import { NextResponse } from "next/server";
import { createClient } from "genlayer-js";
import { createGenLayerNetworkConfig, GENLAYER_CHAIN } from "@/lib/genlayer/network";
import { cacheControlFor, checkReadRequest, READ_TIMEOUT_MS, type ReadRequest } from "@/lib/hive/readPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Read-only proxy for HIVE contract views. Browsers never talk to Studio RPC for reads:
 * this route has a hard timeout, falls back to the second Studio hostname (same chain 61997)
 * on network failures, and lets the CDN share public list views for a few seconds so many
 * visitors don't each spend the RPC's per-IP read budget. No keys, no writes.
 *
 *   GET  /api/gl/read?address=0x..&functionName=get_fixtures&args=[0,50]
 *   POST /api/gl/read  { address, functionName, args }
 */
const PRIMARY = GENLAYER_CHAIN.rpcUrls.default.http[0];
const SECONDARY = PRIMARY.includes("studio-next") ? PRIMARY.replace("studio-next", "studio-dev") : PRIMARY.replace("studio-dev", "studio-next");
const clients = [...new Set([PRIMARY, SECONDARY])].map((rpcUrl) => ({
  rpcUrl,
  client: createClient({ chain: createGenLayerNetworkConfig({ chainId: String(GENLAYER_CHAIN.id), chainName: GENLAYER_CHAIN.name, rpcUrl }).chain }),
}));

class ReadTimeout extends Error {}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new ReadTimeout(`Studio RPC did not answer within ${Math.round(ms / 1000)} s`)), ms))]);

// viem spreads the RPC's own words across message / shortMessage / details / cause.
const errorText = (e: any) => [e?.message, e?.shortMessage, e?.details, e?.cause?.message, e?.cause?.details].filter(Boolean).join(" | ");

// Worth retrying (possibly on the other hostname): network trouble, rate limits, and Studio's
// "Server busy: all 8 execution slots occupied" — it runs at most 8 contract reads at once for
// everyone. viem relabels some of those replies as "Version of JSON-RPC protocol is not supported".
// Contract errors (a view raising) are returned as-is.
const isRetryable = (e: unknown) =>
  e instanceof ReadTimeout ||
  /fetch failed|HTTP request failed|ECONN|ETIMEDOUT|ENOTFOUND|socket|429|rate limit|503|502|server busy|execution slots|retry later|JSON-RPC protocol/i.test(errorText(e));

// Keep this instance from adding more than a few concurrent reads to Studio's shared slots.
const MAX_CONCURRENT = 4;
let active = 0;
const waiters: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function read({ address, functionName, args }: ReadRequest) {
  const started = Date.now();
  let lastError: unknown;
  for (let attempt = 0; ; attempt++) {
    const remaining = READ_TIMEOUT_MS - (Date.now() - started);
    if (remaining < 1000) break;
    const { client, rpcUrl } = clients[attempt % clients.length];
    try {
      const value = await withSlot(() =>
        withTimeout(client.readContract({ address: address as `0x${string}`, functionName, args, jsonSafeReturn: true }), Math.min(remaining, 8000)),
      );
      return { value, rpcUrl };
    } catch (e) {
      lastError = e;
      if (!isRetryable(e)) throw e;
      if (!(e instanceof ReadTimeout)) await sleep(Math.min(250 * 2 ** attempt, 2000) + Math.random() * 250);
    }
  }
  throw lastError;
}

// Last good answer per read, kept by this (warm) function instance. Served, marked stale, only
// when Studio fails or rate-limits — a slow minute on the RPC shouldn't blank the site.
const LAST_GOOD_MAX_AGE_MS = 10 * 60_000;
const lastGood = new Map<string, { value: unknown; at: number }>();

async function handle(body: unknown) {
  const checked = checkReadRequest(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { req } = checked;
  const key = `${req.address.toLowerCase()}|${req.functionName}|${JSON.stringify(req.args)}`;
  try {
    const { value, rpcUrl } = await read(req);
    lastGood.set(key, { value, at: Date.now() });
    if (lastGood.size > 1000) lastGood.delete(lastGood.keys().next().value!);
    return NextResponse.json(
      { result: value },
      {
        headers: {
          // Lists: fresh for 10 s, then the CDN answers instantly with the previous copy while it refetches
          // in the background; the page's own poll picks up the refreshed copy, so staleness lasts one poll.
          "Cache-Control": cacheControlFor(req.functionName),
          "X-Hive-Rpc": new URL(rpcUrl).host,
        },
      },
    );
  } catch (e: any) {
    const stale = lastGood.get(key);
    if (stale && Date.now() - stale.at < LAST_GOOD_MAX_AGE_MS) {
      return NextResponse.json(
        { result: stale.value, stale: true },
        { headers: { "Cache-Control": "no-store", "X-Hive-Stale": `${Math.round((Date.now() - stale.at) / 1000)}s` } },
      );
    }
    const message = (/server busy|execution slots/i.test(errorText(e)) ? "Studio is busy (all execution slots occupied), retry shortly" : String(e?.details || e?.shortMessage || e?.message || e)).split("\n")[0].slice(0, 300);
    const timeout = e instanceof ReadTimeout;
    const busy = !timeout && isRetryable(e);
    return NextResponse.json(
      { error: `${req.functionName}: ${message}` },
      { status: timeout ? 504 : busy ? 503 : 502, headers: { "Cache-Control": "no-store", ...(busy ? { "Retry-After": "2" } : {}) } },
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let args: unknown = [];
  try {
    args = JSON.parse(url.searchParams.get("args") || "[]");
  } catch {
    return NextResponse.json({ error: "args must be a JSON array" }, { status: 400 });
  }
  return handle({ address: url.searchParams.get("address"), functionName: url.searchParams.get("functionName"), args });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  return handle(body);
}

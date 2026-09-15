// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SPORTS = "0xeE172062d021f4dE2B4fEbad0B945e769a62C954";
const CRYPTO = "0x6172565eA61CEa77c8E6d1fBed36936009C10FF1";

// readContract behaviour per RPC host, set by each test.
const behaviour: Record<string, (args: any) => Promise<unknown>> = {};

vi.mock("genlayer-js", () => ({
  createClient: ({ chain }: any) => {
    const host = new URL(chain.rpcUrls.default.http[0]).host;
    return { readContract: (args: any) => (behaviour[host] ?? (() => Promise.reject(new Error("no behaviour"))))(args) };
  },
}));

async function loadRoute() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_HIVE_SPORTS_ADDRESS = SPORTS;
  process.env.NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS = CRYPTO;
  process.env.NEXT_PUBLIC_GENLAYER_RPC_URL = "https://studio-next.genlayer.com/api";
  process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID = "61997";
  return import("../app/api/gl/read/route");
}

const get = (route: any, address: string, functionName: string, args: unknown[] = []) =>
  route.GET(new Request(`http://x/api/gl/read?address=${address}&functionName=${functionName}&args=${encodeURIComponent(JSON.stringify(args))}`));

beforeEach(() => {
  for (const k of Object.keys(behaviour)) delete behaviour[k];
});
afterEach(() => vi.useRealTimers());

describe("/api/gl/read", () => {
  it("returns a list view with a short CDN cache and a detail view uncached", async () => {
    behaviour["studio-next.genlayer.com"] = async ({ functionName }) => (functionName === "get_fixtures" ? [{ match_id: "pd-1" }] : { match_id: "pd-1" });
    const route = await loadRoute();

    const list = await get(route, SPORTS, "get_fixtures", [0, 16]);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ result: [{ match_id: "pd-1" }] });
    expect(list.headers.get("cache-control")).toBe("public, s-maxage=10, stale-while-revalidate=3600");

    const detail = await get(route, SPORTS, "get_fixture", ["pd-1"]);
    expect(detail.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses other contracts, write methods and odd arguments", async () => {
    const route = await loadRoute();
    expect((await get(route, "0x0000000000000000000000000000000000000001", "get_config")).status).toBe(400);
    const write = await route.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ address: SPORTS, functionName: "predict", args: [] }) }));
    expect(write.status).toBe(400);
    expect((await get(route, CRYPTO, "get_markets", [{ evil: true }])).status).toBe(400);
    expect((await get(route, CRYPTO, "get_markets", [-1, 16])).status).toBe(400);
  });

  it("falls back to the second Studio hostname when the first one hangs", async () => {
    vi.useFakeTimers();
    behaviour["studio-next.genlayer.com"] = () => new Promise(() => {});
    behaviour["studio-dev.genlayer.com"] = async () => ({ fixture_count: 47 });
    const route = await loadRoute();

    const pending = get(route, SPORTS, "get_config");
    await vi.advanceTimersByTimeAsync(9_000);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.headers.get("x-hive-rpc")).toBe("studio-dev.genlayer.com");
    expect((await res.json()).result.fixture_count).toBe(47);
  });

  it("times out with 504 instead of hanging when both hostnames hang", async () => {
    vi.useFakeTimers();
    behaviour["studio-next.genlayer.com"] = () => new Promise(() => {});
    behaviour["studio-dev.genlayer.com"] = () => new Promise(() => {});
    const route = await loadRoute();

    const pending = get(route, CRYPTO, "get_market", [1]);
    await vi.advanceTimersByTimeAsync(13_000);
    const res = await pending;
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/get_market: Studio RPC did not answer/);
  });

  it("serves the last good list answer, marked stale, when Studio fails", async () => {
    vi.useFakeTimers();
    let up = true;
    const answer = async () => (up ? [{ id: 44 }] : new Promise(() => {}));
    behaviour["studio-next.genlayer.com"] = answer;
    behaviour["studio-dev.genlayer.com"] = answer;
    const route = await loadRoute();

    expect((await get(route, CRYPTO, "get_markets", [0, 16])).status).toBe(200);
    up = false;
    const pending = get(route, CRYPTO, "get_markets", [0, 16]);
    await vi.advanceTimersByTimeAsync(13_000);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(res.headers.get("x-hive-stale")).toBeTruthy();
    expect(await res.json()).toEqual({ result: [{ id: 44 }], stale: true });
  });

  it("does not retry contract errors on the other hostname", async () => {
    const seen: string[] = [];
    behaviour["studio-next.genlayer.com"] = async () => { seen.push("next"); throw new Error("fixture not found"); };
    behaviour["studio-dev.genlayer.com"] = async () => { seen.push("dev"); return {}; };
    const route = await loadRoute();
    const res = await get(route, SPORTS, "get_fixture", ["pd-9"]);
    expect(res.status).toBe(502);
    expect(seen).toEqual(["next"]);
  });
});

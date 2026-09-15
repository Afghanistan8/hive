// Shared by the browser read path and the /api/gl/read proxy. No server-only imports.
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS } from "./config";

/** Every view method HiveReader calls. Anything else is refused by the proxy. */
export const READ_METHODS = new Set([
  "get_config",
  "get_fixtures",
  "get_fixture",
  "get_markets",
  "get_market",
  "get_supported_assets",
  "get_position",
  "get_user_positions",
  "get_positions",
  "get_evidence",
  "get_evidence_raw",
  "get_source_urls",
  "get_ai_call",
  "get_ai_calls",
  "get_username",
  "get_leagues",
  "get_market_by_asset_day",
  "get_position_count",
]);

/** Public aggregate views. */
const LIST_METHODS = new Set([
  "get_config",
  "get_fixtures",
  "get_markets",
  "get_supported_assets",
  "get_ai_calls",
  "get_positions",
  "get_position_count",
  "get_leagues",
]);
/** One wallet's rows — still public on-chain data, keyed by the address in the URL. */
const WALLET_METHODS = new Set(["get_position", "get_user_positions", "get_username"]);

/**
 * Every view is public chain state, so every answer may be shared from the CDN. That matters:
 * Studio allows ~30 contract reads per minute per IP, and all visitors reach it from Vercel's IPs.
 * After a user's own transaction the browser adds a cache-busting `v` parameter (see markFresh).
 */
export function cacheControlFor(functionName: string) {
  if (LIST_METHODS.has(functionName)) return "public, s-maxage=10, stale-while-revalidate=3600";
  if (WALLET_METHODS.has(functionName)) return "public, s-maxage=3, stale-while-revalidate=30";
  return "public, s-maxage=5, stale-while-revalidate=120";
}

export const READ_TIMEOUT_MS = 12_000;
export const BROWSER_READ_TIMEOUT_MS = 15_000;

export type ReadArg = string | number;

export interface ReadRequest {
  address: string;
  functionName: string;
  args: ReadArg[];
}

/** Validates an untrusted read request; returns an error message or the normalized request. */
export function checkReadRequest(body: unknown): { ok: true; req: ReadRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const { address, functionName, args = [] } = body as Record<string, unknown>;
  // `v` (cache-busting after a user's own write) is accepted and ignored.
  const allowed = [HIVE_SPORTS_ADDRESS, HIVE_CRYPTO_ADDRESS].filter(Boolean).map((a) => a.toLowerCase());
  if (typeof address !== "string" || !allowed.includes(address.toLowerCase())) return { ok: false, error: "address is not a HIVE contract" };
  if (typeof functionName !== "string" || !READ_METHODS.has(functionName)) return { ok: false, error: "functionName is not an allowed view" };
  if (!Array.isArray(args) || args.length > 3) return { ok: false, error: "args must be an array of at most 3 values" };
  for (const a of args) {
    const okString = typeof a === "string" && a.length <= 128;
    const okNumber = typeof a === "number" && Number.isSafeInteger(a) && a >= 0;
    if (!okString && !okNumber) return { ok: false, error: "args must be short strings or non-negative integers" };
  }
  return { ok: true, req: { address, functionName, args: args as ReadArg[] } };
}

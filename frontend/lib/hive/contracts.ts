import { createClient } from "genlayer-js";
import { GENLAYER_CHAIN } from "../genlayer/network";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS } from "./config";
import { BROWSER_READ_TIMEOUT_MS, READ_TIMEOUT_MS, type ReadArg } from "./readPolicy";
import type {
  AiCall,
  AiCallRow,
  CryptoEvidence,
  CryptoMarket,
  CryptoPosition,
  CryptoUserRow,
  Fixture,
  PositionRow,
  SportsEvidence,
  SportsPosition,
  SportsUserRow,
  SupportedAsset,
} from "./types";

const isBrowser = typeof window !== "undefined";

/**
 * Studio executes each view in GenVM, so big pages are slow and uneven: get_fixtures(0,50)
 * measured 5–12+ s, while three parallel pages of 16 finish in ~3 s. The browser therefore reads
 * small pages in parallel and caps how many (newest rows win); the keeper and other server
 * callers read everything in large pages.
 */
const VIEW = { page: 16, fixturePages: 8, marketPages: 5, positionPages: 6, aiCallPages: 8 };
const FULL = { page: 50, fixturePages: 40, marketPages: 40, positionPages: 40, aiCallPages: 40 };
type Limits = typeof VIEW;

const pageOffsets = (count: number, page: number, maxPages: number, newestLast: boolean) => {
  const pages = Math.min(Math.ceil(count / page), maxPages);
  if (!newestLast) return Array.from({ length: pages }, (_, i) => i * page);
  // Oldest-first lists: skip the oldest rows when capped so the newest are always shown.
  const start = Math.max(0, count - pages * page);
  return Array.from({ length: pages }, (_, i) => start + i * page);
};

// After the user's own transaction, bypass the CDN copy for a minute so they see their stake.
let freshUntil = 0;
export const markFresh = () => {
  freshUntil = Date.now() + 60_000;
};

export interface ReaderOptions {
  /**
   * Read through the /api/gl/read proxy at this origin ("" = same origin). Browsers always use
   * the proxy; server rendering passes the site origin so it shares the CDN cache with browsers.
   * Omit on the server (keeper, scripts) to read Studio directly.
   */
  proxyBase?: string;
  /** Extra fetch options for proxy reads (e.g. Next's `{ next: { revalidate } }`). */
  fetchInit?: RequestInit & { next?: { revalidate?: number } };
  timeoutMs?: number;
}

const timeout = <T>(p: Promise<T>, ms: number, label: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label}: Studio RPC did not answer within ${Math.round(ms / 1000)} s`)), ms))]);

/**
 * Thin read layer over the two HIVE contracts. Every value shown in the app comes from
 * these view calls. In the browser they go through the /api/gl/read proxy (timeout, RPC
 * fallback, short CDN cache); on the server (keeper, API routes) they hit Studio RPC directly.
 */
export class HiveReader {
  private client: ReturnType<typeof createClient> | null = null;
  private readonly proxyBase: string | undefined;
  private readonly limits: Limits;

  constructor(
    readonly cryptoAddress: string = HIVE_CRYPTO_ADDRESS,
    readonly sportsAddress: string = HIVE_SPORTS_ADDRESS,
    private readonly opts: ReaderOptions = {},
  ) {
    this.proxyBase = isBrowser ? "" : opts.proxyBase;
    this.limits = this.proxyBase === undefined ? FULL : VIEW;
  }

  private async read<T>(address: string, functionName: string, args: ReadArg[] = []): Promise<T> {
    if (!address) throw new Error(`Contract address for ${functionName} is not configured (NEXT_PUBLIC_HIVE_*_ADDRESS)`);
    if (this.proxyBase !== undefined) {
      const qs = new URLSearchParams({ address, functionName, args: JSON.stringify(args) });
      if (isBrowser && Date.now() < freshUntil) qs.set("v", String(Math.floor(Date.now() / 3000)));
      const timeoutMs = this.opts.timeoutMs ?? BROWSER_READ_TIMEOUT_MS;
      let res: Response;
      try {
        res = await fetch(`${this.proxyBase}/api/gl/read?${qs}`, { ...this.opts.fetchInit, signal: AbortSignal.timeout(timeoutMs) });
      } catch (e: any) {
        throw new Error(e?.name === "TimeoutError" ? `${functionName}: no answer within ${timeoutMs / 1000} s` : `${functionName}: ${e?.message ?? e}`);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body?.error || `${functionName}: read proxy returned HTTP ${res.status}`), { status: res.status });
      return body.result as T;
    }
    this.client ??= createClient({ chain: GENLAYER_CHAIN });
    // Studio runs at most 8 contract reads at once for everyone ("Server busy: all 8 execution
    // slots occupied"); back off and retry a few times rather than failing a keeper tick.
    for (let attempt = 0; ; attempt++) {
      try {
        return (await timeout(
          this.client.readContract({ address: address as `0x${string}`, functionName, args, jsonSafeReturn: true }),
          READ_TIMEOUT_MS,
          functionName,
        )) as T;
      } catch (e: any) {
        const text = [e?.message, e?.details, e?.cause?.message].filter(Boolean).join(" ");
        if (attempt >= 4 || !/server busy|execution slots|retry later|rate limit|JSON-RPC protocol/i.test(text)) throw e;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt + Math.random() * 300));
      }
    }
  }

  /**
   * Paged list read. Page 0 is requested together with the row count (it is needed unless the
   * list is longer than the cap allows), then the remaining pages in parallel.
   */
  private async list<T>(address: string, functionName: string, count: Promise<number>, maxPages: number, newestLast: boolean) {
    const first = this.read<T[]>(address, functionName, [0, this.limits.page]);
    first.catch(() => {}); // may go unused; its failure is reported by the awaited reads below
    const offsets = pageOffsets(await count, this.limits.page, maxPages, newestLast);
    const chunks = await Promise.all(offsets.map((o) => (o === 0 ? first : this.read<T[]>(address, functionName, [o, this.limits.page]))));
    return chunks.flat();
  }

  // ---- HiveCrypto
  cryptoConfig = () => this.read<{ market_count: number; now: number }>(this.cryptoAddress, "get_config");
  /** Newest first. */
  cryptoMarkets = () =>
    this.list<CryptoMarket>(this.cryptoAddress, "get_markets", this.cryptoConfig().then((c) => Number(c.market_count ?? 0)), this.limits.marketPages, false);
  cryptoMarket = (id: number) => this.read<CryptoMarket>(this.cryptoAddress, "get_market", [id]);
  cryptoPosition = (id: number, wallet: string) =>
    this.read<CryptoPosition>(this.cryptoAddress, "get_position", [id, wallet.toLowerCase()]);
  cryptoEvidence = (id: number) => this.read<CryptoEvidence>(this.cryptoAddress, "get_evidence", [id]);
  cryptoSourceUrls = (id: number) => this.read<{ coingecko: string; gate: string }>(this.cryptoAddress, "get_source_urls", [id]);
  cryptoAssets = () => this.read<SupportedAsset[]>(this.cryptoAddress, "get_supported_assets");
  cryptoUserPositions = (wallet: string) =>
    this.read<CryptoUserRow[]>(this.cryptoAddress, "get_user_positions", [wallet.toLowerCase(), 0, 50]);

  // ---- HiveSports
  sportsConfig = () => this.read<{ fixture_count: number; now: number }>(this.sportsAddress, "get_config");
  fixtureCount = async () => Number((await this.sportsConfig()).fixture_count ?? 0);
  /** Registration order (oldest first). */
  fixtures = () => this.list<Fixture>(this.sportsAddress, "get_fixtures", this.fixtureCount(), this.limits.fixturePages, true);
  fixture = (matchId: string) => this.read<Fixture>(this.sportsAddress, "get_fixture", [matchId]);
  sportsPosition = (matchId: string, wallet: string) =>
    this.read<SportsPosition>(this.sportsAddress, "get_position", [matchId, wallet.toLowerCase()]);
  sportsEvidence = (matchId: string) => this.read<SportsEvidence>(this.sportsAddress, "get_evidence", [matchId]);
  sportsEvidenceRaw = (matchId: string) => this.read<string>(this.sportsAddress, "get_evidence_raw", [matchId]);
  sportsSourceUrls = (matchId: string) => this.read<{ espn: string; bbc: string }>(this.sportsAddress, "get_source_urls", [matchId]);
  allPositions = () =>
    this.list<PositionRow>(this.sportsAddress, "get_positions", this.read<number>(this.sportsAddress, "get_position_count").then(Number), this.limits.positionPages, true);
  aiCall = (matchId: string) => this.read<AiCall>(this.sportsAddress, "get_ai_call", [matchId]);
  /** get_ai_calls pages over fixtures (not calls): one fixture_count read, then parallel pages. */
  aiCalls = () => this.list<AiCallRow>(this.sportsAddress, "get_ai_calls", this.fixtureCount(), this.limits.aiCallPages, true);
  username = (wallet: string) => this.read<string>(this.sportsAddress, "get_username", [wallet.toLowerCase()]);
  sportsUserPositions = (wallet: string) =>
    this.read<SportsUserRow[]>(this.sportsAddress, "get_user_positions", [wallet.toLowerCase(), 0, 50]);
}

let shared: HiveReader | null = null;
export const hiveReader = () => (shared ??= new HiveReader());

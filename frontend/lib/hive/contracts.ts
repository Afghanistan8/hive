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
const PAGE = isBrowser ? 16 : 50;
const LIMITS = isBrowser
  ? { fixturePages: 8, marketPages: 5, positionPages: 6, aiCallPages: 8 }
  : { fixturePages: 40, marketPages: 40, positionPages: 40, aiCallPages: 40 };

const pageOffsets = (count: number, maxPages: number, newestLast: boolean) => {
  const pages = Math.min(Math.ceil(count / PAGE), maxPages);
  if (!newestLast) return Array.from({ length: pages }, (_, i) => i * PAGE);
  // Oldest-first lists: skip the oldest rows when capped so the newest are always shown.
  const start = Math.max(0, count - pages * PAGE);
  return Array.from({ length: pages }, (_, i) => start + i * PAGE);
};

const timeout = <T>(p: Promise<T>, ms: number, label: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label}: Studio RPC did not answer within ${Math.round(ms / 1000)} s`)), ms))]);

/**
 * Thin read layer over the two HIVE contracts. Every value shown in the app comes from
 * these view calls. In the browser they go through the /api/gl/read proxy (timeout, RPC
 * fallback, short CDN cache); on the server (keeper, API routes) they hit Studio RPC directly.
 */
export class HiveReader {
  private client: ReturnType<typeof createClient> | null = null;

  constructor(
    readonly cryptoAddress: string = HIVE_CRYPTO_ADDRESS,
    readonly sportsAddress: string = HIVE_SPORTS_ADDRESS,
  ) {}

  private async read<T>(address: string, functionName: string, args: ReadArg[] = []): Promise<T> {
    if (!address) throw new Error(`Contract address for ${functionName} is not configured (NEXT_PUBLIC_HIVE_*_ADDRESS)`);
    if (isBrowser) {
      const qs = new URLSearchParams({ address, functionName, args: JSON.stringify(args) });
      let res: Response;
      try {
        res = await fetch(`/api/gl/read?${qs}`, { signal: AbortSignal.timeout(BROWSER_READ_TIMEOUT_MS) });
      } catch (e: any) {
        throw new Error(e?.name === "TimeoutError" ? `${functionName}: no answer within ${BROWSER_READ_TIMEOUT_MS / 1000} s` : `${functionName}: ${e?.message ?? e}`);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `${functionName}: read proxy returned HTTP ${res.status}`);
      return body.result as T;
    }
    this.client ??= createClient({ chain: GENLAYER_CHAIN });
    return (await timeout(
      this.client.readContract({ address: address as `0x${string}`, functionName, args, jsonSafeReturn: true }),
      READ_TIMEOUT_MS,
      functionName,
    )) as T;
  }

  private async pages<T>(address: string, functionName: string, offsets: number[], extra: ReadArg[] = []) {
    const chunks = await Promise.all(offsets.map((o) => this.read<T[]>(address, functionName, [...extra, o, PAGE])));
    return chunks.flat();
  }

  // ---- HiveCrypto
  cryptoConfig = () => this.read<{ market_count: number; now: number }>(this.cryptoAddress, "get_config");
  /** Newest first. */
  cryptoMarkets = async () => {
    const count = Number((await this.cryptoConfig()).market_count ?? 0);
    return this.pages<CryptoMarket>(this.cryptoAddress, "get_markets", pageOffsets(count, LIMITS.marketPages, false));
  };
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
  fixtures = async () =>
    this.pages<Fixture>(this.sportsAddress, "get_fixtures", pageOffsets(await this.fixtureCount(), LIMITS.fixturePages, true));
  fixture = (matchId: string) => this.read<Fixture>(this.sportsAddress, "get_fixture", [matchId]);
  sportsPosition = (matchId: string, wallet: string) =>
    this.read<SportsPosition>(this.sportsAddress, "get_position", [matchId, wallet.toLowerCase()]);
  sportsEvidence = (matchId: string) => this.read<SportsEvidence>(this.sportsAddress, "get_evidence", [matchId]);
  sportsEvidenceRaw = (matchId: string) => this.read<string>(this.sportsAddress, "get_evidence_raw", [matchId]);
  sportsSourceUrls = (matchId: string) => this.read<{ espn: string; bbc: string }>(this.sportsAddress, "get_source_urls", [matchId]);
  allPositions = async () => {
    const count = Number(await this.read<number>(this.sportsAddress, "get_position_count"));
    return this.pages<PositionRow>(this.sportsAddress, "get_positions", pageOffsets(count, LIMITS.positionPages, true));
  };
  aiCall = (matchId: string) => this.read<AiCall>(this.sportsAddress, "get_ai_call", [matchId]);
  /** get_ai_calls pages over fixtures (not calls): one fixture_count read, then parallel pages. */
  aiCalls = async () =>
    this.pages<AiCallRow>(this.sportsAddress, "get_ai_calls", pageOffsets(await this.fixtureCount(), LIMITS.aiCallPages, true));
  username = (wallet: string) => this.read<string>(this.sportsAddress, "get_username", [wallet.toLowerCase()]);
  sportsUserPositions = (wallet: string) =>
    this.read<SportsUserRow[]>(this.sportsAddress, "get_user_positions", [wallet.toLowerCase(), 0, 50]);
}

let shared: HiveReader | null = null;
export const hiveReader = () => (shared ??= new HiveReader());

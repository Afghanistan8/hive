import { createClient } from "genlayer-js";
import { GENLAYER_CHAIN } from "../genlayer/network";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS } from "./config";
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

/**
 * Thin read layer over the two HIVE contracts. Every value shown in the app
 * comes from these view calls — there is no backend or indexer.
 */
export class HiveReader {
  private client: ReturnType<typeof createClient>;

  constructor(
    readonly cryptoAddress: string = HIVE_CRYPTO_ADDRESS,
    readonly sportsAddress: string = HIVE_SPORTS_ADDRESS,
  ) {
    this.client = createClient({ chain: GENLAYER_CHAIN });
  }

  private async read<T>(address: string, functionName: string, args: any[] = []): Promise<T> {
    if (!address) throw new Error(`Contract address for ${functionName} is not configured`);
    return (await this.client.readContract({
      address: address as `0x${string}`,
      functionName,
      args,
      jsonSafeReturn: true,
    })) as T;
  }

  // ---- HiveCrypto
  cryptoMarkets = async (offset = 0, limit = 50) => {
    const pages: CryptoMarket[] = [];
    for (let page = 0; page < 6; page++) {
      const rows = await this.read<CryptoMarket[]>(this.cryptoAddress, "get_markets", [offset + page * limit, limit]);
      pages.push(...rows);
      if (rows.length < limit) break;
    }
    return pages;
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
  fixtures = async () => {
    const all: Fixture[] = [];
    for (let page = 0; page < 10; page++) {
      const rows = await this.read<Fixture[]>(this.sportsAddress, "get_fixtures", [page * 50, 50]);
      all.push(...rows);
      if (rows.length < 50) break;
    }
    return all;
  };
  fixture = (matchId: string) => this.read<Fixture>(this.sportsAddress, "get_fixture", [matchId]);
  sportsPosition = (matchId: string, wallet: string) =>
    this.read<SportsPosition>(this.sportsAddress, "get_position", [matchId, wallet.toLowerCase()]);
  sportsEvidence = (matchId: string) => this.read<SportsEvidence>(this.sportsAddress, "get_evidence", [matchId]);
  sportsEvidenceRaw = (matchId: string) => this.read<string>(this.sportsAddress, "get_evidence_raw", [matchId]);
  sportsSourceUrls = (matchId: string) => this.read<{ espn: string; bbc: string }>(this.sportsAddress, "get_source_urls", [matchId]);
  allPositions = async () => {
    const all: PositionRow[] = [];
    for (let page = 0; page < 40; page++) {
      const rows = await this.read<PositionRow[]>(this.sportsAddress, "get_positions", [page * 50, 50]);
      all.push(...rows);
      if (rows.length < 50) break;
    }
    return all;
  };
  aiCall = (matchId: string) => this.read<AiCall>(this.sportsAddress, "get_ai_call", [matchId]);
  aiCalls = async () => {
    const all: AiCallRow[] = [];
    for (let page = 0; page < 20; page++) {
      // get_ai_calls pages over fixtures (not calls), so walk until past the fixture count
      const rows = await this.read<AiCallRow[]>(this.sportsAddress, "get_ai_calls", [page * 50, 50]);
      all.push(...rows);
      if (page * 50 + 50 >= (await this.fixtureCount())) break;
    }
    return all;
  };
  fixtureCount = async () => Number((await this.read<any>(this.sportsAddress, "get_config")).fixture_count ?? 0);
  username = (wallet: string) => this.read<string>(this.sportsAddress, "get_username", [wallet.toLowerCase()]);
  sportsUserPositions = (wallet: string) =>
    this.read<SportsUserRow[]>(this.sportsAddress, "get_user_positions", [wallet.toLowerCase(), 0, 50]);
}

let shared: HiveReader | null = null;
export const hiveReader = () => (shared ??= new HiveReader());

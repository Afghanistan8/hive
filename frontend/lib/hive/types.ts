// Shapes returned by the HiveCrypto / HiveSports view methods (JSON-safe:
// integers above 2^53 arrive as decimal strings, so wei fields are `Wei`).
export type Wei = number | string;

export type CryptoPhase = "OPEN" | "CLOSED" | "READY_TO_SETTLE" | "SETTLED" | "INCONCLUSIVE";
export type SportsPhase = "OPEN" | "CLOSED" | "READY_TO_SETTLE" | "SETTLED" | "INCONCLUSIVE" | "POSTPONED";

export interface CryptoMarket {
  exists: boolean;
  id: number;
  asset: string;
  coingecko_id: string;
  gate_pair: string;
  target_day: string;
  creator: string;
  created_at: number;
  cutoff_at: number;
  settles_at: number;
  terminal_refund_at: number;
  up_pool: Wei;
  down_pool: Wei;
  total_pool: Wei;
  paid_out: Wei;
  positions_count: number;
  state: "PENDING" | "UP" | "DOWN" | "INCONCLUSIVE" | "REFUNDED";
  result: string;
  refund_all: boolean;
  resolved_at: number;
  phase: CryptoPhase;
}

export interface CryptoPosition {
  exists: boolean;
  market_id: number;
  side: "" | "UP" | "DOWN";
  stake: Wei;
  claimed: boolean;
  payout: Wei;
  claimable: Wei;
}

export interface CryptoEvidence {
  exists: boolean;
  resolved_at?: number;
  coingecko_open?: Wei;
  coingecko_close?: Wei;
  coingecko_direction?: string;
  gate_open?: Wei;
  gate_close?: Wei;
  gate_direction?: string;
  final_result?: string;
  terminal_refund?: boolean;
  price_scale?: number;
}

export interface CryptoUserRow {
  market: CryptoMarket;
  side: "UP" | "DOWN";
  stake: Wei;
  claimed: boolean;
  payout: Wei;
  claimable: Wei;
}

export interface Fixture {
  match_id: string;
  league: string;
  league_name: string;
  home: string;
  away: string;
  espn_event_id: string;
  kickoff_ts: number;
  creator: string;
  created_at: number;
  status: "OPEN" | "SETTLED" | "POSTPONED" | "REFUNDED";
  result: "" | "HOME" | "DRAW" | "AWAY";
  home_goals: number;
  away_goals: number;
  pool_home: Wei;
  pool_draw: Wei;
  pool_away: Wei;
  total_pool: Wei;
  paid_out: Wei;
  positions_count: number;
  refund_all: boolean;
  resolved_at: number;
  phase: SportsPhase;
}

export interface SportsPosition {
  exists: boolean;
  match_id: string;
  pick: "" | "HOME" | "DRAW" | "AWAY";
  stake: Wei;
  claimed: boolean;
  payout: Wei;
  claimable: Wei;
}

export interface SourceReading {
  status: string;
  home_goals: number;
  away_goals: number;
}

export interface SportsEvidence {
  exists: boolean;
  match_id?: string;
  espn?: SourceReading;
  bbc?: SourceReading;
  outcome?: string;
}

export interface SportsUserRow {
  fixture: Fixture;
  pick: "HOME" | "DRAW" | "AWAY";
  stake: Wei;
  claimed: boolean;
  payout: Wei;
  claimable: Wei;
}

export interface SupportedAsset {
  asset: string;
  coingecko_id: string;
  gate_pair: string;
}

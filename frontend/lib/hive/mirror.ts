// Browser reads from the Supabase read-mirror (anon key, SELECT-only by RLS).
// Used only as instant placeholder data; the contract read replaces it moments later.

import type { CryptoMarket, Fixture, PositionRow } from "./types";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const mirrorConfigured = Boolean(URL_ && ANON);

async function select<T>(path: string): Promise<T[]> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  if (!res.ok) throw new Error(`mirror ${path}: ${res.status}`);
  return res.json();
}

export async function mirrorFixtures(): Promise<Fixture[]> {
  const rows = await select<any>("hive_fixtures?select=*&order=kickoff_ts.asc&limit=1000");
  return rows.map((r) => ({
    match_id: r.match_id, league: r.league, league_name: r.league_name ?? r.league, home: r.home, away: r.away,
    espn_event_id: r.espn_event_id, kickoff_ts: Number(r.kickoff_ts), creator: r.creator ?? "", created_at: Number(r.created_at ?? 0),
    status: r.status, result: r.result ?? "", home_goals: r.home_goals ?? 0, away_goals: r.away_goals ?? 0,
    pool_home: r.pool_home ?? "0", pool_draw: r.pool_draw ?? "0", pool_away: r.pool_away ?? "0", total_pool: r.total_pool ?? "0",
    paid_out: r.paid_out ?? "0", positions_count: r.positions_count ?? 0, refund_all: !!r.refund_all,
    resolved_at: Number(r.resolved_at ?? 0), phase: "OPEN", ai_pick: r.ai_pick ?? "",
  }));
}

export async function mirrorPositions(): Promise<PositionRow[]> {
  const rows = await select<any>("hive_positions?select=*&limit=10000");
  return rows.map((r) => ({
    match_id: r.match_id, league: r.league, owner: r.owner, username: r.username ?? "", pick: r.pick, stake: r.stake,
    claimed: r.claimed, payout: r.payout ?? "0", claimable: r.claimable ?? "0", fixture_status: r.fixture_status,
    fixture_result: r.fixture_result ?? "", refund_all: !!r.refund_all,
  }));
}

export async function mirrorMarkets(): Promise<CryptoMarket[]> {
  const rows = await select<any>("hive_crypto_markets?select=*&order=id.desc&limit=1000");
  return rows.map((r) => ({
    exists: true, id: Number(r.id), asset: r.asset, coingecko_id: r.coingecko_id, gate_pair: r.gate_pair, target_day: r.target_day,
    creator: r.creator ?? "", created_at: Number(r.created_at ?? 0), cutoff_at: Number(r.cutoff_at), settles_at: Number(r.settles_at),
    terminal_refund_at: Number(r.terminal_refund_at), up_pool: r.up_pool ?? "0", down_pool: r.down_pool ?? "0",
    total_pool: r.total_pool ?? "0", paid_out: r.paid_out ?? "0", positions_count: r.positions_count ?? 0, state: r.state,
    result: r.result ?? "", refund_all: !!r.refund_all, resolved_at: Number(r.resolved_at ?? 0), phase: "OPEN",
  }));
}

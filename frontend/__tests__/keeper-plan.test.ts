import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, gmt1Day, isDue, planAiCalls, planFixtureResolves, planMarketResolves, planPostpones } from "../lib/keeper/plan";
import type { CryptoMarket, Fixture } from "../lib/hive/types";

const H = 3600;
const NOW = 1_790_000_000;

function fixture(p: Partial<Fixture>): Fixture {
  return {
    match_id: "pl-1", league: "PL", league_name: "English Premier League", home: "A", away: "B", espn_event_id: "1",
    kickoff_ts: NOW, creator: "", created_at: 0, status: "OPEN", result: "", home_goals: 0, away_goals: 0,
    pool_home: "0", pool_draw: "0", pool_away: "0", total_pool: "0", paid_out: "0", positions_count: 0,
    refund_all: false, resolved_at: 0, phase: "OPEN", ai_pick: "", ...p,
  };
}

function market(p: Partial<CryptoMarket>): CryptoMarket {
  return {
    exists: true, id: 1, asset: "BTC", coingecko_id: "bitcoin", gate_pair: "BTC_USDT", target_day: "2026-09-20", creator: "",
    created_at: 0, cutoff_at: NOW - 24 * H, settles_at: NOW, terminal_refund_at: NOW + 5 * 24 * H, up_pool: "0", down_pool: "0",
    total_pool: "0", paid_out: "0", positions_count: 1, state: "PENDING", result: "", refund_all: false, resolved_at: 0, phase: "READY_TO_SETTLE", ...p,
  };
}

describe("isDue", () => {
  it("fires in the first window after eligibility, then hourly", () => {
    expect(isDue(NOW - 1, NOW, DEFAULT_LIMITS)).toBe(false);
    expect(isDue(NOW, NOW, DEFAULT_LIMITS)).toBe(true);
    expect(isDue(NOW + 14 * 60, NOW, DEFAULT_LIMITS)).toBe(true);
    expect(isDue(NOW + 20 * 60, NOW, DEFAULT_LIMITS)).toBe(false);
    expect(isDue(NOW + H + 60, NOW, DEFAULT_LIMITS)).toBe(true);
  });
});

describe("keeper plans", () => {
  it("resolves only staked, pending markets that are due", () => {
    const plan = planMarketResolves([
      market({ id: 1 }),
      market({ id: 2, positions_count: 0 }),
      market({ id: 3, state: "UP" }),
      market({ id: 4, settles_at: NOW + H }),
    ], NOW);
    expect(plan.map((m) => m.id)).toEqual([1]);
  });

  it("resolves fixtures with stakes or an AI call two hours after kickoff", () => {
    const plan = planFixtureResolves([
      fixture({ match_id: "staked", kickoff_ts: NOW - 2 * H, positions_count: 2 }),
      fixture({ match_id: "ai", kickoff_ts: NOW - 2 * H, ai_pick: "HOME" }),
      fixture({ match_id: "empty", kickoff_ts: NOW - 2 * H }),
      fixture({ match_id: "early", kickoff_ts: NOW - H, positions_count: 1 }),
      fixture({ match_id: "done", kickoff_ts: NOW - 2 * H, positions_count: 1, status: "SETTLED" }),
    ], NOW);
    expect(plan.map((f) => f.match_id).sort()).toEqual(["ai", "staked"]);
  });

  it("requests AI calls for the next fixtures without one", () => {
    const plan = planAiCalls([
      fixture({ match_id: "soon", kickoff_ts: NOW + 5 * H }),
      fixture({ match_id: "has", kickoff_ts: NOW + 4 * H, ai_pick: "DRAW" }),
      fixture({ match_id: "far", kickoff_ts: NOW + 3 * 24 * H }),
      fixture({ match_id: "started", kickoff_ts: NOW - 60 }),
      fixture({ match_id: "sooner", kickoff_ts: NOW + 2 * H }),
      fixture({ match_id: "third", kickoff_ts: NOW + 6 * H }),
    ], NOW);
    expect(plan.map((f) => f.match_id)).toEqual(["sooner", "soon"]);
  });

  it("only tries mark_postponed when the display feed hints and the grace period passed", () => {
    const f1 = fixture({ match_id: "p", espn_event_id: "9", kickoff_ts: NOW - 4 * H });
    const f2 = fixture({ match_id: "q", espn_event_id: "8", kickoff_ts: NOW - 2 * H });
    expect(planPostpones([f1, f2], { "9": "Postponed", "8": "Postponed" }, NOW).map((f) => f.match_id)).toEqual(["p"]);
    expect(planPostpones([f1], { "9": "FT" }, NOW)).toEqual([]);
  });

  it("computes GMT+1 days", () => {
    expect(gmt1Day(Date.UTC(2026, 8, 15, 23, 30) / 1000, 1)).toBe("2026-09-17");
    expect(gmt1Day(Date.UTC(2026, 8, 15, 22, 30) / 1000, 1)).toBe("2026-09-16");
  });
});

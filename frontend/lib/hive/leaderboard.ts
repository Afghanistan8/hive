import { toWei } from "./format";
import type { AiCallRow, PositionRow } from "./types";

export type PickOutcome = "OPEN" | "WON" | "LOST" | "REFUND";

/** How a single position turned out, from on-chain fixture state only. */
export function pickOutcome(p: { pick: string; fixture_status: string; fixture_result: string }): PickOutcome {
  if (p.fixture_status === "OPEN") return "OPEN";
  if (p.fixture_status === "POSTPONED" || p.fixture_status === "REFUNDED") return "REFUND";
  return p.pick === p.fixture_result ? "WON" : "LOST";
}

export interface PredictorStats {
  owner: string;
  username: string;
  picks: number;
  settled: number;
  correct: number;
  open: number;
  accuracy: number; // 0..1 over settled picks
  staked: bigint;
  returned: bigint; // paid out + still claimable, settled/refunded picks only
  net: bigint; // returned - stake on settled/refunded picks
  leagues: Set<string>;
}

export function buildLeaderboard(rows: PositionRow[], league = ""): PredictorStats[] {
  const byOwner = new Map<string, PredictorStats>();
  for (const r of rows) {
    if (league && r.league !== league) continue;
    let s = byOwner.get(r.owner);
    if (!s) {
      s = { owner: r.owner, username: r.username, picks: 0, settled: 0, correct: 0, open: 0, accuracy: 0, staked: 0n, returned: 0n, net: 0n, leagues: new Set() };
      byOwner.set(r.owner, s);
    }
    if (r.username) s.username = r.username;
    const stake = toWei(r.stake);
    const outcome = pickOutcome(r);
    s.picks += 1;
    s.staked += stake;
    s.leagues.add(r.league);
    if (outcome === "OPEN") {
      s.open += 1;
      continue;
    }
    const back = toWei(r.payout) + toWei(r.claimable);
    s.returned += back;
    s.net += back - stake;
    if (outcome !== "REFUND") {
      s.settled += 1;
      if (outcome === "WON") s.correct += 1;
    }
  }
  const out = [...byOwner.values()];
  for (const s of out) s.accuracy = s.settled ? s.correct / s.settled : 0;
  return out.sort(
    (a, b) =>
      b.correct - a.correct ||
      b.accuracy - a.accuracy ||
      (b.net > a.net ? 1 : b.net < a.net ? -1 : 0) ||
      b.picks - a.picks,
  );
}

export function aiRecord(calls: AiCallRow[], league = "") {
  let settled = 0;
  let correct = 0;
  let total = 0;
  for (const c of calls) {
    if (league && c.league !== league) continue;
    total += 1;
    if (c.fixture_status !== "SETTLED") continue;
    settled += 1;
    if (c.pick === c.fixture_result) correct += 1;
  }
  return { total, settled, correct, accuracy: settled ? correct / settled : 0 };
}

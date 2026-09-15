import { describe, expect, it } from "vitest";
import { aiRecord, buildLeaderboard, pickOutcome } from "../lib/hive/leaderboard";
import type { AiCallRow, PositionRow } from "../lib/hive/types";

const GEN = 10n ** 18n;

function pos(p: Partial<PositionRow>): PositionRow {
  return {
    match_id: "pl-1", league: "PL", owner: "0xa", username: "", pick: "HOME", stake: (2n * GEN).toString(),
    claimed: false, payout: 0, claimable: 0, fixture_status: "OPEN", fixture_result: "", refund_all: false, ...p,
  };
}

describe("pickOutcome", () => {
  it("maps on-chain fixture state to a pick result", () => {
    expect(pickOutcome({ pick: "HOME", fixture_status: "OPEN", fixture_result: "" })).toBe("OPEN");
    expect(pickOutcome({ pick: "HOME", fixture_status: "SETTLED", fixture_result: "HOME" })).toBe("WON");
    expect(pickOutcome({ pick: "DRAW", fixture_status: "SETTLED", fixture_result: "HOME" })).toBe("LOST");
    expect(pickOutcome({ pick: "AWAY", fixture_status: "POSTPONED", fixture_result: "" })).toBe("REFUND");
    expect(pickOutcome({ pick: "AWAY", fixture_status: "REFUNDED", fixture_result: "" })).toBe("REFUND");
  });
});

describe("buildLeaderboard", () => {
  const rows: PositionRow[] = [
    // alice: 2 correct of 2, +3 GEN
    pos({ owner: "0xa", username: "alice", match_id: "pl-1", fixture_status: "SETTLED", fixture_result: "HOME", payout: (5n * GEN).toString(), claimed: true }),
    pos({ owner: "0xa", match_id: "sa-2", league: "SA", pick: "AWAY", fixture_status: "SETTLED", fixture_result: "AWAY", claimable: (2n * GEN).toString() }),
    // bob: 1 correct of 2, one open, one refund
    pos({ owner: "0xb", match_id: "pl-1", pick: "HOME", fixture_status: "SETTLED", fixture_result: "HOME", payout: (3n * GEN).toString(), claimed: true }),
    pos({ owner: "0xb", match_id: "pl-3", pick: "DRAW", fixture_status: "SETTLED", fixture_result: "AWAY" }),
    pos({ owner: "0xb", match_id: "pl-4", pick: "DRAW" }),
    pos({ owner: "0xb", match_id: "fl1-5", league: "FL1", fixture_status: "POSTPONED", claimable: (2n * GEN).toString() }),
  ];

  it("ranks by correct picks, then accuracy, and computes net on resolved picks only", () => {
    const board = buildLeaderboard(rows);
    expect(board.map((s) => s.owner)).toEqual(["0xa", "0xb"]);
    const [alice, bob] = board;
    expect(alice).toMatchObject({ username: "alice", picks: 2, settled: 2, correct: 2, accuracy: 1 });
    expect(alice.net).toBe(3n * GEN); // (5 + 2) back - (2 + 2) staked
    expect(bob).toMatchObject({ picks: 4, settled: 2, correct: 1, open: 1, accuracy: 0.5 });
    expect(bob.net).toBe(-1n * GEN); // 3 + 0 + 2 back - 6 staked on resolved picks
    expect(bob.staked).toBe(8n * GEN);
  });

  it("filters by league", () => {
    const sa = buildLeaderboard(rows, "SA");
    expect(sa).toHaveLength(1);
    expect(sa[0]).toMatchObject({ owner: "0xa", correct: 1, picks: 1 });
  });
});

describe("aiRecord", () => {
  it("scores AI calls only on settled fixtures", () => {
    const calls: AiCallRow[] = [
      { match_id: "pl-1", league: "PL", pick: "HOME", confidence: "high", fixture_status: "SETTLED", fixture_result: "HOME" },
      { match_id: "pl-3", league: "PL", pick: "HOME", confidence: "low", fixture_status: "SETTLED", fixture_result: "AWAY" },
      { match_id: "pl-4", league: "PL", pick: "DRAW", confidence: "medium", fixture_status: "OPEN", fixture_result: "" },
    ];
    expect(aiRecord(calls)).toEqual({ total: 3, settled: 2, correct: 1, accuracy: 0.5 });
    expect(aiRecord(calls, "SA")).toEqual({ total: 0, settled: 0, correct: 0, accuracy: 0 });
  });
});

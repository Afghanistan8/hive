// Pure planning logic for the keeper — no I/O, unit-tested.
// Every action it plans is a permissionless contract call any wallet could make.

import type { CryptoMarket, Fixture } from "../hive/types";

export const DAY = 86_400;
export const HOUR = 3_600;

export interface KeeperLimits {
  /** How often the cron fires (seconds); used for stateless retry spacing. */
  interval: number;
  maxResolveMarkets: number;
  maxResolveFixtures: number;
  maxAiCalls: number;
  maxPostpones: number;
  aiCallHorizon: number;
  retryEvery: number;
}

export const DEFAULT_LIMITS: KeeperLimits = {
  interval: 15 * 60,
  maxResolveMarkets: 3,
  maxResolveFixtures: 3,
  maxAiCalls: 2,
  maxPostpones: 2,
  aiCallHorizon: 36 * HOUR,
  retryEvery: HOUR,
};

/**
 * Stateless retry spacing: act in the first cron window after `eligibleAt`, then
 * once every `retryEvery` seconds. Avoids paying fees for a revert every run.
 */
export function isDue(now: number, eligibleAt: number, limits: KeeperLimits): boolean {
  if (now < eligibleAt) return false;
  return (now - eligibleAt) % limits.retryEvery < limits.interval;
}

export function gmt1Day(nowSec: number, offsetDays: number): string {
  return new Date((nowSec + HOUR + offsetDays * DAY) * 1000).toISOString().slice(0, 10);
}

export function planMarketResolves(markets: CryptoMarket[], now: number, limits = DEFAULT_LIMITS): CryptoMarket[] {
  return markets
    .filter((m) => m.state === "PENDING" && Number(m.positions_count) > 0 && (isDue(now, m.settles_at, limits) || now >= m.terminal_refund_at))
    .sort((a, b) => a.settles_at - b.settles_at)
    .slice(0, limits.maxResolveMarkets);
}

export function planFixtureResolves(fixtures: Fixture[], now: number, limits = DEFAULT_LIMITS): Fixture[] {
  // Worth settling when money or an AI call is riding on it; always attempt once the 7-day refund window opens.
  return fixtures
    .filter((f) => f.status === "OPEN" && (Number(f.positions_count) > 0 || !!f.ai_pick))
    .filter((f) => isDue(now, f.kickoff_ts + 2 * HOUR, limits) || isDue(now, f.kickoff_ts + 7 * DAY, limits))
    .sort((a, b) => a.kickoff_ts - b.kickoff_ts)
    .slice(0, limits.maxResolveFixtures);
}

export function planAiCalls(fixtures: Fixture[], now: number, limits = DEFAULT_LIMITS): Fixture[] {
  return fixtures
    .filter((f) => f.status === "OPEN" && !f.ai_pick && f.kickoff_ts > now + 10 * 60 && f.kickoff_ts <= now + limits.aiCallHorizon)
    .sort((a, b) => a.kickoff_ts - b.kickoff_ts)
    .slice(0, limits.maxAiCalls);
}

export function planPostpones(fixtures: Fixture[], displayStatus: Record<string, string>, now: number, limits = DEFAULT_LIMITS): Fixture[] {
  // Display feed is only a hint for *when* to try; the contract re-checks both sources itself.
  return fixtures
    .filter((f) => f.status === "OPEN" && now >= f.kickoff_ts + 3 * HOUR)
    .filter((f) => /POSTPONED|CANCELED|CANCELLED|ABANDONED|SUSPENDED/i.test(displayStatus[f.espn_event_id] ?? ""))
    .slice(0, limits.maxPostpones);
}

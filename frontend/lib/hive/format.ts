import { GEN, PRICE_SCALE } from "./config";
import type { CryptoMarket, CryptoPhase, Fixture, SportsPhase, Wei } from "./types";

export const toWei = (value: Wei | bigint | undefined | null): bigint => {
  if (value === undefined || value === null || value === "") return 0n;
  return typeof value === "bigint" ? value : BigInt(String(value));
};

export function formatGen(value: Wei | bigint | undefined | null, digits = 2): string {
  const wei = toWei(value);
  const whole = wei / GEN;
  const frac = (wei % GEN).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function parseGen(input: string): bigint | null {
  const text = input.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  return BigInt(whole) * GEN + BigInt((frac + "0".repeat(18)).slice(0, 18));
}

export function formatScaledPrice(value: Wei | undefined): string {
  const scaled = toWei(value);
  const whole = scaled / PRICE_SCALE;
  const frac = (scaled % PRICE_SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export function formatUtc(ts: number): string {
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function formatGmt1(ts: number): string {
  return new Date((ts + 3600) * 1000).toISOString().replace("T", " ").slice(0, 16) + " GMT+1";
}

export function formatLocal(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

// The contract's view `phase` uses the chain's latest consensus time, which only
// advances with transactions. For display we re-derive it from the wall clock;
// the contract still enforces every boundary with consensus time.
export function cryptoPhase(m: CryptoMarket, now = nowSeconds()): CryptoPhase {
  if (m.state === "UP" || m.state === "DOWN") return "SETTLED";
  if (m.state === "INCONCLUSIVE" || m.state === "REFUNDED") return "INCONCLUSIVE";
  if (now < m.cutoff_at) return "OPEN";
  if (now < m.settles_at) return "CLOSED";
  return "READY_TO_SETTLE";
}

export function sportsPhase(f: Fixture, now = nowSeconds()): SportsPhase {
  if (f.status === "SETTLED") return "SETTLED";
  if (f.status === "POSTPONED") return "POSTPONED";
  if (f.status === "REFUNDED") return "INCONCLUSIVE";
  if (now < f.kickoff_ts) return "OPEN";
  if (now < f.kickoff_ts + 90 * 60) return "CLOSED";
  return "READY_TO_SETTLE";
}

export function impliedMultiplier(pool: Wei, total: Wei): string {
  const p = toWei(pool);
  const t = toWei(total);
  if (p === 0n) return "—";
  return `${(Number((t * 100n) / p) / 100).toFixed(2)}x`;
}

export function tomorrowGmt1(offsetDays = 1): string {
  return new Date(Date.now() + 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export const shortAddress = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

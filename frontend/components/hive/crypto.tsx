"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { formatCountdown, formatGmt1 } from "@/lib/hive/format";
import { useCandles } from "@/lib/hive/hooks";
import type { CryptoMarket } from "@/lib/hive/types";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/crypto", label: "Markets", exact: true },
  { href: "/crypto/activity", label: "Activity" },
  { href: "/create", label: "Open a market" },
];

export function CryptoTabs() {
  const pathname = usePathname() ?? "";
  return (
    <div className="mb-6 inline-flex flex-wrap gap-1 rounded-full border border-black/10 bg-[#f4f1eb]/70 p-1 backdrop-blur">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={cn("rounded-full px-4 py-1.5 text-[14px] transition", active ? "bg-ink text-[#f6f3ee]" : "text-ink/70 hover:text-ink")}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Display-only hourly chart (Gate.io 1h). Shades the market's GMT+1 candle window
 * and marks its open. Settlement never reads this — the contract fetches its own.
 */
export function PriceChart({ market }: { market: CryptoMarket }) {
  const now = Math.floor(Date.now() / 1000);
  const from = Math.min(market.cutoff_at - 24 * 3600, now - 36 * 3600);
  const to = Math.min(Math.max(market.settles_at + 2 * 3600, now), now);
  const { data, isLoading, error } = useCandles(market.gate_pair, from, to);

  const chart = useMemo(() => {
    const candles = data?.candles ?? [];
    if (candles.length < 2) return null;
    const W = 720, H = 220, P = 8;
    const t0 = candles[0].t, t1 = Math.max(candles[candles.length - 1].t + 3600, market.settles_at);
    const lo = Math.min(...candles.map((c) => c.l)), hi = Math.max(...candles.map((c) => c.h));
    const pad = (hi - lo) * 0.08 || hi * 0.01;
    const x = (t: number) => P + ((t - t0) / (t1 - t0)) * (W - 2 * P);
    const y = (v: number) => P + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 2 * P);
    const line = candles.map((c, i) => `${i ? "L" : "M"}${x(c.t + 3600).toFixed(1)},${y(c.c).toFixed(1)}`).join(" ");
    const area = `${line} L${x(candles[candles.length - 1].t + 3600).toFixed(1)},${H - P} L${x(candles[0].t + 3600).toFixed(1)},${H - P} Z`;
    const inWindow = candles.filter((c) => c.t >= market.cutoff_at && c.t < market.settles_at);
    const openPrice = inWindow[0]?.o;
    const last = candles[candles.length - 1];
    return { W, H, P, x, y, line, area, openPrice, last, inWindow };
  }, [data, market.cutoff_at, market.settles_at]);

  const change = chart?.openPrice ? ((chart.last.c - chart.openPrice) / chart.openPrice) * 100 : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">{market.asset} price</h2>
        <div className="flex items-baseline gap-3 text-sm">
          {chart && <span className="text-lg font-semibold tabular-nums">${chart.last.c.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>}
          {change !== null && (
            <span className={cn("font-semibold tabular-nums", change > 0 ? "text-emerald-800" : "text-[#b53a17]")}>
              {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% vs candle open
            </span>
          )}
        </div>
      </div>
      {isLoading && <div className="h-[220px] animate-pulse rounded-lg bg-black/[0.04]" />}
      {error && <p className="text-sm text-muted-foreground">Display feed unavailable right now.</p>}
      {chart && (
        <svg viewBox={`0 0 ${chart.W} ${chart.H}`} className="h-auto w-full" role="img" aria-label={`${market.asset} hourly price`}>
          <defs>
            <linearGradient id="hive-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ee6a2c" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ee6a2c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect
            x={chart.x(market.cutoff_at)}
            y={chart.P}
            width={Math.max(0, chart.x(market.settles_at) - chart.x(market.cutoff_at))}
            height={chart.H - 2 * chart.P}
            fill="#161514"
            opacity="0.045"
            rx="6"
          />
          <path d={chart.area} fill="url(#hive-area)" />
          <path d={chart.line} fill="none" stroke="#d9481f" strokeWidth="2" strokeLinejoin="round" />
          {chart.openPrice && (
            <g>
              <line x1={chart.P} x2={chart.W - chart.P} y1={chart.y(chart.openPrice)} y2={chart.y(chart.openPrice)} stroke="#161514" strokeDasharray="4 5" strokeWidth="1" opacity="0.45" />
              <text x={chart.W - chart.P - 4} y={chart.y(chart.openPrice) - 6} textAnchor="end" fontSize="11" fill="#161514" opacity="0.6">candle open</text>
            </g>
          )}
        </svg>
      )}
      <p className="text-xs text-muted-foreground">Shaded: the market's GMT+1 candle window. Display-only Gate.io feed — settlement fetches CoinGecko and Gate.io itself.</p>
    </div>
  );
}

export function Lifecycle({ market, now }: { market: CryptoMarket; now: number }) {
  const resolved = market.state !== "PENDING";
  const steps = [
    { label: "Market opened", ts: market.created_at, done: true },
    { label: "Entries close · GMT+1 day starts", ts: market.cutoff_at, done: now >= market.cutoff_at },
    { label: "Candle completes · resolvable", ts: market.settles_at, done: now >= market.settles_at },
    { label: resolved ? `Resolved · ${market.result}` : "Resolve (anyone)", ts: market.resolved_at || market.settles_at, done: resolved },
    { label: "Terminal refund fallback", ts: market.terminal_refund_at, done: market.state === "REFUNDED" },
  ];
  const activeIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold">Lifecycle</h2>
      <ol className="relative space-y-4 border-l border-black/15 pl-5">
        {steps.map((s, i) => (
          <li key={s.label} className="relative">
            <span
              className={cn(
                "absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2",
                s.done ? "border-ink bg-ink" : i === activeIdx ? "border-[#ee6a2c] bg-[#ee6a2c]" : "border-black/25 bg-[#f6f3ee]",
              )}
            />
            <div className={cn("text-sm font-medium", !s.done && i !== activeIdx && "text-ink/50")}>{s.label}</div>
            <div className="text-xs text-muted-foreground">
              {formatGmt1(s.ts)}
              {i === activeIdx && s.ts > now && <> · in {formatCountdown(s.ts - now)}</>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

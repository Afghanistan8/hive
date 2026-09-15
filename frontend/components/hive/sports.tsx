"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { HIVE_SPORTS_ADDRESS } from "@/lib/hive/config";
import type { LiveEvent } from "@/lib/hive/espn";
import { formatGmt1 } from "@/lib/hive/format";
import { useAiCall } from "@/lib/hive/hooks";
import type { Fixture } from "@/lib/hive/types";
import { cn } from "@/lib/utils";
import { TxDialog } from "./TxDialog";

const TABS = [
  { href: "/sports", label: "Fixtures", exact: true },
  { href: "/sports/tables", label: "Tables" },
  { href: "/sports/picks", label: "My Picks" },
  { href: "/sports/leaderboard", label: "Leaderboard" },
];

export function SportsTabs() {
  const pathname = usePathname() ?? "";
  return (
    <div className="mb-6 inline-flex flex-wrap gap-1 rounded-full border border-black/10 bg-[#f4f1eb]/70 p-1 backdrop-blur">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn("rounded-full px-4 py-1.5 text-[14px] transition", active ? "bg-ink text-[#f6f3ee]" : "text-ink/70 hover:text-ink")}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export function LeaguePills({ value, onChange, includeAll = true }: { value: string; onChange: (v: string) => void; includeAll?: boolean }) {
  const items = [
    ...(includeAll ? [{ code: "", label: "All" }] : []),
    { code: "PL", label: "Premier League" },
    { code: "PD", label: "La Liga" },
    { code: "BL1", label: "Bundesliga" },
    { code: "SA", label: "Serie A" },
    { code: "FL1", label: "Ligue 1" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((l) => (
        <button
          key={l.code || "all"}
          onClick={() => onChange(l.code)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition",
            value === l.code ? "border-ink bg-ink text-[#f6f3ee]" : "border-black/10 text-muted-foreground hover:border-black/30",
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

/** Club crest with an initials fallback (display-only, from ESPN). */
export function Crest({ src, name, size = 28, className }: { src?: string; name: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  if (!src || broken) {
    return (
      <span
        className={cn("inline-grid shrink-0 place-items-center rounded-full bg-black/[0.07] font-semibold text-ink/60", className)}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        aria-hidden
      >
        {initials}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size }} />;
}

/** Live / full-time score chip from the display feed. Never used for settlement. */
export function LiveScore({ live, className }: { live?: LiveEvent; className?: string }) {
  if (!live || live.state === "pre") return null;
  const isLive = live.state === "in";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        isLive ? "bg-[#ee6a2c]/12 text-[#b53a17]" : "bg-black/[0.06] text-ink/70",
        className,
      )}
      title="Display feed (ESPN). Settlement is decided on-chain from ESPN and BBC."
    >
      {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ee6a2c]" />}
      {live.homeScore}–{live.awayScore} · {live.detail || (isLive ? "LIVE" : "FT")}
    </span>
  );
}

export function pickLabel(f: Pick<Fixture, "home" | "away">, pick: string) {
  return pick === "HOME" ? f.home : pick === "AWAY" ? f.away : pick === "DRAW" ? "Draw" : "—";
}

export function AiPickChip({ fixture }: { fixture: Fixture }) {
  if (!fixture.ai_pick) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-ink/70" title="Pre-match pick published by GenLayer validators">
      <Sparkles className="h-3 w-3 text-[#d9481f]" /> AI: {pickLabel(fixture, fixture.ai_pick)}
    </span>
  );
}

/** Validators' pre-match forecast: request it, then show pick, confidence, reason and the exact agreed text. */
export function AiCallPanel({ fixture, now }: { fixture: Fixture; now: number }) {
  const { data: call } = useAiCall(fixture.match_id);
  const open = fixture.status === "OPEN" && now < fixture.kickoff_ts;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#d9481f]" />
        <h2 className="text-xl font-bold">AI Call</h2>
      </div>
      {call?.exists ? (
        <>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-[-0.03em]">{pickLabel(fixture, call.pick ?? "")}</span>
            <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-xs capitalize">{call.confidence} confidence</span>
            {fixture.status === "SETTLED" && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", call.pick === fixture.result ? "bg-emerald-600/10 text-emerald-800" : "bg-[#d9481f]/10 text-[#b53a17]")}>
                {call.pick === fixture.result ? "Called it" : "Missed"}
              </span>
            )}
          </div>
          {call.reason && <p className="text-sm text-ink/75">{call.reason}</p>}
          <p className="text-xs text-muted-foreground">Published {call.requested_at ? formatGmt1(call.requested_at) : ""} · holds no funds</p>
          {call.raw && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Exact text validators agreed on</summary>
              <code className="mt-1 block whitespace-pre-wrap break-all rounded bg-black/[0.04] p-2">{call.raw}</code>
            </details>
          )}
        </>
      ) : open ? (
        <>
          <p className="text-sm text-muted-foreground">
            No forecast yet. Anyone can ask the network: validators read the live {fixture.league_name} table and publish a
            home / draw / away pick with a reason. It never touches the pools.
          </p>
          <TxDialog
            address={HIVE_SPORTS_ADDRESS}
            method="request_ai_call"
            args={[fixture.match_id]}
            variant="outline"
            className="w-full"
            title="Ask validators for a pre-match pick"
            description="The leader's model forecasts from the league table; every validator's model checks the forecast against fixed criteria (non-comparative consensus). One call per fixture, before kickoff."
            label="Request AI Call"
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No AI Call was requested before kickoff.</p>
      )}
    </div>
  );
}

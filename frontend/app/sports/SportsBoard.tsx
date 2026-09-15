"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Card, ErrorBox, Loading, LocalTime, PageHeader, ReadSource } from "@/components/hive/bits";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { AiPickChip, Crest, LeaguePills, LiveScore, SportsTabs } from "@/components/hive/sports";
import { HIVE_SPORTS_ADDRESS } from "@/lib/hive/config";
import { formatCountdown, formatGen, gatePhase, sportsPhase, toWei } from "@/lib/hive/format";
import { useFixtures, useNow, useScoreboard } from "@/lib/hive/hooks";
import type { Snapshot } from "@/lib/hive/serverData";
import type { Fixture } from "@/lib/hive/types";

const phaseOf = (f: Fixture, now: number) => gatePhase(sportsPhase(f, now), f.phase).phase;

export function SportsBoard({ initial }: { initial: Snapshot<Fixture[]> | null }) {
  const { data, isPending, error, refetch } = useFixtures(initial);
  const [league, setLeague] = useState("");
  const now = useNow(1000, initial?.at);

  // Open markets first (soonest kickoff, busiest pot breaks ties), then games awaiting a result,
  // then results (most recent first). Last night's settled match never leads the page.
  const groups = useMemo(() => {
    const rows = (data ?? []).filter((f) => !league || f.league === league);
    const open = rows.filter((f) => phaseOf(f, now) === "OPEN").sort((a, b) => a.kickoff_ts - b.kickoff_ts || Number(toWei(b.total_pool) - toWei(a.total_pool)));
    const live = rows.filter((f) => ["CLOSED", "READY_TO_SETTLE"].includes(phaseOf(f, now))).sort((a, b) => a.kickoff_ts - b.kickoff_ts);
    const done = rows.filter((f) => !["OPEN", "CLOSED", "READY_TO_SETTLE"].includes(phaseOf(f, now))).sort((a, b) => b.kickoff_ts - a.kickoff_ts);
    return { open, live, done, total: rows.length };
  }, [data, league, now]);

  const staked = useMemo(() => (data ?? []).reduce((s, f) => s + toWei(f.total_pool), 0n), [data]);

  return (
    <div>
      <PageHeader
        title="Hive Match"
        subtitle="Pari-mutuel 1X2 markets for Europe's top five leagues. Stake before kickoff; after full time anyone can resolve, and the contract only pays out when ESPN and BBC Sport report the same score."
      />
      <SportsTabs />
      {!HIVE_SPORTS_ADDRESS && <ErrorBox error="NEXT_PUBLIC_HIVE_SPORTS_ADDRESS is not set in frontend/.env" />}
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <LeaguePills value={league} onChange={setLeague} />
        {data && (
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">{formatGen(staked)} GEN</b> staked across {data.length} fixtures
          </p>
        )}
      </div>
      {HIVE_SPORTS_ADDRESS && isPending && !error && <Loading what="fixtures" />}
      {error && <ErrorBox error={error} onRetry={() => refetch()} />}

      <Section title="Open for staking" hint="closes at kickoff" rows={groups.open} now={now} />
      <Section title="Awaiting result" hint="resolvable 90 minutes after kickoff" rows={groups.live} now={now} />
      <Section title="Results" hint="settled from ESPN + BBC Sport" rows={groups.done} now={now} />

      {data && groups.total === 0 && (
        <p className="py-10 text-center text-muted-foreground">
          {data.length === 0 ? "No fixtures are registered on the contract yet." : "No fixtures for this league yet."}
        </p>
      )}
      <ReadSource label="Sports" address={HIVE_SPORTS_ADDRESS} count={data?.length} noun="fixtures" />
    </div>
  );
}

function Section({ title, hint, rows, now }: { title: string; hint: ReactNode; rows: Fixture[]; now: number }) {
  if (!rows.length) return null;
  return (
    <section className="mb-9">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>
        <span className="text-sm text-muted-foreground">{rows.length} · {hint}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((f) => (
          <FixtureCard key={f.match_id} f={f} now={now} />
        ))}
      </div>
    </section>
  );
}

function FixtureCard({ f, now }: { f: Fixture; now: number }) {
  const { data: board } = useScoreboard(f.league, f.kickoff_ts);
  const live = board?.[f.espn_event_id];
  const phase = phaseOf(f, now);

  return (
    <Link href={`/sports/${f.match_id}`}>
      <Card className="h-full space-y-3 transition-colors hover:border-black/25">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{f.league_name}</span>
          <span className="flex items-center gap-1.5">
            <LiveScore live={live} />
            <PhaseBadge phase={phase} />
          </span>
        </div>
        <div className="space-y-1.5">
          <TeamLine name={f.home} logo={live?.homeLogo} score={f.status === "SETTLED" ? f.home_goals : undefined} />
          <TeamLine name={f.away} logo={live?.awayLogo} score={f.status === "SETTLED" ? f.away_goals : undefined} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span><LocalTime ts={f.kickoff_ts} /></span>
          {phase === "OPEN" && (
            <span suppressHydrationWarning>
              · kicks off in <b className="text-foreground">{formatCountdown(f.kickoff_ts - now)}</b>
            </span>
          )}
          <AiPickChip fixture={f} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {([["Home", f.pool_home, "HOME"], ["Draw", f.pool_draw, "DRAW"], ["Away", f.pool_away, "AWAY"]] as const).map(([label, pool, key]) => (
            <div key={label} className={f.result === key ? "rounded-md bg-ink py-1.5 text-[#f6f3ee]" : "rounded-md bg-black/[0.04] py-1.5"}>
              <div className={f.result === key ? "text-[#f6f3ee]/70" : "text-muted-foreground"}>{label}</div>
              <div className="font-semibold">{formatGen(pool)} GEN</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Pot {formatGen(f.total_pool)} GEN · {f.positions_count} wallet{f.positions_count === 1 ? "" : "s"}
          {f.status === "SETTLED" && f.refund_all && " · nobody backed the result — all stakes refunded"}
        </div>
      </Card>
    </Link>
  );
}

function TeamLine({ name, logo, score }: { name: string; logo?: string; score?: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2.5">
        <Crest src={logo} name={name} size={24} />
        <span className="truncate text-[17px] font-semibold tracking-[-0.02em]">{name}</span>
      </span>
      {score !== undefined && <span className="text-lg font-semibold tabular-nums">{score}</span>}
    </div>
  );
}

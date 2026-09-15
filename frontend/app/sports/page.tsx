"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/hive/bits";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { AiPickChip, Crest, LeaguePills, LiveScore, SportsTabs } from "@/components/hive/sports";
import { HIVE_SPORTS_ADDRESS } from "@/lib/hive/config";
import { formatCountdown, formatGen, formatLocal, sportsPhase } from "@/lib/hive/format";
import { useFixtures, useNow, useScoreboard } from "@/lib/hive/hooks";
import type { Fixture } from "@/lib/hive/types";

export default function SportsPage() {
  const { data, isLoading, error } = useFixtures();
  const [league, setLeague] = useState("");
  const now = useNow(1000);

  const rows = useMemo(
    () => (data ?? []).filter((f) => !league || f.league === league).sort((a, b) => a.kickoff_ts - b.kickoff_ts),
    [data, league],
  );

  return (
    <div>
      <PageHeader
        title="Hive Match"
        subtitle="Pari-mutuel 1X2 markets for Europe's top five leagues. Stake before kickoff; after full time anyone can resolve, and the contract only pays out when ESPN and BBC Sport report the same score."
      />
      <SportsTabs />
      {!HIVE_SPORTS_ADDRESS && <ErrorBox error="NEXT_PUBLIC_HIVE_SPORTS_ADDRESS is not set in frontend/.env" />}
      <div className="mb-5">
        <LeaguePills value={league} onChange={setLeague} />
      </div>
      {isLoading && <Loading what="fixtures" />}
      {error && <ErrorBox error={error} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((f) => (
          <FixtureCard key={f.match_id} f={f} now={now} />
        ))}
      </div>
      {data && rows.length === 0 && <p className="py-10 text-center text-muted-foreground">No fixtures for this league yet.</p>}
    </div>
  );
}

function FixtureCard({ f, now }: { f: Fixture; now: number }) {
  const { data: board } = useScoreboard(f.league, f.kickoff_ts);
  const live = board?.[f.espn_event_id];
  const phase = sportsPhase(f, now);

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
          <span>{formatLocal(f.kickoff_ts)}</span>
          {phase === "OPEN" && <span>· kicks off in <b className="text-foreground">{formatCountdown(f.kickoff_ts - now)}</b></span>}
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
        <div className="text-xs text-muted-foreground">Pot {formatGen(f.total_pool)} GEN · {f.positions_count} wallets</div>
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

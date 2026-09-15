"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/hive/bits";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { HIVE_SPORTS_ADDRESS } from "@/lib/hive/config";
import { formatCountdown, formatGen, formatLocal, sportsPhase } from "@/lib/hive/format";
import { useFixtures, useNow } from "@/lib/hive/hooks";
import { cn } from "@/lib/utils";

const LEAGUES = [
  { code: "", label: "All" },
  { code: "PL", label: "Premier League" },
  { code: "PD", label: "La Liga" },
  { code: "BL1", label: "Bundesliga" },
  { code: "SA", label: "Serie A" },
  { code: "FL1", label: "Ligue 1" },
];

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
      {!HIVE_SPORTS_ADDRESS && <ErrorBox error="NEXT_PUBLIC_HIVE_SPORTS_ADDRESS is not set in frontend/.env" />}
      <div className="mb-5 flex flex-wrap gap-2">
        {LEAGUES.map((l) => (
          <button
            key={l.code}
            onClick={() => setLeague(l.code)}
            className={cn("rounded-full border px-3 py-1 text-sm", league === l.code ? "border-accent bg-accent/20" : "border-white/10 text-muted-foreground hover:border-white/30")}
          >
            {l.label}
          </button>
        ))}
      </div>
      {isLoading && <Loading what="fixtures" />}
      {error && <ErrorBox error={error} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((f) => {
          const phase = sportsPhase(f, now);
          return (
            <Link key={f.match_id} href={`/sports/${f.match_id}`}>
              <Card className="h-full space-y-3 transition-colors hover:border-accent/60">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{f.league_name}</span>
                  <PhaseBadge phase={phase} />
                </div>
                <div className="text-lg font-semibold leading-tight">
                  {f.home} <span className="text-muted-foreground">vs</span> {f.away}
                </div>
                {f.status === "SETTLED" ? (
                  <div className="text-sm">Full time {f.home_goals}–{f.away_goals} · {f.result}</div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {formatLocal(f.kickoff_ts)}
                    {phase === "OPEN" && <> · kicks off in <b className="text-foreground">{formatCountdown(f.kickoff_ts - now)}</b></>}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  {([["Home", f.pool_home], ["Draw", f.pool_draw], ["Away", f.pool_away]] as const).map(([label, pool]) => (
                    <div key={label} className="rounded-md bg-white/5 py-1.5">
                      <div className="text-muted-foreground">{label}</div>
                      <div className="font-semibold">{formatGen(pool)} GEN</div>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">Pot {formatGen(f.total_pool)} GEN · {f.positions_count} wallets</div>
              </Card>
            </Link>
          );
        })}
      </div>
      {data && rows.length === 0 && <p className="py-10 text-center text-muted-foreground">No fixtures for this league yet.</p>}
    </div>
  );
}

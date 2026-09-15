"use client";

import { useState } from "react";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/hive/bits";
import { Crest, LeaguePills, SportsTabs } from "@/components/hive/sports";
import { LEAGUE_META } from "@/lib/hive/espn";
import { useFixtures, useStandings } from "@/lib/hive/hooks";
import { cn } from "@/lib/utils";

export default function TablesPage() {
  const [league, setLeague] = useState("PL");
  const { data, isLoading, error } = useStandings(league);
  const { data: fixtures } = useFixtures();
  const meta = LEAGUE_META.find((l) => l.code === league)!;
  const zones = [...new Map((data?.rows ?? []).filter((r) => r.note).map((r) => [r.note, r.noteColor])).entries()];
  const openCount = (fixtures ?? []).filter((f) => f.league === league && f.status === "OPEN").length;

  return (
    <div>
      <PageHeader
        title="League tables"
        subtitle="Live standings for Europe's top five leagues — context for your picks. Tables are display-only; markets settle on-chain from ESPN and BBC Sport."
      />
      <SportsTabs />
      <div className="mb-5">
        <LeaguePills value={league} onChange={setLeague} includeAll={false} />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/10 px-5 py-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.035em]">{meta.name}</h2>
            <p className="text-xs text-muted-foreground">{data?.season ?? ""} · {openCount} open HIVE fixture{openCount === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {zones.map(([note, color]) => (
              <span key={note} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {note}
              </span>
            ))}
          </div>
        </div>
        {isLoading && <Loading what="the table" />}
        {error && <div className="p-5"><ErrorBox error={error} /></div>}
        {data && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-black/10">
                  <th className="w-12 py-2.5 pl-5">#</th>
                  <th className="py-2.5">Club</th>
                  <th className="py-2.5 text-center">P</th>
                  <th className="py-2.5 text-center">W</th>
                  <th className="py-2.5 text-center">D</th>
                  <th className="py-2.5 text-center">L</th>
                  <th className="py-2.5 text-center">GF</th>
                  <th className="py-2.5 text-center">GA</th>
                  <th className="py-2.5 text-center">GD</th>
                  <th className="py-2.5 pr-5 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.team} className="border-b border-black/[0.06] last:border-0 hover:bg-black/[0.03]">
                    <td className="py-2.5 pl-5">
                      <span className="relative inline-flex items-center gap-2 font-semibold tabular-nums">
                        <span className="h-5 w-1 rounded-full" style={{ background: r.noteColor || "transparent" }} />
                        {r.rank}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-2.5">
                        <Crest src={r.logo} name={r.team} size={22} />
                        <span className="font-medium">{r.team}</span>
                      </span>
                    </td>
                    {[r.played, r.won, r.drawn, r.lost, r.gf, r.ga].map((v, i) => (
                      <td key={i} className="py-2.5 text-center tabular-nums text-ink/80">{v}</td>
                    ))}
                    <td className={cn("py-2.5 text-center tabular-nums", r.gd.startsWith("-") ? "text-[#b53a17]" : r.gd === "0" ? "text-ink/70" : "text-emerald-800")}>{r.gd}</td>
                    <td className="py-2.5 pr-5 text-right text-base font-semibold tabular-nums">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

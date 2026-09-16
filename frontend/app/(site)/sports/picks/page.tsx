"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, ErrorBox, Loading, PageHeader, Stat } from "@/components/hive/bits";
import { ClaimDialog } from "@/components/hive/ClaimDialog";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { AiPickChip, SportsTabs, pickLabel } from "@/components/hive/sports";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/genlayer/wallet";
import { HIVE_SPORTS_ADDRESS } from "@/lib/hive/config";
import { formatGen, formatLocal, sportsPhase, toWei } from "@/lib/hive/format";
import { useNow, usePortfolio } from "@/lib/hive/hooks";
import { pickOutcome, type PickOutcome } from "@/lib/hive/leaderboard";
import { cn } from "@/lib/utils";

const FILTERS: { key: "ALL" | PickOutcome; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "OPEN", label: "Open" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
  { key: "REFUND", label: "Refunded" },
];

const OUTCOME_STYLE: Record<PickOutcome, string> = {
  OPEN: "bg-black/[0.05] text-ink/70",
  WON: "bg-emerald-600/10 text-emerald-800",
  LOST: "bg-[#d9481f]/10 text-[#b53a17]",
  REFUND: "bg-amber-500/10 text-amber-800",
};

export default function MyPicksPage() {
  const { address, isConnected, requestConnect } = useWallet();
  const { sports } = usePortfolio(address);
  const now = useNow(10_000);
  const [filter, setFilter] = useState<"ALL" | PickOutcome>("ALL");

  const rows = useMemo(
    () =>
      (sports.data ?? []).map((r) => ({
        ...r,
        outcome: pickOutcome({ pick: r.pick, fixture_status: r.fixture.status, fixture_result: r.fixture.result }),
      })),
    [sports.data],
  );

  const stats = useMemo(() => {
    let staked = 0n, back = 0n, settled = 0, won = 0, open = 0, claimable = 0n;
    for (const r of rows) {
      staked += toWei(r.stake);
      claimable += toWei(r.claimable);
      if (r.outcome === "OPEN") { open++; continue; }
      back += toWei(r.payout) + toWei(r.claimable);
      if (r.outcome !== "REFUND") { settled++; if (r.outcome === "WON") won++; }
    }
    const resolvedStake = rows.filter((r) => r.outcome !== "OPEN").reduce((s, r) => s + toWei(r.stake), 0n);
    return { staked, net: back - resolvedStake, settled, won, open, claimable };
  }, [rows]);

  if (!isConnected || !address) {
    return (
      <div>
        <PageHeader title="My Picks" subtitle="Every prediction you've made, straight from the contract." />
        <SportsTabs />
        <Card className="space-y-4">
          <p className="text-muted-foreground">Connect your wallet to see your picks, results and anything you can claim.</p>
          <Button variant="gradient" onClick={requestConnect}>Connect wallet</Button>
        </Card>
      </div>
    );
  }

  const visible = rows.filter((r) => filter === "ALL" || r.outcome === filter);

  return (
    <div>
      <PageHeader title="My Picks" subtitle="Every prediction you've made, straight from the contract." />
      <SportsTabs />

      <Card className="mb-6 grid grid-cols-2 gap-5 md:grid-cols-5">
        <Stat label="Picks" value={rows.length} hint={`${stats.open} open`} />
        <Stat label="Correct" value={`${stats.won}/${stats.settled}`} hint={stats.settled ? `${Math.round((stats.won / stats.settled) * 100)}% accuracy` : "no settled picks yet"} />
        <Stat label="Staked" value={`${formatGen(stats.staked)} GEN`} />
        <Stat label="Net on settled" value={`${stats.net >= 0n ? "+" : "−"}${formatGen(stats.net >= 0n ? stats.net : -stats.net)} GEN`} />
        <Stat label="Claimable" value={<span className="text-[#b53a17]">{formatGen(stats.claimable)} GEN</span>} />
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn("rounded-full border px-3 py-1 text-sm", filter === f.key ? "border-ink bg-ink text-[#f6f3ee]" : "border-black/10 text-muted-foreground hover:border-black/30")}
          >
            {f.label} {f.key !== "ALL" && <span className="opacity-60">{rows.filter((r) => r.outcome === f.key).length}</span>}
          </button>
        ))}
      </div>

      {sports.isLoading && <Loading what="your picks" />}
      {sports.error && <ErrorBox error={sports.error} />}
      {sports.data?.length === 0 && (
        <Card className="text-sm text-muted-foreground">
          No picks yet. <Link href="/sports" className="text-ink underline decoration-ember underline-offset-4">Pick a fixture</Link> and stake 2 GEN on home, draw or away.
        </Card>
      )}

      <div className="space-y-2">
        {visible.map((r) => {
          const f = r.fixture;
          const claimable = toWei(r.claimable);
          return (
            <Card key={f.match_id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <Link href={`/sports/${f.match_id}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{f.league_name}</span>·<span>{formatLocal(f.kickoff_ts)}</span>
                  <PhaseBadge phase={sportsPhase(f, now)} />
                  <AiPickChip fixture={f} />
                </div>
                <div className="mt-1 truncate text-lg font-semibold tracking-[-0.02em]">
                  {f.home} <span className="text-muted-foreground">vs</span> {f.away}
                  {f.status === "SETTLED" && <span className="ml-2 text-ink/60">{f.home_goals}–{f.away_goals}</span>}
                </div>
                <div className="text-sm text-ink/75">
                  Your pick: <b>{pickLabel(f, r.pick)}</b> · {formatGen(r.stake)} GEN
                  {r.claimed && <> · received {formatGen(r.payout)} GEN</>}
                </div>
              </Link>
              <div className="flex items-center gap-3">
                <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", OUTCOME_STYLE[r.outcome])}>{r.outcome === "REFUND" ? "REFUNDED" : r.outcome}</span>
                {!r.claimed && claimable > 0n && (
                  <ClaimDialog
                    address={HIVE_SPORTS_ADDRESS}
                    method={f.refund_all ? "refund" : "claim"}
                    args={[f.match_id]}
                    amount={claimable}
                    label={`${f.refund_all ? "Refund" : "Claim"} ${formatGen(claimable)}`}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

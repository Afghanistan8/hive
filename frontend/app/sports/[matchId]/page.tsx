"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { BackLink, Card, ErrorBox, Loading, SourceLink, Stat } from "@/components/hive/bits";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { ClaimDialog } from "@/components/hive/ClaimDialog";
import { TxDialog } from "@/components/hive/TxDialog";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/lib/genlayer/wallet";
import { HIVE_SPORTS_ADDRESS, SPORTS_MIN_STAKE } from "@/lib/hive/config";
import { formatCountdown, formatGen, formatGmt1, formatLocal, formatUtc, impliedMultiplier, parseGen, sportsPhase, toWei } from "@/lib/hive/format";
import { useFixture, useNow, useSportsEvidence, useSportsEvidenceRaw, useSportsPosition, useSportsSourceUrls } from "@/lib/hive/hooks";
import type { SourceReading } from "@/lib/hive/types";
import { cn } from "@/lib/utils";

const PICKS = ["HOME", "DRAW", "AWAY"] as const;

function Reading({ label, r }: { label: string; r?: SourceReading }) {
  return (
    <div className="rounded-md bg-white/5 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{r ? (r.status === "FINISHED" ? `FT ${r.home_goals}–${r.away_goals}` : r.status) : "—"}</div>
    </div>
  );
}

export default function FixturePage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { address } = useWallet();
  const now = useNow(1000);
  const { data: f, isLoading, error } = useFixture(matchId);
  const { data: position } = useSportsPosition(matchId, address);
  const { data: sources } = useSportsSourceUrls(matchId);
  const { data: evidence } = useSportsEvidence(matchId, !!f && f.status !== "OPEN");
  const { data: evidenceRaw } = useSportsEvidenceRaw(matchId, !!f && f.status !== "OPEN");
  const [pick, setPick] = useState<(typeof PICKS)[number]>("HOME");
  const [amount, setAmount] = useState(String(SPORTS_MIN_STAKE));

  if (isLoading) return <Loading what="fixture" />;
  if (error) return <ErrorBox error={error} />;
  if (!f) return null;

  const phase = sportsPhase(f, now);
  const pools = { HOME: f.pool_home, DRAW: f.pool_draw, AWAY: f.pool_away };
  const labels = { HOME: f.home, DRAW: "Draw", AWAY: f.away };
  const lockedPick = position?.exists ? position.pick : "";
  const activePick = (lockedPick || pick) as (typeof PICKS)[number];
  const wei = parseGen(amount);
  const stakeError = wei === null ? "Enter a GEN amount" : wei < BigInt(SPORTS_MIN_STAKE) * 10n ** 18n ? `Minimum stake is ${SPORTS_MIN_STAKE} GEN` : "";
  const claimable = toWei(position?.claimable);

  return (
    <div className="space-y-5">
      <BackLink href="/sports">All fixtures</BackLink>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{f.league_name} · match <code>{f.match_id}</code></span>
          <PhaseBadge phase={phase} />
        </div>
        <h1 className="text-3xl font-bold md:text-4xl">
          {f.home} <span className="text-muted-foreground">vs</span> {f.away}
        </h1>
        {f.status === "SETTLED" && (
          <div className="text-2xl font-semibold text-accent">Full time {f.home_goals}–{f.away_goals} · {labels[f.result as keyof typeof labels]} {f.result !== "DRAW" && "win"}</div>
        )}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Kickoff" value={formatLocal(f.kickoff_ts)} hint={formatUtc(f.kickoff_ts)} />
          <Stat label={phase === "OPEN" ? "Betting closes in" : "Status"} value={phase === "OPEN" ? formatCountdown(f.kickoff_ts - now) : f.status} />
          <Stat label="Total pot" value={`${formatGen(f.total_pool)} GEN`} hint={`${f.positions_count} wallets`} />
          <Stat label="Resolvable from" value={formatLocal(f.kickoff_ts + 5400)} hint="kickoff + 90 min" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <h2 className="text-xl font-bold">Pools</h2>
          <div className="grid grid-cols-3 gap-3">
            {PICKS.map((p) => (
              <button
                key={p}
                disabled={phase !== "OPEN" || (!!lockedPick && lockedPick !== p)}
                onClick={() => setPick(p)}
                className={cn(
                  "rounded-lg border-2 p-4 text-left transition-all disabled:cursor-not-allowed",
                  activePick === p ? "border-accent bg-accent/15" : "border-white/10 hover:border-white/25",
                  f.result === p && "border-emerald-400 bg-emerald-400/10",
                )}
              >
                <div className="text-sm font-semibold">{labels[p]}</div>
                <div className="mt-1 text-lg">{formatGen(pools[p])} GEN</div>
                <div className="text-xs text-muted-foreground">pays {impliedMultiplier(pools[p], f.total_pool)} now</div>
              </button>
            ))}
          </div>

          {phase === "OPEN" && (
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="text-sm text-muted-foreground">
                {lockedPick
                  ? <>You backed <b className="text-foreground">{labels[lockedPick as keyof typeof labels]}</b> with {formatGen(position?.stake)} GEN. You can top up the same side.</>
                  : "One side per wallet; same-side top-ups allowed. Minimum 2 GEN. Winners split the whole pot pro-rata — no rake."}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input className="sm:w-40" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Stake in GEN" />
                <TxDialog
                  address={HIVE_SPORTS_ADDRESS}
                  method="predict"
                  args={[f.match_id, activePick]}
                  value={wei ?? 0n}
                  disabled={!!stakeError}
                  title={`Stake on ${labels[activePick]}`}
                  description={<>Sends {amount} GEN into the {labels[activePick]} pool for {f.home} vs {f.away}. Refunded 1:1 if the match is postponed.</>}
                  label={`Stake ${amount || 0} GEN on ${labels[activePick]}`}
                />
              </div>
              {stakeError && <p className="text-xs text-destructive">{stakeError}</p>}
            </div>
          )}

          {position?.exists && (
            <div className="rounded-md border border-white/10 p-3 text-sm">
              Your position: <b>{labels[position.pick as keyof typeof labels]}</b> · {formatGen(position.stake)} GEN
              {position.claimed && <> · claimed {formatGen(position.payout)} GEN</>}
            </div>
          )}

          {f.status !== "OPEN" && position?.exists && !position.claimed && (
            claimable > 0n ? (
              <ClaimDialog
                address={HIVE_SPORTS_ADDRESS}
                method={f.refund_all ? "refund" : "claim"}
                args={[f.match_id]}
                amount={claimable}
                label={`${f.refund_all ? "Refund" : "Claim"} ${formatGen(claimable)} GEN`}
              />
            ) : (
              <p className="text-sm text-muted-foreground">This position did not win — nothing to claim.</p>
            )
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="text-xl font-bold">Settlement</h2>
          <p className="text-sm text-muted-foreground">
            Resolve runs inside a GenLayer transaction. Every validator fetches both sources and must agree on the same
            canonical reading. Nobody passes a score in.
          </p>
          <div className="space-y-2 text-sm">
            <div>A · <SourceLink href={sources?.espn}>ESPN scoreboard (event {f.espn_event_id})</SourceLink></div>
            <div>B · <SourceLink href={sources?.bbc}>BBC Sport scores page</SourceLink></div>
          </div>
          {f.status === "OPEN" && (
            <div className="space-y-2">
              <TxDialog
                address={HIVE_SPORTS_ADDRESS}
                method="resolve"
                args={[f.match_id]}
                variant="blue"
                className="w-full"
                disabled={now < f.kickoff_ts + 5400}
                title="Resolve from ESPN + BBC"
                description="Validators fetch ESPN and BBC Sport. Settles only if both show the same full-time score; otherwise the transaction reverts and the fixture stays open for a later retry. After 7 days without agreement it refunds everyone."
                label={now < f.kickoff_ts + 5400 ? `Resolve available in ${formatCountdown(f.kickoff_ts + 5400 - now)}` : "Resolve"}
              />
              <TxDialog
                address={HIVE_SPORTS_ADDRESS}
                method="mark_postponed"
                args={[f.match_id]}
                variant="outline"
                size="sm"
                className="w-full"
                disabled={now < f.kickoff_ts + 3 * 3600}
                title="Mark postponed"
                description="Opens 1:1 refunds only if BOTH sources confirm the fixture was postponed, cancelled or abandoned. Available 3h after kickoff."
                label="Mark postponed (3h after kickoff)"
              />
            </div>
          )}
          {evidence?.exists && (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <div className="text-sm font-semibold">Agreed evidence</div>
              <div className="grid grid-cols-2 gap-2">
                <Reading label="ESPN" r={evidence.espn} />
                <Reading label="BBC Sport" r={evidence.bbc} />
              </div>
              <div className="text-sm">Outcome: <b>{evidence.outcome}</b></div>
              {evidenceRaw && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Exact payload validators agreed on</summary>
                  <code className="mt-1 block break-all rounded bg-white/5 p-2">{evidenceRaw}</code>
                </details>
              )}
              {f.resolved_at > 0 && <div className="text-xs text-muted-foreground">Decided at {formatGmt1(f.resolved_at)}</div>}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

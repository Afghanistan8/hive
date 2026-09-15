"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { BackLink, Card, ErrorBox, Loading, SourceLink, Stat } from "@/components/hive/bits";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { ClaimDialog } from "@/components/hive/ClaimDialog";
import { TxDialog } from "@/components/hive/TxDialog";
import { CryptoTabs, Lifecycle, PriceChart } from "@/components/hive/crypto";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/lib/genlayer/wallet";
import { CRYPTO_MAX_STAKE, CRYPTO_MIN_STAKE, GEN, HIVE_CRYPTO_ADDRESS } from "@/lib/hive/config";
import { cryptoPhase, formatCountdown, formatGen, formatGmt1, formatScaledPrice, impliedMultiplier, parseGen, toWei } from "@/lib/hive/format";
import { useCryptoEvidence, useCryptoMarket, useCryptoPosition, useCryptoSourceUrls, useNow } from "@/lib/hive/hooks";
import { cn } from "@/lib/utils";

export default function CryptoMarketPage() {
  const params = useParams<{ marketId: string }>();
  const id = Number(params.marketId);
  const { address } = useWallet();
  const now = useNow(1000);
  const { data: m, isLoading, error, refetch } = useCryptoMarket(id);
  const { data: position } = useCryptoPosition(id, address);
  const { data: sources } = useCryptoSourceUrls(id);
  const { data: evidence } = useCryptoEvidence(id, !!m && m.state !== "PENDING");
  const [side, setSide] = useState<"UP" | "DOWN">("UP");
  const [amount, setAmount] = useState(String(CRYPTO_MIN_STAKE));

  if (!HIVE_CRYPTO_ADDRESS) return <ErrorBox error="NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS is not set" />;
  if (!Number.isFinite(id) || id <= 0) return <ErrorBox error={`"${params.marketId}" is not a market id`} />;
  if (error) return <ErrorBox error={error} onRetry={() => refetch()} />;
  if (isLoading || !m) return <Loading what="market" />;

  const phase = cryptoPhase(m, now);
  const lockedSide = position?.exists ? position.side : "";
  const activeSide = (lockedSide || side) as "UP" | "DOWN";
  const current = toWei(position?.stake);
  const wei = parseGen(amount);
  const stakeError =
    wei === null ? "Enter a GEN amount"
      : wei < BigInt(CRYPTO_MIN_STAKE) * GEN ? `Minimum ${CRYPTO_MIN_STAKE} GEN per entry`
      : current + wei > BigInt(CRYPTO_MAX_STAKE) * GEN ? `Max ${CRYPTO_MAX_STAKE} GEN per wallet (you have ${formatGen(current)})`
      : "";
  const claimable = toWei(position?.claimable);

  return (
    <div className="space-y-5">
      <BackLink href="/crypto">All markets</BackLink>
      <CryptoTabs />
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>Market #{m.id} · CoinGecko <code>{m.coingecko_id}</code> · Gate.io <code>{m.gate_pair}</code></span>
          <PhaseBadge phase={phase} />
        </div>
        <h1 className="text-3xl font-bold md:text-4xl">
          {m.asset} daily candle · {m.target_day} <span className="text-muted-foreground text-xl">(GMT+1)</span>
        </h1>
        {m.result && <div className="text-2xl font-semibold text-accent">Result: {m.result}{m.refund_all && " · everyone refunded"}</div>}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Entries close" value={formatGmt1(m.cutoff_at)} hint={now < m.cutoff_at ? `in ${formatCountdown(m.cutoff_at - now)}` : "closed"} />
          <Stat label="Candle closes / resolvable" value={formatGmt1(m.settles_at)} hint={now < m.settles_at ? `in ${formatCountdown(m.settles_at - now)}` : "now resolvable"} />
          <Stat label="Pot" value={`${formatGen(m.total_pool)} GEN`} hint={`${m.positions_count} wallets`} />
          <Stat label="Terminal refund" value={formatGmt1(m.terminal_refund_at)} hint="if sources never recover" />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2"><PriceChart market={m} /></Card>
        <Card><Lifecycle market={m} now={now} /></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="space-y-4 lg:col-span-2">
          <h2 className="text-xl font-bold">Pools</h2>
          <div className="grid grid-cols-2 gap-3">
            {(["UP", "DOWN"] as const).map((s) => (
              <button
                key={s}
                disabled={phase !== "OPEN" || (!!lockedSide && lockedSide !== s)}
                onClick={() => setSide(s)}
                className={cn(
                  "rounded-lg border-2 p-4 text-left disabled:cursor-not-allowed",
                  activeSide === s ? (s === "UP" ? "border-emerald-600 bg-emerald-500/10" : "border-[#d9481f] bg-[#d9481f]/10") : "border-black/10 hover:border-black/25",
                )}
              >
                <div className="text-lg font-bold">{s === "UP" ? "▲ UP" : "▼ DOWN"}</div>
                <div className="text-lg">{formatGen(s === "UP" ? m.up_pool : m.down_pool)} GEN</div>
                <div className="text-xs text-muted-foreground">pays {impliedMultiplier(s === "UP" ? m.up_pool : m.down_pool, m.total_pool)} now</div>
              </button>
            ))}
          </div>

          {phase === "OPEN" && (
            <div className="space-y-3 border-t border-black/10 pt-4">
              <p className="text-sm text-muted-foreground">
                {lockedSide
                  ? <>You hold {formatGen(current)} GEN on <b className="text-foreground">{lockedSide}</b>. Top-ups on the same side only, up to 8 GEN total.</>
                  : "Stake 2–8 GEN. Side switching is rejected. Flat close counts as DOWN. Payouts are pro-rata on the winning pool."}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input className="sm:w-40" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Stake in GEN" />
                <TxDialog
                  address={HIVE_CRYPTO_ADDRESS}
                  method="take_position"
                  args={[m.id, activeSide]}
                  value={wei ?? 0n}
                  disabled={!!stakeError}
                  title={`Stake ${activeSide} on ${m.asset}`}
                  description={<>Sends {amount} GEN to the {activeSide} pool for {m.asset} on {m.target_day} (GMT+1).</>}
                  label={`Stake ${amount || 0} GEN ${activeSide}`}
                />
              </div>
              {stakeError && <p className="text-xs text-destructive">{stakeError}</p>}
            </div>
          )}

          {position?.exists && (
            <div className="rounded-md border border-black/10 p-3 text-sm">
              Your position: <b>{position.side}</b> · {formatGen(position.stake)} GEN
              {position.claimed && <> · claimed {formatGen(position.payout)} GEN</>}
            </div>
          )}
          {m.state !== "PENDING" && position?.exists && !position.claimed && (
            claimable > 0n ? (
              <ClaimDialog
                address={HIVE_CRYPTO_ADDRESS}
                method="claim"
                args={[m.id]}
                amount={claimable}
                label={`Claim ${formatGen(claimable)} GEN`}
              />
            ) : (
              <p className="text-sm text-muted-foreground">This position did not win — nothing to claim.</p>
            )
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="text-xl font-bold">Settlement</h2>
          <p className="text-sm text-muted-foreground">
            Resolve takes only the market id. Inside the transaction, validators rebuild the exact GMT+1 candle from both
            sources and must agree on the canonical payload. Charts elsewhere are display-only.
          </p>
          <div className="space-y-2 text-sm">
            <div>A · <SourceLink href={sources?.coingecko}>CoinGecko market_chart/range</SourceLink></div>
            <div>B · <SourceLink href={sources?.gate}>Gate.io 1h candlesticks</SourceLink></div>
          </div>
          {m.state === "PENDING" && (
            <TxDialog
              address={HIVE_CRYPTO_ADDRESS}
              method="resolve_market"
              args={[m.id]}
              variant="blue"
              className="w-full"
              disabled={now < m.settles_at}
              title={`Resolve ${m.asset} ${m.target_day}`}
              description="Validators fetch CoinGecko and Gate.io. UP+UP → UP, DOWN+DOWN → DOWN, mismatch → INCONCLUSIVE (refunds). If a source is unavailable the transaction reverts so anyone can retry."
              label={now < m.settles_at ? `Resolvable in ${formatCountdown(m.settles_at - now)}` : "Resolve"}
            />
          )}
          {evidence?.exists && (
            <div className="space-y-2 border-t border-black/10 pt-3 text-sm">
              <div className="font-semibold">Agreed evidence{evidence.terminal_refund && " (terminal refund)"}</div>
              {!evidence.terminal_refund && (
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground"><tr><th>Source</th><th>Open</th><th>Close</th><th>Dir</th></tr></thead>
                  <tbody>
                    <tr><td>CoinGecko</td><td>{formatScaledPrice(evidence.coingecko_open)}</td><td>{formatScaledPrice(evidence.coingecko_close)}</td><td>{evidence.coingecko_direction}</td></tr>
                    <tr><td>Gate.io</td><td>{formatScaledPrice(evidence.gate_open)}</td><td>{formatScaledPrice(evidence.gate_close)}</td><td>{evidence.gate_direction}</td></tr>
                  </tbody>
                </table>
              )}
              <div>Final: <b>{evidence.final_result}</b></div>
              {evidence.agreed_payload && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Exact payload validators agreed on</summary>
                  <code className="mt-1 block break-all rounded bg-black/[0.04] p-2">{evidence.agreed_payload}</code>
                </details>
              )}
              {evidence.resolved_at ? <div className="text-xs text-muted-foreground">Decided at {formatGmt1(evidence.resolved_at)}</div> : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

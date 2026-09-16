"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/hive/bits";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/genlayer/wallet";
import { explorerAddress, explorerTx } from "@/lib/hive/config";
import { cryptoPhase, formatGen, sportsPhase, toWei } from "@/lib/hive/format";
import { useNow, usePortfolio } from "@/lib/hive/hooks";
import { readTxLog, type TxLogEntry } from "@/lib/hive/txlog";

export default function PortfolioPage() {
  const { address, isConnected, requestConnect } = useWallet();
  const { crypto, sports } = usePortfolio(address);
  const now = useNow(5000);
  const [txs, setTxs] = useState<TxLogEntry[]>([]);
  useEffect(() => setTxs(readTxLog()), [crypto.dataUpdatedAt, sports.dataUpdatedAt]);

  if (!isConnected || !address) {
    return (
      <div>
        <PageHeader title="Portfolio" subtitle="Connect a wallet to see your positions and claimable amounts." />
        <Button variant="gradient" onClick={requestConnect}>Connect wallet</Button>
      </div>
    );
  }

  const claimable = [...(crypto.data ?? []), ...(sports.data ?? [])].reduce((sum, r) => sum + toWei(r.claimable), 0n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        subtitle={<>Positions for <a className="text-accent underline" href={explorerAddress(address)} target="_blank" rel="noreferrer">{address}</a>, read directly from both contracts.</>}
      />
      <Card className="flex flex-wrap gap-8">
        <div><div className="text-xs uppercase text-muted-foreground">Claimable now</div><div className="text-2xl font-bold text-accent">{formatGen(claimable)} GEN</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Sports positions</div><div className="text-2xl font-bold">{sports.data?.length ?? "…"}</div></div>
        <div><div className="text-xs uppercase text-muted-foreground">Crypto positions</div><div className="text-2xl font-bold">{crypto.data?.length ?? "…"}</div></div>
      </Card>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Sports</h2>
        {sports.isLoading && <Loading what="sports positions" />}
        {sports.error && <ErrorBox error={sports.error} />}
        {sports.data?.length === 0 && <p className="text-sm text-muted-foreground">No sports positions yet. <Link className="text-accent underline" href="/sports">Browse fixtures</Link>.</p>}
        {sports.data?.map((r) => (
          <Link key={r.fixture.match_id} href={`/sports/${r.fixture.match_id}`}>
            <Card className="mb-2 flex flex-wrap items-center justify-between gap-3 p-4 hover:border-black/25">
              <div>
                <div className="font-semibold">{r.fixture.home} vs {r.fixture.away}</div>
                <div className="text-xs text-muted-foreground">{r.fixture.league_name} · picked {r.pick} · {formatGen(r.stake)} GEN</div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <PhaseBadge phase={sportsPhase(r.fixture, now)} />
                {r.claimed ? <span>claimed {formatGen(r.payout)} GEN</span> : toWei(r.claimable) > 0n ? <b className="text-accent">claim {formatGen(r.claimable)} GEN</b> : null}
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Crypto</h2>
        {crypto.isLoading && <Loading what="crypto positions" />}
        {crypto.error && <ErrorBox error={crypto.error} />}
        {crypto.data?.length === 0 && <p className="text-sm text-muted-foreground">No crypto positions yet. <Link className="text-accent underline" href="/crypto">Browse markets</Link>.</p>}
        {crypto.data?.map((r) => (
          <Link key={r.market.id} href={`/crypto/${r.market.id}`}>
            <Card className="mb-2 flex flex-wrap items-center justify-between gap-3 p-4 hover:border-black/25">
              <div>
                <div className="font-semibold">{r.market.asset} · {r.market.target_day}</div>
                <div className="text-xs text-muted-foreground">{r.side} · {formatGen(r.stake)} GEN {r.market.result && `· result ${r.market.result}`}</div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <PhaseBadge phase={cryptoPhase(r.market, now)} />
                {r.claimed ? <span>claimed {formatGen(r.payout)} GEN</span> : toWei(r.claimable) > 0n ? <b className="text-accent">claim {formatGen(r.claimable)} GEN</b> : null}
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Transactions from this browser</h2>
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Transactions you send from HIVE appear here with explorer links.</p>
        ) : (
          <Card className="divide-y divide-black/[0.06] p-0">
            {txs.map((t) => (
              <a key={t.hash} href={explorerTx(t.hash)} target="_blank" rel="noreferrer" className="flex flex-wrap justify-between gap-2 px-4 py-2 text-sm hover:bg-black/[0.04]">
                <span className="font-mono">{t.label}</span>
                <span className="text-muted-foreground">{t.ok === false ? "failed · " : ""}{new Date(t.at).toLocaleString()} · {t.hash.slice(0, 10)}…</span>
              </a>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

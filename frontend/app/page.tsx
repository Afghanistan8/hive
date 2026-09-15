"use client";

import Link from "next/link";
import { Card, ContractLink, NetworkBadge } from "@/components/hive/bits";
import { Button } from "@/components/ui/button";
import { GENLAYER_CHAIN, GENLAYER_CHAIN_ID } from "@/lib/genlayer/network";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS, STUDIO_URL } from "@/lib/hive/config";
import { useCryptoMarkets, useFixtures } from "@/lib/hive/hooks";

export default function HomePage() {
  const fixtures = useFixtures();
  const markets = useCryptoMarkets();

  return (
    <div className="space-y-10">
      <section className="space-y-5 pt-6 text-center">
        <NetworkBadge />
        <h1 className="text-4xl font-bold md:text-6xl">
          Prediction markets <span className="bg-gradient-to-r from-[#9B6AF6] to-[#E37DF7] bg-clip-text text-transparent">nobody can rig</span>
        </h1>
        <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
          HIVE settles football and crypto markets inside GenLayer Intelligent Contracts. Validators independently fetch
          two public sources, and a result is only final when both sources agree. No oracle key, no admin, no backend.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="gradient" size="lg"><Link href="/sports">Hive Match · Football</Link></Button>
          <Button asChild variant="outline" size="lg"><Link href="/crypto">Hive Daily · Crypto</Link></Button>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3">
          <div className="text-sm uppercase tracking-wide text-accent">Hive Match</div>
          <h2 className="text-2xl font-bold">Top-5 European leagues, pari-mutuel 1X2</h2>
          <p className="text-sm text-muted-foreground">
            Stake on Home / Draw / Away (min 2 GEN) before kickoff. Winners split the whole pot pro-rata, no rake.
            After full time anyone can press Resolve.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Source A: ESPN scoreboard JSON, parsed deterministically by event id</li>
            <li>Source B: BBC Sport scores page, read by each validator&apos;s LLM into a structured score</li>
            <li>Both must report the same full-time score — otherwise the fixture stays open</li>
            <li>Both confirm a postponement → 1:1 refunds; no agreement within 7 days → refunds</li>
          </ul>
          <div className="text-sm">{fixtures.data ? `${fixtures.data.length} fixtures on-chain` : "Loading fixtures…"}</div>
        </Card>
        <Card className="space-y-3">
          <div className="text-sm uppercase tracking-wide text-accent">Hive Daily</div>
          <h2 className="text-2xl font-bold">Will the GMT+1 daily candle close UP or DOWN?</h2>
          <p className="text-sm text-muted-foreground">
            22 major tokens. Stake 2–8 GEN per wallet before the day starts (GMT+1). Anyone can open a market for a
            future day and anyone can settle it once the candle closes.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Source A: CoinGecko market chart → open/close of the exact GMT+1 window</li>
            <li>Source B: Gate.io hourly candles → the same 24h window (never UTC daily bars)</li>
            <li>UP + UP → UP, DOWN + DOWN → DOWN, disagreement → INCONCLUSIVE refunds</li>
            <li>Sources down → retry later; still down after 5 days → refunds. A direction is never invented.</li>
          </ul>
          <div className="text-sm">{markets.data ? `${markets.data.length} markets on-chain` : "Loading markets…"}</div>
        </Card>
      </section>

      <Card className="space-y-4">
        <h2 className="text-2xl font-bold">Verify this build yourself</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Add the network to your wallet (Connect does it for you): <b>{GENLAYER_CHAIN.name}</b>, chain ID{" "}
            <b>{GENLAYER_CHAIN_ID}</b>, RPC <code>{GENLAYER_CHAIN.rpcUrls.default.http[0]}</code>, symbol GEN.
          </li>
          <li>
            Get GEN from the faucet in <a className="text-accent underline" href={STUDIO_URL} target="_blank" rel="noreferrer">GenLayer Studio Next</a> (droplet icon on your account).
          </li>
          <li>Open <Link className="text-accent underline" href="/crypto">Crypto</Link>, pick an OPEN market and stake 2 GEN UP or DOWN.</li>
          <li>Open <Link className="text-accent underline" href="/sports">Sports</Link> and stake on an upcoming fixture.</li>
          <li>Every write shows its fee quote, then an explorer link. Your positions live in <Link className="text-accent underline" href="/portfolio">Portfolio</Link>.</li>
          <li>
            After the candle closes / the match ends, press <b>Resolve</b>. The transaction fetches both public sources on-chain; the
            evidence panel shows exactly what validators agreed on.
          </li>
        </ol>
        <div className="flex flex-col gap-2 border-t border-white/10 pt-4 md:flex-row md:gap-6">
          <ContractLink label="HiveSports" address={HIVE_SPORTS_ADDRESS} />
          <ContractLink label="HiveCrypto" address={HIVE_CRYPTO_ADDRESS} />
        </div>
      </Card>
    </div>
  );
}

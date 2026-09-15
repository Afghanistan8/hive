"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContractLink } from "@/components/hive/bits";
import { GENLAYER_CHAIN, GENLAYER_CHAIN_ID } from "@/lib/genlayer/network";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS, STUDIO_URL } from "@/lib/hive/config";
import { useCryptoMarkets, useFixtures } from "@/lib/hive/hooks";

export default function HomePage() {
  const fixtures = useFixtures();
  const markets = useCryptoMarkets();

  return (
    <main>
      {/* ---------------- Hero: mirrors the reference composition ---------------- */}
      <section className="relative flex h-[100svh] min-h-[560px] flex-col items-center overflow-hidden px-4">
        {/* The orb itself is drawn by the WebGL background; this is the no-WebGL fallback. */}
        <div className="orb-fallback absolute left-1/2 top-[22.5%] hidden h-[12.2vw] max-h-[220px] min-h-[88px] w-[12.2vw] min-w-[88px] max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full ember-dot" />

        <h1 className="hero-title animate-rise absolute top-[51%] w-full -translate-y-1/2 text-center text-ink md:top-[49%]">
          <span className="block md:inline">Hive</span> <span className="block md:inline">Markets</span>
        </h1>

        <p
          className="animate-fade-in absolute inset-x-6 top-[78%] mx-auto max-w-[23rem] text-center md:top-[75%] text-[13px] leading-[1.45] text-ink/90 md:max-w-[26rem] md:text-[13.5px]"
          style={{ animationDelay: "0.35s" }}
        >
          Football and crypto prediction markets that settle only when two public sources agree
        </p>

        <nav
          className="animate-fade-in fixed bottom-5 right-5 z-40 flex items-center gap-1 rounded-full bg-[#f6f3ee]/90 p-1 text-[12.5px] shadow-[0_2px_12px_rgba(40,30,20,0.12)] backdrop-blur"
          style={{ animationDelay: "0.6s" }}
          aria-label="Enter"
        >
          <Link href="/sports" className="rounded-full px-3 py-1.5 transition hover:bg-ink hover:text-[#f6f3ee]">Sports</Link>
          <Link href="/crypto" className="rounded-full px-3 py-1.5 transition hover:bg-ink hover:text-[#f6f3ee]">Crypto</Link>
        </nav>
      </section>

      {/* ---------------- Below the fold ---------------- */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-6 md:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          <Door
            href="/sports"
            kicker="Hive Match"
            title="Europe's top five leagues"
            body="Stake on home, draw or away before kickoff. Winners split the whole pot. Settles only when ESPN and BBC Sport report the same full-time score."
            stat={fixtures.data ? `${fixtures.data.length} fixtures on-chain` : "Reading fixtures…"}
          />
          <Door
            href="/crypto"
            kicker="Hive Daily"
            title="Up or down, every GMT+1 day"
            body="22 major tokens, 2–8 GEN per wallet. Settles only when CoinGecko and Gate.io agree on the candle's direction — otherwise everyone is refunded."
            stat={markets.data ? `${markets.data.length} markets on-chain` : "Reading markets…"}
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <h2 className="max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] md:text-6xl">
          Nobody holds the answer key.
        </h2>
        <div className="mt-10 grid gap-8 text-[15px] leading-relaxed md:grid-cols-3">
          <Step n="01" title="Contracts own the sources">
            Resolve takes only an id. URLs, parsers and outcome rules live in the Intelligent Contract — no one can pass a score or a price in.
          </Step>
          <Step n="02" title="Every validator checks">
            Each validator fetches both public sources itself and must produce the identical canonical payload. That exact payload is what gets stored.
          </Step>
          <Step n="03" title="Disagreement never pays">
            Sources disagree or go dark? Fixtures stay open and retry, candles refund. A winner is never invented.
          </Step>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-28 pt-6 md:px-8">
        <div className="brand-card p-6 md:p-10">
          <h3 className="text-2xl font-semibold tracking-[-0.035em] md:text-3xl">Verify this build</h3>
          <ol className="mt-5 grid list-decimal gap-2 pl-5 text-[14.5px] text-ink/80 md:grid-cols-2 md:gap-x-10">
            <li>Connect a wallet — HIVE adds <b>{GENLAYER_CHAIN.name}</b> (chain {GENLAYER_CHAIN_ID}, RPC <code className="text-[13px]">{GENLAYER_CHAIN.rpcUrls.default.http[0]}</code>).</li>
            <li>Get GEN from the faucet in <a className="underline decoration-ember underline-offset-4" href={STUDIO_URL} target="_blank" rel="noreferrer">GenLayer Studio Next</a>.</li>
            <li>Stake 2 GEN on an open <Link className="underline decoration-ember underline-offset-4" href="/crypto">crypto market</Link> or <Link className="underline decoration-ember underline-offset-4" href="/sports">fixture</Link>.</li>
            <li>After the close, press Resolve and read the exact evidence validators agreed on.</li>
          </ol>
          <div className="mt-6 flex flex-col gap-2 border-t border-black/10 pt-5 md:flex-row md:gap-8">
            <ContractLink label="HiveSports" address={HIVE_SPORTS_ADDRESS} />
            <ContractLink label="HiveCrypto" address={HIVE_CRYPTO_ADDRESS} />
          </div>
        </div>
      </section>
    </main>
  );
}

function Door({ href, kicker, title, body, stat }: { href: string; kicker: string; title: string; body: string; stat: string }) {
  return (
    <Link href={href} className="group brand-card flex min-h-[300px] flex-col justify-between p-7 hover:-translate-y-0.5 hover:border-black/20 md:p-9">
      <div>
        <div className="flex items-center gap-2 text-[13px] text-ink/70">
          <span className="ember-dot inline-block h-2.5 w-2.5 rounded-full" /> {kicker}
        </div>
        <h2 className="mt-4 text-4xl font-semibold leading-[1] tracking-[-0.045em] md:text-5xl">{title}</h2>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink/75">{body}</p>
      </div>
      <div className="mt-8 flex items-center justify-between text-[13.5px]">
        <span className="text-ink/60">{stat}</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[#f6f3ee] transition group-hover:gap-3">
          Enter <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-black/15 pt-5">
      <div className="text-[12px] tracking-widest text-ink/50">{n}</div>
      <div className="mt-2 text-xl font-semibold tracking-[-0.03em]">{title}</div>
      <p className="mt-2 text-ink/75">{children}</p>
    </div>
  );
}

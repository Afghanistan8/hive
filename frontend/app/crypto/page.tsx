"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/hive/bits";
import { PhaseBadge } from "@/components/hive/PhaseBadge";
import { CryptoTabs } from "@/components/hive/crypto";
import { HIVE_CRYPTO_ADDRESS } from "@/lib/hive/config";
import { cryptoPhase, formatCountdown, formatGen, toWei } from "@/lib/hive/format";
import { useCryptoMarkets, useNow } from "@/lib/hive/hooks";
import { cn } from "@/lib/utils";

const FILTERS = ["ALL", "OPEN", "CLOSED", "READY_TO_SETTLE", "SETTLED", "INCONCLUSIVE"] as const;

export default function CryptoPage() {
  const { data, isLoading, error } = useCryptoMarkets();
  const now = useNow(1000);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");

  const days = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof data>>();
    for (const m of data ?? []) {
      if (filter !== "ALL" && cryptoPhase(m, now) !== filter) continue;
      groups.set(m.target_day, [...(groups.get(m.target_day) ?? []), m]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data, filter, now]);

  return (
    <div>
      <PageHeader
        title="Hive Daily"
        subtitle="Will the GMT+1 daily candle close UP or DOWN? Entries close when the day starts (00:00 GMT+1). Settlement requires CoinGecko and Gate.io to agree on the direction."
      />
      <CryptoTabs />
      {!HIVE_CRYPTO_ADDRESS && <ErrorBox error="NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS is not set in frontend/.env" />}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn("rounded-full border px-3 py-1 text-sm", filter === f ? "border-ink bg-ink text-[#f6f3ee]" : "border-black/10 text-muted-foreground hover:border-black/30")}
          >
            {f.replaceAll("_", " ")}
          </button>
        ))}
      </div>
      {isLoading && <Loading what="markets" />}
      {error && <ErrorBox error={error} />}
      <div className="space-y-8">
        {days.map(([day, markets]) => (
          <section key={day}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-xl font-bold">{day}</h2>
              <span className="text-sm text-muted-foreground">
                {now < markets[0].cutoff_at ? `entries close in ${formatCountdown(markets[0].cutoff_at - now)}` : now < markets[0].settles_at ? `candle closes in ${formatCountdown(markets[0].settles_at - now)}` : "candle closed"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {markets.sort((a, b) => a.asset.localeCompare(b.asset)).map((m) => {
                const total = toWei(m.total_pool);
                const upShare = total > 0n ? Number((toWei(m.up_pool) * 100n) / total) : 50;
                return (
                  <Link key={m.id} href={`/crypto/${m.id}`}>
                    <Card className="h-full space-y-2 p-4 transition-colors hover:border-black/25">
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold">{m.asset}</span>
                        <span className="text-xs text-muted-foreground">#{m.id}</span>
                      </div>
                      <PhaseBadge phase={cryptoPhase(m, now)} />
                      {m.result && <div className="text-sm">Result: <b>{m.result}</b></div>}
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#d9481f]/35">
                        <div className="h-full bg-ink" style={{ width: `${upShare}%` }} />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>▲ {formatGen(m.up_pool)}</span>
                        <span>▼ {formatGen(m.down_pool)}</span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {data && days.length === 0 && <p className="py-10 text-center text-muted-foreground">No markets match this filter.</p>}
    </div>
  );
}

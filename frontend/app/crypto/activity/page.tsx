"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/hive/bits";
import { CryptoTabs } from "@/components/hive/crypto";
import { formatGen, formatGmt1, shortAddress } from "@/lib/hive/format";
import { useCryptoMarkets } from "@/lib/hive/hooks";
import { cn } from "@/lib/utils";

type Kind = "opened" | "resolved" | "refunded";

const STYLE: Record<Kind, string> = {
  opened: "bg-black/[0.05] text-ink/70",
  resolved: "bg-ink text-[#f6f3ee]",
  refunded: "bg-amber-500/10 text-amber-800",
};

export default function ActivityPage() {
  const { data, isLoading, error } = useCryptoMarkets();

  const events = useMemo(() => {
    const rows: { kind: Kind; ts: number; id: number; asset: string; day: string; note: string }[] = [];
    for (const m of data ?? []) {
      rows.push({ kind: "opened", ts: m.created_at, id: m.id, asset: m.asset, day: m.target_day, note: `by ${shortAddress(m.creator)}` });
      if (m.resolved_at > 0) {
        const refunded = m.state === "REFUNDED" || m.state === "INCONCLUSIVE";
        rows.push({
          kind: refunded ? "refunded" : "resolved",
          ts: m.resolved_at,
          id: m.id,
          asset: m.asset,
          day: m.target_day,
          note: refunded ? "sources did not agree — stakes refunded" : `${m.result} · pot ${formatGen(m.total_pool)} GEN`,
        });
      }
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 150);
  }, [data]);

  return (
    <div>
      <PageHeader title="Activity" subtitle="Markets opened and settled on-chain, newest first." />
      <CryptoTabs />
      {isLoading && <Loading what="activity" />}
      {error && <ErrorBox error={error} />}
      <Card className="divide-y divide-black/[0.06] p-0">
        {events.map((e, i) => (
          <Link key={`${e.kind}-${e.id}-${i}`} href={`/crypto/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-black/[0.03]">
            <div className="flex items-center gap-3">
              <span className={cn("w-20 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold uppercase", STYLE[e.kind])}>{e.kind}</span>
              <span className="font-semibold">{e.asset}</span>
              <span className="text-sm text-ink/70">{e.day}</span>
              <span className="text-sm text-muted-foreground">{e.note}</span>
            </div>
            <span className="text-xs text-muted-foreground">{formatGmt1(e.ts)}</span>
          </Link>
        ))}
        {data && events.length === 0 && <p className="p-5 text-sm text-muted-foreground">No activity yet.</p>}
      </Card>
    </div>
  );
}

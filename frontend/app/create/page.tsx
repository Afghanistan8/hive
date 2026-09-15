"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, PageHeader } from "@/components/hive/bits";
import { TxDialog } from "@/components/hive/TxDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HIVE_CRYPTO_ADDRESS } from "@/lib/hive/config";
import { tomorrowGmt1 } from "@/lib/hive/format";
import { useCryptoAssets, useCryptoMarkets } from "@/lib/hive/hooks";
import { cn } from "@/lib/utils";

export default function CreatePage() {
  const { data: assets } = useCryptoAssets();
  const { data: markets } = useCryptoMarkets();
  const [asset, setAsset] = useState("BTC");
  const [day, setDay] = useState(tomorrowGmt1(2));

  const existing = useMemo(() => markets?.find((m) => m.asset === asset && m.target_day === day), [markets, asset, day]);
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= tomorrowGmt1(1);
  const openDays = useMemo(() => new Set((markets ?? []).filter((m) => m.target_day === day).map((m) => m.asset)), [markets, day]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Open a crypto market"
        subtitle="Permissionless: any wallet can open an UP/DOWN market for a supported asset on any future GMT+1 day (up to 60 days ahead). One market per asset per day."
      />
      <Card className="space-y-5">
        <div className="space-y-2">
          <Label>Asset</Label>
          <div className="flex flex-wrap gap-2">
            {(assets ?? []).map((a) => (
              <button
                key={a.asset}
                onClick={() => setAsset(a.asset)}
                title={`CoinGecko ${a.coingecko_id} · Gate ${a.gate_pair}`}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  asset === a.asset ? "border-accent bg-accent/20" : "border-white/10 hover:border-white/30",
                  openDays.has(a.asset) && "opacity-50",
                )}
              >
                {a.asset}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="day">Target day (GMT+1)</Label>
          <Input id="day" type="date" value={day} min={tomorrowGmt1(1)} onChange={(e) => setDay(e.target.value)} className="w-56" />
          <p className="text-xs text-muted-foreground">
            Entries close at {day} 00:00 GMT+1. The candle window is [{day} 00:00, next day 00:00) GMT+1, and it becomes resolvable when that window closes.
          </p>
        </div>
        {existing ? (
          <p className="text-sm">
            {asset} on {day} already exists — <Link className="text-accent underline" href={`/crypto/${existing.id}`}>open market #{existing.id}</Link>.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <TxDialog
              address={HIVE_CRYPTO_ADDRESS}
              method="create_market"
              args={[asset, day]}
              disabled={!validDay}
              title={`Open ${asset} · ${day}`}
              description="Creates the market on-chain. The contract checks the asset, the date and uniqueness using consensus time."
              label={`Create ${asset} market for ${day}`}
            />
            <TxDialog
              address={HIVE_CRYPTO_ADDRESS}
              method="create_daily_markets"
              args={[day]}
              variant="outline"
              disabled={!validDay}
              title={`Open all assets · ${day}`}
              description="Creates a market for every supported asset on this day in one transaction, skipping any that already exist."
              label={`Create all ${assets?.length ?? ""} assets for ${day}`}
            />
          </div>
        )}
        {!validDay && <p className="text-xs text-destructive">Pick a future GMT+1 day.</p>}
      </Card>
    </div>
  );
}

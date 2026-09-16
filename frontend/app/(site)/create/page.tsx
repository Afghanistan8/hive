"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, PageHeader } from "@/components/hive/bits";
import { TxDialog } from "@/components/hive/TxDialog";
import { CryptoTabs } from "@/components/hive/crypto";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HIVE_CRYPTO_ADDRESS } from "@/lib/hive/config";
import { tomorrowGmt1 } from "@/lib/hive/format";
import { useCryptoAssets, useCryptoMarkets, useHydrated } from "@/lib/hive/hooks";
import { cn } from "@/lib/utils";

export default function CreatePage() {
  const { data: assets } = useCryptoAssets();
  const { data: markets } = useCryptoMarkets();
  const hydrated = useHydrated();
  const [asset, setAsset] = useState("BTC");
  const [day, setDay] = useState("");
  const [touched, setTouched] = useState(false);

  // "Tomorrow" depends on the viewer's clock, so it is only computed after hydration. Until the
  // user picks something, suggest the first day (and asset) that is still open to create.
  useEffect(() => {
    if (touched || !markets || !assets?.length) return;
    const taken = (d: string) => new Set(markets.filter((m) => m.target_day === d).map((m) => m.asset));
    for (let offset = 1; offset <= 60; offset++) {
      const d = tomorrowGmt1(offset);
      const free = assets.find((a) => !taken(d).has(a.asset));
      if (free) {
        setDay(d);
        setAsset(free.asset);
        return;
      }
    }
  }, [markets, assets, touched]);

  const minDay = hydrated ? tomorrowGmt1(1) : undefined;
  const existing = useMemo(() => markets?.find((m) => m.asset === asset && m.target_day === day), [markets, asset, day]);
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day) && !!minDay && day >= minDay;
  const openDays = useMemo(() => new Set((markets ?? []).filter((m) => m.target_day === day).map((m) => m.asset)), [markets, day]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Open a crypto market"
        subtitle="Permissionless: any wallet can open an UP/DOWN market for a supported asset on any future GMT+1 day (up to 60 days ahead). One market per asset per day."
      />
      <CryptoTabs />
      <Card className="space-y-5">
        <div className="space-y-2">
          <Label>Asset</Label>
          <div className="flex flex-wrap gap-2">
            {(assets ?? []).map((a) => (
              <button
                key={a.asset}
                onClick={() => {
                  setAsset(a.asset);
                  setTouched(true);
                }}
                title={`CoinGecko ${a.coingecko_id} · Gate ${a.gate_pair}`}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  asset === a.asset ? "border-ink bg-ink text-[#f6f3ee]" : "border-black/10 hover:border-black/30",
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
          <Input
            id="day"
            type="date"
            value={day}
            min={minDay}
            onChange={(e) => {
              setDay(e.target.value);
              setTouched(true);
            }}
            className="w-56"
          />
          {day && (
            <p className="text-xs text-muted-foreground">
              Entries close at {day} 00:00 GMT+1. The candle window is [{day} 00:00, next day 00:00) GMT+1, and it becomes resolvable when that window closes.
            </p>
          )}
        </div>
        {!day ? (
          <p className="text-sm text-muted-foreground">Finding the next day with markets still to open…</p>
        ) : existing ? (
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
        {hydrated && day && !validDay && <p className="text-xs text-destructive">Pick a future GMT+1 day.</p>}
      </Card>
    </div>
  );
}

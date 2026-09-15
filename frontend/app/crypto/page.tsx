import type { Metadata } from "next";
import { formatGen, toWei } from "@/lib/hive/format";
import { marketsSnapshot } from "@/lib/hive/serverData";
import { CryptoBoard } from "./CryptoBoard";

// Pre-rendered with a contract snapshot and refreshed in the background (see sports/page.tsx).
export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const snap = await marketsSnapshot();
  const now = Date.now() / 1000;
  const open = (snap?.data ?? []).filter((m) => m.state === "PENDING" && m.cutoff_at > now);
  const staked = (snap?.data ?? []).reduce((s, m) => s + toWei(m.total_pool), 0n);
  const description = snap
    ? `${open.length} open UP/DOWN markets on 22 tokens · ${formatGen(staked)} GEN staked. Settles only when CoinGecko and Gate.io agree.`
    : "Will the GMT+1 daily candle close UP or DOWN? Settles only when CoinGecko and Gate.io agree.";
  return { title: "Hive Daily", description, openGraph: { title: "Hive Daily", description }, twitter: { title: "Hive Daily", description } };
}

export default async function CryptoPage() {
  return <CryptoBoard initial={await marketsSnapshot()} />;
}

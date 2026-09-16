import type { Metadata } from "next";
import { formatGen } from "@/lib/hive/format";
import { notFound } from "next/navigation";
import { marketSnapshot, MISSING } from "@/lib/hive/serverData";
import { MarketView } from "./MarketView";

// Rendered on first visit, then cached per market and refreshed in the background every 30 s.
export const revalidate = 30;
export const dynamicParams = true;
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ marketId: string }> };

const snapshotFor = (marketId: string) => {
  const id = Number(marketId);
  return /^\d+$/.test(marketId) && Number.isSafeInteger(id) && id > 0 ? marketSnapshot(id) : Promise.resolve(MISSING);
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { marketId } = await params;
  const snap = await snapshotFor(marketId);
  if (snap === MISSING) return { title: "Market not found" };
  const m = snap?.data;
  if (!m) return { title: "Market" };
  const title = `${m.asset} · ${m.target_day}`;
  const state = m.result ? `Result ${m.result}${m.refund_all ? " · refunded" : ""}` : `▲ ${formatGen(m.up_pool)} GEN · ▼ ${formatGen(m.down_pool)} GEN`;
  const description = `Will ${m.asset}'s GMT+1 daily candle close up or down? ${state}. Settles only when CoinGecko and Gate.io agree.`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function MarketPage({ params }: Props) {
  const { marketId } = await params;
  const snap = await snapshotFor(marketId);
  if (snap === MISSING) notFound();
  return <MarketView marketId={marketId} initial={snap} />;
}

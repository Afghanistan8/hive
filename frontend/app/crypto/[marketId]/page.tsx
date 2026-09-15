import type { Metadata } from "next";
import { formatGen } from "@/lib/hive/format";
import { marketSnapshot } from "@/lib/hive/serverData";
import { MarketView } from "./MarketView";

// Rendered on first visit, then cached per market and refreshed in the background every 30 s.
export const revalidate = 30;
export const dynamicParams = true;
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ marketId: string }> };

const snapshotFor = (marketId: string) => {
  const id = Number(marketId);
  return Number.isSafeInteger(id) && id > 0 ? marketSnapshot(id) : Promise.resolve(null);
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { marketId } = await params;
  const m = (await snapshotFor(marketId))?.data;
  if (!m) return { title: "Market" };
  const title = `${m.asset} · ${m.target_day}`;
  const state = m.result ? `Result ${m.result}${m.refund_all ? " · refunded" : ""}` : `▲ ${formatGen(m.up_pool)} GEN · ▼ ${formatGen(m.down_pool)} GEN`;
  const description = `Will ${m.asset}'s GMT+1 daily candle close up or down? ${state}. Settles only when CoinGecko and Gate.io agree.`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function MarketPage({ params }: Props) {
  const { marketId } = await params;
  return <MarketView marketId={marketId} initial={await snapshotFor(marketId)} />;
}

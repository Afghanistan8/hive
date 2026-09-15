import type { Metadata } from "next";
import { formatGen } from "@/lib/hive/format";
import { fixtureSnapshot } from "@/lib/hive/serverData";
import { FixtureView } from "./FixtureView";

// Rendered on first visit, then cached per match and refreshed in the background every 30 s.
export const revalidate = 30;
export const dynamicParams = true;
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  const f = (await fixtureSnapshot(matchId))?.data;
  if (!f) return { title: "Fixture" };
  const title = `${f.home} vs ${f.away}`;
  const state =
    f.status === "SETTLED"
      ? `Full time ${f.home_goals}–${f.away_goals}${f.refund_all ? " · all stakes refunded" : ""}`
      : `Home ${formatGen(f.pool_home)} · Draw ${formatGen(f.pool_draw)} · Away ${formatGen(f.pool_away)} GEN`;
  const description = `${f.league_name} · ${state}. Settles only when ESPN and BBC Sport agree.`;
  return { title, description, openGraph: { title, description }, twitter: { title, description } };
}

export default async function FixturePage({ params }: Props) {
  const { matchId } = await params;
  return <FixtureView matchId={matchId} initial={await fixtureSnapshot(matchId)} />;
}

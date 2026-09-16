import type { Metadata } from "next";
import { formatGen } from "@/lib/hive/format";
import { notFound } from "next/navigation";
import { fixtureSnapshot, MISSING } from "@/lib/hive/serverData";
import { FixtureView } from "./FixtureView";

// Rendered on first visit, then cached per match and refreshed in the background every 30 s.
export const revalidate = 30;
export const dynamicParams = true;
export const generateStaticParams = async () => [];

type Props = { params: Promise<{ matchId: string }> };

// Match ids are "<league>-<ESPN event id>"; anything else can't exist, so skip the chain read.
const fixtureSnapshotFor = (matchId: string) =>
  /^(pl|pd|bl1|sa|fl1)-\d{1,12}$/.test(matchId) ? fixtureSnapshot(matchId) : Promise.resolve(MISSING);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  const snap = await fixtureSnapshotFor(matchId);
  if (snap === MISSING) return { title: "Fixture not found" };
  const f = snap?.data;
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
  const snap = await fixtureSnapshotFor(matchId);
  if (snap === MISSING) notFound();
  return <FixtureView matchId={matchId} initial={snap} />;
}

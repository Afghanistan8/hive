import type { Metadata } from "next";
import { formatGen, toWei } from "@/lib/hive/format";
import { fixturesSnapshot } from "@/lib/hive/serverData";
import { SportsBoard } from "./SportsBoard";

// Pre-rendered with a contract snapshot and refreshed in the background, so the HTML (link
// previews, first paint, no-JS readers) already lists fixtures and pools.
export const revalidate = 30;

export async function generateMetadata(): Promise<Metadata> {
  const snap = await fixturesSnapshot();
  const now = Date.now() / 1000;
  const open = (snap?.data ?? []).filter((f) => f.status === "OPEN" && f.kickoff_ts > now);
  const staked = (snap?.data ?? []).reduce((s, f) => s + toWei(f.total_pool), 0n);
  const description = snap
    ? `${open.length} open fixtures across Europe's top five leagues · ${formatGen(staked)} GEN staked. Settles only when ESPN and BBC Sport agree.`
    : "Pari-mutuel 1X2 markets for Europe's top five leagues. Settles only when ESPN and BBC Sport agree.";
  return { title: "Hive Match", description, openGraph: { title: "Hive Match", description }, twitter: { title: "Hive Match", description } };
}

export default async function SportsPage() {
  return <SportsBoard initial={await fixturesSnapshot()} />;
}

import type { MetadataRoute } from "next";
import { fixturesSnapshot, marketsSnapshot, SITE_ORIGIN } from "@/lib/hive/serverData";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/sports", "/sports/tables", "/sports/leaderboard", "/crypto", "/crypto/activity", "/create"].map((p) => ({
    url: `${SITE_ORIGIN}${p}`,
    changeFrequency: "hourly" as const,
  }));
  const [fixtures, markets] = await Promise.all([fixturesSnapshot(), marketsSnapshot()]);
  return [
    ...pages,
    ...(fixtures?.data ?? []).map((f) => ({ url: `${SITE_ORIGIN}/sports/${f.match_id}`, changeFrequency: "hourly" as const })),
    ...(markets?.data ?? []).map((m) => ({ url: `${SITE_ORIGIN}/crypto/${m.id}`, changeFrequency: "hourly" as const })),
  ];
}

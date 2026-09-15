import { NextResponse } from "next/server";
import { ESPN_HEADERS, ESPN_SLUGS, normalizeStandings } from "@/lib/hive/espn";

export async function GET(_req: Request, ctx: { params: Promise<{ league: string }> }) {
  const { league } = await ctx.params;
  const slug = ESPN_SLUGS[league.toUpperCase()];
  if (!slug) return NextResponse.json({ error: "unknown league" }, { status: 400 });
  try {
    const res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`, {
      headers: ESPN_HEADERS,
      next: { revalidate: 900 },
    });
    if (!res.ok) return NextResponse.json({ error: `ESPN ${res.status}` }, { status: 502 });
    return NextResponse.json(normalizeStandings(await res.json()), {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

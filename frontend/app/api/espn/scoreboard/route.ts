import { NextResponse } from "next/server";
import { ESPN_HEADERS, ESPN_SLUGS, normalizeScoreboard } from "@/lib/hive/espn";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = ESPN_SLUGS[(url.searchParams.get("league") ?? "").toUpperCase()];
  const date = url.searchParams.get("date") ?? "";
  if (!slug || !/^\d{8}$/.test(date)) return NextResponse.json({ error: "league and date=YYYYMMDD required" }, { status: 400 });
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${date}`, {
      headers: ESPN_HEADERS,
      next: { revalidate: 45 },
    });
    if (!res.ok) return NextResponse.json({ error: `ESPN ${res.status}` }, { status: 502 });
    return NextResponse.json(normalizeScoreboard(await res.json()), {
      headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=120" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

import { NextResponse } from "next/server";

// Display-only hourly candles for the market chart. The contract performs its
// own CoinGecko + Gate.io fetch at settlement and never reads this route.
export async function GET(req: Request, ctx: { params: Promise<{ pair: string }> }) {
  const { pair } = await ctx.params;
  if (!/^[A-Z0-9]{2,10}_USDT$/.test(pair)) return NextResponse.json({ error: "bad pair" }, { status: 400 });
  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  const now = Math.floor(Date.now() / 1000);
  const start = Number.isFinite(from) && from > 0 ? from : now - 48 * 3600;
  const end = Math.min(Number.isFinite(to) && to > start ? to : now, start + 7 * 86400, now);
  try {
    const res = await fetch(
      `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${pair}&interval=1h&from=${start}&to=${end}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 60 }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return NextResponse.json({ error: `Gate ${res.status}` }, { status: 502 });
    const rows = (await res.json()) as string[][];
    const candles = rows
      .map((r) => ({ t: Number(r[0]), c: Number(r[2]), h: Number(r[3]), l: Number(r[4]), o: Number(r[5]) }))
      .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c))
      .sort((a, b) => a.t - b.t);
    return NextResponse.json({ pair, candles }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

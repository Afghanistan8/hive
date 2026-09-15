import { NextResponse } from "next/server";
import { runKeeper } from "@/lib/keeper/keeper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Keeper tick. Called by Vercel Cron and by the GitHub Actions schedule with
 * `Authorization: Bearer $CRON_SECRET`. Every transaction it sends is a
 * permissionless call any wallet could make; the keeper key has no privileges.
 *
 *   GET /api/cron/keeper            -> plan + submit (needs KEEPER_PRIVATE_KEY)
 *   GET /api/cron/keeper?dry=1      -> plan only, nothing signed
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const report = await runKeeper({ dryRun });
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// Server-side only (Node / GitHub Actions / API route). Never import from client components.
import { createAccount, createClient } from "genlayer-js";
import { GENLAYER_CHAIN } from "../genlayer/network";
import { HiveReader } from "../hive/contracts";
import { ESPN_HEADERS, ESPN_SLUGS, normalizeScoreboard, normalizeStandings, type LiveEvent } from "../hive/espn";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS } from "../hive/config";
import { discoverFixtures } from "./discover";
import { DEFAULT_LIMITS, gmt1Day, planAiCalls, planFixtureResolves, planMarketResolves, planPostpones, type KeeperLimits } from "./plan";
import { insert, mirrorEnabled, upsert } from "./supabase";

export interface KeeperAction {
  kind: string;
  target: string;
  hash?: string;
  error?: string;
  planned?: boolean;
}

export interface KeeperReport {
  ranAt: string;
  dryRun: boolean;
  signer: string | null;
  mirror: Record<string, number> | "disabled";
  actions: KeeperAction[];
  errors: string[];
}

const MAX_WRITES = 8;

/**
 * Keeper signer, from server-side secrets only:
 *   KEEPER_PRIVATE_KEY                         raw 0x-prefixed key, or
 *   KEEPER_KEYSTORE_JSON + KEEPER_KEYSTORE_PASSWORD  keystore exported by `genlayer account export`
 */
async function signerClient() {
  let pk = process.env.KEEPER_PRIVATE_KEY?.trim() ?? "";
  if (pk && !pk.startsWith("0x")) pk = `0x${pk}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    const json = process.env.KEEPER_KEYSTORE_JSON?.trim();
    const password = process.env.KEEPER_KEYSTORE_PASSWORD;
    if (!json || password === undefined) return null;
    const { Wallet } = await import("ethers");
    pk = (await Wallet.fromEncryptedJson(json, password)).privateKey;
  }
  return createClient({ chain: GENLAYER_CHAIN, account: createAccount(pk as `0x${string}`) }) as any;
}

async function send(client: any, address: string, functionName: string, args: unknown[]): Promise<string> {
  const e = await client.estimateTransactionFees({});
  return client.writeContract({
    address,
    functionName,
    args,
    value: 0n,
    fees: { distribution: e.distribution, feeValue: BigInt(e.feeValue) },
  });
}

async function scoreboards(dates: { league: string; date: string }[]): Promise<Record<string, LiveEvent>> {
  const seen = new Set<string>();
  const all: Record<string, LiveEvent> = {};
  for (const { league, date } of dates) {
    const key = `${league}-${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_SLUGS[league]}/scoreboard?dates=${date}`, { headers: ESPN_HEADERS, cache: "no-store" });
    if (res.ok) Object.assign(all, normalizeScoreboard(await res.json()));
  }
  return all;
}

export async function runKeeper(opts: { dryRun?: boolean; limits?: KeeperLimits } = {}): Promise<KeeperReport> {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const client = opts.dryRun ? null : await signerClient();
  const dryRun = !client;
  const now = Math.floor(Date.now() / 1000);
  const reader = new HiveReader();
  const report: KeeperReport = {
    ranAt: new Date().toISOString(),
    dryRun,
    signer: client?.account?.address ?? null,
    mirror: mirrorEnabled() ? {} : "disabled",
    actions: [],
    errors: [],
  };
  let writes = 0;
  const act = async (kind: string, target: string, address: string, fn: string, args: unknown[]) => {
    if (dryRun || writes >= MAX_WRITES) {
      report.actions.push({ kind, target, planned: true });
      return;
    }
    writes++;
    try {
      report.actions.push({ kind, target, hash: await send(client, address, fn, args) });
    } catch (e: any) {
      report.actions.push({ kind, target, error: String(e?.shortMessage || e?.message || e).slice(0, 300) });
    }
  };
  const guard = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e: any) {
      report.errors.push(`${label}: ${String(e?.message || e).slice(0, 300)}`);
    }
  };

  // ---- read chain state once
  const [fixtures, markets, positions] = await Promise.all([
    HIVE_SPORTS_ADDRESS ? reader.fixtures() : Promise.resolve([]),
    HIVE_CRYPTO_ADDRESS ? reader.cryptoMarkets() : Promise.resolve([]),
    HIVE_SPORTS_ADDRESS ? reader.allPositions() : Promise.resolve([]),
  ]);
  const live = await scoreboards(
    fixtures
      .filter((f) => Math.abs(f.kickoff_ts - now) < 3 * 86_400)
      .map((f) => ({ league: f.league, date: new Date(f.kickoff_ts * 1000).toISOString().slice(0, 10).replaceAll("-", "") })),
  ).catch(() => ({} as Record<string, LiveEvent>));

  // ---- crypto: keep the next two GMT+1 days open
  await guard("open markets", async () => {
    for (const offset of [1, 2]) {
      const day = gmt1Day(now, offset);
      if (!markets.some((m) => m.target_day === day)) await act("create_daily_markets", day, HIVE_CRYPTO_ADDRESS, "create_daily_markets", [day]);
    }
  });

  // ---- sports: register upcoming fixtures verified against BBC
  await guard("register fixtures", async () => {
    const upcoming = fixtures.filter((f) => f.status === "OPEN" && f.kickoff_ts > now).length;
    if (upcoming >= 30) return;
    const candidates = await discoverFixtures({ days: 8, perLeague: 6, minLeadSec: 2 * 3600, exclude: new Set(fixtures.map((f) => f.match_id)) });
    const batch = candidates.slice(0, 40);
    if (batch.length) await act("add_fixtures", `${batch.length} fixtures`, HIVE_SPORTS_ADDRESS, "add_fixtures", [JSON.stringify(batch)]);
  });

  // ---- sports: AI calls shortly before kickoff
  await guard("ai calls", async () => {
    for (const f of planAiCalls(fixtures, now, limits)) await act("request_ai_call", f.match_id, HIVE_SPORTS_ADDRESS, "request_ai_call", [f.match_id]);
  });

  // ---- settlement
  await guard("resolve fixtures", async () => {
    for (const f of planFixtureResolves(fixtures, now, limits)) await act("resolve", f.match_id, HIVE_SPORTS_ADDRESS, "resolve", [f.match_id]);
  });
  await guard("postpones", async () => {
    const status = Object.fromEntries(Object.values(live).map((e) => [e.id, e.detail]));
    for (const f of planPostpones(fixtures, status, now, limits)) await act("mark_postponed", f.match_id, HIVE_SPORTS_ADDRESS, "mark_postponed", [f.match_id]);
  });
  await guard("resolve markets", async () => {
    for (const m of planMarketResolves(markets, now, limits)) await act("resolve_market", `#${m.id} ${m.asset} ${m.target_day}`, HIVE_CRYPTO_ADDRESS, "resolve_market", [m.id]);
  });

  // ---- mirror to Supabase (read cache only)
  if (mirrorEnabled()) {
    const stamp = new Date().toISOString();
    const counts: Record<string, number> = {};
    await guard("mirror fixtures", async () => {
      const calls = await reader.aiCalls();
      const callById = new Map(calls.map((c) => [c.match_id, c]));
      const detail = await Promise.all(
        fixtures.filter((f) => f.ai_pick).map(async (f) => [f.match_id, await reader.aiCall(f.match_id)] as const),
      );
      const reasons = new Map(detail);
      counts.fixtures = await upsert(
        "hive_fixtures",
        fixtures.map((f) => ({
          match_id: f.match_id, league: f.league, league_name: f.league_name, home: f.home, away: f.away,
          espn_event_id: f.espn_event_id, kickoff_ts: f.kickoff_ts, status: f.status, result: f.result,
          home_goals: f.home_goals, away_goals: f.away_goals, pool_home: String(f.pool_home), pool_draw: String(f.pool_draw),
          pool_away: String(f.pool_away), total_pool: String(f.total_pool), paid_out: String(f.paid_out),
          positions_count: f.positions_count, refund_all: f.refund_all, resolved_at: f.resolved_at, creator: f.creator,
          created_at: f.created_at, ai_pick: f.ai_pick, ai_confidence: callById.get(f.match_id)?.confidence ?? null,
          ai_reason: reasons.get(f.match_id)?.reason ?? null, home_logo: live[f.espn_event_id]?.homeLogo ?? null,
          away_logo: live[f.espn_event_id]?.awayLogo ?? null, live_detail: live[f.espn_event_id]?.detail ?? null,
          live_home_score: live[f.espn_event_id]?.homeScore ?? null, live_away_score: live[f.espn_event_id]?.awayScore ?? null,
          live_state: live[f.espn_event_id]?.state ?? null, synced_at: stamp,
        })),
        "match_id",
      );
    });
    await guard("mirror positions", async () => {
      counts.positions = await upsert(
        "hive_positions",
        positions.map((p) => ({
          match_id: p.match_id, owner: p.owner, league: p.league, username: p.username || null, pick: p.pick,
          stake: String(p.stake), claimed: p.claimed, payout: String(p.payout), claimable: String(p.claimable),
          fixture_status: p.fixture_status, fixture_result: p.fixture_result, refund_all: p.refund_all, synced_at: stamp,
        })),
        "match_id,owner",
      );
    });
    await guard("mirror markets", async () => {
      counts.markets = await upsert(
        "hive_crypto_markets",
        markets.map((m) => ({
          id: m.id, asset: m.asset, coingecko_id: m.coingecko_id, gate_pair: m.gate_pair, target_day: m.target_day,
          creator: m.creator, created_at: m.created_at, cutoff_at: m.cutoff_at, settles_at: m.settles_at,
          terminal_refund_at: m.terminal_refund_at, up_pool: String(m.up_pool), down_pool: String(m.down_pool),
          total_pool: String(m.total_pool), paid_out: String(m.paid_out), positions_count: m.positions_count,
          state: m.state, result: m.result, refund_all: m.refund_all, resolved_at: m.resolved_at, synced_at: stamp,
        })),
        "id",
      );
    });
    await guard("mirror standings", async () => {
      let n = 0;
      for (const [league, slug] of Object.entries(ESPN_SLUGS)) {
        const res = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`, { headers: ESPN_HEADERS, cache: "no-store" });
        if (!res.ok) continue;
        const { season, rows } = normalizeStandings(await res.json());
        n += await upsert(
          "hive_standings",
          rows.map((r) => ({
            league, team: r.team, rank: r.rank, short: r.short, abbr: r.abbr, logo: r.logo, played: r.played, won: r.won,
            drawn: r.drawn, lost: r.lost, gf: r.gf, ga: r.ga, gd: r.gd, points: r.points, note: r.note, note_color: r.noteColor,
            season, synced_at: stamp,
          })),
          "league,team",
        );
      }
      counts.standings = n;
    });
    report.mirror = counts;
    await guard("log run", () => insert("hive_keeper_runs", { ran_at: stamp, dry_run: dryRun, actions: report.actions, errors: report.errors }));
  }

  return report;
}

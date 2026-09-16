// Server-rendering data for pages: reads through the site's own /api/gl/read so SSR shares the
// CDN cache with browsers (Studio allows ~30 contract reads a minute per IP). Every helper returns
// null instead of throwing: a slow chain must never break a page, the client then loads the data.
import { HiveReader } from "./contracts";
import type { CryptoMarket, Fixture } from "./types";

export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

/** How often pre-rendered pages refresh their contract snapshot (seconds). */
export const SNAPSHOT_REVALIDATE = 30;

/** The contract says this id does not exist (proxy answered 404). */
export const MISSING = "missing" as const;

export interface Snapshot<T> {
  data: T;
  /** Epoch ms the snapshot was read — lets React Query refetch as soon as it is stale. */
  at: number;
}

const reader = () =>
  new HiveReader(undefined, undefined, {
    proxyBase: SITE_ORIGIN,
    fetchInit: { next: { revalidate: SNAPSHOT_REVALIDATE } },
    // The proxy itself retries busy/rate-limited reads for up to 12 s.
    timeoutMs: 14_000,
  });

async function snapshot<T>(fn: (r: HiveReader) => Promise<T>): Promise<Snapshot<T> | null | typeof MISSING> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { data: await fn(reader()), at: Date.now() };
    } catch (e) {
      if ((e as { status?: number })?.status === 404) return MISSING;
      console.warn(`[hive] server snapshot attempt ${attempt + 1} failed:`, (e as Error)?.message ?? e);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

const orNull = <T,>(s: Snapshot<T> | null | typeof MISSING) => (s === MISSING ? null : s);
export const fixturesSnapshot = async () => orNull(await snapshot<Fixture[]>((r) => r.fixtures()));
export const marketsSnapshot = async () => orNull(await snapshot<CryptoMarket[]>((r) => r.cryptoMarkets()));
export const fixtureSnapshot = (matchId: string) => snapshot<Fixture>((r) => r.fixture(matchId));
export const marketSnapshot = (id: number) => snapshot<CryptoMarket>((r) => r.cryptoMarket(id));

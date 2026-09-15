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

export interface Snapshot<T> {
  data: T;
  /** Epoch ms the snapshot was read — lets React Query refetch as soon as it is stale. */
  at: number;
}

const reader = () =>
  new HiveReader(undefined, undefined, {
    proxyBase: SITE_ORIGIN,
    fetchInit: { next: { revalidate: SNAPSHOT_REVALIDATE } },
    timeoutMs: 8000,
  });

async function snapshot<T>(fn: (r: HiveReader) => Promise<T>): Promise<Snapshot<T> | null> {
  try {
    return { data: await fn(reader()), at: Date.now() };
  } catch (e) {
    console.warn("[hive] server snapshot unavailable:", (e as Error)?.message ?? e);
    return null;
  }
}

export const fixturesSnapshot = () => snapshot<Fixture[]>((r) => r.fixtures());
export const marketsSnapshot = () => snapshot<CryptoMarket[]>((r) => r.cryptoMarkets());
export const fixtureSnapshot = (matchId: string) => snapshot<Fixture>((r) => r.fixture(matchId));
export const marketSnapshot = (id: number) => snapshot<CryptoMarket>((r) => r.cryptoMarket(id));

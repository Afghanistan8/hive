"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { hiveReader, markFresh } from "./contracts";
import type { Snapshot } from "./serverData";
import type { CryptoMarket, Fixture } from "./types";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS } from "./config";
import type { LiveEvent, StandingRow } from "./espn";
import { mirrorConfigured, mirrorFixtures, mirrorMarkets, mirrorPositions } from "./mirror";

const REFRESH = 15_000;

/** Every contract read: fail fast (one retry), never spin forever; the proxy itself times out at 12 s. */
const CONTRACT = { staleTime: 10_000, retry: 1, retryDelay: 1000 } as const;

/** Supabase mirror snapshot, used only as instant placeholder while the contract read runs. */
function useMirror<T>(key: string, fn: () => Promise<T>) {
  return useQuery({ queryKey: ["mirror", key], queryFn: fn, enabled: mirrorConfigured, staleTime: 60_000, retry: false });
}

export function useCryptoMarkets(initial?: Snapshot<CryptoMarket[]> | null) {
  const mirror = useMirror("markets", mirrorMarkets);
  return useQuery({
    initialData: initial?.data,
    initialDataUpdatedAt: initial?.at,
    queryKey: ["crypto", "markets"],
    ...CONTRACT,
    queryFn: () => hiveReader().cryptoMarkets(),
    enabled: !!HIVE_CRYPTO_ADDRESS,
    refetchInterval: REFRESH,
    placeholderData: mirror.data,
  });
}

export function useCryptoMarket(id: number, initial?: Snapshot<CryptoMarket> | null) {
  return useQuery({
    initialData: initial?.data,
    initialDataUpdatedAt: initial?.at,
    queryKey: ["crypto", "market", id],
    ...CONTRACT,
    queryFn: () => hiveReader().cryptoMarket(id),
    enabled: !!HIVE_CRYPTO_ADDRESS && Number.isFinite(id) && id > 0,
    refetchInterval: REFRESH,
  });
}

export function useCryptoPosition(id: number, wallet: string | null) {
  return useQuery({
    queryKey: ["crypto", "position", id, wallet],
    ...CONTRACT,
    queryFn: () => hiveReader().cryptoPosition(id, wallet!),
    enabled: !!HIVE_CRYPTO_ADDRESS && !!wallet && id > 0,
    refetchInterval: REFRESH,
  });
}

export function useCryptoEvidence(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["crypto", "evidence", id],
    ...CONTRACT,
    queryFn: () => hiveReader().cryptoEvidence(id),
    enabled: !!HIVE_CRYPTO_ADDRESS && enabled,
  });
}

export function useCryptoSourceUrls(id: number) {
  return useQuery({
    queryKey: ["crypto", "sources", id],
    ...CONTRACT,
    queryFn: () => hiveReader().cryptoSourceUrls(id),
    enabled: !!HIVE_CRYPTO_ADDRESS && id > 0,
    staleTime: Infinity,
  });
}

export function useCryptoAssets() {
  return useQuery({
    queryKey: ["crypto", "assets"],
    ...CONTRACT,
    queryFn: () => hiveReader().cryptoAssets(),
    enabled: !!HIVE_CRYPTO_ADDRESS,
    staleTime: Infinity,
  });
}

export function useFixtures(initial?: Snapshot<Fixture[]> | null) {
  const mirror = useMirror("fixtures", mirrorFixtures);
  return useQuery({
    initialData: initial?.data,
    initialDataUpdatedAt: initial?.at,
    queryKey: ["sports", "fixtures"],
    ...CONTRACT,
    queryFn: () => hiveReader().fixtures(),
    enabled: !!HIVE_SPORTS_ADDRESS,
    refetchInterval: REFRESH,
    placeholderData: mirror.data,
  });
}

export function useFixture(matchId: string, initial?: Snapshot<Fixture> | null) {
  return useQuery({
    initialData: initial?.data,
    initialDataUpdatedAt: initial?.at,
    queryKey: ["sports", "fixture", matchId],
    ...CONTRACT,
    queryFn: () => hiveReader().fixture(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && !!matchId,
    refetchInterval: REFRESH,
  });
}

export function useSportsPosition(matchId: string, wallet: string | null) {
  return useQuery({
    queryKey: ["sports", "position", matchId, wallet],
    ...CONTRACT,
    queryFn: () => hiveReader().sportsPosition(matchId, wallet!),
    enabled: !!HIVE_SPORTS_ADDRESS && !!wallet && !!matchId,
    refetchInterval: REFRESH,
  });
}

export function useSportsEvidence(matchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["sports", "evidence", matchId],
    ...CONTRACT,
    queryFn: () => hiveReader().sportsEvidence(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && enabled,
  });
}

export function useSportsEvidenceRaw(matchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["sports", "evidence-raw", matchId],
    ...CONTRACT,
    queryFn: () => hiveReader().sportsEvidenceRaw(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && enabled,
  });
}

export function useSportsSourceUrls(matchId: string) {
  return useQuery({
    queryKey: ["sports", "sources", matchId],
    ...CONTRACT,
    queryFn: () => hiveReader().sportsSourceUrls(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && !!matchId,
    staleTime: Infinity,
  });
}

export function useAllPositions() {
  const mirror = useMirror("positions", mirrorPositions);
  return useQuery({
    queryKey: ["sports", "positions"],
    ...CONTRACT,
    queryFn: () => hiveReader().allPositions(),
    enabled: !!HIVE_SPORTS_ADDRESS,
    refetchInterval: 30_000,
    placeholderData: mirror.data,
  });
}

export function useAiCall(matchId: string) {
  return useQuery({
    queryKey: ["sports", "ai", matchId],
    ...CONTRACT,
    queryFn: () => hiveReader().aiCall(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && !!matchId,
    refetchInterval: REFRESH,
  });
}

export function useAiCalls() {
  return useQuery({
    queryKey: ["sports", "ai-calls"],
    ...CONTRACT,
    queryFn: () => hiveReader().aiCalls(),
    enabled: !!HIVE_SPORTS_ADDRESS,
    refetchInterval: 60_000,
  });
}

export function useUsername(wallet: string | null) {
  return useQuery({
    queryKey: ["sports", "username", wallet],
    ...CONTRACT,
    queryFn: () => hiveReader().username(wallet!),
    enabled: !!HIVE_SPORTS_ADDRESS && !!wallet,
  });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

/** Display-only league table (ESPN). */
export function useStandings(league: string) {
  return useQuery({
    queryKey: ["display", "standings", league],
    queryFn: () => getJson<{ season: string; rows: StandingRow[] }>(`/api/espn/standings/${league}`),
    enabled: !!league,
    staleTime: 10 * 60_000,
  });
}

/** Display-only live scores + crests for one league-day (ESPN). */
export function useScoreboard(league: string, kickoffTs: number | undefined) {
  const date = kickoffTs ? new Date(kickoffTs * 1000).toISOString().slice(0, 10).replaceAll("-", "") : "";
  return useQuery({
    queryKey: ["display", "scoreboard", league, date],
    queryFn: () => getJson<Record<string, LiveEvent>>(`/api/espn/scoreboard?league=${league}&date=${date}`),
    enabled: !!league && !!date,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Display-only hourly candles (Gate.io). */
export function useCandles(pair: string, from?: number, to?: number) {
  const qs = from ? `?from=${from}${to ? `&to=${to}` : ""}` : "";
  return useQuery({
    queryKey: ["display", "candles", pair, from, to],
    queryFn: () => getJson<{ candles: { t: number; o: number; h: number; l: number; c: number }[] }>(`/api/candles/${pair}${qs}`),
    enabled: !!pair,
    refetchInterval: 60_000,
  });
}

export function usePortfolio(wallet: string | null) {
  const crypto = useQuery({
    queryKey: ["crypto", "user", wallet],
    ...CONTRACT,
    queryFn: () => hiveReader().cryptoUserPositions(wallet!),
    enabled: !!HIVE_CRYPTO_ADDRESS && !!wallet,
    refetchInterval: REFRESH,
  });
  const sports = useQuery({
    queryKey: ["sports", "user", wallet],
    ...CONTRACT,
    queryFn: () => hiveReader().sportsUserPositions(wallet!),
    enabled: !!HIVE_SPORTS_ADDRESS && !!wallet,
    refetchInterval: REFRESH,
  });
  return { crypto, sports };
}

export function useInvalidateHive() {
  const qc = useQueryClient();
  return useCallback(() => {
    markFresh();
    qc.invalidateQueries({ queryKey: ["crypto"] });
    qc.invalidateQueries({ queryKey: ["sports"] });
  }, [qc]);
}

/** Re-render every `ms` so countdowns and derived phases stay current. */
/**
 * `renderedAt` (epoch ms of a server snapshot) makes the first render identical on the server and
 * during hydration, so countdowns and phases don't mismatch; the real clock takes over on mount.
 */
export function useNow(ms = 1000, renderedAt?: number) {
  const [now, setNow] = useState(() => Math.floor((renderedAt ?? Date.now()) / 1000));
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const noopSubscribe = () => () => {};
/** False on the server and during hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

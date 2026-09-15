"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { hiveReader } from "./contracts";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS } from "./config";

const REFRESH = 15_000;

export function useCryptoMarkets() {
  return useQuery({
    queryKey: ["crypto", "markets"],
    queryFn: () => hiveReader().cryptoMarkets(),
    enabled: !!HIVE_CRYPTO_ADDRESS,
    refetchInterval: REFRESH,
  });
}

export function useCryptoMarket(id: number) {
  return useQuery({
    queryKey: ["crypto", "market", id],
    queryFn: () => hiveReader().cryptoMarket(id),
    enabled: !!HIVE_CRYPTO_ADDRESS && Number.isFinite(id) && id > 0,
    refetchInterval: REFRESH,
  });
}

export function useCryptoPosition(id: number, wallet: string | null) {
  return useQuery({
    queryKey: ["crypto", "position", id, wallet],
    queryFn: () => hiveReader().cryptoPosition(id, wallet!),
    enabled: !!HIVE_CRYPTO_ADDRESS && !!wallet && id > 0,
    refetchInterval: REFRESH,
  });
}

export function useCryptoEvidence(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["crypto", "evidence", id],
    queryFn: () => hiveReader().cryptoEvidence(id),
    enabled: !!HIVE_CRYPTO_ADDRESS && enabled,
  });
}

export function useCryptoSourceUrls(id: number) {
  return useQuery({
    queryKey: ["crypto", "sources", id],
    queryFn: () => hiveReader().cryptoSourceUrls(id),
    enabled: !!HIVE_CRYPTO_ADDRESS && id > 0,
    staleTime: Infinity,
  });
}

export function useCryptoAssets() {
  return useQuery({
    queryKey: ["crypto", "assets"],
    queryFn: () => hiveReader().cryptoAssets(),
    enabled: !!HIVE_CRYPTO_ADDRESS,
    staleTime: Infinity,
  });
}

export function useFixtures() {
  return useQuery({
    queryKey: ["sports", "fixtures"],
    queryFn: () => hiveReader().fixtures(),
    enabled: !!HIVE_SPORTS_ADDRESS,
    refetchInterval: REFRESH,
  });
}

export function useFixture(matchId: string) {
  return useQuery({
    queryKey: ["sports", "fixture", matchId],
    queryFn: () => hiveReader().fixture(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && !!matchId,
    refetchInterval: REFRESH,
  });
}

export function useSportsPosition(matchId: string, wallet: string | null) {
  return useQuery({
    queryKey: ["sports", "position", matchId, wallet],
    queryFn: () => hiveReader().sportsPosition(matchId, wallet!),
    enabled: !!HIVE_SPORTS_ADDRESS && !!wallet && !!matchId,
    refetchInterval: REFRESH,
  });
}

export function useSportsEvidence(matchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["sports", "evidence", matchId],
    queryFn: () => hiveReader().sportsEvidence(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && enabled,
  });
}

export function useSportsEvidenceRaw(matchId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["sports", "evidence-raw", matchId],
    queryFn: () => hiveReader().sportsEvidenceRaw(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && enabled,
  });
}

export function useSportsSourceUrls(matchId: string) {
  return useQuery({
    queryKey: ["sports", "sources", matchId],
    queryFn: () => hiveReader().sportsSourceUrls(matchId),
    enabled: !!HIVE_SPORTS_ADDRESS && !!matchId,
    staleTime: Infinity,
  });
}

export function usePortfolio(wallet: string | null) {
  const crypto = useQuery({
    queryKey: ["crypto", "user", wallet],
    queryFn: () => hiveReader().cryptoUserPositions(wallet!),
    enabled: !!HIVE_CRYPTO_ADDRESS && !!wallet,
    refetchInterval: REFRESH,
  });
  const sports = useQuery({
    queryKey: ["sports", "user", wallet],
    queryFn: () => hiveReader().sportsUserPositions(wallet!),
    enabled: !!HIVE_SPORTS_ADDRESS && !!wallet,
    refetchInterval: REFRESH,
  });
  return { crypto, sports };
}

export function useInvalidateHive() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ["crypto"] });
    qc.invalidateQueries({ queryKey: ["sports"] });
  }, [qc]);
}

/** Re-render every `ms` so countdowns and derived phases stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

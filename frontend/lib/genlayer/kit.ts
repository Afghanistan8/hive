"use client";

import { useMemo } from "react";
import { createTransactionKit, type TransactionKit } from "@genlayer/transaction-kit";
import { GENLAYER_CHAIN, getEthereumProvider } from "./client";

/** Transaction Kit bound to the connected account and the wallet the user picked. */
export function useTransactionKit(address: string | null, walletId?: string | null): TransactionKit | null {
  return useMemo(() => {
    const provider = getEthereumProvider();

    if (!provider || !address?.startsWith("0x")) {
      return null;
    }

    return createTransactionKit({
      chain: GENLAYER_CHAIN,
      provider,
      account: address as `0x${string}`,
    });
    // walletId re-creates the kit when the user switches wallets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, walletId]);
}

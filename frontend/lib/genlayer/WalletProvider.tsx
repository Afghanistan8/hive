"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { connectWalletProvider, getAccounts, getCurrentChainId, switchAccount } from "./client";
import { GENLAYER_CHAIN_ID } from "./network";
import {
  getSelectedWalletId,
  getServerWalletOptions,
  getWalletOption,
  getWalletOptions,
  selectWallet,
  startWalletDiscovery,
  subscribeWallets,
  walletsReady,
  type WalletOption,
} from "./wallets";

// Remembers an explicit disconnect so we don't silently reconnect on reload.
const DISCONNECT_FLAG = "wallet_disconnected";

export interface WalletState {
  address: string | null;
  chainId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  /** True when at least one wallet (MetaMask, OKX, Rabby, …) is available. */
  isMetaMaskInstalled: boolean;
  isOnCorrectNetwork: boolean;
  walletId: string | null;
  walletName: string | null;
  walletIcon: string | null;
}

interface WalletContextValue extends WalletState {
  wallets: WalletOption[];
  /** Connect a specific wallet by id; with no id, reuse the last-picked or the only one. */
  connectWallet: (walletId?: string) => Promise<string>;
  disconnectWallet: () => void;
  switchWalletAccount: () => Promise<string>;
  /** Shared wallet picker dialog (rendered once by <WalletChooser />). */
  chooserOpen: boolean;
  setChooserOpen: (open: boolean) => void;
  /** Open the picker — every "Connect wallet" button calls this. */
  requestConnect: () => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const EMPTY: WalletState = {
  address: null,
  chainId: null,
  isConnected: false,
  isLoading: true,
  isMetaMaskInstalled: false,
  isOnCorrectNetwork: false,
  walletId: null,
  walletName: null,
  walletIcon: null,
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useSyncExternalStore(subscribeWallets, getWalletOptions, getServerWalletOptions);
  const [state, setState] = useState<WalletState>(EMPTY);
  const [chooserOpen, setChooserOpen] = useState(false);
  const requestConnect = useCallback(() => setChooserOpen(true), []);

  const describe = (id: string | null) => {
    const w = getWalletOption(id);
    return { walletId: w?.id ?? null, walletName: w?.name ?? null, walletIcon: w?.icon || null };
  };

  // Discover wallets, then silently restore the last session if still authorised.
  useEffect(() => {
    startWalletDiscovery();
    let cancelled = false;
    (async () => {
      await walletsReady();
      if (cancelled) return;
      const available = getWalletOptions().length > 0;
      const disconnected = typeof window !== "undefined" && localStorage.getItem(DISCONNECT_FLAG) === "true";
      const savedId = getSelectedWalletId();
      const saved = getWalletOption(savedId);
      if (!available || disconnected || !saved) {
        setState({ ...EMPTY, isLoading: false, isMetaMaskInstalled: available });
        return;
      }
      const accounts = await getAccounts(saved.provider);
      const chainId = await getCurrentChainId(saved.provider);
      setState({
        address: accounts[0] || null,
        chainId,
        isConnected: accounts.length > 0,
        isLoading: false,
        isMetaMaskInstalled: true,
        isOnCorrectNetwork: !!chainId && parseInt(chainId, 16) === GENLAYER_CHAIN_ID,
        ...describe(saved.id),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setState((prev) => ({ ...prev, isMetaMaskInstalled: wallets.length > 0 }));
  }, [wallets.length]);

  // Listen to the connected wallet only.
  useEffect(() => {
    const provider = getWalletOption(state.walletId)?.provider;
    if (!provider?.on) return;

    const onAccounts = (accounts: string[]) => {
      if (accounts.length > 0) localStorage.removeItem(DISCONNECT_FLAG);
      setState((prev) => ({ ...prev, address: accounts[0] || null, isConnected: accounts.length > 0 }));
    };
    const onChain = (chainId: string) => {
      setState((prev) => ({ ...prev, chainId, isOnCorrectNetwork: parseInt(chainId, 16) === GENLAYER_CHAIN_ID }));
    };
    const onDisconnect = () => setState((prev) => ({ ...prev, address: null, isConnected: false }));

    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [state.walletId]);

  const connectWallet = useCallback(async (walletId?: string) => {
    await walletsReady(walletId ? 0 : 400);
    const options = getWalletOptions();
    const target = getWalletOption(walletId) ?? getWalletOption(getSelectedWalletId()) ?? (options.length === 1 ? options[0] : null);
    if (!target) throw new Error(options.length ? "Choose a wallet" : "No wallet found");

    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      selectWallet(target.id);
      const address = await connectWalletProvider(target.provider);
      const chainId = await getCurrentChainId(target.provider);
      localStorage.removeItem(DISCONNECT_FLAG);
      setState({
        address,
        chainId,
        isConnected: true,
        isLoading: false,
        isMetaMaskInstalled: true,
        isOnCorrectNetwork: !!chainId && parseInt(chainId, 16) === GENLAYER_CHAIN_ID,
        ...describe(target.id),
      });
      return address;
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw err;
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    localStorage.setItem(DISCONNECT_FLAG, "true");
    setState((prev) => ({ ...prev, address: null, isConnected: false }));
  }, []);

  const switchWalletAccount = useCallback(async () => {
    const provider = getWalletOption(state.walletId)?.provider;
    if (!provider) throw new Error("No wallet connected");
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const address = await switchAccount(provider);
      const chainId = await getCurrentChainId(provider);
      setState((prev) => ({
        ...prev,
        address,
        chainId,
        isConnected: true,
        isLoading: false,
        isOnCorrectNetwork: !!chainId && parseInt(chainId, 16) === GENLAYER_CHAIN_ID,
      }));
      return address;
    } catch (err) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw err;
    }
  }, [state.walletId]);

  const value: WalletContextValue = {
    ...state, wallets, connectWallet, disconnectWallet, switchWalletAccount, chooserOpen, setChooserOpen, requestConnect,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) throw new Error("useWallet must be used within a WalletProvider");
  return context;
}

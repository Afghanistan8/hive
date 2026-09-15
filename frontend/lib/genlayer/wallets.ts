"use client";

// Multi-wallet discovery via EIP-6963: MetaMask, OKX Wallet, Rabby, Coinbase Wallet,
// Trust, Brave, Phantom (EVM) and any other extension or in-app browser that announces
// itself. Falls back to legacy injected providers (window.okxwallet / window.ethereum).

export interface Eip1193Provider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isTrust?: boolean;
  isBraveWallet?: boolean;
}

export interface WalletOption {
  id: string; // rdns when announced (e.g. io.metamask, com.okex.wallet)
  name: string;
  icon: string; // data URI from the wallet, or ""
  provider: Eip1193Provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
    okxwallet?: Eip1193Provider;
  }
}

export const INSTALL_LINKS = [
  { name: "MetaMask", url: "https://metamask.io/download/" },
  { name: "OKX Wallet", url: "https://www.okx.com/web3" },
  { name: "Rabby", url: "https://rabby.io/" },
  { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet/downloads" },
];

const STORAGE_KEY = "hive.wallet";
const options = new Map<string, WalletOption>();
const listeners = new Set<() => void>();
let snapshot: WalletOption[] = [];
let started = false;
let selectedId: string | null = null;

function emit() {
  snapshot = [...options.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  listeners.forEach((l) => l());
}

function rank(id: string) {
  const order = ["io.metamask", "com.okex.wallet", "io.rabby", "com.coinbase.wallet"];
  const i = order.indexOf(id);
  return i === -1 ? order.length : i;
}

function legacyName(p: Eip1193Provider): { id: string; name: string } {
  if (p.isOkxWallet || p.isOKExWallet) return { id: "com.okex.wallet", name: "OKX Wallet" };
  if (p.isRabby) return { id: "io.rabby", name: "Rabby" };
  if (p.isCoinbaseWallet) return { id: "com.coinbase.wallet", name: "Coinbase Wallet" };
  if (p.isTrust) return { id: "com.trustwallet.app", name: "Trust Wallet" };
  if (p.isBraveWallet) return { id: "com.brave.wallet", name: "Brave Wallet" };
  if (p.isMetaMask) return { id: "io.metamask", name: "MetaMask" };
  return { id: "injected", name: "Browser wallet" };
}

function addLegacy(p: Eip1193Provider | undefined) {
  if (!p) return;
  const { id, name } = legacyName(p);
  // Only fill gaps: EIP-6963 announcements carry the real name and icon.
  if ([...options.values()].some((o) => o.provider === p) || options.has(id)) return;
  options.set(id, { id, name, icon: "", provider: p });
}

export function startWalletDiscovery() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    selectedId = localStorage.getItem(STORAGE_KEY);
  } catch {
    selectedId = null;
  }
  window.addEventListener("eip6963:announceProvider", (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail?.info || !detail?.provider) return;
    const id = String(detail.info.rdns || detail.info.uuid);
    options.set(id, { id, name: String(detail.info.name || id), icon: String(detail.info.icon || ""), provider: detail.provider });
    emit();
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Wallets that don't speak EIP-6963 yet.
  setTimeout(() => {
    addLegacy(window.okxwallet);
    for (const p of window.ethereum?.providers ?? []) addLegacy(p);
    addLegacy(window.ethereum);
    emit();
  }, 350);
}

export function subscribeWallets(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getWalletOptions = () => snapshot;
const NO_WALLETS: WalletOption[] = [];
export const getServerWalletOptions = (): WalletOption[] => NO_WALLETS;

export function getSelectedWalletId() {
  return selectedId;
}

export function getWalletOption(id: string | null | undefined) {
  return id ? options.get(id) ?? null : null;
}

export function selectWallet(id: string | null) {
  selectedId = id;
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
  listeners.forEach((l) => l());
}

/** The provider of the wallet the user picked; falls back to the legacy injected one. */
export function getSelectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return getWalletOption(selectedId)?.provider ?? snapshot[0]?.provider ?? window.ethereum ?? null;
}

/** Resolves once discovery has had a moment to hear from installed wallets. */
export function walletsReady(ms = 400) {
  startWalletDiscovery();
  return new Promise<void>((r) => setTimeout(r, ms));
}

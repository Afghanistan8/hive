"use client";

import { createClient } from "genlayer-js";
import { GENLAYER_CHAIN, GENLAYER_CHAIN_ID, GENLAYER_CHAIN_ID_HEX, GENLAYER_NETWORK } from "./network";
import { getSelectedProvider, type Eip1193Provider } from "./wallets";

export { GENLAYER_CHAIN, GENLAYER_CHAIN_ID, GENLAYER_CHAIN_ID_HEX, GENLAYER_NETWORK } from "./network";
export type { Eip1193Provider } from "./wallets";

export function getStudioUrl(): string {
  return GENLAYER_CHAIN.rpcUrls.default.http[0];
}

/** Provider of the wallet the user chose (MetaMask, OKX, Rabby, …), or the injected fallback. */
export function getEthereumProvider(): Eip1193Provider | null {
  return getSelectedProvider();
}

export function hasInjectedWallet(): boolean {
  return getEthereumProvider() !== null;
}

function requireProvider(): Eip1193Provider {
  const provider = getEthereumProvider();
  if (!provider) throw new Error("No wallet found");
  return provider;
}

export async function requestAccounts(provider = requireProvider()): Promise<string[]> {
  try {
    return await provider.request({ method: "eth_requestAccounts" });
  } catch (error: any) {
    if (error?.code === 4001) throw new Error("User rejected the connection request");
    throw new Error(`Failed to connect wallet: ${error?.message ?? error}`);
  }
}

export async function getAccounts(provider = getEthereumProvider()): Promise<string[]> {
  if (!provider) return [];
  try {
    return await provider.request({ method: "eth_accounts" });
  } catch {
    return [];
  }
}

export async function getCurrentChainId(provider = getEthereumProvider()): Promise<string | null> {
  if (!provider) return null;
  try {
    return await provider.request({ method: "eth_chainId" });
  } catch {
    return null;
  }
}

export async function addGenLayerNetwork(provider = requireProvider()): Promise<void> {
  try {
    await provider.request({ method: "wallet_addEthereumChain", params: [GENLAYER_NETWORK] });
  } catch (error: any) {
    if (error?.code === 4001) throw new Error("User rejected adding the network");
    throw new Error(`Failed to add GenLayer network: ${error?.message ?? error}`);
  }
}

export async function switchToGenLayerNetwork(provider = requireProvider()): Promise<void> {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: GENLAYER_CHAIN_ID_HEX }] });
  } catch (error: any) {
    // 4902 = unknown chain (MetaMask); some wallets report -32603 / "Unrecognized chain"
    if (error?.code === 4902 || error?.code === -32603 || /unrecognized|not added|unknown chain/i.test(error?.message ?? "")) {
      await addGenLayerNetwork(provider);
    } else if (error?.code === 4001) {
      throw new Error("User rejected switching the network");
    } else {
      throw new Error(`Failed to switch network: ${error?.message ?? error}`);
    }
  }
}

export async function isOnGenLayerNetwork(provider = getEthereumProvider()): Promise<boolean> {
  const chainId = await getCurrentChainId(provider);
  return !!chainId && parseInt(chainId, 16) === GENLAYER_CHAIN_ID;
}

/** Connect the given wallet provider and make sure it is on GenLayer Studio Next. */
export async function connectWalletProvider(provider = requireProvider()): Promise<string> {
  const accounts = await requestAccounts(provider);
  if (!accounts?.length) throw new Error("No accounts found");
  if (!(await isOnGenLayerNetwork(provider))) await switchToGenLayerNetwork(provider);
  return accounts[0];
}

/** Show the wallet's account picker (where supported) and return the chosen account. */
export async function switchAccount(provider = requireProvider()): Promise<string> {
  try {
    await provider.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
  } catch (error: any) {
    if (error?.code === 4001) throw new Error("User rejected account switch");
    if (error?.code === -32002) throw new Error("Account switch request already pending");
    // Wallets without wallet_requestPermissions: fall back to a plain account request.
  }
  const accounts = await requestAccounts(provider);
  if (!accounts?.length) throw new Error("No account selected");
  return accounts[0];
}

export function createGenLayerClient(address?: string) {
  const config: any = { chain: GENLAYER_CHAIN };
  if (address) {
    config.account = address as `0x${string}`;
    const provider = getEthereumProvider();
    if (provider) config.provider = provider;
  }
  return createClient(config);
}

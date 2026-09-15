import { afterEach, describe, expect, it, vi } from "vitest";

function announce(rdns: string, name: string, provider: object) {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: `${rdns}-uuid`, name, icon: "data:image/svg+xml,x", rdns }, provider } }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  delete (window as any).okxwallet;
  delete (window as any).ethereum;
  localStorage.clear();
});

describe("wallet discovery", () => {
  it("lists every EIP-6963 wallet and returns the picked provider", async () => {
    const metamask = { request: vi.fn(), isMetaMask: true };
    const okx = { request: vi.fn(), isOkxWallet: true };
    window.addEventListener("eip6963:requestProvider", () => {
      announce("com.okex.wallet", "OKX Wallet", okx);
      announce("io.metamask", "MetaMask", metamask);
    });
    const w = await import("../lib/genlayer/wallets");
    w.startWalletDiscovery();

    expect(w.getWalletOptions().map((o) => o.name)).toEqual(["MetaMask", "OKX Wallet"]);
    w.selectWallet("com.okex.wallet");
    expect(w.getSelectedProvider()).toBe(okx);
    expect(localStorage.getItem("hive.wallet")).toBe("com.okex.wallet");
  });

  it("falls back to legacy injected OKX and MetaMask providers", async () => {
    vi.useFakeTimers();
    (window as any).okxwallet = { request: vi.fn(), isOkxWallet: true };
    (window as any).ethereum = { request: vi.fn(), isMetaMask: true };
    const w = await import("../lib/genlayer/wallets");
    w.startWalletDiscovery();
    vi.advanceTimersByTime(400);
    expect(w.getWalletOptions().map((o) => o.id)).toEqual(["io.metamask", "com.okex.wallet"]);
  });
});

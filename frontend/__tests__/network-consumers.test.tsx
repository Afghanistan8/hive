import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GENLAYER_CHAIN,
  GENLAYER_CHAIN_ID_HEX,
  GENLAYER_NETWORK,
} from "../lib/genlayer/network";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ readContract: vi.fn() })),
  createTransactionKit: vi.fn(() => ({ configured: true })),
}));

vi.mock("genlayer-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@genlayer/transaction-kit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@genlayer/transaction-kit")>()),
  createTransactionKit: mocks.createTransactionKit,
}));

import { HiveReader } from "../lib/hive/contracts";
import {
  addGenLayerNetwork,
  switchToGenLayerNetwork,
} from "../lib/genlayer/client";
import { useTransactionKit } from "../lib/genlayer/kit";

const account = "0x1234567890123456789012345678901234567890";
const providerRequest = vi.fn();

describe("network consumers", () => {
  beforeEach(() => {
    mocks.createClient.mockClear();
    mocks.createTransactionKit.mockClear();
    providerRequest.mockReset();
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        request: providerRequest,
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    });
  });

  it("keeps browser contract reads off Studio RPC (they use the /api/gl/read proxy)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: { fixture_count: 0 } })));
    vi.stubGlobal("fetch", fetchMock);
    await new HiveReader(account, account).fixtureCount();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/^\/api\/gl\/read\?/);
    vi.unstubAllGlobals();
  });

  it("builds the read proxy's clients from the shared chain", async () => {
    await import("../app/api/gl/read/route");
    const chains = mocks.createClient.mock.calls.map((c: any) => c[0].chain);
    expect(chains.length).toBeGreaterThan(0);
    for (const chain of chains) expect(chain.id).toBe(GENLAYER_CHAIN.id);
    expect(chains.map((c: any) => c.rpcUrls.default.http[0])).toContain(GENLAYER_CHAIN.rpcUrls.default.http[0]);
  });

  it("uses the same chain for Transaction Kit submissions", () => {
    renderHook(() => useTransactionKit(account));

    expect(mocks.createTransactionKit).toHaveBeenCalledWith({
      account,
      chain: GENLAYER_CHAIN,
      provider: expect.objectContaining({ request: providerRequest }),
    });
  });

  it("does not create a signing kit without an account", () => {
    const { result } = renderHook(() => useTransactionKit(null));
    expect(result.current).toBeNull();
    expect(mocks.createTransactionKit).not.toHaveBeenCalled();
  });

  it("does not create a signing kit without a wallet provider", () => {
    Object.defineProperty(window, "ethereum", { configurable: true, value: undefined });
    const { result } = renderHook(() => useTransactionKit(account));
    expect(result.current).toBeNull();
    expect(mocks.createTransactionKit).not.toHaveBeenCalled();
  });

  it("uses the shared wallet network for add and switch requests", async () => {
    await switchToGenLayerNetwork();
    expect(providerRequest).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });

    await addGenLayerNetwork();
    expect(providerRequest).toHaveBeenCalledWith({
      method: "wallet_addEthereumChain",
      params: [GENLAYER_NETWORK],
    });
  });
});

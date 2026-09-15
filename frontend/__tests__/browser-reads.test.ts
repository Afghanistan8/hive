import { afterEach, describe, expect, it, vi } from "vitest";

const SPORTS = "0xeE172062d021f4dE2B4fEbad0B945e769a62C954";
const CRYPTO = "0x6172565eA61CEa77c8E6d1fBed36936009C10FF1";

const readContract = vi.fn();
vi.mock("genlayer-js", () => ({ createClient: () => ({ readContract }) }));

async function loadReader() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_HIVE_SPORTS_ADDRESS = SPORTS;
  process.env.NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS = CRYPTO;
  const { HiveReader } = await import("../lib/hive/contracts");
  return new HiveReader();
}

afterEach(() => {
  vi.unstubAllGlobals();
  readContract.mockReset();
});

describe("browser contract reads", () => {
  it("go through /api/gl/read in small parallel pages, never to Studio RPC", async () => {
    const calls: { fn: string; args: unknown[] }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const q = new URL(url, "http://localhost").searchParams;
      const fn = q.get("functionName")!;
      const args = JSON.parse(q.get("args")!);
      calls.push({ fn, args });
      const result = fn === "get_config" ? { fixture_count: 47 } : Array.from({ length: Math.min(16, 47 - args[0]) }, (_, i) => ({ match_id: `pd-${args[0] + i}` }));
      return new Response(JSON.stringify({ result }), { status: 200 });
    }));
    const reader = await loadReader();

    const fixtures = await reader.fixtures();
    expect(fixtures).toHaveLength(47);
    expect(calls.map((c) => [c.fn, c.args])).toEqual([
      ["get_config", []],
      ["get_fixtures", [0, 16]],
      ["get_fixtures", [16, 16]],
      ["get_fixtures", [32, 16]],
    ]);
    expect(readContract).not.toHaveBeenCalled();
  });

  it("caps pages to the newest fixtures when the contract holds many", async () => {
    const offsets: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const q = new URL(url, "http://localhost").searchParams;
      if (q.get("functionName") === "get_config") return new Response(JSON.stringify({ result: { fixture_count: 1000 } }));
      offsets.push(JSON.parse(q.get("args")!)[0]);
      return new Response(JSON.stringify({ result: [] }));
    }));
    const reader = await loadReader();
    await reader.fixtures();
    // page 0 is requested alongside the count, then the 8 newest pages
    expect(offsets).toHaveLength(9);
    expect(offsets.filter((o) => o > 0).sort((a, b) => a - b)).toEqual(Array.from({ length: 8 }, (_, i) => 1000 - 16 * (8 - i)));
  });

  it("surface the proxy's error message instead of hanging", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "get_markets: Studio RPC did not answer within 12 s" }), { status: 504 })));
    const reader = await loadReader();
    await expect(reader.cryptoMarket(1)).rejects.toThrow("get_markets: Studio RPC did not answer within 12 s");
  });
});

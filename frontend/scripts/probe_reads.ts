// Proves the chain and the contract state the app reads, against every Studio RPC candidate.
//
//   npm run probe --workspace frontend
//
// Read-only: no wallet, no signing.
import { createClient } from "genlayer-js";
import { createGenLayerNetworkConfig } from "../lib/genlayer/network";

const RPCS = ["https://studio-next.genlayer.com/api", "https://studio-dev.genlayer.com/api"];
const SPORTS = process.env.NEXT_PUBLIC_HIVE_SPORTS_ADDRESS || "0xeE172062d021f4dE2B4fEbad0B945e769a62C954";
const CRYPTO = process.env.NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS || "0x6172565eA61CEa77c8E6d1fBed36936009C10FF1";
const TIMEOUT_MS = 15_000;

const withTimeout = <T>(p: Promise<T>, label: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${label}: timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS))]);

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ ok: true; ms: number; value: T } | { ok: false; ms: number; error: string }> {
  const t = Date.now();
  try {
    const value = await withTimeout(fn(), label);
    return { ok: true, ms: Date.now() - t, value };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t, error: String(e?.shortMessage || e?.message || e).split("\n")[0] };
  }
}

const iso = (s: number) => (s ? new Date(s * 1000).toISOString() : String(s));
const summary: Record<string, unknown> = {};

for (const rpc of RPCS) {
  console.log(`\n=== ${rpc}`);
  const chainId = await timed("eth_chainId", async () => {
    const res = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    return ((await res.json()) as { result: string }).result;
  });
  console.log("eth_chainId:", chainId.ok ? `${chainId.value} (${parseInt(chainId.value, 16)}) in ${chainId.ms} ms` : `FAIL ${chainId.error}`);
  if (!chainId.ok) {
    summary[rpc] = { ok: false, error: chainId.error };
    continue;
  }

  const client = createClient({ chain: createGenLayerNetworkConfig({ chainId: "61997", rpcUrl: rpc }).chain });
  const read = (address: string, functionName: string, args: any[] = []) =>
    timed(functionName, () => client.readContract({ address: address as `0x${string}`, functionName, args, jsonSafeReturn: true }) as Promise<any>);

  const sCfg = await read(SPORTS, "get_config");
  const fixtures = await read(SPORTS, "get_fixtures", [0, 50]);
  const cCfg = await read(CRYPTO, "get_config");
  const markets = await read(CRYPTO, "get_markets", [0, 50]);
  const assets = await read(CRYPTO, "get_supported_assets");

  console.log("\nHiveSports", SPORTS);
  console.log("  get_config:", sCfg.ok ? `fixture_count=${sCfg.value.fixture_count} view now=${sCfg.value.now} (${iso(sCfg.value.now)}) in ${sCfg.ms} ms` : `FAIL ${sCfg.error}`);
  if (fixtures.ok) {
    console.log(`  get_fixtures(0,50): ${fixtures.value.length} rows in ${fixtures.ms} ms`);
    for (const f of fixtures.value.slice(0, 3)) console.log(`    ${f.match_id}  ${f.home} v ${f.away}  kickoff ${iso(f.kickoff_ts)}  status=${f.status} phase=${f.phase}`);
  } else console.log("  get_fixtures: FAIL", fixtures.error);

  console.log("\nHiveCrypto", CRYPTO);
  console.log("  get_config:", cCfg.ok ? `market_count=${cCfg.value.market_count} view now=${cCfg.value.now} (${iso(cCfg.value.now)}) in ${cCfg.ms} ms` : `FAIL ${cCfg.error}`);
  if (markets.ok) {
    console.log(`  get_markets(0,50): ${markets.value.length} rows in ${markets.ms} ms`);
    for (const m of markets.value.slice(0, 5)) console.log(`    #${m.id}  ${m.asset}  ${m.target_day}  state=${m.state} phase=${m.phase}`);
  } else console.log("  get_markets: FAIL", markets.error);
  console.log("  get_supported_assets:", assets.ok ? `${assets.value.length} assets in ${assets.ms} ms` : `FAIL ${assets.error}`);

  summary[rpc] = {
    chainId: parseInt(chainId.value, 16),
    fixtures: fixtures.ok ? fixtures.value.length : fixtures.error,
    fixture_count: sCfg.ok ? sCfg.value.fixture_count : null,
    markets: markets.ok ? markets.value.length : markets.error,
    market_count: cCfg.ok ? cCfg.value.market_count : null,
  };
}

console.log("\n=== summary");
console.log(JSON.stringify(summary, null, 2));

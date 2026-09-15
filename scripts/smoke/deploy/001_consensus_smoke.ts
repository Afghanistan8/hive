// Consensus smoke test on Studio Next — proves the real settlement path
// (web fetches + validator LLMs + strict_eq) reaches agreement on-chain today,
// without waiting for tonight's fixtures or tomorrow's candles.
//
// It deploys THROWAWAY copies of both contracts in which only the
// "must be in the future" registration guards are relaxed, registers an
// already-finished real fixture and already-closed real candles, and resolves
// them. Settlement code, sources, parsers and consensus are byte-identical to
// contracts/. These copies are never used by the app.
//
//   cd scripts/smoke && SMOKE_ONLY=consensus npx genlayer deploy
//
// Node built-ins only (the CLI transpiles this file into a temp dir).
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..", "..");
const OUT = path.join(process.cwd(), "smoke-results.json");

const FIXTURE = { league: "PL", event: "401879278", home: "Manchester United", away: "Manchester City", kickoff: 1789313400 };
const CANDLE_DAY = process.env.SMOKE_DAY ?? "2026-09-14";
const CANDLE_ASSETS = (process.env.SMOKE_ASSETS ?? "BTC,ATOM").split(",");

function patch(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`smoke patch anchor not found: ${from}`);
  return source.replace(from, to);
}

function accepted(receipt: any): boolean {
  return String(receipt.txExecutionResultName ?? "") === "FINISHED_WITH_RETURN";
}

async function fees(client: any) {
  const e = await client.estimateTransactionFees({});
  return { distribution: e.distribution, feeValue: BigInt(e.feeValue) };
}

async function deploy(client: any, label: string, code: string) {
  const hash = await client.deployContract({ code: new TextEncoder().encode(code), args: [], fees: await fees(client) });
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "decided", retries: 400, interval: 3000 });
  const address = receipt.txDataDecoded?.contractAddress ?? receipt.data?.contract_address;
  if (!accepted(receipt) || !address) throw new Error(`${label} deploy failed: ${receipt.txExecutionResultName}`);
  console.log(`deployed ${label} at ${address} (${hash})`);
  return { address, hash };
}

async function write(client: any, address: string, functionName: string, args: any[]) {
  const hash = await client.writeContract({ address, functionName, args, value: 0n, fees: await fees(client) });
  console.log(`sent ${functionName}(${args.join(", ")}) ${hash}`);
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "decided", retries: 600, interval: 5000 });
  const leader = receipt.consensus_data?.leader_receipt?.[0] ?? receipt.data?.consensus_data?.leader_receipt?.[0];
  const result = { functionName, args, hash, execution: receipt.txExecutionResultName, status: receipt.statusName ?? receipt.status, leaderResult: leader?.result ?? null };
  console.log(`  -> ${result.execution} ${JSON.stringify(result.status)}`);
  return result;
}

const read = (client: any, address: string, functionName: string, args: any[]) =>
  client.readContract({ address, functionName, args, jsonSafeReturn: true });

export default async function main(client: any) {
  if (process.env.SMOKE_ONLY && process.env.SMOKE_ONLY !== "consensus") return;
  const fail = (m: string) => { throw new Error(`CONSENSUS SMOKE FAILED: ${m}`); };
  const results: any = { network: client.chain?.name, chainId: client.chain?.id, ranAt: new Date().toISOString(), sports: {}, crypto: {} };

  // ---- sports: real finished fixture, ESPN + BBC + LLM consensus
  let sports = readFileSync(path.join(ROOT, "contracts", "hive_sports.py"), "utf8");
  sports = patch(sports, "MIN_LEAD = 10 * 60", "MIN_LEAD = -30 * DAY  # SMOKE COPY ONLY: allow registering a finished fixture");
  const s = await deploy(client, "HiveSports(smoke)", sports);
  results.sports.contract = s;
  results.sports.add = await write(client, s.address, "add_fixture", [FIXTURE.league, FIXTURE.event, FIXTURE.home, FIXTURE.away, FIXTURE.kickoff]);
  const matchId = `${FIXTURE.league.toLowerCase()}-${FIXTURE.event}`;
  results.sports.resolve = await write(client, s.address, "resolve", [matchId]);
  results.sports.fixture = await read(client, s.address, "get_fixture", [matchId]);
  results.sports.evidence = await read(client, s.address, "get_evidence", [matchId]);
  results.sports.evidenceRaw = await read(client, s.address, "get_evidence_raw", [matchId]);
  console.log("sports evidence:", results.sports.evidenceRaw);
  writeFileSync(OUT, JSON.stringify(results, null, 2) + "\n");

  const ev = JSON.parse(results.sports.evidenceRaw || "{}");
  if (results.sports.resolve.execution !== "FINISHED_WITH_RETURN") fail("sports resolve did not execute");
  if (ev.source_a !== "espn" || ev.source_b !== "bbc") fail("sports evidence must come from ESPN and BBC");
  for (const src of ["espn", "bbc"]) {
    if (ev[src]?.status !== "FINISHED" || ev[src]?.home_goals !== 0 || ev[src]?.away_goals !== 1) fail(`${src} reading not stored exactly: ${JSON.stringify(ev[src])}`);
  }
  if (ev.outcome !== "AWAY" || results.sports.fixture.result !== "AWAY") fail("sports outcome mismatch");
  const canonical = (o: any): string => Array.isArray(o) ? `[${o.map(canonical).join(",")}]`
    : o && typeof o === "object" ? `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}` : JSON.stringify(o);
  if (canonical(ev) !== results.sports.evidenceRaw) fail("stored sports evidence is not the canonical agreed payload");

  // ---- crypto: real closed GMT+1 candles, CoinGecko + Gate.io consensus
  let crypto = readFileSync(path.join(ROOT, "contracts", "hive_crypto.py"), "utf8");
  crypto = patch(crypto, "if day_start <= now:", "if day_start <= now - 30 * DAY:  # SMOKE COPY ONLY: allow a closed day");
  const c = await deploy(client, "HiveCrypto(smoke)", crypto);
  results.crypto.contract = c;
  results.crypto.markets = [];
  for (const asset of CANDLE_ASSETS) {
    const create = await write(client, c.address, "create_market", [asset, CANDLE_DAY]);
    const market = await read(client, c.address, "get_market_by_asset_day", [asset, CANDLE_DAY]);
    // A public API outage is an agreed UNAVAILABLE -> TRANSIENT revert; retry like any user would.
    let resolve = await write(client, c.address, "resolve_market", [market.id]);
    const attempts = [resolve];
    for (let i = 0; i < 3 && resolve.execution !== "FINISHED_WITH_RETURN"; i++) {
      await new Promise((r) => setTimeout(r, 90_000));
      resolve = await write(client, c.address, "resolve_market", [market.id]);
      attempts.push(resolve);
    }
    const evidence = await read(client, c.address, "get_evidence", [market.id]);
    console.log(`${asset} evidence:`, JSON.stringify(evidence));
    results.crypto.markets.push({ asset, day: CANDLE_DAY, create, attempts, evidence, market: await read(client, c.address, "get_market", [market.id]) });
    writeFileSync(OUT, JSON.stringify(results, null, 2) + "\n");

    if (resolve.execution !== "FINISHED_WITH_RETURN") fail(`${asset} never resolved`);
    const parts = String(evidence.agreed_payload).split("|");
    const expected = [String(market.id), asset, null, null, CANDLE_DAY,
      String(evidence.coingecko_open), String(evidence.coingecko_close), evidence.coingecko_direction,
      String(evidence.gate_open), String(evidence.gate_close), evidence.gate_direction, evidence.final_result];
    if (parts.length !== 12 || expected.some((v, i) => v !== null && parts[i] !== v)) fail(`${asset} stored fields differ from agreed payload ${evidence.agreed_payload}`);
    const expectedFinal = evidence.coingecko_direction === evidence.gate_direction ? evidence.coingecko_direction : "INCONCLUSIVE";
    if (evidence.final_result !== expectedFinal) fail(`${asset} final result contradicts directions`);
  }
  console.log("CONSENSUS SMOKE PASSED");
}

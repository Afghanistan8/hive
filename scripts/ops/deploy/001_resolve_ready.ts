// Operator helper: resolve every HIVE market / fixture that is ready.
//
//   npm run resolve:ready            (from the repo root)
//
// Uses only permissionless calls — exactly what the Resolve button does. Any
// wallet can run it; it has no special power. Reverts (sources not yet in
// agreement, match unfinished) are logged and simply retried next run.
// Node built-ins only (the CLI transpiles this file into a temp dir).
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..", "..");
const state = JSON.parse(readFileSync(path.join(ROOT, "deploy", "deployments.json"), "utf8"));
const CRYPTO = state.contracts.HiveCrypto.address;
const SPORTS = state.contracts.HiveSports.address;
const MAX = Number(process.env.HIVE_RESOLVE_MAX ?? 10);

async function fees(client: any) {
  const e = await client.estimateTransactionFees({});
  return { distribution: e.distribution, feeValue: BigInt(e.feeValue) };
}

async function send(client: any, address: string, functionName: string, args: any[]) {
  const hash = await client.writeContract({ address, functionName, args, value: 0n, fees: await fees(client) });
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: "decided", retries: 600, interval: 5000 });
  console.log(`${functionName}(${args.join(", ")}) ${hash} -> ${receipt.txExecutionResultName}`);
}

const read = (client: any, address: string, functionName: string, args: any[]) =>
  client.readContract({ address, functionName, args, jsonSafeReturn: true });

export default async function main(client: any) {
  const now = Math.floor(Date.now() / 1000);
  let sent = 0;

  const markets: any[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await read(client, CRYPTO, "get_markets", [offset, 50]);
    markets.push(...page);
    if (page.length < 50) break;
  }
  // Only markets with stakes are worth a settlement transaction.
  for (const m of markets.filter((m) => m.state === "PENDING" && now >= m.settles_at && Number(m.positions_count) > 0)) {
    if (sent++ >= MAX) break;
    await send(client, CRYPTO, "resolve_market", [m.id]).catch((e) => console.log(`resolve_market(${m.id}) failed: ${e}`));
  }

  const fixtures: any[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await read(client, SPORTS, "get_fixtures", [offset, 50]);
    fixtures.push(...page);
    if (page.length < 50) break;
  }
  for (const f of fixtures.filter((f) => f.status === "OPEN" && now >= f.kickoff_ts + 2 * 3600)) {
    if (sent++ >= MAX) break;
    await send(client, SPORTS, "resolve", [f.match_id]).catch((e) => console.log(`resolve(${f.match_id}) failed: ${e}`));
  }
  console.log(`done: ${sent} settlement transactions attempted`);
}

// Seeds the demo through ordinary permissionless writes — the same calls any
// user could make. Nothing here has privileges the contracts don't give everyone.
//
//   * HiveCrypto.create_daily_markets for the next HIVE_SEED_DAYS GMT+1 days
//   * HiveSports.add_fixtures from fixtures.demo.json (future kickoffs only)
//
// Node built-ins only (see note in 001_deploy_crypto.ts).
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const STATE_FILE = path.join(ROOT, "deploy", "deployments.json");
const DAY = 86_400;
const BATCH = 20;

async function write(client: any, address: string, functionName: string, args: any[]) {
  const txHash = await client.writeContract({ address, functionName, args, value: 0n });
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, waitUntil: "decided", retries: 300, interval: 3000 });
  const statusName = String(receipt.statusName ?? "");
  const execution = String(receipt.txExecutionResultName ?? "");
  const ok = ["ACCEPTED", "FINALIZED"].includes(statusName) && !execution.includes("ERROR");
  console.log(`${ok ? "ok  " : "FAIL"} ${functionName} ${txHash} status=${statusName} execution=${execution}`);
  return { txHash, ok, functionName, args: functionName === "add_fixtures" ? `${JSON.parse(args[0]).length} fixtures` : args };
}

function gmt1Day(offsetDays: number): string {
  const gmt1 = new Date(Date.now() + 3_600_000 + offsetDays * DAY * 1000);
  return gmt1.toISOString().slice(0, 10);
}

export default async function main(client: any) {
  if (!existsSync(STATE_FILE)) throw new Error("deploy/deployments.json missing — run the deploy scripts first");
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const crypto = state.contracts?.HiveCrypto?.address;
  const sports = state.contracts?.HiveSports?.address;
  if (!crypto || !sports) throw new Error("HiveCrypto / HiveSports addresses missing in deploy/deployments.json");
  if (process.env.HIVE_SKIP_SEED) {
    console.log("HIVE_SKIP_SEED set — skipping demo seed");
    return;
  }

  const results: any[] = [];
  const days = Number(process.env.HIVE_SEED_DAYS ?? 2);
  for (let i = 1; i <= days; i++) {
    results.push(await write(client, crypto, "create_daily_markets", [gmt1Day(i)]));
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const fixtures = JSON.parse(readFileSync(path.join(ROOT, "fixtures.demo.json"), "utf8"))
    .filter((f: any) => f.kickoff_ts > nowSec + 30 * 60)
    .map((f: any) => ({ league: f.league, espn_event_id: f.espn_event_id, home: f.home, away: f.away, kickoff_ts: f.kickoff_ts }));
  for (let i = 0; i < fixtures.length; i += BATCH) {
    results.push(await write(client, sports, "add_fixtures", [JSON.stringify(fixtures.slice(i, i + BATCH))]));
  }

  state.seeds = [...(state.seeds ?? []), { at: new Date().toISOString(), results }];
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

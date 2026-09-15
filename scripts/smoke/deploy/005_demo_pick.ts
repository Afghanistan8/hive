// Demo activity for the leaderboard / My Picks: a public username and one real 2 GEN pick.
//   cd scripts/smoke && SMOKE_ONLY=demo-pick npx genlayer deploy
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..", "..");

async function fees(client: any) {
  const e = await client.estimateTransactionFees({});
  return { distribution: e.distribution, feeValue: BigInt(e.feeValue) };
}

async function send(client: any, address: string, functionName: string, args: any[], value = 0n) {
  const hash = await client.writeContract({ address, functionName, args, value, fees: await fees(client) });
  const r = await client.waitForTransactionReceipt({ hash, waitUntil: "decided", retries: 300, interval: 4000 });
  console.log(`${functionName}(${args.join(", ")}) ${hash} -> ${r.txExecutionResultName}`);
  if (r.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error(`${functionName} failed`);
}

export default async function main(client: any) {
  if (process.env.SMOKE_ONLY !== "demo-pick") return;
  const sports = JSON.parse(readFileSync(path.join(ROOT, "deploy", "deployments.json"), "utf8")).contracts.HiveSports.address;
  const me = client.account.address.toLowerCase();
  const name = process.env.DEMO_USERNAME ?? "hive_demo";
  const matchId = process.env.DEMO_MATCH ?? "pd-401882876";
  const pick = process.env.DEMO_PICK ?? "HOME";

  if (!(await client.readContract({ address: sports, functionName: "get_username", args: [me], jsonSafeReturn: true }))) {
    await send(client, sports, "set_username", [name]);
  }
  const pos = await client.readContract({ address: sports, functionName: "get_position", args: [matchId, me], jsonSafeReturn: true });
  if (!pos.exists) await send(client, sports, "predict", [matchId, pick], 2n * 10n ** 18n);
  const rows = await client.readContract({ address: sports, functionName: "get_positions", args: [0, 10], jsonSafeReturn: true });
  console.log(JSON.stringify(rows, null, 2));
}

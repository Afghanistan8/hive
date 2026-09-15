// Deploys contracts/hive_crypto.py. Run through `genlayer deploy`, which injects
// a client bound to the active CLI account and network.
//
// The CLI transpiles each script into a temp dir without bundling, so this file
// only imports Node built-ins. Shared logic is intentionally repeated per script.
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const ROOT = process.cwd();
const CONTRACT = "contracts/hive_crypto.py";
const NAME = "HiveCrypto";
const ENV_KEY = "NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS";
const STATE_FILE = path.join(ROOT, "deploy", "deployments.json");

function loadState(): any {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : { contracts: {}, seeds: [] };
}

function upsertEnv(key: string, value: string) {
  const envPath = path.join(ROOT, "frontend", ".env");
  const base = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : readFileSync(path.join(ROOT, "frontend", ".env.example"), "utf8");
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(base)
    ? base.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : `${base.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, next);
}

export default async function main(client: any) {
  const source = readFileSync(path.join(ROOT, CONTRACT));
  const codeHash = createHash("sha256").update(source).digest("hex");
  const chainId = Number(client.chain?.id);
  const state = loadState();
  const previous = state.contracts?.[NAME];

  if (previous && previous.chainId === chainId && previous.codeHash === codeHash && !process.env.HIVE_REDEPLOY) {
    console.log(`${NAME} already deployed at ${previous.address} (same code). Set HIVE_REDEPLOY=1 to force.`);
    upsertEnv(ENV_KEY, previous.address);
    return;
  }

  await client.initializeConsensusSmartContract();
  const txHash = await client.deployContract({ code: new Uint8Array(source), args: [] });
  console.log(`${NAME} deploy tx: ${txHash}`);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash, waitUntil: "decided", retries: 300, interval: 3000 });

  const statusName = String(receipt.statusName ?? "");
  const execution = String(receipt.txExecutionResultName ?? "");
  if (!["ACCEPTED", "FINALIZED"].includes(statusName) || execution.includes("ERROR")) {
    throw new Error(`${NAME} deployment not accepted: status=${statusName} execution=${execution}`);
  }
  const address = receipt.txDataDecoded?.contractAddress ?? receipt.data?.contract_address ?? receipt.recipient;
  if (!address) throw new Error(`${NAME} receipt has no contract address`);

  state.network = { chainId, name: client.chain?.name, rpc: client.chain?.rpcUrls?.default?.http?.[0] };
  state.contracts = state.contracts ?? {};
  state.contracts[NAME] = { address, txHash, chainId, codeHash, deployedAt: new Date().toISOString() };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  upsertEnv(ENV_KEY, address);
  console.log(`${NAME} deployed at ${address}`);
}

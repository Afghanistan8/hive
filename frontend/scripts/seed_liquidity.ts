// Seeds visible demo liquidity on upcoming HIVE markets from a few openly-labelled team wallets
// (usernames hive_seed_a … hive_seed_e). Every stake is an ordinary `predict` / `take_position`
// anyone could make, sent through the same Transaction Kit estimate → submit → track path the
// browser uses, with a local EIP-1193 signer standing in for the wallet extension.
//
//   npm run seed:liquidity --workspace frontend            # plan + send
//   npm run seed:liquidity --workspace frontend -- --dry   # plan only
//
// Wallets are created on first run and kept in deploy/seed-wallets.local.json (gitignored), funded
// from Studio Next's faucet. Results (public tx hashes) go to deploy/seed-liquidity.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTransactionKit, type SubmitInput } from "@genlayer/transaction-kit";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { GENLAYER_CHAIN } from "../lib/genlayer/network";
import { HiveReader } from "../lib/hive/contracts";
import { HIVE_CRYPTO_ADDRESS, HIVE_SPORTS_ADDRESS } from "../lib/hive/config";

// Studio rate-limits gen_call / eth_call / eth_sendRawTransaction / gen_getTransactionByHash /
// sim_fundAccount to 30 per minute per IP ("standard" bucket). Every request to the RPC — ours,
// genlayer-js's and Transaction Kit's — goes through this throttle, and rate-limit errors back off.
const STANDARD = new Set(["gen_call", "eth_call", "eth_sendRawTransaction", "gen_getTransactionByHash", "sim_fundAccount", "eth_estimateGas"]);
const SPACING_MS = 2400;
let nextSlot = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (!url.includes("genlayer.com")) return realFetch(input, init);
  let methods: string[] = [];
  try {
    const body = JSON.parse(String(init?.body ?? "{}"));
    methods = (Array.isArray(body) ? body : [body]).map((b: any) => b.method);
  } catch {}
  for (let attempt = 0; ; attempt++) {
    if (methods.some((m) => STANDARD.has(m))) {
      const wait = Math.max(0, nextSlot - Date.now());
      nextSlot = Math.max(nextSlot, Date.now()) + SPACING_MS * methods.length;
      if (wait) await new Promise((r) => setTimeout(r, wait));
    }
    const res = await realFetch(input, init);
    const text = await res.clone().text();
    const limited = res.status === 429 || text.includes("-32029");
    if (!limited || attempt > 8) return res;
    let after = 30;
    try {
      after = JSON.parse(text)?.error?.data?.retry_after_seconds ?? 30;
    } catch {}
    nextSlot = Date.now() + (after + 1) * 1000;
  }
}) as typeof fetch;

const ROOT = join(process.cwd(), "..");
const WALLETS_FILE = join(ROOT, "deploy", "seed-wallets.local.json");
const RESULTS_FILE = join(ROOT, "deploy", "seed-liquidity.json");
const RPC = GENLAYER_CHAIN.rpcUrls.default.http[0];
const GEN = 10n ** 18n;
const NAMES = ["hive_seed_a", "hive_seed_b", "hive_seed_c", "hive_seed_d", "hive_seed_e"];
const dry = process.argv.includes("--dry");
const SPORTS_FIXTURES = Number(process.env.SEED_FIXTURES ?? 12);

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

/** Minimal EIP-1193 provider: signs locally, forwards everything else to Studio. */
function localProvider(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk);
  return {
    address: account.address,
    request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account.address];
      if (method === "eth_chainId") return `0x${GENLAYER_CHAIN.id.toString(16)}`;
      if (method === "eth_sendTransaction") {
        const tx = params[0] as Record<string, string>;
        const [nonce, gasPrice] = await Promise.all([
          rpc<string>("eth_getTransactionCount", [account.address, "pending"]),
          tx.gasPrice ? Promise.resolve(tx.gasPrice) : rpc<string>("eth_gasPrice"),
        ]);
        const gas = tx.gas ?? (await rpc<string>("eth_estimateGas", [{ from: account.address, to: tx.to, data: tx.data, value: tx.value ?? "0x0" }]));
        const raw = await account.signTransaction({
          type: "legacy",
          chainId: GENLAYER_CHAIN.id,
          nonce: Number(nonce),
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value ?? 0),
          gas: BigInt(gas),
          gasPrice: BigInt(gasPrice),
        });
        return rpc<string>("eth_sendRawTransaction", [raw]);
      }
      return rpc(method, params);
    },
  };
}

type Wallet = { name: string; pk: `0x${string}`; address: string };
function loadWallets(): Wallet[] {
  const existing: Wallet[] = existsSync(WALLETS_FILE) ? JSON.parse(readFileSync(WALLETS_FILE, "utf8")) : [];
  const wallets = NAMES.map((name) => existing.find((w) => w.name === name) ?? (() => {
    const pk = generatePrivateKey();
    return { name, pk, address: privateKeyToAccount(pk).address };
  })());
  if (!dry) writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
  return wallets;
}

type Job = { wallet: Wallet; label: string; tx: SubmitInput; value: bigint };

/** Transaction Kit estimate + submit (the browser's path). Outcomes are checked in bulk afterwards. */
async function submit(job: Job) {
  const provider = localProvider(job.wallet.pk);
  const kit = createTransactionKit({ chain: GENLAYER_CHAIN, provider, account: provider.address });
  const quote = await kit.estimate({ preset: "standard", userValue: job.value }, job.tx);
  if (quote.verification.status === "mismatch") throw new Error("fee quote verification mismatch");
  const { genlayerTxId } = await kit.submit(quote, job.tx);
  return { hash: genlayerTxId, feeValue: quote.feeValue.toString(), source: quote.source };
}

async function outcome(hash: string) {
  const tx = await rpc<any>("gen_getTransactionByHash", [hash]);
  const status = String(tx?.statusName ?? tx?.status_name ?? tx?.status ?? "");
  const result = String(tx?.txExecutionResultName ?? tx?.tx_execution_result_name ?? tx?.execution_result ?? "");
  return { status, result };
}

// Deterministic spread so pools look like a market, not one wallet: favourite side gets more.
const SPORTS_SHAPES: [number, "HOME" | "DRAW" | "AWAY", number][][] = [
  [[0, "HOME", 5], [1, "DRAW", 2], [2, "AWAY", 3]],
  [[1, "HOME", 3], [3, "AWAY", 4]],
  [[2, "HOME", 2], [4, "DRAW", 3], [0, "AWAY", 2]],
  [[3, "HOME", 6], [4, "AWAY", 2]],
];
const flip = (p: "HOME" | "DRAW" | "AWAY", ai: string) => (ai === "AWAY" ? (p === "HOME" ? "AWAY" : p === "AWAY" ? "HOME" : p) : ai === "DRAW" && p === "HOME" ? "DRAW" : ai === "DRAW" && p === "DRAW" ? "HOME" : p);

const reader = new HiveReader();
const wallets = loadWallets();
const now = Math.floor(Date.now() / 1000);
const jobs: Job[] = [];

// Existing seed positions, read in bulk (a handful of reads, not one per market).
const held = new Set<string>();
for (const p of await reader.allPositions()) held.add(`${p.match_id}|${p.owner.toLowerCase()}`);
for (const w of wallets) for (const r of await reader.cryptoUserPositions(w.address)) held.add(`${r.market?.id ?? (r as any).market_id}|${w.address.toLowerCase()}`);

// Sports: the soonest OPEN fixtures with at least 90 minutes to go.
const fixtures = (await reader.fixtures()).filter((f) => f.status === "OPEN" && f.kickoff_ts > now + 5400).sort((a, b) => a.kickoff_ts - b.kickoff_ts).slice(0, SPORTS_FIXTURES);
for (const [i, f] of fixtures.entries()) {
  for (const [w, basePick, gen] of SPORTS_SHAPES[i % SPORTS_SHAPES.length]) {
    const wallet = wallets[w];
    if (held.has(`${f.match_id}|${wallet.address.toLowerCase()}`)) continue;
    const pick = flip(basePick, f.ai_pick);
    jobs.push({ wallet, label: `${f.home} v ${f.away} · ${pick} ${gen} GEN`, tx: { kind: "write", address: HIVE_SPORTS_ADDRESS as `0x${string}`, method: "predict", args: [f.match_id, pick] }, value: BigInt(gen) * GEN });
  }
}

// Crypto: every OPEN market whose entries close more than 2 hours from now.
const markets = (await reader.cryptoMarkets()).filter((m) => m.state === "PENDING" && m.cutoff_at > now + 7200);
for (const [i, m] of markets.entries()) {
  const first: "UP" | "DOWN" = i % 3 === 0 ? "DOWN" : "UP";
  const opposite: "UP" | "DOWN" = first === "UP" ? "DOWN" : "UP";
  const shape: [number, "UP" | "DOWN", number][] = [
    [0, first, 2 + (i % 5)],
    [1, i % 5 === 4 ? first : opposite, 2 + ((i * 3) % 6)],
    ...(i % 4 === 0 ? [[2, "UP", 3] as [number, "UP", number]] : []),
  ];
  for (const [w, side, gen] of shape) {
    const wallet = wallets[w];
    if (held.has(`${m.id}|${wallet.address.toLowerCase()}`)) continue;
    jobs.push({ wallet, label: `${m.asset} ${m.target_day} · ${side} ${gen} GEN`, tx: { kind: "write", address: HIVE_CRYPTO_ADDRESS as `0x${string}`, method: "take_position", args: [m.id, side] }, value: BigInt(gen) * GEN });
  }
}

const perWallet = new Map<string, bigint>();
for (const j of jobs) perWallet.set(j.wallet.name, (perWallet.get(j.wallet.name) ?? 0n) + j.value);
console.log(`plan: ${jobs.length} stakes across ${fixtures.length} fixtures and ${markets.length} markets`);
for (const w of wallets) console.log(`  ${w.name} ${w.address} needs ${(perWallet.get(w.name) ?? 0n) / GEN} GEN`);
if (dry) {
  for (const j of jobs) console.log(`  - ${j.wallet.name}: ${j.label}`);
  process.exit(0);
}

// Fund from the Studio Next faucet and set the public usernames.
for (const w of wallets) {
  const need = (perWallet.get(w.name) ?? 0n) + 10n * GEN;
  const balance = BigInt(await rpc<string>("eth_getBalance", [w.address, "latest"]));
  if (balance < need) {
    await rpc("sim_fundAccount", [w.address, Number(need - balance + 5n * GEN)]);
    console.log(`funded ${w.name} from faucet`);
  }
}
for (const w of wallets) {
  if ((await reader.username(w.address)) === w.name) continue;
  jobs.unshift({ wallet: w, label: `set_username ${w.name}`, tx: { kind: "write", address: HIVE_SPORTS_ADDRESS as `0x${string}`, method: "set_username", args: [w.name] }, value: 0n });
}

const results: Record<string, unknown>[] = existsSync(RESULTS_FILE) ? JSON.parse(readFileSync(RESULTS_FILE, "utf8")).results ?? [] : [];
const save = () => writeFileSync(RESULTS_FILE, JSON.stringify({ note: "Demo liquidity from openly-labelled team seed wallets (hive_seed_*). Ordinary permissionless stakes.", results }, null, 2));

// Submit: one ordered queue per wallet (nonces), wallets interleaved; the throttle paces everything.
const submitted: { job: Job; row: Record<string, unknown> }[] = [];
await Promise.all(
  wallets.map(async (w) => {
    for (const job of jobs.filter((j) => j.wallet === w)) {
      const row: Record<string, unknown> = { wallet: w.name, address: w.address, what: job.label, method: job.tx.kind === "write" ? job.tx.method : "", at: new Date().toISOString() };
      try {
        Object.assign(row, await submit(job));
        submitted.push({ job, row });
        console.log(`→ ${w.name} ${job.label} ${row.hash}`);
      } catch (e: any) {
        Object.assign(row, { ok: false, error: String(e?.shortMessage || e?.message || e).split("\n")[0].slice(0, 200) });
        console.log(`✗ ${w.name} ${job.label} → ${row.error}`);
      }
      results.push(row);
      save();
    }
  }),
);

// Outcomes: poll until every submitted transaction is decided (or 40 minutes pass).
const deadline = Date.now() + 40 * 60_000;
let pending = submitted.filter((s) => s.row.hash);
while (pending.length && Date.now() < deadline) {
  for (const s of pending) {
    try {
      const { status, result } = await outcome(String(s.row.hash));
      if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(status)) {
        Object.assign(s.row, { status, result, ok: status !== "CANCELED" && result === "FINISHED_WITH_RETURN" });
        console.log(`${s.row.ok ? "✓" : "✗"} ${s.row.wallet} ${s.row.what} → ${status} ${result}`);
      }
    } catch (e: any) {
      console.log(`… ${s.row.what}: ${String(e?.message ?? e).split("\n")[0]}`);
    }
  }
  save();
  pending = pending.filter((s) => s.row.ok === undefined);
  if (pending.length) console.log(`${pending.length} still pending`);
}
console.log(`done: ${results.filter((r) => r.ok).length} ok / ${results.length} recorded`);

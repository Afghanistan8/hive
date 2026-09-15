// Payout smoke test on Studio Next: payable stake -> real resolve -> claim.
// Verifies value transfer in (take_position) and out (emit_transfer in claim)
// on the live GenVM, which direct-mode tests cannot fully emulate.
//
// Throwaway copy of contracts/hive_crypto.py with the two time guards that
// block a same-session run relaxed (create a closed day, stake after cutoff).
// Payout math, settlement and transfer code are untouched.
//
//   cd scripts/smoke && SMOKE_ONLY=claim npx genlayer deploy
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd(), "..", "..");
const OUT = path.join(process.cwd(), "claim-results.json");
const ASSET = process.env.SMOKE_ASSET ?? "ETH";
const DAY = process.env.SMOKE_DAY ?? "2026-09-14";
const STAKE = 2n * 10n ** 18n;

function patch(source: string, from: string, to: string): string {
  if (!source.includes(from)) throw new Error(`smoke patch anchor not found: ${from}`);
  return source.replace(from, to);
}

async function fees(client: any) {
  const e = await client.estimateTransactionFees({});
  return { distribution: e.distribution, feeValue: BigInt(e.feeValue) };
}

async function waitOk(client: any, hash: string, label: string) {
  const r = await client.waitForTransactionReceipt({ hash, waitUntil: "decided", retries: 600, interval: 5000 });
  console.log(`${label} ${hash} -> ${r.txExecutionResultName}`);
  return { hash, execution: r.txExecutionResultName, receipt: r };
}

const balance = (client: any, address: string) => client.getBalance({ address });
const read = (client: any, address: string, functionName: string, args: any[]) =>
  client.readContract({ address, functionName, args, jsonSafeReturn: true });

export default async function main(client: any) {
  if (process.env.SMOKE_ONLY && process.env.SMOKE_ONLY !== "claim") return;
  const me = client.account?.address;
  const out: any = { ranAt: new Date().toISOString(), wallet: me, asset: ASSET, day: DAY };

  let code = readFileSync(path.join(ROOT, "contracts", "hive_crypto.py"), "utf8");
  code = patch(code, "if day_start <= now:", "if day_start <= now - 30 * DAY:  # SMOKE COPY ONLY");
  code = patch(code, "if m.state != STATE_PENDING or consensus_now() >= int(m.cutoff_at):", "if m.state != STATE_PENDING:  # SMOKE COPY ONLY: stake after cutoff");

  const deployHash = await client.deployContract({ code: new TextEncoder().encode(code), args: [], fees: await fees(client) });
  const dep = await waitOk(client, deployHash, "deploy HiveCrypto(claim-smoke)");
  const address = dep.receipt.txDataDecoded?.contractAddress ?? dep.receipt.data?.contract_address;
  out.contract = { address, hash: deployHash };

  out.create = await waitOk(client, await client.writeContract({ address, functionName: "create_market", args: [ASSET, DAY], value: 0n, fees: await fees(client) }), "create_market");
  const market = await read(client, address, "get_market_by_asset_day", [ASSET, DAY]);

  const contractBefore = await balance(client, address);
  out.stake = await waitOk(client, await client.writeContract({ address, functionName: "take_position", args: [market.id, "UP"], value: STAKE, fees: await fees(client) }), "take_position UP 2 GEN");
  const contractAfterStake = await balance(client, address);
  out.position = await read(client, address, "get_position", [market.id, me.toLowerCase()]);

  out.resolve = await waitOk(client, await client.writeContract({ address, functionName: "resolve_market", args: [market.id], value: 0n, fees: await fees(client) }), "resolve_market");
  out.market = await read(client, address, "get_market", [market.id]);
  out.evidence = await read(client, address, "get_evidence", [market.id]);

  // A claim emits a funded value-transfer message, so its fees must include the
  // message allocation. Studio's write simulation returns exactly that.
  const claimFees = await client.estimateTransactionFeesForWrite({ address, functionName: "claim", args: [market.id], value: 0n });
  out.claimAllocations = JSON.parse(JSON.stringify(claimFees.messageAllocations ?? [], (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  const walletBeforeClaim = await balance(client, me);
  out.claim = await waitOk(client, await client.writeContract({
    address, functionName: "claim", args: [market.id], value: 0n,
    fees: { distribution: claimFees.distribution, messageAllocations: claimFees.messageAllocations, feeValue: claimFees.feeValue },
  }), "claim");
  out.positionAfter = await read(client, address, "get_position", [market.id, me.toLowerCase()]);
  // emit_transfer defaults to on='finalized'; give the message time to apply.
  let contractAfterClaim = await balance(client, address);
  for (let i = 0; i < 40 && contractAfterClaim !== contractBefore; i++) {
    await new Promise((r) => setTimeout(r, 15000));
    contractAfterClaim = await balance(client, address);
  }
  const walletAfterClaim = await balance(client, me);
  out.balances = {
    contractBefore: contractBefore.toString(),
    contractAfterStake: contractAfterStake.toString(),
    contractAfterClaim: contractAfterClaim.toString(),
    walletBeforeClaim: walletBeforeClaim.toString(),
    walletAfterClaim: walletAfterClaim.toString(),
  };
  for (const k of ["create", "stake", "resolve", "claim"]) delete out[k].receipt;
  delete dep.receipt;
  console.log(JSON.stringify(out, null, 2));
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  // ---- runtime assertions
  const fail = (m: string) => { throw new Error(`CLAIM SMOKE FAILED: ${m}`); };
  if (out.stake.execution !== "FINISHED_WITH_RETURN") fail("stake did not execute");
  if (contractAfterStake - contractBefore !== STAKE) fail("stake value did not reach the contract");
  if (out.resolve.execution !== "FINISHED_WITH_RETURN") fail("resolve did not execute");
  if (out.claim.execution !== "FINISHED_WITH_RETURN") fail("claim did not execute");
  if (!out.positionAfter.claimed || String(out.positionAfter.payout) !== STAKE.toString()) fail("position not marked claimed with full payout");
  if (contractAfterClaim !== contractBefore) fail(`contract still holds the payout (${contractAfterClaim}); transfer not delivered`);
  console.log("CLAIM SMOKE PASSED: 2 GEN in via take_position, 2 GEN out to the wallet via claim");
}

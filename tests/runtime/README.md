# Runtime tests (live GenVM on Studio Next)

Direct-mode tests (`tests/direct`) run the real GenLayer SDK in-process, but they
cannot represent everything the network enforces: validators re-executing
nondeterministic blocks and comparing results, real web/LLM access, fee
accounting, and value-transfer messages. Those are covered here, against the
live network, with hard assertions (the run fails on any mismatch).

| Test | File | Asserts |
|---|---|---|
| Consensus settlement | `scripts/smoke/deploy/001_consensus_smoke.ts` | Real finished PL fixture resolves only with **ESPN and BBC** both `FINISHED 0–1`; stored evidence is byte-identical to the canonical agreed payload; BTC and ATOM candles resolve with stored fields equal to the agreed `agreed_payload` string and a final result consistent with both directions; transient source outages are retried |
| Payout path | `scripts/smoke/deploy/002_claim_smoke.ts` | 2 GEN stake reaches the contract; resolve settles; `claim` (fees from Studio's write simulation, including the payout message allocation) executes, marks the position claimed and **the contract balance returns to 0** once the transfer finalizes |

Run (uses the active GenLayer CLI account; costs a few tenths of GEN in refundable fees):

```bash
cd scripts/smoke
SMOKE_ONLY=consensus npx genlayer deploy
SMOKE_ONLY=claim npx genlayer deploy
```

Both deploy throwaway copies of the contracts with only the "must be in the
future" guards relaxed (so already-finished events can be used); settlement,
payout and transfer code are byte-identical to `contracts/`.

Regression history: the payout test caught that an internal GenLayer message to
a wallet is skipped (value returned to the contract) and that a claim must carry
a message-fee allocation — neither is visible in direct mode. Payouts now use an
EVM value transfer and the frontend claims with simulated fees.

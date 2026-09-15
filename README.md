# HIVE

**Prediction markets that settle themselves — only when two independent public sources agree.**

HIVE is one app with two markets, both running as GenLayer Intelligent Contracts on **Studio Next**:

| | **Hive Match** — football | **Hive Daily** — crypto |
|---|---|---|
| Question | Home / Draw / Away for fixtures in the Premier League, La Liga, Bundesliga, Serie A and Ligue 1 | Will the completed GMT+1 daily candle close UP or DOWN? 22 major tokens |
| Stakes | Pari-mutuel, min 2 GEN, winners split the whole pot, no rake | 2–8 GEN per wallet, pro-rata on the winning pool |
| Source A | **ESPN** scoreboard JSON (deterministic parser, matched by event id) — required | CoinGecko `market_chart/range` (exact GMT+1 window) |
| Source B | **BBC Sport** scores page, read by **each validator's own LLM** into a structured score — required | Gate.io **hourly** candles rebuilt into the same 24h window |
| Final when | BBC **and** ESPN report the same full-time score — never a single source | Both report the same direction |
| Otherwise | Stays open and retryable; both confirm postponement → 1:1 refunds; no agreement within 7 days → refunds | Mismatch → INCONCLUSIVE refunds; sources down → retry; still down after 5 days → refunds |

No owner, no admin key, no pause, no sweep, no trusted resolver, no backend. Anyone can create a market, stake,
resolve and claim. The frontend reads the contracts directly.

---

## Deployed on Studio Next

| | |
|---|---|
| Network | GenLayer Studio Next (Consensus v0.6 preview) |
| Chain ID | `61997` |
| RPC used | `https://studio-next.genlayer.com/api` (same chain as `https://studio-dev.genlayer.com/api`) |
| Explorer | https://explorer-studio-dev.genlayer.com |
| Studio / faucet | https://studio-next.genlayer.com |

| Contract | Address | Deploy tx |
|---|---|---|
| `HiveSports` ([contracts/hive_sports.py](contracts/hive_sports.py)) | [`0xEEd7dD67A929a433a27a90DB2463eaC4195cf1f2`](https://explorer-studio-dev.genlayer.com/address/0xEEd7dD67A929a433a27a90DB2463eaC4195cf1f2) | [`0x3627fa57…5182bfdb`](https://explorer-studio-dev.genlayer.com/tx/0x3627fa574a48f4cae5fa4dc626a056a8703e5b9e07957d630af6b3235182bfdb) |
| `HiveCrypto` ([contracts/hive_crypto.py](contracts/hive_crypto.py)) | [`0x6172565eA61CEa77c8E6d1fBed36936009C10FF1`](https://explorer-studio-dev.genlayer.com/address/0x6172565eA61CEa77c8E6d1fBed36936009C10FF1) | [`0x52df1e75…c50e0626`](https://explorer-studio-dev.genlayer.com/tx/0x52df1e7541f952654d5625e1d89a0fa8aa907deb8d7736fe9d21ba4cc50e0626) |

Demo seed (ordinary permissionless writes, recorded in [deploy/deployments.json](deploy/deployments.json)):

- `create_daily_markets("2026-09-16")` — [`0xbb5661aa…e49adae1`](https://explorer-studio-dev.genlayer.com/tx/0xbb5661aad45fe4a33022bd8c3b8adb1a989c04d9db0c7af45711a6f8e49adae1)
- `create_daily_markets("2026-09-17")` — [`0xcfe233f4…c35c455a`](https://explorer-studio-dev.genlayer.com/tx/0xcfe233f46fda7d28dfb64da4c656ec18355fa940d2fb994819f7e9b5c35c455a)
- `add_fixtures(20 fixtures)` — [`0xcbcbb5db…c6db6551`](https://explorer-studio-dev.genlayer.com/tx/0xcbcbb5db912f5ca480a96bbec9aac4b19ebaa32f4e3121da2247f00bc6db6551)

> Why `studio-next.genlayer.com`? It is the RPC in the hackathon announcement and the v2-dev template default, it answers
> `eth_chainId = 0xf22d (61997)`, and Transaction Kit quotes fees against it. `studio-dev.genlayer.com` serves the same
> chain (the GenLayer CLI's `studio-dev` network points there). `studio.next.genlayer.com` does not resolve.

### Settlement and payouts proven live on Studio Next

Direct-mode tests cannot represent validator re-execution, real web/LLM access, fee accounting or value-transfer
messages, so [tests/runtime](tests/runtime/README.md) runs assertion-based tests on the live network. They deploy
throwaway copies of the contracts where **only the "must be in the future" guards are relaxed** and use real,
already-finished events; settlement, payout and transfer code are byte-identical to `contracts/`.
Results: [smoke-results.json](scripts/smoke/smoke-results.json), [claim-results.json](scripts/smoke/claim-results.json).

| What | Transaction | Stored agreed evidence |
|---|---|---|
| Man Utd v Man City (PL, 13 Sep) `resolve` | [`0xa825795d…8cbc5671`](https://explorer-studio-dev.genlayer.com/tx/0xa825795dd97a509abdb61daa700e08a00200c3da3e3d13c90f0841218cbc5671) | ESPN `FINISHED 0–1` **and** BBC `FINISHED 0–1` → outcome `AWAY` (canonical JSON stored byte for byte) |
| BTC 2026-09-14 `resolve_market` | [`0x5631ddcc…e8e2a0da`](https://explorer-studio-dev.genlayer.com/tx/0x5631ddcc35e9dc101298feb07a3b097e6c52313b1987fbc3d59fb4bee8e2a0da) | `1\|BTC\|bitcoin\|BTC_USDT\|2026-09-14\|7668256817293\|7875262563068\|UP\|7671090000000\|7855310000000\|UP\|UP` |
| ATOM 2026-09-14 first attempt | [`0x1617f227…bec8090c`](https://explorer-studio-dev.genlayer.com/tx/0x1617f22716be4410b8a31d82a81426f664979eac59749010a98b8b1cbec8090c) | source outage → validators agree `UNAVAILABLE` → **TRANSIENT revert, still retryable** |
| ATOM 2026-09-14 retry | [`0x63cef42b…23fbcf25`](https://explorer-studio-dev.genlayer.com/tx/0x63cef42b157be8664b1eee020711cc641b3258440dd159665b609f5423fbcf25) | CoinGecko `157585286→158071059 UP` vs Gate `158300000→158000000 DOWN` → **INCONCLUSIVE** (refunds) |
| Payout: stake 2 GEN → resolve → `claim` | [`0xefce964e…0fdfb985`](https://explorer-studio-dev.genlayer.com/tx/0xefce964e12913b2d6e2b511d71f892b3233ec30384c782f680fd89ed0fdfb985) | contract balance 2 GEN → **0**, wallet receives the 2 GEN |

The payout test caught two runtime-only constraints direct mode could not: an *internal* GenLayer message to a wallet
is skipped (its value returns to the contract), and a transaction that emits a value-transfer message must budget it
in `fees.messageAllocations`. Payouts therefore use an EVM value transfer, and claims are sent with the fee preset
Studio returns from simulating the exact call.

---

## Verify this build

1. **Add Studio Next to your wallet** (the app's *Connect wallet* does this automatically):
   network name `GenLayer Studio Next`, RPC `https://studio-next.genlayer.com/api`, chain ID `61997`, symbol `GEN`,
   explorer `https://explorer-studio-dev.genlayer.com`.
2. **Get GEN**: open https://studio-next.genlayer.com, import/create your account and press the faucet (droplet) icon.
3. **Run the app** (or use the hosted build if provided):
   ```bash
   npm ci
   cp frontend/.env.example frontend/.env   # already contains the deployed addresses
   npm run dev                              # http://localhost:3000
   ```
4. **Crypto**: open `/crypto`, pick an `OPEN` market (e.g. BTC for the next GMT+1 day), stake **2 GEN** UP or DOWN.
   The Transaction Kit panel shows the fee quote from the network's fee policy, you hold to sign, and it tracks the
   transaction until decided — with an explorer link.
5. **Sports**: open `/sports`, pick an upcoming fixture, stake on Home / Draw / Away.
6. **Explorer**: every write links to `explorer-studio-dev.genlayer.com/tx/…`; `/portfolio` lists positions, claimable
   amounts and your transaction links. Contract pages: see the table above.
7. **Settlement**: after the candle closes / 90 minutes after kickoff, press **Resolve** on the market page. The
   transaction takes only an id. Inside it, every validator fetches both public sources and must agree on a canonical
   payload; the page's *Agreed evidence* panel shows exactly what was stored. If the sources disagree or are not ready,
   the transaction reverts and anyone can retry later. Claim appears once settled.

---

## Why decentralized judgment matters here

A prediction market is only as honest as whoever decides the outcome. The usual answer is a privileged oracle key or a
single API — one party that can be bribed, hacked, rate-limited or simply wrong. HIVE removes that role:

- **No one supplies the answer.** `resolve(match_id)` / `resolve_market(market_id)` take no data. URL templates,
  parsers, alias tables and outcome rules are contract code.
- **Two independent sources, all validators.** Each validator fetches both sources itself. `gl.eq_principle.strict_eq`
  requires them to produce the identical canonical payload, and that payload carries every field later written to
  storage. There are **zero** web fetches after consensus.
- **Human-readable pages are fair game.** BBC Sport is a page for people, full of traps (Women's Super League results,
  Man City vs Man United, Paris FC vs PSG, Inter vs Milan). Each validator's LLM reads a deterministic excerpt of it
  with the competition named and a club alias guide, and must output `{status, home_goals, away_goals}` — structured
  values, never prose, so consensus compares facts.
- **Disagreement is a first-class outcome.** Mismatched sources never produce a winner: sports stay open and
  retryable, crypto becomes INCONCLUSIVE and refunds. Nothing is fabricated when data is missing.

## Contract design

### HiveCrypto — [contracts/hive_crypto.py](contracts/hive_crypto.py)

- **Lifecycle (GMT+1, fixed offset, no DST)** for target day D: entries close at `D 00:00 GMT+1`; candle window is
  `[D 00:00, D+1 00:00) GMT+1`; `resolve_market` opens at `D+1 00:00 GMT+1`; terminal refund 5 days later. All
  boundaries use `gl.message.raw["datetime"]` (consensus time), never a node clock.
- **Evidence**: CoinGecko `market_chart/range` samples must hug both window edges (≤ 90 min); Gate.io must return exactly
  24 aligned, closed 1h candles (never the UTC-aligned `1d` bars). Prices become integers scaled by `10^8` from their
  decimal text — no float formatting. Direction per source: `close > open` → UP, else DOWN.
- **Canonical payload** `id|asset|coingecko_id|gate_pair|day|cg_open|cg_close|cg_dir|gt_open|gt_close|gt_dir|final`,
  or `UNAVAILABLE|id|source`. After consensus it is re-validated (bound to this market, each direction follows from its
  own prices, final = both directions or INCONCLUSIVE) before any write.
- **Money**: 2–8 GEN per wallet, same-side top-ups, side switch rejected. Winners get `stake × total / winning_pool`;
  the last winner sweeps integer dust so each market pays out exactly its pool. Empty winning side → everyone refunded.
  `claim` emits an EVM value transfer to the wallet **before** marking claimed; any failure reverts the whole
  transaction.
- **Exact evidence**: `get_evidence` returns the stored fields plus `agreed_payload`, the exact string
  validators agreed on (also kept for terminal refunds).
- Permissionless: `create_market`, `create_daily_markets` (all assets for a day), `take_position`, `resolve_market`,
  `claim`.

### HiveSports — [contracts/hive_sports.py](contracts/hive_sports.py)

- **One contract, many fixtures.** Registry keyed by `match_id = <league>-<espn_event_id>` with teams, kickoff, pools,
  status. `add_fixture` / `add_fixtures` (batch of ≤ 40) are permissionless; kickoff must be 10 min–60 days ahead.
- **Betting** closes at kickoff (consensus time). HOME / DRAW / AWAY, min 2 GEN, one side per wallet, same-side top-ups.
- **`resolve`** (kickoff + 90 min): ESPN scoreboard for the league+date → the event by id → `FINISHED` with score /
  `POSTPONED` / `NOT_FINISHED` / `NOT_FOUND`. BBC scores page for the date → deterministic excerpt around the pairing →
  validator LLM → normalized `{status, home_goals, away_goals}`. Canonical JSON
  `{match_id, source_a, source_b, espn, bbc, outcome}` under `strict_eq`, re-validated before storage. Settles only if
  both are FINISHED with the same score. `get_evidence_raw` returns the stored agreed JSON byte for byte.
- **`mark_postponed`** (kickoff + 3 h): only if both sources report a postponement → 1:1 refunds.
- **Terminal refund**: a `resolve` 7 days after kickoff that still has no agreement refunds everyone.
- **`claim` / `refund`**: pull payments, transfer first, pari-mutuel with dust sweep, empty winning pool → refunds.

## Verified crypto universe (22)

Checked with `python scripts/check_sources.py` (GMT+1 day 2026-09-14: **22/22 verified on both sources**).

| Asset | CoinGecko id | Gate.io pair | Asset | CoinGecko id | Gate.io pair |
|---|---|---|---|---|---|
| BTC | bitcoin | BTC_USDT | ATOM | cosmos | ATOM_USDT |
| ETH | ethereum | ETH_USDT | LTC | litecoin | LTC_USDT |
| SOL | solana | SOL_USDT | UNI | uniswap | UNI_USDT |
| BNB | binancecoin | BNB_USDT | AAVE | aave | AAVE_USDT |
| XRP | ripple | XRP_USDT | SUI | sui | SUI_USDT |
| ADA | cardano | ADA_USDT | NEAR | near | NEAR_USDT |
| DOGE | dogecoin | DOGE_USDT | APT | aptos | APT_USDT |
| AVAX | avalanche-2 | AVAX_USDT | ARB | arbitrum | ARB_USDT |
| LINK | chainlink | LINK_USDT | OP | optimism | OP_USDT |
| DOT | polkadot | DOT_USDT | JUP | jupiter-exchange-solana | JUP_USDT |
| ZRO | layerzero | ZRO_USDT | ZAMA | zama | ZAMA_USDT |

## Demo fixtures

[fixtures.demo.json](fixtures.demo.json) holds 20 real fixtures (4 per league, 15–19 Sep 2026) generated by
`scripts/generate_fixtures.py` from ESPN and checked against the BBC page for each date. They are registered on-chain.
Regenerate with `python scripts/generate_fixtures.py` (uses `FOOTBALL_DATA_API_KEY` for an extra kickoff cross-check when
set; works without it).

---

## Repository

```
contracts/
  hive_crypto.py            Hive Daily markets
  hive_sports.py            Hive Match multi-fixture markets
tests/direct/               40 in-memory tests (web/LLM mocks, exact agreed-payload regressions, genvm-lint)
tests/runtime/README.md     live Studio Next tests: consensus settlement + payout path
deploy/
  001_deploy_crypto.ts      fee-aware, idempotent deploys (writes frontend/.env + deployments.json)
  002_deploy_sports.ts
  003_seed_demo.ts          opens next GMT+1 days + registers demo fixtures
  deployments.json          public addresses + tx hashes
scripts/
  check_sources.py          both sources for every asset, exits 1 on a dead pair
  generate_fixtures.py      ESPN fixtures verified against BBC (+ football-data.org if keyed)
  demo_seed.py              refresh + seed wrapper
  ops/deploy/001_resolve_ready.ts   resolve everything that is ready (permissionless)
  smoke/deploy/             runtime tests (assertion-based) on throwaway copies
frontend/                   Next.js app (genlayer-js 2.0.0-rc.1, Transaction Kit 0.1.0-rc.2)
fixtures.demo.json
DEMO.md                     demo script + video shot list
```

## Development

Requirements: Python ≥ 3.12, Node ≥ 22.

```bash
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt pytest
npm ci

npm run lint:contracts        # genvm-lint check on both contracts
npm run test:contracts        # pytest tests/direct
npm test                      # frontend vitest
npm run build                 # frontend production build
npm run check:sources         # live source check (CoinGecko rate limits: be patient)
```

Deploy (uses the GenLayer CLI account that is active on your machine; nothing is hardcoded):

```bash
npx genlayer network set studio-dev     # chain 61997
npx genlayer account show
npm run deploy                          # deploy + seed; re-runs skip unchanged contracts
npm run resolve:ready                   # settle anything that is ready
npm run smoke                           # runtime tests on the live network (throwaway contracts)
```

Fees follow the v2 flow: deploy/seed scripts ask the network for a fee preset (`estimateTransactionFees`, Studio's fee
policy) instead of hand-written numbers. In the frontend, stakes, resolves and market creation use Transaction
Kit's live quote; claims/refunds use genlayer-js `estimateTransactionFeesForWrite`, because a payout emits a
value-transfer message that must be budgeted in `messageAllocations`, which Transaction Kit 0.1.0-rc.2 cannot pass.

## Known limitations

- Studio Next is a preview network; validators, fees and GenVM runner hashes can change. The contracts pin
  `py-genlayer:5jycge4q…` (GenVM v0.6.0-rc5), which Studio Next accepted at deploy time.
- Public APIs rate-limit. A CoinGecko 429 produces an agreed `UNAVAILABLE` and a retryable revert (seen live above).
- ESPN filters some user agents; the contracts send `curl/8.5.0 (HIVE GenLayer validator)`, which it accepts.
- BBC resolution depends on the page listing the pairing under the stored names; `generate_fixtures.py` only emits
  fixtures it can find, and a missed pairing simply keeps the fixture open (then refunds after 7 days).
- Fixture registration is permissionless; a badly registered fixture cannot settle wrongly (both sources must agree),
  it just refunds. The UI shows every fixture's registrant.
- Payouts are EVM value transfers to the claiming account; contracts claiming on behalf of users are not supported.
- View `phase` uses the chain's latest consensus time; the UI derives display phases from the clock. The contracts
  enforce every boundary with consensus time.

## License

MIT

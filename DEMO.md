# HIVE — demo kit

## 30-second pitch

Prediction markets live or die on who decides the outcome. HIVE has nobody in that seat. Football and crypto markets
settle inside GenLayer Intelligent Contracts: every validator fetches two independent public sources itself — ESPN and
BBC Sport for matches, CoinGecko and Gate.io for candles — and the contract only pays out when both sources agree.
If they disagree, nobody wins by accident: fixtures stay open, candles refund. No oracle key, no admin, no backend.

## Talking points for judges

1. **Real GenLayer contracts, real consensus.** Two contracts on Studio Next (chain 61997). Settlement runs
   `gl.eq_principle.strict_eq` over web fetches — and, for BBC Sport, over each validator's own LLM reading of a
   human page. Live proof: Man Utd 0–1 Man City settled AWAY with ESPN and BBC agreeing; BTC settled UP; ATOM landed
   INCONCLUSIVE because CoinGecko said UP and Gate.io said DOWN (links in README).
2. **Why decentralized judgment matters.** A single API or a resolver key is a single point of failure and bribery.
   Here nobody passes the result in; `resolve` takes only an id. The contract owns sources, parsers and rules.
3. **Meaningful state, validator-checked outcome.** Pools, positions, lifecycle phases, stored evidence. The agreed
   payload includes every persisted field (scores, scaled prices, directions) and is re-validated before storage.
4. **Failure modes are designed, not ignored.** Disagreement, unfinished matches, postponements, rate limits and dead
   sources each have an explicit, fund-safe path (retry, 1:1 refund, terminal refund). We hit a real CoinGecko rate
   limit during testing: validators agreed "unavailable", the tx reverted, the retry settled.
5. **Beyond the template.** Two new products, a 22-asset verified universe, a 5-league fixture registry with club-alias
   disambiguation, 33 contract tests, source checker + fixture generator, fee-aware idempotent deploys, a
   Transaction Kit frontend with evidence panels.

## Live demo script (≈ 5 minutes)

Prep: wallet on Studio Next with ≥ 10 GEN from the Studio faucet, `npm run dev`, tabs for the app and the explorer.

1. **Landing `/`** — point at the network badge (Studio Next · 61997) and the two product cards; scroll to
   *Verify this build* and the two contract links.
2. **Crypto `/crypto`** — tomorrow's GMT+1 day with 22 OPEN markets. Open BTC. Explain the lifecycle row:
   entries close at 00:00 GMT+1, candle closes 24 h later, terminal refund 5 days after that.
3. **Stake** 2 GEN UP → Transaction Kit shows the fee quote from the live fee policy → hold to sign → tracking →
   *View transaction on explorer*. Pool updates.
4. **Settlement panel** — click the two source links (CoinGecko range + Gate.io 1h candles). "The contract builds these
   URLs itself; I can't pass it a price."
5. **Sports `/sports`** — filter by league, open a fixture, stake 2 GEN on Home. Show the ESPN event id + BBC page links
   and the disabled *Resolve* countdown (kickoff + 90 min).
6. **Evidence** — open a settled market/fixture (or show the smoke-test explorer txs from the README): ESPN
   `FINISHED 0–1`, BBC `FINISHED 0–1`, outcome AWAY; ATOM with CoinGecko UP vs Gate DOWN → INCONCLUSIVE.
7. **Portfolio `/portfolio`** — positions, claimable amount, transaction links.
8. **Create `/create`** — open a market for another asset/day in one click, permissionlessly.

After a real match ends (e.g. the La Liga fixtures on 15–16 Sep 2026): press **Resolve** on the fixture, then **Claim**,
or run `npm run resolve:ready` to settle everything with stakes that is ready.

## 60–90 s video shot list

| # | Time | Shot | Voice-over |
|---|---|---|---|
| 1 | 0:00–0:08 | Landing page, network badge | "HIVE: football and crypto prediction markets that nobody can rig — settled by GenLayer consensus." |
| 2 | 0:08–0:18 | `/sports` grid filtered to Premier League, open a fixture | "Stake on home, draw or away for Europe's top five leagues. Winners split the pot, no rake." |
| 3 | 0:18–0:30 | Stake 2 GEN, Transaction Kit fee quote, hold to sign, decided + explorer link | "Every write shows its fee up front and is tracked until GenLayer validators decide it." |
| 4 | 0:30–0:45 | Settlement panel: ESPN + BBC links; explorer tx of the Man Utd v Man City resolve; evidence 0–1 / 0–1 | "Resolve takes no data. Each validator reads ESPN's feed and BBC's page with its own AI, and the score only counts when both agree." |
| 5 | 0:45–0:58 | `/crypto` day grid → BTC market → stake UP | "Hive Daily: will the GMT+1 candle close up or down? 22 tokens, 2 to 8 GEN." |
| 6 | 0:58–1:10 | ATOM evidence: CoinGecko UP vs Gate DOWN → INCONCLUSIVE | "Sources disagree? No winner is invented — everyone gets refunded." |
| 7 | 1:10–1:20 | `/portfolio` claimable + `/create` | "Positions, claims and new markets — all permissionless." |
| 8 | 1:20–1:30 | README "Verify this build" + contract addresses | "No oracle key, no admin, no backend. Open it on Studio Next and check every result yourself." |

Recording tips: 1440p browser window, zoom 110 %, dark theme; pre-fund the wallet; keep the explorer tabs for the four
smoke-test transactions open so shot 4 and 6 don't wait on the network.

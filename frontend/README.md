# HIVE frontend

Next.js app for HIVE. Every value on screen comes from contract view calls; every write goes through
`@genlayer/transaction-kit-react`'s `GenLayerTransactionPanel` (live fee quote → hold to sign → tracking).

| Route | What |
|---|---|
| `/` | What HIVE is, how settlement works, verify-this-build steps, contract links |
| `/sports` | Fixtures by league with pools and kickoff countdowns |
| `/sports/[matchId]` | Stake HOME / DRAW / AWAY, resolve, mark postponed, claim/refund, agreed evidence |
| `/crypto` | Daily markets grouped by GMT+1 day, filter by phase |
| `/crypto/[marketId]` | Stake UP / DOWN (2–8 GEN), resolve, claim, agreed evidence |
| `/create` | Open one asset or all assets for a future GMT+1 day |
| `/portfolio` | Positions, claimable amounts, explorer links |

Key files: `lib/hive/contracts.ts` (reads), `lib/hive/hooks.ts` (React Query), `components/hive/TxDialog.tsx`
(Transaction Kit writes, including payable stakes via `userValue`), `lib/genlayer/network.ts` (one chain definition
shared by the wallet, genlayer-js and Transaction Kit).

```bash
cp .env.example .env   # Studio Next RPC, chain 61997 and the deployed contract addresses
npm run dev
npm test               # vitest
npm run lint           # tsc --noEmit
```

# Deploying HIVE (Vercel + keeper cron + Supabase mirror)

The contracts are already live on GenLayer Studio Next (see README). This guide
puts the frontend on Vercel, turns on the keeper, and adds the Supabase
read-mirror. None of these components can move funds or decide outcomes: the
keeper only makes permissionless calls any wallet could make, and Supabase is a
cache that the app never trusts for money.

```
GitHub Actions (*/15) ─┐
Vercel Cron (daily)  ──┼──▶ /api/cron/keeper ──▶ HiveCrypto / HiveSports  (permissionless txs)
                       │           │
                       │           └──────────▶ Supabase (read-mirror upserts)
Browser ──▶ Next.js on Vercel ──▶ contracts (source of truth)
                           └────▶ Supabase anon SELECT (instant placeholder data)
```

## 1. Vercel project

1. Vercel → **Add New → Project → Import** `Afghanistan8/hive`.
2. **Root Directory: `frontend`** (Framework: Next.js). Install/build commands: defaults.
3. Environment variables (Production + Preview):

| Name | Value | Secret? |
|---|---|---|
| `NEXT_PUBLIC_GENLAYER_RPC_URL` | `https://studio-next.genlayer.com/api` | no |
| `NEXT_PUBLIC_GENLAYER_CHAIN_ID` | `61997` | no |
| `NEXT_PUBLIC_GENLAYER_CHAIN_NAME` | `GenLayer Studio Next` | no |
| `NEXT_PUBLIC_GENLAYER_SYMBOL` | `GEN` | no |
| `NEXT_PUBLIC_HIVE_CRYPTO_ADDRESS` | from `frontend/.env.example` | no |
| `NEXT_PUBLIC_HIVE_SPORTS_ADDRESS` | from `frontend/.env.example` | no |
| `NEXT_PUBLIC_EXPLORER_URL` | `https://explorer-studio-dev.genlayer.com` | no |
| `NEXT_PUBLIC_SITE_URL` | your Vercel URL (link previews) | no |
| `CRON_SECRET` | long random string (`openssl rand -hex 32`) | **yes** |
| `KEEPER_PRIVATE_KEY` | keeper wallet key (step 2) | **yes** |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | step 3 | no (RLS: read-only) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | step 3 | **yes** (service key) |

`frontend/vercel.json` registers a daily Vercel Cron (the Hobby-plan limit). On Pro you can change the schedule to
`*/15 * * * *` and skip the GitHub Actions trigger.

## 2. Keeper wallet

Use a dedicated wallet, not the deployer. Run this yourself (it prints a new key once):

```bash
node scripts/keeper_wallet.mjs                 # prints keeper address + private key
npx genlayer account send <keeper-address> 5   # fund it from the deployer on studio-dev
```

Paste the private key only into Vercel's `KEEPER_PRIVATE_KEY` (mark it Sensitive). Never commit it.

Each keeper tick sends at most 8 transactions (fee deposits are mostly refunded). Check it without signing:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://<your-app>.vercel.app/api/cron/keeper?dry=1"
```

What a tick does:

| Job | Rule |
|---|---|
| Open crypto markets | next two GMT+1 days if missing (`create_daily_markets`) |
| Register fixtures | next 8 days, ≤6 per league, only pairings BBC lists (`add_fixtures`) while fewer than 30 are upcoming |
| AI Calls | fixtures kicking off within 36 h without one, ≤2 per tick (`request_ai_call`) |
| Resolve fixtures | staked or AI-called fixtures from kickoff + 2 h, retried hourly; again at kickoff + 7 d (terminal refund) |
| Postponements | `mark_postponed` after kickoff + 3 h when the display feed shows a postponement (the contract re-checks BBC + ESPN) |
| Resolve markets | staked markets once the candle closes, retried hourly; again at the terminal-refund time |
| Mirror | upserts fixtures, positions, markets, standings, and logs the run to `hive_keeper_runs` |

## 3. Supabase mirror

1. Create a project at supabase.com.
2. SQL editor → paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. Project settings → API: copy the **Project URL**, the **anon** key (public) and the **service_role** key (secret)
   into the Vercel variables above. Redeploy.

Without these variables the app reads the contracts directly and the keeper simply skips mirroring.

## 4. 15-minute schedule via GitHub Actions

Repository → Settings → Secrets and variables → Actions:

- **Variable** `KEEPER_URL` = `https://<your-app>.vercel.app`
- **Secret** `CRON_SECRET` = the same value as in Vercel

`.github/workflows/keeper.yml` then calls the keeper every 15 minutes (and can be run manually, with a dry-run
toggle, from the Actions tab).

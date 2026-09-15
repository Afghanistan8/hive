# Deploying HIVE (Vercel hosting + Vercel Cron keeper)

The contracts are live on GenLayer Studio Next (see README). The frontend is hosted on Vercel and redeploys on every
push to `main`. Automation is a **keeper endpoint on Vercel** (`/api/cron/keeper`) that makes permissionless contract
calls. Vercel Cron triggers it twice a day (the Hobby-plan limit); an external scheduler such as cron-job.org can call
it every 15 minutes. Nothing here can move funds or decide an outcome. Supabase support exists but is optional and off.

```
Vercel Cron (00:05, 21:30 UTC) ─┐
cron-job.org (every 15 min)    ─┴─▶ /api/cron/keeper ──▶ HiveCrypto / HiveSports   (permissionless txs)
Browser ──▶ Next.js on Vercel ──▶ contracts (source of truth)
```

**Live app:** https://hive-psi-eight.vercel.app

## 1. Vercel environment variables

Project `hive` → Settings → Environment Variables (Production). Public network/contract variables are already set.
Add these yourself and mark them **Sensitive** — they are never exposed to the browser (no `NEXT_PUBLIC_` prefix):

| Name | Value |
|---|---|
| `CRON_SECRET` | any long random string (e.g. `openssl rand -hex 32`) — Vercel Cron sends it automatically |
| `KEEPER_KEYSTORE_JSON` + `KEEPER_KEYSTORE_PASSWORD` | deployer keystore contents + its password (see below), **or** |
| `KEEPER_PRIVATE_KEY` | the deployer's raw private key |

Shortcut: fill the gitignored `.env.vercel` in the repo root and run `node scripts/push_vercel_env.mjs` — it verifies
the key belongs to the deployer, uploads everything as Sensitive via stdin, redeploys and dry-runs the keeper, without
printing any value.

Export the deployer keystore (the GenLayer CLI can't print a raw key):

```bash
npx genlayer account export --account deployer --output "%USERPROFILE%/Desktop/deployer.keystore.json" --password "<pick-a-strong-password>"
```

Paste the file contents into `KEEPER_KEYSTORE_JSON`, the password into `KEEPER_KEYSTORE_PASSWORD`, then delete the
file. **Redeploy** (Deployments → ⋯ → Redeploy) so the function picks up the new variables.

Check it without signing anything:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://hive-psi-eight.vercel.app/api/cron/keeper?dry=1"
```

The response never includes the signer address or anything derived from the key (`"signer": "configured"`).

## 2. Every 15 minutes with cron-job.org (optional, recommended on match days)

cron-job.org → Create cronjob:

- URL: `https://hive-psi-eight.vercel.app/api/cron/keeper`
- Schedule: every 15 minutes
- Advanced → Headers: `Authorization` = `Bearer <CRON_SECRET>`
- Request timeout: 60 s

## What a tick does

At most 6 transactions and ~45 s per run (tunable with `KEEPER_MAX_WRITES` / `KEEPER_BUDGET_MS`); anything skipped is
picked up next tick. Fee deposits are mostly refunded.

| Job | Rule |
|---|---|
| Open crypto markets | next two GMT+1 days if missing (`create_daily_markets`) |
| Register fixtures | next 8 days, ≤6 per league, only pairings BBC lists (`add_fixtures`) while fewer than 30 are upcoming |
| AI Calls | fixtures kicking off within 36 h without one, ≤2 per tick (`request_ai_call`) |
| Resolve fixtures | staked or AI-called fixtures from kickoff + 2 h, retried hourly; again at kickoff + 7 d (terminal refund) |
| Postponements | `mark_postponed` after kickoff + 3 h when the display feed shows a postponement (the contract re-checks BBC + ESPN) |
| Resolve markets | staked markets once the candle closes, retried hourly; again at the terminal-refund time |

With only the twice-daily Vercel Cron, retries land at those two times, so settlement is slower; use the 15-minute
external schedule for quick settlement after matches.

Local equivalent: `npm run keeper --workspace frontend -- --dry`.

## Optional: Supabase read-mirror

1. Create a project at supabase.com and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
2. Vercel env (Sensitive): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — the keeper writes the mirror.
3. Vercel env (public): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (read-only by RLS). Redeploy.

## GitHub Actions

All workflows are manual-only (`workflow_dispatch`) while the GitHub account's Actions billing is locked, so pushes
don't produce failure emails. Restore the `push`/`pull_request` triggers in `ci.yml` and `frontend.yml` (and the
`schedule` in `sources.yml`) once it is cleared; none of them are needed for the app or the keeper.

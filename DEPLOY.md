# Deploying HIVE (Vercel hosting + GitHub Actions keeper)

The contracts are live on GenLayer Studio Next (see README). The frontend is hosted on Vercel and redeploys on every
push to `main`. Automation runs **only in GitHub Actions**: a keeper that makes permissionless contract calls every
15 minutes. Nothing here can move funds or decide an outcome. Supabase support exists but is optional and off by
default — the app reads the contracts directly.

```
GitHub Actions (*/15) ──▶ npm run keeper ──▶ HiveCrypto / HiveSports   (permissionless txs)
                                    └────▶ Supabase (optional read-mirror)
Browser ──▶ Next.js on Vercel ──▶ contracts (source of truth)
```

**Live app:** https://hive-psi-eight.vercel.app

## 1. Vercel (already set up)

Project `hive`, Root Directory `frontend`, connected to `Afghanistan8/hive` (production branch `main`). Public env
vars are configured: network, RPC, chain ID and both contract addresses (same values as `frontend/.env.example`).
No secrets are needed on Vercel.

## 2. Keeper wallet (your deployer) — you add the secret, it is never public

GitHub Secrets are encrypted, masked in logs, never shown on the public repo and not given to pull requests from
forks. The keeper never prints the signing address or anything derived from the key.

**Option A — raw key** (if you have the deployer's private key, e.g. the `PRIVATE_KEY` you used before):
secret `KEEPER_PRIVATE_KEY`.

**Option B — keystore exported by the GenLayer CLI** (the CLI can't print a raw key):

```bash
npx genlayer account export --account deployer --output "%USERPROFILE%/Desktop/deployer.keystore.json" --password "<pick-a-strong-password>"
```

Add two repository secrets: `KEEPER_KEYSTORE_JSON` = the file's full contents, `KEEPER_KEYSTORE_PASSWORD` = that
password. Then delete the file.

GitHub → `Afghanistan8/hive` → Settings → Secrets and variables → Actions → **New repository secret**.

## 3. Turn it on

The workflow `.github/workflows/keeper.yml` is scheduled every 15 minutes. Test it first:
Actions → **Keeper** → *Run workflow* → tick **dry** → the run summary lists what it would do. Then run it without dry.
Without the secret every run is a dry run.

Local equivalent:

```bash
npm run keeper --workspace frontend -- --dry
```

What a tick does (at most 8 transactions; fee deposits are mostly refunded):

| Job | Rule |
|---|---|
| Open crypto markets | next two GMT+1 days if missing (`create_daily_markets`) |
| Register fixtures | next 8 days, ≤6 per league, only pairings BBC lists (`add_fixtures`) while fewer than 30 are upcoming |
| AI Calls | fixtures kicking off within 36 h without one, ≤2 per tick (`request_ai_call`) |
| Resolve fixtures | staked or AI-called fixtures from kickoff + 2 h, retried hourly; again at kickoff + 7 d (terminal refund) |
| Postponements | `mark_postponed` after kickoff + 3 h when the display feed shows a postponement (the contract re-checks BBC + ESPN) |
| Resolve markets | staked markets once the candle closes, retried hourly; again at the terminal-refund time |

## Optional: Supabase read-mirror

Only if you want mirrored tables for analytics or faster first paint:

1. Create a project at supabase.com and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
2. GitHub secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (keeper writes the mirror).
3. Vercel env `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (read-only by RLS), then redeploy.

The `/api/cron/keeper` route is also kept for hosts with their own scheduler; it requires `CRON_SECRET` and a
`KEEPER_PRIVATE_KEY` in that host's env, and is unused in the GitHub-only setup.

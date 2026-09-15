-- HIVE read-mirror (Supabase / Postgres). Paste into the Supabase SQL editor once.
--
-- The contracts on GenLayer Studio Next are the source of truth. This mirror is a
-- cache the keeper (server, service-role key) refreshes every cron tick so pages
-- load instantly. The public (anon) role can only SELECT; nothing in the app
-- trusts these rows for money — every stake/claim/resolve re-reads the contract.
-- Wei amounts are stored as text to keep full 256-bit precision.

create table if not exists public.hive_fixtures (
  match_id        text primary key,
  league          text not null,
  league_name     text,
  home            text not null,
  away            text not null,
  espn_event_id   text not null,
  kickoff_ts      bigint not null,
  status          text not null,
  result          text,
  home_goals      int,
  away_goals      int,
  pool_home       text,
  pool_draw       text,
  pool_away       text,
  total_pool      text,
  paid_out        text,
  positions_count int,
  refund_all      boolean,
  resolved_at     bigint,
  creator         text,
  created_at      bigint,
  ai_pick         text,
  ai_confidence   text,
  ai_reason       text,
  home_logo       text,
  away_logo       text,
  live_state      text,
  live_detail     text,
  live_home_score text,
  live_away_score text,
  synced_at       timestamptz not null default now()
);
create index if not exists hive_fixtures_league_kickoff on public.hive_fixtures (league, kickoff_ts);

create table if not exists public.hive_positions (
  match_id        text not null,
  owner           text not null,
  league          text not null,
  username        text,
  pick            text not null,
  stake           text not null,
  claimed         boolean not null default false,
  payout          text,
  claimable       text,
  fixture_status  text,
  fixture_result  text,
  refund_all      boolean,
  synced_at       timestamptz not null default now(),
  primary key (match_id, owner)
);
create index if not exists hive_positions_owner on public.hive_positions (owner);

create table if not exists public.hive_crypto_markets (
  id                 bigint primary key,
  asset              text not null,
  coingecko_id       text,
  gate_pair          text,
  target_day         text not null,
  creator            text,
  created_at         bigint,
  cutoff_at          bigint,
  settles_at         bigint,
  terminal_refund_at bigint,
  up_pool            text,
  down_pool          text,
  total_pool         text,
  paid_out           text,
  positions_count    int,
  state              text,
  result             text,
  refund_all         boolean,
  resolved_at        bigint,
  synced_at          timestamptz not null default now()
);
create index if not exists hive_crypto_markets_day on public.hive_crypto_markets (target_day);

create table if not exists public.hive_standings (
  league     text not null,
  team       text not null,
  rank       int,
  short      text,
  abbr       text,
  logo       text,
  played     int,
  won        int,
  drawn      int,
  lost       int,
  gf         int,
  ga         int,
  gd         text,
  points     int,
  note       text,
  note_color text,
  season     text,
  synced_at  timestamptz not null default now(),
  primary key (league, team)
);

create table if not exists public.hive_keeper_runs (
  id       bigserial primary key,
  ran_at   timestamptz not null default now(),
  dry_run  boolean not null,
  actions  jsonb not null default '[]',
  errors   jsonb not null default '[]'
);

-- Read-only for everyone; only the service role (keeper) writes (it bypasses RLS).
do $$
declare t text;
begin
  foreach t in array array['hive_fixtures','hive_positions','hive_crypto_markets','hive_standings','hive_keeper_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

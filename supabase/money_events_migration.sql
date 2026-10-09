-- Run in the Supabase SQL editor.
-- If money_wallets.session_id is uuid (not text), change session_id below to uuid.

create table if not exists money_policies (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references money_wallets(id) on delete cascade,
  session_id text not null,
  policy_id text not null,
  version int not null,
  policy jsonb not null,
  hash text not null,
  created_at timestamptz default now(),
  unique (wallet_id, version)
);

create table if not exists money_events (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references money_wallets(id) on delete cascade,
  session_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  prev_hash text,
  entry_hash text not null,
  event jsonb not null,
  created_at timestamptz default now(),
  unique (wallet_id, entry_hash)
);

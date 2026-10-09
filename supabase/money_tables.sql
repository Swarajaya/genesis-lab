-- Run once in the Supabase SQL editor.
create table if not exists money_policies (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references money_wallets(id) on delete cascade,
  session_id text not null,
  policy_id text not null,
  version int not null,
  policy jsonb not null,
  hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists money_events (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references money_wallets(id) on delete cascade,
  session_id text not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  prev_hash text,
  entry_hash text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists money_policies_wallet_idx on money_policies(wallet_id);
create index if not exists money_events_wallet_idx on money_events(wallet_id, occurred_at);

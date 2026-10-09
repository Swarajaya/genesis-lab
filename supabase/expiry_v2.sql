-- EXPIRY v2: policy versions + tamper-evident event ledger. Additive only; existing money_* tables are untouched.
create table if not exists public.money_policies (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.money_wallets(id) on delete cascade,
  session_id uuid,
  policy_id text not null,
  policy_version int not null,
  policy jsonb not null,
  policy_hash text not null,
  created_at timestamptz not null default now(),
  unique (wallet_id, policy_version)
);

create table if not exists public.money_events (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.money_wallets(id) on delete cascade,
  session_id uuid,
  seq int not null,
  event_id text not null,
  occurred_at timestamptz not null,
  event_type text not null,
  amount_paise bigint not null default 0,
  purpose text,
  recipient text,
  result text not null,
  reason text,
  balance_after_paise bigint not null,
  policy_version int not null,
  state_before text,
  state_after text not null,
  trace jsonb,
  prev_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now(),
  unique (wallet_id, seq)
);

create index if not exists money_events_wallet_idx on public.money_events (wallet_id, seq);

-- Server-only access via the service role (same model as the other money tables).
alter table public.money_policies enable row level security;
alter table public.money_events enable row level security;

-- NOTE: if money_transactions.category or money_rules.allowed_categories have CHECK constraints that
-- pre-date the EMERGENCY purpose, extend them to include 'emergency'. Writes degrade gracefully if not.

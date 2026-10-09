-- ============================================================
-- GENESIS LAB - complete database setup
-- Run this whole file in Supabase Dashboard > SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS.
-- All writes happen server-side through the service-role key,
-- which bypasses RLS. Browser (anon/authenticated) access is limited.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Helper: updated_at trigger
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- profiles (one row per Supabase Auth user)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'visitor' check (role in ('visitor','judge','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- experiments (catalog of the six experiments)
-- ------------------------------------------------------------
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  domain text not null,
  tagline text not null,
  objective text not null,
  sort_order int not null default 0,
  is_live boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- sdgs + experiment_sdgs
-- ------------------------------------------------------------
create table if not exists public.sdgs (
  id int primary key check (id between 1 and 17),
  title text not null,
  color text not null,
  description text not null
);

create table if not exists public.experiment_sdgs (
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  sdg_id int not null references public.sdgs(id) on delete cascade,
  relevance text not null check (relevance in ('primary','secondary')),
  rationale text not null,
  primary key (experiment_id, sdg_id)
);
create index if not exists idx_experiment_sdgs_sdg on public.experiment_sdgs(sdg_id);

-- ------------------------------------------------------------
-- experiment_runs (generic log of every demo run)
-- session_id is an anonymous browser session identifier for demo mode.
-- ------------------------------------------------------------
create table if not exists public.experiment_runs (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid references public.experiments(id) on delete set null,
  experiment_slug text not null,
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  status text not null default 'completed' check (status in ('started','completed','failed')),
  input_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  duration_ms int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_runs_experiment on public.experiment_runs(experiment_slug, created_at desc);
create index if not exists idx_runs_user on public.experiment_runs(user_id);
create index if not exists idx_runs_session on public.experiment_runs(session_id);

-- ------------------------------------------------------------
-- ai_requests (safe metadata only: no keys, no prompts)
-- ------------------------------------------------------------
create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.experiment_runs(id) on delete set null,
  experiment_slug text,
  provider text not null,
  model text,
  key_slot int,
  attempts int not null default 1,
  success boolean not null,
  error_kind text,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_requests_created on public.ai_requests(created_at desc);
create index if not exists idx_ai_requests_provider on public.ai_requests(provider, success);

-- ------------------------------------------------------------
-- uploaded_assets
-- ------------------------------------------------------------
create table if not exists public.uploaded_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  experiment_slug text,
  bucket text not null default 'genesis-uploads',
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now()
);
create index if not exists idx_assets_session on public.uploaded_assets(session_id);

-- ------------------------------------------------------------
-- GameZero
-- ------------------------------------------------------------
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  world_seed text not null,
  status text not null default 'observing' check (status in ('observing','hypothesizing','testing','learned','playing')),
  surviving_hypotheses jsonb not null default '[]'::jsonb,
  rejected_hypotheses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_game_sessions_session on public.game_sessions(session_id);

create table if not exists public.game_observations (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  step_index int not null,
  state_before jsonb not null,
  action jsonb not null,
  state_after jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_obs_session on public.game_observations(game_session_id, step_index);

-- ------------------------------------------------------------
-- Blood compatibility (simulation)
-- ------------------------------------------------------------
create table if not exists public.blood_inventory (
  id uuid primary key default gen_random_uuid(),
  donor_code text not null unique,
  abo text not null check (abo in ('O','A','B','AB')),
  rh text not null check (rh in ('+','-')),
  kell text not null default 'K-' check (kell in ('K+','K-')),
  rhc text not null default 'c+' check (rhc in ('c+','c-')),
  rhe text not null default 'E-' check (rhe in ('E+','E-')),
  duffy text not null default 'Fy(a+)' check (duffy in ('Fy(a+)','Fy(a-)')),
  units int not null default 1 check (units >= 0),
  distance_km numeric(6,1) not null default 5 check (distance_km >= 0),
  available boolean not null default true,
  hours_to_expiry int not null default 240 check (hours_to_expiry >= 0),
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_blood_inventory_abo on public.blood_inventory(abo, rh);

create table if not exists public.blood_matches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.experiment_runs(id) on delete set null,
  session_id text,
  recipient jsonb not null,
  constraints jsonb not null default '{}'::jsonb,
  ranking jsonb not null,
  explanation text,
  created_at timestamptz not null default now()
);
create index if not exists idx_blood_matches_session on public.blood_matches(session_id, created_at desc);

-- ------------------------------------------------------------
-- Nutrition from waste
-- ------------------------------------------------------------
create table if not exists public.nutrition_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.experiment_runs(id) on delete set null,
  session_id text,
  ingredients jsonb not null,
  asset_id uuid references public.uploaded_assets(id) on delete set null,
  result jsonb not null,
  waste_diverted_g numeric(10,1),
  created_at timestamptz not null default now()
);
create index if not exists idx_nutrition_session on public.nutrition_runs(session_id, created_at desc);

-- ------------------------------------------------------------
-- One Object, 100 Lives
-- ------------------------------------------------------------
create table if not exists public.object_lifecycles (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.experiment_runs(id) on delete set null,
  session_id text,
  object_name text not null,
  material text,
  asset_id uuid references public.uploaded_assets(id) on delete set null,
  pathways jsonb not null,
  pathway_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_object_session on public.object_lifecycles(session_id, created_at desc);

-- ------------------------------------------------------------
-- Trust without identity (stores ONLY public proof material)
-- ------------------------------------------------------------
create table if not exists public.identity_proofs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.experiment_runs(id) on delete set null,
  session_id text,
  claim text not null,
  commitment text not null,
  proof jsonb not null,
  verified boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_identity_session on public.identity_proofs(session_id, created_at desc);

-- ------------------------------------------------------------
-- Expiry (simulated programmable money, no real value)
-- ------------------------------------------------------------
create table if not exists public.money_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  label text not null default 'Demo wallet',
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  initial_paise bigint not null default 0 check (initial_paise >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_wallets_session on public.money_wallets(session_id);

create table if not exists public.money_rules (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.money_wallets(id) on delete cascade,
  allowed_categories text[] not null default '{}',
  recipient_type text not null default 'any',
  max_per_txn_paise bigint not null check (max_per_txn_paise >= 0),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_rules_wallet on public.money_rules(wallet_id);

create table if not exists public.money_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.money_wallets(id) on delete cascade,
  amount_paise bigint not null check (amount_paise > 0),
  category text not null,
  merchant text,
  decision text not null check (decision in ('APPROVED','REJECTED')),
  reasons jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  balance_after_paise bigint not null,
  prev_hash text,
  entry_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_txn_wallet on public.money_transactions(wallet_id, created_at);

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','experiments','experiment_runs','game_sessions',
    'blood_inventory','money_wallets','money_rules'
  ] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Row Level Security
-- Everything is locked down. The service role (server only) bypasses RLS.
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.experiments enable row level security;
alter table public.sdgs enable row level security;
alter table public.experiment_sdgs enable row level security;
alter table public.experiment_runs enable row level security;
alter table public.ai_requests enable row level security;
alter table public.uploaded_assets enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_observations enable row level security;
alter table public.blood_inventory enable row level security;
alter table public.blood_matches enable row level security;
alter table public.nutrition_runs enable row level security;
alter table public.object_lifecycles enable row level security;
alter table public.identity_proofs enable row level security;
alter table public.money_wallets enable row level security;
alter table public.money_rules enable row level security;
alter table public.money_transactions enable row level security;

-- Public catalog: anyone may read experiments, sdgs and their mapping.
drop policy if exists "catalog read experiments" on public.experiments;
create policy "catalog read experiments" on public.experiments for select using (true);
drop policy if exists "catalog read sdgs" on public.sdgs;
create policy "catalog read sdgs" on public.sdgs for select using (true);
drop policy if exists "catalog read experiment_sdgs" on public.experiment_sdgs;
create policy "catalog read experiment_sdgs" on public.experiment_sdgs for select using (true);

-- Profiles: a user can read and update only their own profile.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id and role = 'visitor');

-- Demo inventory is synthetic, so signed-in users may read it.
drop policy if exists "inventory read authenticated" on public.blood_inventory;
create policy "inventory read authenticated" on public.blood_inventory
  for select to authenticated using (is_demo = true);

-- Per-user read access to their own records (writes are server-only).
drop policy if exists "runs own read" on public.experiment_runs;
create policy "runs own read" on public.experiment_runs for select using (auth.uid() = user_id);

drop policy if exists "assets own read" on public.uploaded_assets;
create policy "assets own read" on public.uploaded_assets for select using (auth.uid() = user_id);

drop policy if exists "game sessions own read" on public.game_sessions;
create policy "game sessions own read" on public.game_sessions for select using (auth.uid() = user_id);

drop policy if exists "game obs own read" on public.game_observations;
create policy "game obs own read" on public.game_observations for select using (
  exists (select 1 from public.game_sessions g where g.id = game_session_id and g.user_id = auth.uid())
);

drop policy if exists "wallets own read" on public.money_wallets;
create policy "wallets own read" on public.money_wallets for select using (auth.uid() = user_id);

drop policy if exists "rules own read" on public.money_rules;
create policy "rules own read" on public.money_rules for select using (
  exists (select 1 from public.money_wallets w where w.id = wallet_id and w.user_id = auth.uid())
);

drop policy if exists "txn own read" on public.money_transactions;
create policy "txn own read" on public.money_transactions for select using (
  exists (select 1 from public.money_wallets w where w.id = wallet_id and w.user_id = auth.uid())
);

-- ai_requests, blood_matches, nutrition_runs, object_lifecycles, identity_proofs
-- intentionally have NO policies: only the service role (server) can access them.

-- ------------------------------------------------------------
-- Storage bucket for uploads (private)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('genesis-uploads', 'genesis-uploads', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- ------------------------------------------------------------
-- Seed catalog data (also available separately in seed.sql)
-- ------------------------------------------------------------
-- ============================================================
-- GENESIS LAB - seed data (idempotent, safe to re-run)
-- Contains catalog data and synthetic demo inventory only.
-- No user accounts, no passwords, no personal data.
-- ============================================================

insert into public.experiments (slug, name, domain, tagline, objective, sort_order, is_live) values
('blood',     'Digital Blood Bank Without Blood Types', 'Healthcare & Infrastructure', 'Compatibility is a network, not a label.', 'Rank donor units against a recipient using multi-factor compatibility, logistics and urgency.', 1, true),
('nutrition', 'AI Nutrition From Waste',                'Health + Climate',            'Turn leftovers into balanced meals.',       'Convert wasted ingredients into meals with an estimated nutrition profile and waste avoided.', 2, true),
('gamezero',  'GameZero',                               'AI & Intelligent Systems',    'An AI that learns a game from one example.', 'Infer hidden game rules from demonstrations, reject contradicted hypotheses, then play.', 3, true),
('trust',     'Trust Without Identity',                 'Cybersecurity & Digital Safety', 'Prove it without revealing it.',          'Prove age >= 18 with a zero-knowledge style proof, without revealing the date of birth.', 4, true),
('object',    'One Object, 100 Lives',                  'Climate & Sustainable Technology', 'Every object has more than one future.',   'Generate and rank second-life pathways for an object with transparent assumptions.', 5, true),
('expiry',    'EXPIRY',                                 'Fintech & Digital Economy',   'Money with an expiry date.',                 'Programmable simulated money enforced by rules: purpose, recipient, cap and expiry.', 6, true)
on conflict (slug) do update set
  name = excluded.name, domain = excluded.domain, tagline = excluded.tagline,
  objective = excluded.objective, sort_order = excluded.sort_order, is_live = excluded.is_live;

insert into public.sdgs (id, title, color, description) values
(1,  'No Poverty',                         '#E5243B', 'End poverty in all its forms everywhere.'),
(2,  'Zero Hunger',                        '#DDA63A', 'End hunger, achieve food security and improved nutrition.'),
(3,  'Good Health and Well-being',         '#4C9F38', 'Ensure healthy lives and promote well-being for all.'),
(8,  'Decent Work and Economic Growth',    '#A21942', 'Promote sustained, inclusive economic growth.'),
(9,  'Industry, Innovation and Infrastructure', '#FD6925', 'Build resilient infrastructure and foster innovation.'),
(10, 'Reduced Inequalities',               '#DD1367', 'Reduce inequality within and among countries.'),
(11, 'Sustainable Cities and Communities', '#FD9D24', 'Make cities and human settlements inclusive and sustainable.'),
(12, 'Responsible Consumption and Production', '#BF8B2E', 'Ensure sustainable consumption and production patterns.'),
(13, 'Climate Action',                     '#3F7E44', 'Take urgent action to combat climate change.'),
(16, 'Peace, Justice and Strong Institutions', '#00689D', 'Build effective, accountable and inclusive institutions.'),
(17, 'Partnerships for the Goals',         '#19486A', 'Strengthen partnerships for sustainable development.')
on conflict (id) do update set title = excluded.title, color = excluded.color, description = excluded.description;

with m(slug, sdg, rel, why) as (values
('blood',     3,  'primary',   'Faster, better-informed matching supports emergency care outcomes.'),
('blood',     9,  'secondary', 'Treats blood supply as infrastructure with logistics and inventory visibility.'),
('nutrition', 2,  'primary',   'Turns food that would be discarded into usable meals.'),
('nutrition', 12, 'primary',   'Reduces household and retail food waste.'),
('nutrition', 3,  'secondary', 'Surfaces approximate nutrition to support healthier eating.'),
('nutrition', 13, 'secondary', 'Avoided food waste avoids associated emissions.'),
('gamezero',  9,  'primary',   'Demonstrates sample-efficient, explainable machine learning.'),
('gamezero',  17, 'secondary', 'Transparent reasoning is easier to audit and share.'),
('trust',     16, 'primary',   'Strengthens digital trust and protects personal privacy.'),
('trust',     10, 'secondary', 'Lets people prove eligibility without handing over full identity.'),
('trust',     9,  'secondary', 'Privacy-preserving verification is core digital infrastructure.'),
('object',    12, 'primary',   'Extends product life and keeps materials in use.'),
('object',    13, 'primary',   'Reuse and recovery avoid emissions from new production.'),
('object',    11, 'secondary', 'Reduces municipal waste volume.'),
('expiry',    8,  'primary',   'Programmable money can direct funds to their intended economic use.'),
('expiry',    1,  'secondary', 'Purpose-bound aid can protect benefits for people in need.'),
('expiry',    10, 'secondary', 'Targeted, rule-bound transfers can improve inclusion.')
)
insert into public.experiment_sdgs (experiment_id, sdg_id, relevance, rationale)
select e.id, m.sdg, m.rel, m.why from m join public.experiments e on e.slug = m.slug
on conflict (experiment_id, sdg_id) do update set relevance = excluded.relevance, rationale = excluded.rationale;

-- Synthetic demo donor units (not real people or real inventory)
insert into public.blood_inventory (donor_code, abo, rh, kell, rhc, rhe, duffy, units, distance_km, available, hours_to_expiry, is_demo) values
('D-101', 'O',  '-', 'K-', 'c+', 'E-', 'Fy(a+)', 4,  3.5, true,  300, true),
('D-102', 'O',  '+', 'K-', 'c+', 'E+', 'Fy(a+)', 6,  8.0, true,  220, true),
('D-103', 'A',  '+', 'K-', 'c+', 'E-', 'Fy(a-)', 3,  5.2, true,  180, true),
('D-104', 'A',  '-', 'K+', 'c-', 'E-', 'Fy(a+)', 2,  12.4, true, 260, true),
('D-105', 'B',  '+', 'K-', 'c+', 'E+', 'Fy(a+)', 5,  6.8, true,  120, true),
('D-106', 'B',  '-', 'K-', 'c-', 'E-', 'Fy(a-)', 1,  15.0, true, 90,  true),
('D-107', 'AB', '+', 'K-', 'c+', 'E-', 'Fy(a+)', 2,  4.1, true,  200, true),
('D-108', 'AB', '-', 'K+', 'c+', 'E+', 'Fy(a+)', 1,  22.0, false, 150, true),
('D-109', 'O',  '-', 'K+', 'c-', 'E-', 'Fy(a-)', 3,  9.9, true,  70,  true),
('D-110', 'A',  '+', 'K-', 'c+', 'E+', 'Fy(a+)', 4,  2.7, true,  280, true)
on conflict (donor_code) do update set
  abo = excluded.abo, rh = excluded.rh, kell = excluded.kell, rhc = excluded.rhc, rhe = excluded.rhe,
  duffy = excluded.duffy, units = excluded.units, distance_km = excluded.distance_km,
  available = excluded.available, hours_to_expiry = excluded.hours_to_expiry;

-- ============================================================
-- BLOOD LIVE MODE (additive; existing tables are untouched)
-- All reads and writes go through server API routes using the service-role key.
-- RLS is ON with NO anon/authenticated policies, so the browser can never read or
-- write these tables directly. Realtime uses Broadcast (tiny "tick" messages published
-- by the server); devices then refetch an authoritative snapshot, so no table data
-- is ever exposed through the public anon key.
-- ============================================================
create table if not exists public.blood_live_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active' check (status in ('active','ended')),
  world jsonb not null default '{}'::jsonb,
  version int not null default 0 check (version >= 0),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_blood_live_sessions_status on public.blood_live_sessions(status, expires_at);

create table if not exists public.blood_live_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.blood_live_sessions(id) on delete cascade,
  role text not null check (role in ('donor','hospital','observer')),
  code text not null,
  abo text check (abo in ('O','A','B','AB')),
  rh text check (rh in ('+','-')),
  units int not null default 0 check (units between 0 and 4),
  zone text check (zone in ('A','B','C')),
  online boolean not null default false,
  connected boolean not null default true,
  hospital_requests int not null default 0 check (hospital_requests between 0 and 3),
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, code)
);
create index if not exists idx_blood_live_participants_session on public.blood_live_participants(session_id, joined_at);

create table if not exists public.blood_live_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.blood_live_sessions(id) on delete cascade,
  seq int not null,
  type text not null,
  actor text not null default 'system',
  message text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, seq)
);
create index if not exists idx_blood_live_events_session on public.blood_live_events(session_id, seq desc);

create table if not exists public.blood_live_allocations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.blood_live_sessions(id) on delete cascade,
  participant_id uuid not null references public.blood_live_participants(id) on delete cascade,
  patient_id text not null,
  donor_code text not null,
  units int not null check (units between 1 and 6),
  state text not null check (state in ('offered','confirmed','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_blood_live_allocations_session on public.blood_live_allocations(session_id, created_at);
-- A patient can hold at most one live (offered or confirmed) allocation per donor: blocks duplicate allocation.
create unique index if not exists uq_blood_live_active_allocation
  on public.blood_live_allocations(session_id, patient_id, donor_code) where state in ('offered','confirmed');

alter table public.blood_live_sessions enable row level security;
alter table public.blood_live_participants enable row level security;
alter table public.blood_live_events enable row level security;
alter table public.blood_live_allocations enable row level security;

do $$
declare t text;
begin
  foreach t in array array['blood_live_sessions','blood_live_participants','blood_live_events','blood_live_allocations'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Atomic compare-and-swap commit used by the server: succeeds only if the session version is unchanged,
-- then upserts participants/allocations and appends events in the SAME transaction.
create or replace function public.blood_live_commit(
  p_session uuid, p_expected int, p_world jsonb, p_status text, p_ended timestamptz,
  p_participants jsonb, p_allocations jsonb, p_events jsonb
) returns boolean language plpgsql set search_path = public as $$
declare n int;
begin
  update public.blood_live_sessions
     set world = p_world, status = p_status, ended_at = p_ended, version = version + 1
   where id = p_session and version = p_expected;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;

  insert into public.blood_live_participants (id, session_id, role, code, abo, rh, units, zone, online, connected, hospital_requests, joined_at)
  select r.id, p_session, r.role, r.code, r.abo, r.rh, r.units, r.zone, r.online, r.connected, r.hospital_requests, r.joined_at
    from jsonb_to_recordset(coalesce(p_participants, '[]'::jsonb))
      as r(id uuid, role text, code text, abo text, rh text, units int, zone text, online boolean, connected boolean, hospital_requests int, joined_at timestamptz)
  on conflict (id) do update
     set online = excluded.online, connected = excluded.connected, units = excluded.units, hospital_requests = excluded.hospital_requests
   where public.blood_live_participants.session_id = p_session;

  -- 1) state changes on existing rows first (so a cancelled offer frees its unique slot) ...
  update public.blood_live_allocations a
     set state = r.state, units = r.units
    from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb))
      as r(id uuid, participant_id uuid, patient_id text, donor_code text, units int, state text, created_at timestamptz, updated_at timestamptz)
   where a.id = r.id and a.session_id = p_session;
  -- 2) ... then new rows.
  insert into public.blood_live_allocations (id, session_id, participant_id, patient_id, donor_code, units, state, created_at, updated_at)
  select r.id, p_session, r.participant_id, r.patient_id, r.donor_code, r.units, r.state, r.created_at, r.updated_at
    from jsonb_to_recordset(coalesce(p_allocations, '[]'::jsonb))
      as r(id uuid, participant_id uuid, patient_id text, donor_code text, units int, state text, created_at timestamptz, updated_at timestamptz)
   where not exists (select 1 from public.blood_live_allocations x where x.id = r.id);

  insert into public.blood_live_events (session_id, seq, type, actor, message, data, created_at)
  select p_session, r.seq, r.type, r.actor, r.message, r.data, r.created_at
    from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb))
      as r(seq int, type text, actor text, message text, data jsonb, created_at timestamptz)
  on conflict (session_id, seq) do nothing;
  return true;
end;
$$;
revoke all on function public.blood_live_commit(uuid, int, jsonb, text, timestamptz, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.blood_live_commit(uuid, int, jsonb, text, timestamptz, jsonb, jsonb, jsonb) to service_role;

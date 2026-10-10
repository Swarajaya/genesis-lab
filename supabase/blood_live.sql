-- ============================================================
-- GENESIS LAB: Blood LIVE MODE storage (run this ONE file in the Supabase SQL editor)
-- Safe to run more than once. Touches nothing else.
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

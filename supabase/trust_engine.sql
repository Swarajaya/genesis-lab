-- Experiment 04 (Trust Without Identity): replay protection + credential revocation registry.
-- Proof records reuse the existing identity_proofs table. No private attribute is ever stored.
create table if not exists public.trust_nonces (
  nonce text primary key,
  consumed_at timestamptz not null default now()
);
create table if not exists public.trust_registry (
  handle text primary key,           -- SHA-256 of the credential's commitment vector (opaque)
  status text not null check (status in ('active','suspended','revoked')),
  owner_session text not null,
  updated_at timestamptz not null default now()
);
alter table public.trust_nonces enable row level security;
alter table public.trust_registry enable row level security;
-- No policies: only the server-side service-role client reads or writes these tables.

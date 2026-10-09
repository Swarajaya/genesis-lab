# Supabase Setup

1. **Create a project** at https://supabase.com/dashboard → New project. Save the database password somewhere safe.
2. **Open the SQL Editor** (left sidebar → SQL Editor → New query).
3. **Run `supabase/schema.sql`**: paste the whole file and press Run. It creates all tables, indexes, foreign keys, RLS policies, the private storage bucket, and the catalog seed data. It is safe to re-run.
4. **Run `supabase/seed.sql`** (optional, already included in schema.sql): re-applies the experiments, SDG mappings and demo donor inventory. Use it to reset catalog and inventory data.
5. **Storage bucket**: `schema.sql` creates a private bucket named `genesis-uploads` (5 MB limit, JPEG/PNG/WebP). Check under Storage that it exists. If your project blocks SQL bucket creation, create it manually with the same name, set it to **private**.
6. **Environment variables**: copy `.env.example` to `.env.local` and fill in values from Project Settings → API.
7. **Start the app**: `npm install && npm run dev`, then open http://localhost:3000. The footer status on `/architecture` shows whether Supabase is reachable.

> The app also runs without Supabase configured. Experiments work, and saving is skipped with a clear notice.

## Environment values to enter

| TABLE / SOURCE | COLUMN / VARIABLE | WHAT TO ENTER | EXAMPLE | REQUIRED? |
|---|---|---|---|---|
| .env.local | NEXT_PUBLIC_SUPABASE_URL | Project URL | https://abcd1234.supabase.co | Yes (for saving) |
| .env.local | NEXT_PUBLIC_SUPABASE_ANON_KEY | `anon` public key | eyJhbGciOi... | Yes (for saving) |
| .env.local | SUPABASE_SERVICE_ROLE_KEY | `service_role` key (secret, server only) | eyJhbGciOi... | Yes (for saving) |
| .env.local | GEMINI_API_KEY_1..N | Google AI Studio keys | AIza... | At least one AI key (Gemini or Grok) |
| .env.local | GROK_API_KEY_1..N | xAI console keys | xai-... | At least one AI key (Gemini or Grok) |
| .env.local | GEMINI_MODEL / GROK_MODEL | Model IDs | gemini-2.5-flash / grok-4-fast | Optional (defaults exist) |

## What each table is for

You do **not** type data into these tables by hand. The app writes them. The only data you may edit manually is the catalog and demo inventory.

| TABLE | PLAIN-LANGUAGE PURPOSE | WHO WRITES IT | EXAMPLE ROW | REQUIRED TO ADD MANUALLY? |
|---|---|---|---|---|
| profiles | One row per signed-in user (display name, role) | Auto trigger on sign-up | display_name = "Judge 1" | No |
| experiments | Catalog of the six experiments | seed.sql | slug = "gamezero" | No (seeded) |
| sdgs | UN SDG metadata for goals used | seed.sql | id = 12, title = "Responsible Consumption..." | No (seeded) |
| experiment_sdgs | Which SDGs each experiment maps to, primary or secondary | seed.sql | blood ↔ SDG 3, primary | No (seeded) |
| experiment_runs | A log of each demo run (summary only) | Server | experiment_slug = "trust" | No |
| ai_requests | Safe metadata about AI calls: provider, model, key slot number, latency. Never keys or prompts | Server | provider = "gemini", key_slot = 2 | No |
| uploaded_assets | Records of validated image uploads (private bucket) | Server | mime_type = "image/png" | No |
| game_sessions | One GameZero learning session | Server | status = "learned" | No |
| game_observations | Each observed (state, action, result) step | Server | action = {"dir":"right"} | No |
| blood_inventory | Synthetic demo donor units | seed.sql (editable) | donor_code = "D-101", abo = "O", rh = "-" | Optional: add your own demo donors |
| blood_matches | Saved blood-matching rankings and explanation | Server | ranking = [...] | No |
| nutrition_runs | Saved waste-to-meal results | Server | ingredients = ["stale bread"] | No |
| object_lifecycles | Saved second-life pathway sets | Server | object_name = "plastic bottle" | No |
| identity_proofs | Public proof data only (commitment + proof). Never a date of birth | Server | claim = "age>=18" | No |
| money_wallets | Simulated wallets (no real value) | Server | balance_paise = 100000 | No |
| money_rules | Programmable rules per wallet: categories, cap, expiry | Server | max_per_txn_paise = 50000 | No |
| money_transactions | Hash-chained simulated ledger of approved/rejected attempts | Server | decision = "APPROVED" | No |

## Security model

- Row Level Security is enabled on every table.
- Public (browser) read access exists only for `experiments`, `sdgs` and `experiment_sdgs`.
- Signed-in users can read only their own rows. Demo-mode runs have no user and are written by the server with the service role.
- `ai_requests`, `blood_matches`, `nutrition_runs`, `object_lifecycles`, `identity_proofs` have no browser policies at all.
- The service-role key is only read in server code (`lib/supabase/admin.ts`).

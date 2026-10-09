# GENESIS LAB

**Six domains. Six experiments. One live innovation laboratory.**

An interactive 3D laboratory containing six working experiments. Every feature runs real code: deterministic engines for the logic, a server-side AI router (Gemini + Grok key pools) for intelligence, Zod validation on everything, and Supabase for persistence.

| # | Experiment | Domain | What is real |
|---|---|---|---|
| 1 | Digital Blood Bank Without Blood Types | Healthcare & Infrastructure | Multi-factor compatibility engine (ABO/Rh, antibodies, antigens, distance, shelf life, urgency) + living network + AI explanation. *Educational simulation, not for clinical use.* |
| 2 | AI Nutrition From Waste | Health + Climate | AI identifies ingredients (text or photo) and designs meals; nutrition is computed server-side from reference data and labelled as estimate. |
| 3 | GameZero | AI & Intelligent Systems | Hidden-rule grid game. A deterministic learner enumerates rule hypotheses, rejects those contradicted by observation, runs its own experiments, then plays. Rules never reach the browser. |
| 4 | Trust Without Identity | Cybersecurity | Real zero-knowledge range proof (Pedersen commitments, bit-decomposition OR-proofs, Schnorr, secp256k1) proving age ≥ 18 without revealing the date of birth. Demonstration cryptography, not production grade. |
| 5 | One Object, 100 Lives | Climate | AI generates up to 100 second-life pathways; a transparent scoring model ranks them; rendered as a 3D life tree. |
| 6 | EXPIRY | Fintech | Programmable simulated money: purpose, recipient, cap, expiry. Server-enforced rules, signed wallet state, hash-chained ledger. *No real monetary value.* |

## Stack
Next.js 16 · React 19 · TypeScript · Tailwind v4 · Three.js / React Three Fiber / Drei · Framer Motion · Zod · Supabase (Postgres, Auth, Storage) · Gemini + Grok (xAI) · Vitest.

## Quick start
```bash
npm install
cp .env.example .env.local     # fill in values (see below)
npm run dev                    # http://localhost:3000
```
Production: `npm run build && npm start`. Tests: `npm test`. Lint: `npm run lint`.

The app runs without any keys: the deterministic parts (Blood ranking, GameZero, Trust, Expiry) work fully; AI-dependent parts (Nutrition, Object pathways, AI explanations) show a clean "AI not configured" state until you add at least one Gemini or Grok key.

## Environment
See `.env.example` (every variable is commented). Key points:
- `GEMINI_API_KEY_1..N` and `GROK_API_KEY_1..N`: any number of numbered keys.
- `GEMINI_MODEL`, `GROK_MODEL`, `GROK_VISION_MODEL`: change models without code edits.
- `AI_PRIMARY_PROVIDER` (`gemini` or `grok`), `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_ATTEMPTS`.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public) and `SUPABASE_SERVICE_ROLE_KEY` (server only).
- `LEDGER_SECRET` signs wallet state and challenges. **Set a long random value in production.**
- `TRUST_ISSUER_SEED` seeds the demo issuer key.

Only `NEXT_PUBLIC_*` values reach the browser. AI keys and the service-role key are read only in server routes.

## Supabase
Follow [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md): create a project, run `supabase/schema.sql` (tables, indexes, foreign keys, RLS, private storage bucket, catalog seed), optionally `supabase/seed.sql`, then add the environment variables. Without Supabase the app still works and simply skips saving.

## AI router
`UI → Next.js API → AIProviderRouter → Gemini key pool → Grok key pool → normalized, Zod-validated response`.
- Round-robin across healthy keys of the primary provider.
- Rate-limit / quota errors put that key on cooldown and move to the next key.
- Transient errors (5xx, timeout) retry once, then move on.
- When a pool is exhausted the router switches provider.
- Hard attempt cap, per-request timeout, clean user-facing error if everything fails.
- Logs contain provider, key slot, latency and error class only. Never keys or prompts.
- No other code calls Gemini or Grok directly. `/architecture` shows live status and has a live router test.

## Project layout
```
app/            pages (landing, /lab, /experiments/*, /demo, /architecture) and API routes
components/     3d/ scenes, experiments/ UIs, ui/ shared components
lib/ai/         router, providers, prompts   lib/engines/  pure experiment engines
lib/security/   rate limit, tokens, uploads  lib/supabase/ persistence   lib/validation/ Zod schemas
supabase/       schema.sql, seed.sql         docs/         setup docs        tests/  Vitest suites
```

## Deployment (Vercel)
1. Push the project to a Git repo and import it in Vercel.
2. Add all environment variables from `.env.example` (server secrets as normal, non-public variables).
3. Deploy. API routes use the Node.js runtime. Long AI routes set `maxDuration`.
Any Node 20+ host also works with `npm run build && npm start`.

## Security notes
Zod validation on every request and every AI answer; RLS on all tables with writes only through server routes; MIME-sniffed, 5 MB-limited uploads into a private bucket; in-memory rate limiting per route (use a shared store such as Redis if you scale to several instances); HMAC-signed wallet/challenge tokens; hash-chained ledger; security headers; no stack traces returned; anonymous demo session in an httpOnly cookie.

## Known limitations
- Rate limiting and replay protection are in-memory (single instance).
- Blood module is an educational model; it does not replace crossmatching or blood-bank protocols.
- Nutrition and environmental figures are estimates from reference tables and stated assumptions.
- The Trust demo is a teaching implementation; the demo "ID office" sees the date of birth once to issue the credential, the verifier never does.
- Expiry's "advance clock" is a simulated offset sent with each spend attempt.
- Live AI behavior depends on your provider keys and quotas.

## Demo (3 minutes)
1. `/` → click a node, then **ENTER THE LAB**.
2. **GameZero**: make 2–3 moves → *Let the AI learn* (watch "Hypothesis rejected") → *Play to win*.
3. **Trust**: enter an adult DOB → verified without revealing it. Enter a minor DOB with *Try to cheat* → rejected.
4. **Expiry**: ₹300 food ✓, ₹700 electronics ✗, advance clock, ₹500 food ✗.
5. **Object**: "plastic bottle" → click branches of the life tree.
6. **Blood**: *Load emergency example* → run → read the network. **Nutrition**: tap example chips.
7. `/demo` has a one-click launcher and **RESET DEMO**; `/architecture` shows the AI router status.

## Documentation
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md) · [`docs/AI_CONFIGURATION.md`](docs/AI_CONFIGURATION.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md) · [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md)

## Verification status
Unit tests (47), lint, type check and production build pass. Gemini, Grok and Supabase integrations are covered by mock/unit tests only; **real provider and database testing requires your credentials** and has not been done.

# Architecture

```
Frontend (Next.js, React Three Fiber, Framer Motion)
  → Next.js API routes (/api/blood, /nutrition, /gamezero, /trust, /object, /expiry, /ai, /demo)
  → Experiment engines (pure TypeScript in lib/engines)
  → AIProviderRouter → Gemini key pool → Grok key pool
  → Zod validation of every AI answer
  → Supabase (Postgres + RLS + private Storage), server-side only
  → Visualization (3D scenes and result panels)
```

## Principles
- Deterministic logic decides outcomes (blood ranking, game rules/validation, proofs, money rules, pathway scoring). AI only identifies, generates candidates or explains, and its output is validated before use.
- Secrets live only in server environment variables. Only `NEXT_PUBLIC_*` values reach the browser.
- Every route: Zod input validation, rate limiting, uniform safe errors.
- Persistence helpers (`lib/supabase/persist.ts`) fail quietly when Supabase is not configured, so experiments always work.

## Modules
| Module | Engine | AI role | Saved to |
|---|---|---|---|
| Blood | `lib/engines/blood` | Explains ranking | blood_matches, blood_inventory (read) |
| Nutrition | `lib/engines/nutrition` | Identify ingredients (text/photo), design meals | nutrition_runs, uploaded_assets |
| GameZero | `lib/engines/gamezero` | Phrases a summary only | game_sessions, game_observations |
| Trust | `lib/engines/trust/zk.ts` | Plain-language explanation | identity_proofs |
| Object | `lib/engines/object` | Identify object/photo, generate pathways | object_lifecycles, uploaded_assets |
| Expiry | `lib/engines/money` | None | money_wallets, money_rules, money_transactions |

## 3D
`components/3d/SceneFrame.tsx` wraps every R3F canvas: pixel-ratio cap, demand rendering under reduced motion, low-power particle counts, and a 2D fallback if WebGL is missing or throws. Scenes are loaded with `next/dynamic` (no SSR).

## Database
`supabase/schema.sql` defines all tables, indexes, foreign keys, RLS and the private `genesis-uploads` bucket. Browser clients never write to the database; the service-role key is used only in server routes and every call is scoped to an anonymous session id (httpOnly cookie).

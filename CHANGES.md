# Experiment 04 upgrade: file map

DELETE: components/experiments/trust/runFlow.ts (old age-first flow)

NEW dependency (package.json):  npm i @noble/post-quantum
Dev (tests):                    npm i -D vitest   (add "test": "vitest run")
Env (optional but recommended): TRUST_ISSUER_SEED=<long random string>
Supabase (optional):            run supabase/trust_engine.sql (trust_nonces, trust_registry)

Modified shared files (Experiment 04 content only):
- lib/validation/schemas.ts   (trustRequest replaced; adds policy schemas + import)
- lib/ai/prompts/trust.ts
- lib/supabase/persist.ts     (saveProof gets an optional `claim` argument, default unchanged)
- lib/experiments.ts          (trust entry only)
- components/DemoClient.tsx   (one instruction string for trust)
- lib/engines/trust/zk.ts     (original age proof untouched; generic claims appended)

Tests need path shims for "server-only" and "@/hooks/useCapabilities" (see vitest.config.ts, tests/shims).

Also: delete components/experiments/trust/runFlow.ts in your repo (old age-first flow).
Copy every file in this folder to the same path in your project, overwriting.

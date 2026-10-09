/** Holder-side prover. Runs in the browser: private values and blinding factors never leave this function's scope. */
import type { HeldCredential } from "./credentials";
import { present } from "./credentials";
import { CRED_IDS, compilePolicy, planSelection, primKey, zkClaimOf, type CredId, type Prim } from "./model";
import { claimContext, commonContext, derivedCommitment, type ChallengeInfo, type ClaimProof, type ProofBundle } from "./proof";
import { eqProve, negScalar, rangeProve, scalarOf } from "./zk";

export class ProveError extends Error {
  constructor(
    public readonly code: "policy_mismatch" | "missing_credential" | "unsatisfiable" | "invalid_policy",
    message: string,
  ) {
    super(message);
  }
}

export interface ProveOptions {
  /** Dishonest prover: attempt a proof for a statement that is false. */
  cheat?: boolean;
  /** Dishonest prover: pretend an attribute has another value ("CRED.attr" -> value). */
  assume?: Record<string, number>;
  now?: number;
}

export type ProveStage = "lock" | "commit" | "prove";

export function buildProof(held: Partial<Record<CredId, HeldCredential>>, ch: ChallengeInfo, opts: ProveOptions = {}, onStage?: (s: ProveStage) => void): ProofBundle {
  const compiled = compilePolicy(ch.policy, ch.asOfDay);
  if (!compiled.ok || !compiled.tree) throw new ProveError("invalid_policy", compiled.errors[0]?.message ?? "The verifier's policy is invalid.");
  if (compiled.policyHash !== ch.policyHash) throw new ProveError("policy_mismatch", "The challenge does not match the policy it claims to carry.");

  onStage?.("lock");
  const valueOf = (cred: CredId, attr: string): number | undefined => {
    const a = held[cred]?.attrs[attr];
    if (!a) return undefined;
    return opts.assume?.[`${cred}.${attr}`] ?? a.v;
  };
  const can = (p: Prim): boolean => {
    if (!held[p.cred]) return false;
    if (p.kind === "notRevoked") return true; // the holder cannot see the registry
    const z = zkClaimOf(p, ch.asOfDay);
    if (!z) return true;
    const v = valueOf(z.cred, z.attr);
    if (v === undefined) return false;
    return z.kind === "eq" ? v === z.value : z.kind === "gte" ? v >= z.value : v <= z.value;
  };
  const plan = planSelection(compiled.tree, can);
  if (!plan.ok && !opts.cheat) {
    const missing = plan.claims.find((c) => !held[c.prim.cred]);
    if (missing) throw new ProveError("missing_credential", `No ${missing.prim.cred} credential in the vault.`);
    throw new ProveError("unsatisfiable", "The policy is not satisfied by these private credentials, so an honest prover cannot build a proof.");
  }
  for (const c of plan.claims) if (!held[c.prim.cred]) throw new ProveError("missing_credential", `No ${c.prim.cred} credential in the vault.`);

  onStage?.("commit");
  const creds = CRED_IDS.filter((c) => plan.claims.some((x) => x.prim.cred === c));
  const presentations: ProofBundle["presentations"] = {};
  for (const c of creds) presentations[c] = present(held[c] as HeldCredential, ch.mode === "hybrid-pq");

  const base = { v: 1 as const, verifierId: ch.verifierId, policyHash: ch.policyHash, nonce: ch.nonce, asOf: ch.asOf, createdAt: opts.now ?? Date.now(), expiresAt: ch.exp, mode: ch.mode, selection: plan.selection, presentations };
  const common = commonContext(base);

  onStage?.("prove");
  const claims: Record<string, ClaimProof> = {};
  for (const { path, prim } of plan.claims) {
    const z = zkClaimOf(prim, ch.asOfDay);
    if (!z) {
      claims[path] = { claim: prim };
      continue;
    }
    const opening = (held[z.cred] as HeldCredential).attrs[z.attr];
    const C = opening.C;
    const v = valueOf(z.cred, z.attr) as number;
    const ctx = claimContext(common, path, primKey(prim), C);
    const D = derivedCommitment(z.kind, C, z.value);
    if (z.kind === "eq") {
      if (v !== z.value && !opts.cheat) throw new ProveError("unsatisfiable", "Equality claim is false for this credential.");
      claims[path] = { claim: prim, zk: { type: "eq", ...eqProve(scalarOf(opening.r), D, ctx) } };
    } else if (z.kind === "gte") {
      claims[path] = { claim: prim, zk: { type: "range", bits: rangeProve(v - z.value, scalarOf(opening.r), ctx, opts.cheat) } };
    } else {
      claims[path] = { claim: prim, zk: { type: "range", bits: rangeProve(z.value - v, negScalar(opening.r), ctx, opts.cheat) } };
    }
  }
  return { ...base, claims };
}

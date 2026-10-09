/** Shared proof types and transcript binding. Browser- and server-safe. */
import { derivedEq, derivedGte, derivedLte, type EqProof, type RangeBits } from "./zk";
import type { PolicyNode, Prim, Selection, CredId } from "./model";
import type { Presentation } from "./credentials";

export type SecurityMode = "classical" | "hybrid-pq";

/** Everything the holder needs from the verifier's challenge (the signed token itself is opaque to the holder). */
export interface ChallengeInfo {
  nonce: string;
  asOf: string;
  asOfDay: number;
  iat: number;
  exp: number;
  verifierId: string;
  policy: PolicyNode;
  policyHash: string;
  mode: SecurityMode;
}

export type ZkPart = { type: "range"; bits: RangeBits } | ({ type: "eq" } & EqProof);
export interface ClaimProof {
  claim: Prim;
  zk?: ZkPart;
}

export interface ProofBundle {
  v: 1;
  verifierId: string;
  policyHash: string;
  nonce: string;
  asOf: string;
  createdAt: number;
  expiresAt: number;
  mode: SecurityMode;
  selection: Selection;
  presentations: Partial<Record<CredId, Presentation>>;
  claims: Record<string, ClaimProof>;
}

export function commonContext(b: Pick<ProofBundle, "policyHash" | "nonce" | "asOf" | "verifierId" | "createdAt" | "expiresAt" | "mode" | "presentations">): string {
  const handles = Object.entries(b.presentations)
    .map(([c, p]) => `${c}=${p?.handle}`)
    .sort()
    .join(",");
  return `trust-v1|${b.policyHash}|${b.nonce}|${b.asOf}|${b.verifierId}|${b.createdAt}|${b.expiresAt}|${b.mode}|${handles}`;
}

export const claimContext = (common: string, path: string, key: string, C: string) => `${common}|claim:${path}:${key}|C:${C}`;

/** The derived commitment D that the sigma/range proof is about. */
export function derivedCommitment(kind: "eq" | "gte" | "lte", C: string, value: number): string {
  return kind === "gte" ? derivedGte(C, value) : kind === "lte" ? derivedLte(C, value) : derivedEq(C, value);
}

export const canonicalBytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

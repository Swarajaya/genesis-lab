/** Pure attack mutators. Each returns a modified COPY of a proof; the verifier decides what happens. */
import type { PolicyNode } from "./model";
import { group, leaf } from "./model";
import type { ProofBundle } from "./proof";
import type { StageId } from "./verifier";

export type AttackId = "tamper" | "alter" | "modify" | "replay" | "expire" | "revoke" | "signature" | "policy" | "nonce" | "invalid";

export interface AttackDef {
  id: AttackId;
  n: number;
  label: string;
  what: string;
  /** the stage the verifier is expected to fail at */
  stage: StageId;
}

export const ATTACKS: AttackDef[] = [
  { id: "tamper", n: 1, label: "Tamper proof", what: "Flip one bit of a proof response scalar.", stage: "proof" },
  { id: "alter", n: 2, label: "Alter claim", what: "Weaken a claim inside the proof (for example lower a threshold).", stage: "claim" },
  { id: "modify", n: 3, label: "Modify private value", what: "Prove using a different private value than the one the issuer committed to.", stage: "commitment" },
  { id: "replay", n: 4, label: "Replay proof", what: "Submit the exact proof that was already accepted.", stage: "nonce" },
  { id: "expire", n: 5, label: "Expire proof", what: "Hold a valid proof until its lifetime ends, then submit it.", stage: "expiration" },
  { id: "revoke", n: 6, label: "Revoke credential", what: "The issuer revokes a presented credential, then a fresh proof is submitted.", stage: "revocation" },
  { id: "signature", n: 7, label: "Change signature", what: "Replace the issuer signature on a presented credential.", stage: "signature" },
  { id: "policy", n: 8, label: "Change policy", what: "Present this proof to a verifier whose policy has changed.", stage: "claim" },
  { id: "nonce", n: 9, label: "Use wrong nonce", what: "Build the proof against a nonce the verifier never issued.", stage: "nonce" },
  { id: "invalid", n: 10, label: "Submit invalid proof", what: "Send a structurally invalid proof body.", stage: "structure" },
];

const clone = <T,>(x: T): T => structuredClone(x);
const flip = (hex: string) => hex.slice(0, -1) + (hex.endsWith("0") ? "1" : "0");

export function tamperBundle(b: ProofBundle): ProofBundle {
  const o = clone(b);
  for (const c of Object.values(o.claims)) {
    if (c.zk?.type === "range") {
      c.zk.bits[3].s0 = flip(c.zk.bits[3].s0);
      return o;
    }
    if (c.zk?.type === "eq") {
      c.zk.s = flip(c.zk.s);
      return o;
    }
  }
  const p = Object.values(o.presentations)[0];
  if (p) p.sig = { ...p.sig, s: flip(p.sig.s) };
  return o;
}

export function alterClaim(b: ProofBundle): ProofBundle {
  const o = clone(b);
  for (const c of Object.values(o.claims)) {
    const cl = c.claim;
    if (cl.kind === "gte") cl.value = Math.max(0, cl.value - 1);
    else if (cl.kind === "lte") cl.value = cl.value + 1;
    else if (cl.kind === "eq") cl.value = cl.value === 0 ? 1 : cl.value - 1;
    else cl.kind = cl.kind === "active" ? "notRevoked" : "active";
    return o;
  }
  return o;
}

export function breakSignature(b: ProofBundle): ProofBundle {
  const o = clone(b);
  const p = Object.values(o.presentations)[0];
  if (p) p.sig = { ...p.sig, s: flip(p.sig.s) };
  return o;
}

/** A different policy: the current one AND a degree requirement (or a clearance requirement if one is already there). */
export function mutatePolicy(p: PolicyNode): PolicyNode {
  const has = JSON.stringify(p).includes('"degree_gte"');
  return group("AND", p, has ? leaf("clearance_gte", 1) : leaf("degree_gte", 1));
}

export const invalidBundle = (): unknown => ({ v: 1, proof: "not-a-proof", claims: [1, 2, 3] });

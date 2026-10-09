/**
 * Credential issuance and presentation. The issuer commits to each attribute (Pedersen) and signs the commitment vector
 * with a classical Schnorr signature and an ML-DSA-65 signature. Values and blinding factors go to the holder only.
 */
import { commitAttribute, issuerKeysFromSeed, schnorrSign, schnorrVerify, sha256Hex, type AttrOpening, type IssuerKeys } from "./zk";
import { CREDS, type CredId } from "./model";
import { pqSigKeysFromSeed, pqSign, pqVerify, type PqSigKeys } from "./pq";

export interface IssuerBundle {
  classical: IssuerKeys;
  pq: PqSigKeys;
}

const cache = new Map<string, IssuerBundle>();
export function issuerFor(seed: string, cred: CredId): IssuerBundle {
  const k = `${seed}|${cred}`;
  let b = cache.get(k);
  if (!b) {
    b = { classical: issuerKeysFromSeed(`${seed}/${cred}`), pq: pqSigKeysFromSeed(`${seed}/${cred}`) };
    cache.set(k, b);
  }
  return b;
}

export const credentialMessage = (cred: CredId, commitments: Record<string, string>): string =>
  `cred-v1|${cred}|${Object.keys(commitments)
    .sort()
    .map((a) => `${a}:${commitments[a]}`)
    .join(",")}`;
export const handleOf = (cred: CredId, commitments: Record<string, string>): string => sha256Hex(credentialMessage(cred, commitments));

export interface HeldCredential {
  cred: CredId;
  handle: string;
  /** SECRET openings */
  attrs: Record<string, AttrOpening>;
  commitments: Record<string, string>;
  sig: { R: string; s: string };
  pqSig: string;
  issuedAt: number;
}

/** Issuer step. `values` must cover every attribute of the credential type. */
export function issueCredential(seed: string, cred: CredId, values: Record<string, number>, now = Date.now()): HeldCredential {
  const def = CREDS[cred];
  const attrs: Record<string, AttrOpening> = {};
  const commitments: Record<string, string> = {};
  for (const [name, a] of Object.entries(def.attrs)) {
    const v = values[name];
    if (typeof v !== "number" || !Number.isInteger(v) || v < a.min || v > a.max) throw new Error(`invalid value for ${cred}.${name}`);
    attrs[name] = commitAttribute(v);
    commitments[name] = attrs[name].C;
  }
  const iss = issuerFor(seed, cred);
  const msg = credentialMessage(cred, commitments);
  return { cred, handle: sha256Hex(msg), attrs, commitments, sig: schnorrSign(iss.classical.secretHex, msg), pqSig: pqSign(iss.pq.secretHex, msg), issuedAt: now };
}

/** What the holder shows a verifier for one credential: commitments and signatures only. */
export interface Presentation {
  cred: CredId;
  handle: string;
  commitments: Record<string, string>;
  sig: { R: string; s: string };
  pqSig?: string;
}

export function present(c: HeldCredential, includePq: boolean): Presentation {
  return { cred: c.cred, handle: c.handle, commitments: c.commitments, sig: c.sig, ...(includePq ? { pqSig: c.pqSig } : {}) };
}

export function verifyPresentation(seed: string, p: Presentation, requirePq: boolean): { handle: boolean; classical: boolean; pq: boolean } {
  const iss = issuerFor(seed, p.cred);
  const msg = credentialMessage(p.cred, p.commitments);
  return {
    handle: handleOf(p.cred, p.commitments) === p.handle,
    classical: schnorrVerify(iss.classical.publicHex, msg, p.sig),
    pq: requirePq ? typeof p.pqSig === "string" && pqVerify(iss.pq.publicHex, msg, p.pqSig) : true,
  };
}

/**
 * Adversarial verifier. Pure: all I/O (token authentication, nonce store, registry) is injected by the caller.
 * Every stage is evaluated independently so a failure names exactly which check broke. The verdict is deterministic.
 */
import { verifyPresentation, type Presentation } from "./credentials";
import { CREDS, CRED_IDS, compilePolicy, describePrim, evaluateTree, primKey, requiredClaims, zkClaimOf, type CredId, type Prim, type RegistryStatus } from "./model";
import { claimContext, commonContext, derivedCommitment, type ChallengeInfo, type ClaimProof, type ProofBundle } from "./proof";
import { eqVerify, isPointHex, isScalarHex, rangeVerify } from "./zk";

export type StageId = "structure" | "channel" | "signature" | "commitment" | "nonce" | "expiration" | "revocation" | "claim" | "proof" | "policy";
export type StageState = "pass" | "fail" | "skipped";
export interface StageResult {
  id: StageId;
  label: string;
  state: StageState;
  detail: string;
}
export interface ClaimResult {
  path: string;
  label: string;
  zk: boolean | null;
  registry: boolean | null;
  ok: boolean;
}
export interface VerifyReport {
  trust: "VERIFIED" | "REJECTED";
  stages: StageResult[];
  failed: StageId[];
  claims: ClaimResult[];
  replay: boolean;
  /** what the verifier learned */
  learned: { policySatisfied: boolean; credentialsPresented: CredId[]; rawAttributesReceived: number };
}

export interface VerifyContext {
  bundle: unknown;
  /** The challenge, or null if the token was missing, forged or malformed. */
  challenge: ChallengeInfo | null;
  /** Nonce was already consumed. */
  replayed: boolean;
  now: number;
  seed: string;
  registry: (handle: string) => RegistryStatus | undefined;
  /** Hybrid mode only: whether the sealed envelope decrypted. */
  channel?: { required: boolean; ok: boolean };
}

const LABELS: Record<StageId, string> = {
  structure: "Proof structure",
  channel: "ML-KEM channel",
  signature: "Issuer signature",
  commitment: "Commitment",
  nonce: "Nonce / challenge",
  expiration: "Proof expiration",
  revocation: "Revocation",
  claim: "Claim set",
  proof: "Zero-knowledge proof",
  policy: "Policy",
};

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function checkShape(b: unknown): string | null {
  if (!isObj(b)) return "Proof is not an object.";
  if (b.v !== 1) return "Unsupported proof version.";
  for (const k of ["verifierId", "policyHash", "nonce", "asOf"] as const) if (typeof b[k] !== "string" || (b[k] as string).length > 200) return `Field ${k} is missing or malformed.`;
  for (const k of ["createdAt", "expiresAt"] as const) if (typeof b[k] !== "number" || !Number.isFinite(b[k] as number)) return `Field ${k} is missing or malformed.`;
  if (b.mode !== "classical" && b.mode !== "hybrid-pq") return "Unknown security mode.";
  if (!isObj(b.selection) || !isObj(b.presentations) || !isObj(b.claims)) return "Proof sections are missing.";
  if (Object.keys(b.claims).length > 24) return "Too many claims.";
  for (const [cred, p] of Object.entries(b.presentations)) {
    if (!CRED_IDS.includes(cred as CredId) || !isObj(p)) return "Unknown credential presentation.";
    if (typeof p.handle !== "string" || !isObj(p.commitments) || !isObj(p.sig) || !isPointHex(p.sig.R) || !isScalarHex(p.sig.s)) return "Credential presentation is malformed.";
    for (const v of Object.values(p.commitments)) if (!isPointHex(v)) return "A commitment is not a valid curve point.";
  }
  for (const c of Object.values(b.claims)) {
    if (!isObj(c) || !isObj(c.claim) || typeof c.claim.kind !== "string") return "A claim is malformed.";
    const z = c.zk;
    if (z !== undefined) {
      if (!isObj(z)) return "A proof body is malformed.";
      if (z.type === "range") {
        if (!Array.isArray(z.bits) || z.bits.length !== 16) return "A range proof must contain 16 bit proofs.";
        for (const bit of z.bits as unknown[]) {
          if (!isObj(bit) || !isPointHex(bit.C) || !isPointHex(bit.A0) || !isPointHex(bit.A1) || !isScalarHex(bit.e0) || !isScalarHex(bit.s0) || !isScalarHex(bit.s1)) return "A bit proof is malformed.";
        }
      } else if (z.type === "eq") {
        if (!isPointHex(z.A) || !isScalarHex(z.s)) return "An equality proof is malformed.";
      } else return "Unknown proof type.";
    }
  }
  return null;
}

export function verifyBundle(ctx: VerifyContext): VerifyReport {
  const stages: StageResult[] = [];
  const set = (id: StageId, state: StageState, detail: string) => stages.push({ id, label: LABELS[id], state, detail });
  const skipAll = (from: StageId[], why: string) => from.forEach((id) => set(id, "skipped", why));
  const hybrid = ctx.challenge?.mode === "hybrid-pq" || ctx.channel?.required === true;
  const order: StageId[] = ["structure", ...(hybrid ? (["channel"] as StageId[]) : []), "signature", "commitment", "nonce", "expiration", "revocation", "claim", "proof", "policy"];
  const finish = (claims: ClaimResult[], learned: VerifyReport["learned"]): VerifyReport => {
    const sorted = order.map((id) => stages.find((s) => s.id === id) as StageResult);
    const failed = sorted.filter((s) => s.state !== "pass").map((s) => s.id);
    return { trust: failed.length === 0 ? "VERIFIED" : "REJECTED", stages: sorted, failed, claims, replay: ctx.replayed, learned };
  };
  const none: VerifyReport["learned"] = { policySatisfied: false, credentialsPresented: [], rawAttributesReceived: 0 };

  if (ctx.channel?.required) set("channel", ctx.channel.ok ? "pass" : "fail", ctx.channel.ok ? "Sealed with ML-KEM-768 + AES-256-GCM; decapsulated and authenticated." : "Envelope could not be decapsulated or authenticated.");
  else if (hybrid) set("channel", "fail", "Hybrid mode requires the proof to be sealed to the verifier's ML-KEM key.");

  const shapeErr = checkShape(ctx.bundle);
  if (shapeErr) {
    set("structure", "fail", shapeErr);
    skipAll(order.filter((s) => s !== "structure" && s !== "channel"), "Not evaluated: the proof is structurally invalid.");
    return finish([], none);
  }
  set("structure", "pass", "Well-formed proof envelope.");
  const b = ctx.bundle as ProofBundle;
  const ch = ctx.challenge;

  // challenge / nonce -------------------------------------------------------------------------------------------
  let nonceOk = false;
  let nonceDetail = "";
  if (!ch) nonceDetail = "The verifier challenge is missing, forged or malformed.";
  else if (ctx.replayed) nonceDetail = "REPLAY DETECTED: this challenge was already answered once.";
  else if (b.nonce !== ch.nonce) nonceDetail = "Proof was built for a different nonce than the verifier issued.";
  else if (b.verifierId !== ch.verifierId) nonceDetail = "Proof is bound to a different verifier.";
  else if (b.policyHash !== ch.policyHash) nonceDetail = "Proof is bound to a different policy.";
  else if (b.asOf !== ch.asOf) nonceDetail = "Proof is bound to a different date.";
  else if (b.mode !== ch.mode) nonceDetail = "Proof used a different security mode.";
  else {
    nonceOk = true;
    nonceDetail = "Fresh challenge, answered once, bound to this verifier and policy.";
  }

  if (!ch) {
    set("nonce", "fail", nonceDetail);
    skipAll(order.filter((s) => !["structure", "channel", "nonce"].includes(s)), "Not evaluated: no valid challenge to check against.");
    return finish([], none);
  }

  const compiled = compilePolicy(ch.policy, ch.asOfDay);
  const tree = compiled.ok && compiled.policyHash === ch.policyHash ? compiled.tree : null;
  const required = tree ? requiredClaims(tree, b.selection as Record<string, number>) : null;

  // signature + commitment ----------------------------------------------------------------------------------------
  const presentations = b.presentations as Partial<Record<CredId, Presentation>>;
  const sigOk: Record<string, boolean> = {};
  const sigDetail: string[] = [];
  const hsOk: Record<string, boolean> = {};
  for (const [c, p] of Object.entries(presentations)) {
    const r = verifyPresentation(ctx.seed, p as Presentation, ch.mode === "hybrid-pq");
    sigOk[c] = r.classical && r.pq;
    hsOk[c] = r.handle;
    if (!r.classical) sigDetail.push(`${c}: Schnorr signature invalid`);
    if (!r.pq) sigDetail.push(`${c}: ML-DSA-65 signature missing or invalid`);
  }
  const nCred = Object.keys(presentations).length;
  const allSig = nCred > 0 && Object.values(sigOk).every(Boolean);
  set("signature", allSig ? "pass" : "fail", allSig ? `${nCred} credential signature${nCred > 1 ? "s" : ""} verified${ch.mode === "hybrid-pq" ? " (Schnorr + ML-DSA-65)" : " (Schnorr)"}.` : sigDetail.join("; ") || "No credential presented.");

  // proof + commitment link -----------------------------------------------------------------------------------------
  const common = commonContext(b);
  const results: ClaimResult[] = [];
  const zkOk: Record<string, boolean | null> = {};
  const linkOk: Record<string, boolean> = {};
  const regOk: Record<string, boolean | null> = {};
  const claimDetail: string[] = [];
  const revDetail: string[] = [];
  let claimSetOk = !!required;

  if (!required) claimDetail.push("The selected branches do not describe a valid satisfying set for this policy.");
  if (required) {
    const reqPaths = new Set(required.map((r) => r.path));
    for (const p of Object.keys(b.claims)) if (!reqPaths.has(p)) (claimSetOk = false), claimDetail.push(`Unexpected extra claim "${p}" (minimum disclosure violated).`);
    const needCreds = new Set(required.map((r) => r.prim.cred));
    for (const c of Object.keys(presentations)) if (!needCreds.has(c as CredId)) (claimSetOk = false), claimDetail.push(`Credential ${c} presented but not required.`);
    for (const r of required) {
      const got = b.claims[r.path] as ClaimProof | undefined;
      const pres = presentations[r.prim.cred];
      if (!got) {
        claimSetOk = false;
        claimDetail.push(`Missing claim ${describePrim(r.prim, ch.asOfDay)}.`);
        zkOk[r.path] = false;
        linkOk[r.path] = false;
        continue;
      }
      if (primKey(got.claim as Prim) !== primKey(r.prim)) {
        claimSetOk = false;
        claimDetail.push(`Claim ${r.path} was altered: policy requires ${describePrim(r.prim, ch.asOfDay)}.`);
      }
      if (!pres) {
        zkOk[r.path] = false;
        linkOk[r.path] = false;
        continue;
      }
      const z = zkClaimOf(r.prim, ch.asOfDay);
      if (!z) {
        zkOk[r.path] = null;
        linkOk[r.path] = true;
      } else {
        const C = pres.commitments[z.attr];
        if (!C || !got.zk) {
          zkOk[r.path] = false;
          linkOk[r.path] = false;
        } else {
          const cctx = claimContext(common, r.path, primKey(r.prim), C);
          const D = derivedCommitment(z.kind, C, z.value);
          if (z.kind === "eq") {
            const ok = got.zk.type === "eq" && eqVerify(D, got.zk, cctx);
            zkOk[r.path] = ok;
            linkOk[r.path] = ok;
          } else if (got.zk.type === "range") {
            const rc = rangeVerify(D, got.zk.bits, cctx);
            zkOk[r.path] = rc.bits && rc.link;
            linkOk[r.path] = rc.link;
          } else {
            zkOk[r.path] = false;
            linkOk[r.path] = false;
          }
        }
      }
      // registry (revocation) per claim
      if (r.prim.kind === "active" || r.prim.kind === "notRevoked") {
        const st = ctx.registry(pres.handle);
        const good = r.prim.kind === "active" ? st === "active" : st !== undefined && st !== "revoked";
        regOk[r.path] = good;
        if (!good) revDetail.push(`${r.prim.cred} credential is ${st ?? "unknown to the registry"}${r.prim.kind === "active" ? " (active required)" : " (must not be revoked)"}.`);
      } else regOk[r.path] = null;
    }
  }

  const handleOk = Object.values(hsOk).every(Boolean) && nCred > 0;
  const linksOk = required ? required.every((r) => linkOk[r.path] !== false) : false;
  set("commitment", handleOk && linksOk ? "pass" : "fail", handleOk && linksOk ? "Credential handles match their commitments; every claim is linked to a signed commitment." : !handleOk ? "A credential handle does not match its commitment vector." : "A claim is not consistent with the signed commitment.");
  set("nonce", nonceOk ? "pass" : "fail", nonceDetail);
  const created = b.createdAt;
  const expired = ctx.now > ch.exp || b.expiresAt !== ch.exp;
  const expDetail = ctx.now > ch.exp ? `PROOF EXPIRED ${Math.round((ctx.now - ch.exp) / 100) / 10}s ago.` : b.expiresAt !== ch.exp ? "Declared expiry differs from the verifier's." : created < ch.iat - 1000 || created > ctx.now + 5000 ? "Creation time is outside the challenge window." : `Valid for another ${Math.max(0, Math.round((ch.exp - ctx.now) / 100) / 10)}s.`;
  const expOk = !expired && !(created < ch.iat - 1000 || created > ctx.now + 5000);
  set("expiration", expOk ? "pass" : "fail", expDetail);
  const revOk = !!required && required.every((r) => regOk[r.path] !== false);
  const hasLifecycle = !!required && required.some((r) => regOk[r.path] !== null);
  set("revocation", revOk ? "pass" : "fail", revOk ? (hasLifecycle ? "Registry reports every checked credential in good standing." : "Policy requires no lifecycle checks.") : revDetail.join(" ") || "Revocation could not be evaluated.");
  set("claim", claimSetOk && !!tree ? "pass" : "fail", claimSetOk && tree ? `Exactly the ${required?.length} claim${required?.length === 1 ? "" : "s"} the policy requires, nothing more.` : claimDetail.join(" ") || "Policy could not be compiled.");
  const proofsOk = !!required && required.every((r) => zkOk[r.path] !== false);
  set("proof", proofsOk ? "pass" : "fail", proofsOk ? "All zero-knowledge sub-proofs verified under this policy, nonce and verifier." : "At least one sub-proof does not verify for this transcript.");

  if (required && tree) {
    for (const r of required) {
      const sigGood = sigOk[r.prim.cred] === true;
      results.push({ path: r.path, label: describePrim(r.prim, ch.asOfDay), zk: zkOk[r.path] ?? null, registry: regOk[r.path] ?? null, ok: sigGood && zkOk[r.path] !== false && linkOk[r.path] !== false && regOk[r.path] !== false });
    }
  }
  const satisfied = !!tree && !!required && evaluateTree(tree, b.selection as Record<string, number>, (p) => results.find((x) => x.path === p)?.ok === true);
  set("policy", satisfied ? "pass" : "fail", satisfied ? `Policy satisfied: ${compiled.expression}` : "The verified claims do not satisfy the policy.");

  const out = finish(results, { policySatisfied: satisfied && stages.every((s) => s.state === "pass"), credentialsPresented: Object.keys(presentations) as CredId[], rawAttributesReceived: 0 });
  if (out.trust === "REJECTED") out.learned.policySatisfied = false;
  void CREDS;
  return out;
}

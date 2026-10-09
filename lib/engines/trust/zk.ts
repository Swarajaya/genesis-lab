/**
 * Research-grade zero-knowledge proofs, implemented with real cryptography (not an audited protocol):
 *   - Pedersen commitments on secp256k1 (hiding + binding), second generator H from hash-to-curve
 *   - Bit-decomposition range proof: prove (cutoff - birthDay) in [0, 2^N)
 *   - Per-bit Cramer-Damgard-Schoenmakers OR-proofs (Sigma protocol) made non-interactive by Fiat-Shamir
 *   - Schnorr signature by an "issuer" over the commitment (so the verifier knows the commitment is a real birth date)
 *
 * It is isomorphic: the prover runs in the browser so the date of birth never leaves the device.
 * The legacy age proof below is preserved unchanged. The generic section at the end of this file reuses
 * the same machinery for arbitrary committed attributes (range claims >= / <=, equality claims).
 *
 * Limits: not audited, no holder binding, the issuer sees attribute values at issuance, and every primitive here
 * rests on the discrete-log assumption (secp256k1), so binding and soundness are NOT post-quantum.
 * Perfect hiding of Pedersen commitments is information-theoretic and does not depend on that assumption.
 */
import { secp256k1, secp256k1_hasher } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

const Point = secp256k1.Point;
type Pt = InstanceType<typeof Point>;
const N: bigint = Point.Fn.ORDER;
const G: Pt = Point.BASE;
const BITS = 16; // proves values in [0, 65536) days, about 179 years
const enc = new TextEncoder();

export const H: Pt = secp256k1_hasher.hashToCurve(enc.encode("GENESIS-LAB/pedersen/H/v1"), { DST: "GENESIS-LAB-H2C-V1" }) as unknown as Pt;

const mod = (a: bigint) => ((a % N) + N) % N;

function randScalar(): bigint {
  const bytes = new Uint8Array(32);
  while (true) {
    crypto.getRandomValues(bytes);
    const v = BigInt("0x" + bytesToHex(bytes)) % N;
    if (v > 0n) return v;
  }
}

function mul(p: Pt, k: bigint): Pt {
  const s = mod(k);
  return s === 0n ? Point.ZERO : p.multiplyUnsafe(s);
}

const ptHex = (p: Pt) => bytesToHex(p.toBytes(true));
const hexPt = (h: string): Pt => Point.fromBytes(hexToBytes(h));
const scHex = (s: bigint) => mod(s).toString(16).padStart(64, "0");
const hexSc = (h: string) => BigInt("0x" + h);

function challenge(...parts: (string | Uint8Array)[]): bigint {
  const chunks = parts.map((p) => (typeof p === "string" ? enc.encode(p) : p));
  const total = chunks.reduce((n, c) => n + c.length + 4, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    new DataView(buf.buffer).setUint32(off, c.length);
    off += 4;
    buf.set(c, off);
    off += c.length;
  }
  return BigInt("0x" + bytesToHex(sha256(buf))) % N;
}

/** Days since 1900-01-01 for a YYYY-MM-DD date (UTC). */
export function daysSince1900(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error("bad date");
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(t)) throw new Error("bad date");
  return Math.round((t - Date.UTC(1900, 0, 1)) / 86_400_000);
}

/** Cutoff day number: the latest birth date that is at least `years` old on `asOf`. */
export function cutoffDay(asOf: string, years: number): number {
  const [y, mo, d] = asOf.split("-").map(Number);
  const cut = new Date(Date.UTC(y - years, mo - 1, d));
  // Feb 29 edge: JS rolls to Mar 1 for non-leap years, which is the conventional treatment.
  return daysSince1900(cut.toISOString().slice(0, 10));
}

// ---------- Issuer (Schnorr signature over the commitment) ----------

export interface IssuerKeys {
  secretHex: string;
  publicHex: string;
}

export function issuerKeysFromSeed(seed: string): IssuerKeys {
  const sk = (BigInt("0x" + bytesToHex(sha256(enc.encode(`genesis-lab/issuer/${seed}`)))) % (N - 1n)) + 1n;
  return { secretHex: scHex(sk), publicHex: ptHex(mul(G, sk)) };
}

export function schnorrSign(secretHex: string, message: string): { R: string; s: string } {
  const x = hexSc(secretHex);
  const P = ptHex(mul(G, x));
  const k = randScalar();
  const R = ptHex(mul(G, k));
  const e = challenge("schnorr", R, P, message);
  return { R, s: scHex(k + e * x) };
}

export function schnorrVerify(publicHex: string, message: string, sig: { R: string; s: string }): boolean {
  try {
    const P = hexPt(publicHex);
    const R = hexPt(sig.R);
    const e = challenge("schnorr", sig.R, publicHex, message);
    return mul(G, hexSc(sig.s)).equals(R.add(mul(P, e)));
  } catch {
    return false;
  }
}

export interface Credential {
  /** Birth date as a day number. SECRET: held by the holder only. */
  b: number;
  /** Blinding factor. SECRET. */
  r: string;
  /** Pedersen commitment to b, hex. Public. */
  C: string;
  /** Issuer signature over C. Public. */
  sig: { R: string; s: string };
}

/** Issuer step: commit to the birth date and sign the commitment. The issuer does not store the date. */
export function issueCredential(issuer: IssuerKeys, dob: string): Credential {
  const b = daysSince1900(dob);
  if (b < 0 || b >= 2 ** BITS * 2) throw new Error("date out of range");
  const r = randScalar();
  const C = mul(G, BigInt(b)).add(mul(H, r));
  const Chex = ptHex(C);
  return { b, r: scHex(r), C: Chex, sig: schnorrSign(issuer.secretHex, `dob-commitment:${Chex}`) };
}

export function verifyIssuerSignature(issuerPublicHex: string, C: string, sig: { R: string; s: string }): boolean {
  return schnorrVerify(issuerPublicHex, `dob-commitment:${C}`, sig);
}

// ---------- Range proof ----------

export interface BitProof {
  C: string;
  A0: string;
  A1: string;
  e0: string;
  s0: string;
  s1: string;
}

export interface AgeProof {
  claim: "age>=threshold";
  threshold: number;
  asOf: string;
  nonce: string;
  bits: BitProof[];
}

function transcriptContext(C: string, threshold: number, asOf: string, nonce: string) {
  return `age-proof|${C}|${threshold}|${asOf}|${nonce}`;
}

/** Prove "age >= threshold on asOf" without revealing b or r. `cheat` simulates a dishonest prover (for the soundness demo). */
export function proveAge(cred: Credential, threshold: number, asOf: string, nonce: string, opts: { cheat?: boolean } = {}): AgeProof {
  const cut = cutoffDay(asOf, threshold);
  let v = cut - cred.b;
  if (v < 0 || v >= 2 ** BITS) {
    if (!opts.cheat) throw new Error("cannot prove: the statement is false for this credential");
    v = ((v % 2 ** BITS) + 2 ** BITS) % 2 ** BITS; // dishonest: pretend a different value
  }
  const r = hexSc(cred.r);
  const ctx = transcriptContext(cred.C, threshold, asOf, nonce);

  // Randomness for bits: sum(2^i * r_i) must equal -r so the bit commitments recombine to C'.
  const rs: bigint[] = Array.from({ length: BITS }, () => randScalar());
  let acc = 0n;
  for (let i = 1; i < BITS; i++) acc = mod(acc + (1n << BigInt(i)) * rs[i]);
  rs[0] = mod(-r - acc);

  const bits: BitProof[] = [];
  for (let i = 0; i < BITS; i++) {
    const bit = (v >> i) & 1;
    const Ci = (bit === 1 ? G : Point.ZERO).add(mul(H, rs[i]));
    const Y0 = Ci;
    const Y1 = Ci.subtract(G);
    let A0: Pt, A1: Pt, e0: bigint, e1: bigint, s0: bigint, s1: bigint;
    if (bit === 0) {
      // real branch 0, simulate branch 1
      const k = randScalar();
      A0 = mul(H, k);
      e1 = randScalar();
      s1 = randScalar();
      A1 = mul(H, s1).subtract(mul(Y1, e1));
      const e = challenge(ctx, ptHex(Ci), ptHex(A0), ptHex(A1));
      e0 = mod(e - e1);
      s0 = mod(k + e0 * rs[i]);
    } else {
      // real branch 1, simulate branch 0
      const k = randScalar();
      A1 = mul(H, k);
      e0 = randScalar();
      s0 = randScalar();
      A0 = mul(H, s0).subtract(mul(Y0, e0));
      const e = challenge(ctx, ptHex(Ci), ptHex(A0), ptHex(A1));
      e1 = mod(e - e0);
      s1 = mod(k + e1 * rs[i]);
    }
    void e1;
    bits.push({ C: ptHex(Ci), A0: ptHex(A0), A1: ptHex(A1), e0: scHex(e0), s0: scHex(s0), s1: scHex(s1) });
  }
  return { claim: "age>=threshold", threshold, asOf, nonce, bits };
}

export interface VerifyReport {
  valid: boolean;
  checks: { id: string; label: string; ok: boolean }[];
}

/** Verifier: sees only C, the issuer signature and the proof. Never b or r. */
export function verifyAge(args: { issuerPublicHex: string; C: string; sig: { R: string; s: string }; proof: AgeProof; expectedAsOf: string; expectedNonce: string }): VerifyReport {
  const { issuerPublicHex, C, sig, proof } = args;
  const checks: VerifyReport["checks"] = [];
  const add = (id: string, label: string, ok: boolean) => checks.push({ id, label, ok });

  add("issuer", "Issuer signature on the commitment is valid", verifyIssuerSignature(issuerPublicHex, C, sig));
  add("fresh", "Proof is bound to this verifier's fresh nonce and date", proof.nonce === args.expectedNonce && proof.asOf === args.expectedAsOf);
  add("shape", `Proof contains ${BITS} well-formed bit commitments`, Array.isArray(proof.bits) && proof.bits.length === BITS);

  let bitsOk = false;
  let sumOk = false;
  try {
    if (proof.bits.length === BITS && proof.claim === "age>=threshold") {
      const ctx = transcriptContext(C, proof.threshold, proof.asOf, proof.nonce);
      bitsOk = proof.bits.every((b) => {
        const Ci = hexPt(b.C);
        const A0 = hexPt(b.A0);
        const A1 = hexPt(b.A1);
        const e = challenge(ctx, b.C, b.A0, b.A1);
        const e0 = hexSc(b.e0);
        const e1 = mod(e - e0);
        const okBranch0 = mul(H, hexSc(b.s0)).equals(A0.add(mul(Ci, e0)));
        const okBranch1 = mul(H, hexSc(b.s1)).equals(A1.add(mul(Ci.subtract(G), e1)));
        return okBranch0 && okBranch1;
      });
      // sum(2^i * C_i) must equal cutoff*G - C, tying the bits to the committed birth date.
      let sum: Pt = Point.ZERO;
      for (let i = 0; i < BITS; i++) sum = sum.add(mul(hexPt(proof.bits[i].C), 1n << BigInt(i)));
      const target = mul(G, BigInt(cutoffDay(proof.asOf, proof.threshold))).subtract(hexPt(C));
      sumOk = sum.equals(target);
    }
  } catch {
    bitsOk = false;
    sumOk = false;
  }
  add("bits", "Every bit commitment provably hides a 0 or a 1 (OR-proofs)", bitsOk);
  add("sum", "The bits recombine to (cutoff date - committed birth date), so it is non-negative", sumOk);
  return { valid: checks.every((c) => c.ok), checks };
}

export const ZK_BITS = BITS;


// =====================================================================================================
// Generic claims over committed attributes (used by the trust policy engine)
// =====================================================================================================

export const FIELD_ORDER = N;
export const RANGE_LIMIT = 2 ** BITS;

export interface AttrOpening {
  /** Attribute value (SECRET). */
  v: number;
  /** Blinding factor (SECRET), 64 hex chars. */
  r: string;
  /** Pedersen commitment v*G + r*H (public), compressed hex. */
  C: string;
}

/** Commit to a small non-negative integer. */
export function commitAttribute(v: number): AttrOpening {
  if (!Number.isInteger(v) || v < 0 || v >= RANGE_LIMIT) throw new Error("attribute out of range");
  const r = randScalar();
  return { v, r: scHex(r), C: ptHex(mul(G, BigInt(v)).add(mul(H, r))) };
}

/** Does this opening match its commitment? (holder-side self check) */
export function openingMatches(o: AttrOpening): boolean {
  try {
    return mul(G, BigInt(o.v)).add(mul(H, hexSc(o.r))).equals(hexPt(o.C));
  } catch {
    return false;
  }
}

export type RangeBits = BitProof[];

/** Prove value in [0, 2^BITS) for the commitment D = value*G + rD*H. `cheat` wraps an out-of-range value. */
export function rangeProve(value: number, rD: bigint, ctx: string, cheat = false): RangeBits {
  let v = value;
  if (v < 0 || v >= RANGE_LIMIT) {
    if (!cheat) throw new Error("cannot prove: the statement is false for this credential");
    v = ((v % RANGE_LIMIT) + RANGE_LIMIT) % RANGE_LIMIT;
  }
  const rs: bigint[] = Array.from({ length: BITS }, () => randScalar());
  let acc = 0n;
  for (let i = 1; i < BITS; i++) acc = mod(acc + (1n << BigInt(i)) * rs[i]);
  rs[0] = mod(rD - acc);
  const out: BitProof[] = [];
  for (let i = 0; i < BITS; i++) {
    const bit = (v >> i) & 1;
    const Ci = (bit === 1 ? G : Point.ZERO).add(mul(H, rs[i]));
    const Y1 = Ci.subtract(G);
    let A0: Pt, A1: Pt, e0: bigint, s0: bigint, s1: bigint;
    if (bit === 0) {
      const k = randScalar();
      A0 = mul(H, k);
      const e1 = randScalar();
      s1 = randScalar();
      A1 = mul(H, s1).subtract(mul(Y1, e1));
      e0 = mod(challenge(ctx, ptHex(Ci), ptHex(A0), ptHex(A1)) - e1);
      s0 = mod(k + e0 * rs[i]);
    } else {
      const k = randScalar();
      A1 = mul(H, k);
      e0 = randScalar();
      s0 = randScalar();
      A0 = mul(H, s0).subtract(mul(Ci, e0));
      const e1 = mod(challenge(ctx, ptHex(Ci), ptHex(A0), ptHex(A1)) - e0);
      s1 = mod(k + e1 * rs[i]);
    }
    out.push({ C: ptHex(Ci), A0: ptHex(A0), A1: ptHex(A1), e0: scHex(e0), s0: scHex(s0), s1: scHex(s1) });
  }
  return out;
}

export interface RangeCheck {
  /** every bit commitment hides 0 or 1 (OR-proofs) */
  bits: boolean;
  /** the bits recombine to exactly D (commitment link) */
  link: boolean;
}

/** Verify that D commits to a value in [0, 2^BITS). Never throws. */
export function rangeVerify(Dhex: string, bits: RangeBits, ctx: string): RangeCheck {
  try {
    if (!Array.isArray(bits) || bits.length !== BITS) return { bits: false, link: false };
    const D = hexPt(Dhex);
    const okBits = bits.every((b) => {
      const Ci = hexPt(b.C);
      const e = challenge(ctx, b.C, b.A0, b.A1);
      const e0 = hexSc(b.e0);
      const e1 = mod(e - e0);
      return mul(H, hexSc(b.s0)).equals(hexPt(b.A0).add(mul(Ci, e0))) && mul(H, hexSc(b.s1)).equals(hexPt(b.A1).add(mul(Ci.subtract(G), e1)));
    });
    let sum: Pt = Point.ZERO;
    for (let i = 0; i < BITS; i++) sum = sum.add(mul(hexPt(bits[i].C), 1n << BigInt(i)));
    return { bits: okBits, link: sum.equals(D) };
  } catch {
    return { bits: false, link: false };
  }
}

export interface EqProof {
  A: string;
  s: string;
}

/** Prove D = r*H (i.e. the committed value equals the public constant). Sigma protocol, Fiat-Shamir. */
export function eqProve(rD: bigint, Dhex: string, ctx: string): EqProof {
  const w = randScalar();
  const A = mul(H, w);
  const e = challenge(ctx, Dhex, ptHex(A));
  return { A: ptHex(A), s: scHex(w + e * rD) };
}

export function eqVerify(Dhex: string, proof: EqProof, ctx: string): boolean {
  try {
    const D = hexPt(Dhex);
    const e = challenge(ctx, Dhex, proof.A);
    return mul(H, hexSc(proof.s)).equals(hexPt(proof.A).add(mul(D, e)));
  } catch {
    return false;
  }
}

/** D for "v >= t": commits to v - t with blinding r. */
export function derivedGte(Chex: string, t: number): string {
  return ptHex(hexPt(Chex).subtract(mul(G, BigInt(t))));
}
/** D for "v <= t": commits to t - v with blinding -r. */
export function derivedLte(Chex: string, t: number): string {
  return ptHex(mul(G, BigInt(t)).subtract(hexPt(Chex)));
}
/** D for "v == k": commits to v - k with blinding r (equals r*H when the claim is true). */
export const derivedEq = derivedGte;

export const negScalar = (rHex: string): bigint => mod(-hexSc(rHex));
export const scalarOf = (rHex: string): bigint => hexSc(rHex);
export const isPointHex = (h: unknown): h is string => {
  if (typeof h !== "string" || !/^[0-9a-f]{66}$/.test(h)) return false;
  try {
    hexPt(h);
    return true;
  } catch {
    return false;
  }
};
export const isScalarHex = (h: unknown): h is string => typeof h === "string" && /^[0-9a-f]{64}$/.test(h);
export const sha256Hex = (s: string): string => bytesToHex(sha256(enc.encode(s)));

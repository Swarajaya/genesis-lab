/**
 * Post-quantum layer, built on standardised primitives from @noble/post-quantum:
 *   - ML-DSA-65 (FIPS 204) signatures: issuers co-sign every credential next to the classical Schnorr signature.
 *   - ML-KEM-768 (FIPS 203) key encapsulation: the holder seals the proof for the verifier (KEM + AES-256-GCM).
 * The zero-knowledge proofs themselves (Pedersen / sigma protocols) remain discrete-log based and are NOT post-quantum.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { schnorrSign, schnorrVerify, issuerKeysFromSeed } from "./zk";

const enc = new TextEncoder();
const dec = new TextDecoder();
const seedBytes = (label: string, n: number) => {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 32) out.set(sha256(enc.encode(`${label}/${i}`)).slice(0, Math.min(32, n - i)), i);
  return out;
};

export interface PqSigKeys {
  publicHex: string;
  secretHex: string;
}
export function pqSigKeysFromSeed(seed: string): PqSigKeys {
  const k = ml_dsa65.keygen(seedBytes(`genesis-lab/mldsa/${seed}`, 32));
  return { publicHex: bytesToHex(k.publicKey), secretHex: bytesToHex(k.secretKey) };
}
export const pqSign = (secretHex: string, message: string): string => bytesToHex(ml_dsa65.sign(enc.encode(message), hexToBytes(secretHex)));
export function pqVerify(publicHex: string, message: string, sigHex: string): boolean {
  try {
    return ml_dsa65.verify(hexToBytes(sigHex), enc.encode(message), hexToBytes(publicHex));
  } catch {
    return false;
  }
}

export interface KemKeys {
  publicHex: string;
  secretHex: string;
}
export function kemKeysFromSeed(seed: string): KemKeys {
  const k = ml_kem768.keygen(seedBytes(`genesis-lab/mlkem/${seed}`, 64));
  return { publicHex: bytesToHex(k.publicKey), secretHex: bytesToHex(k.secretKey) };
}

export interface Sealed {
  kemCt: string;
  iv: string;
  ct: string;
}

async function aesKey(shared: Uint8Array, nonce: string): Promise<CryptoKey> {
  const raw = sha256(new Uint8Array([...enc.encode(`genesis-lab/channel/v1|${nonce}|`), ...shared]));
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Holder side: encapsulate to the verifier's ML-KEM key, then AES-256-GCM encrypt the payload (AAD = nonce). */
export async function sealPayload(payload: string, kemPublicHex: string, nonce: string): Promise<Sealed> {
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(hexToBytes(kemPublicHex));
  const key = await aesKey(sharedSecret, nonce);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: enc.encode(nonce) as BufferSource }, key, enc.encode(payload) as BufferSource));
  return { kemCt: bytesToHex(cipherText), iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

/** Verifier side. Returns null when decapsulation or authentication fails. */
export async function openPayload(s: Sealed, kemSecretHex: string, nonce: string): Promise<string | null> {
  try {
    const shared = ml_kem768.decapsulate(hexToBytes(s.kemCt), hexToBytes(kemSecretHex));
    const key = await aesKey(shared, nonce);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(s.iv) as BufferSource, additionalData: enc.encode(nonce) as BufferSource }, key, hexToBytes(s.ct) as BufferSource);
    return dec.decode(pt);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ measured comparison

export interface BenchRow {
  operation: string;
  classical: { algorithm: string; ms: number; bytes: number; label: string };
  postQuantum: { algorithm: string; ms: number; bytes: number; label: string };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
function time<T>(runs: number, fn: () => T): { ms: number; last: T } {
  const t: number[] = [];
  let last!: T;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    last = fn();
    t.push(performance.now() - t0);
  }
  return { ms: Math.round(median(t) * 100) / 100, last };
}

/** Real timings and byte sizes, measured on the machine that runs it. Nothing here is a constant. */
export function benchmark(runs = 5): { rows: BenchRow[]; runs: number } {
  const msg = "genesis-lab/bench/message";
  const classical = issuerKeysFromSeed("bench");
  const kg = time(runs, () => issuerKeysFromSeed(`bench${Math.random()}`));
  const sg = time(runs, () => schnorrSign(classical.secretHex, msg));
  const sigC = schnorrSign(classical.secretHex, msg);
  const vf = time(runs, () => schnorrVerify(classical.publicHex, msg, sigC));

  const pk = pqSigKeysFromSeed("bench");
  const pkg = time(runs, () => pqSigKeysFromSeed(`bench${Math.random()}`));
  const psg = time(runs, () => pqSign(pk.secretHex, msg));
  const sigP = pqSign(pk.secretHex, msg);
  const pvf = time(runs, () => pqVerify(pk.publicHex, msg, sigP));

  // key agreement: ECDH (secp256k1) vs ML-KEM-768
  const a = secp256k1.keygen();
  const b = secp256k1.keygen();
  const ecdh = time(runs, () => secp256k1.getSharedSecret(a.secretKey, b.publicKey));
  const kem = ml_kem768.keygen();
  const encap = time(runs, () => ml_kem768.encapsulate(kem.publicKey));
  const ct = ml_kem768.encapsulate(kem.publicKey);
  const decap = time(runs, () => ml_kem768.decapsulate(ct.cipherText, kem.secretKey));

  const hex = (s: string) => s.length / 2;
  return {
    runs,
    rows: [
      { operation: "Signing key pair", classical: { algorithm: "Schnorr / secp256k1", ms: kg.ms, bytes: hex(classical.publicHex), label: "public key" }, postQuantum: { algorithm: "ML-DSA-65", ms: pkg.ms, bytes: hex(pk.publicHex), label: "public key" } },
      { operation: "Sign", classical: { algorithm: "Schnorr / secp256k1", ms: sg.ms, bytes: hex(sigC.R) + hex(sigC.s), label: "signature" }, postQuantum: { algorithm: "ML-DSA-65", ms: psg.ms, bytes: hex(sigP), label: "signature" } },
      { operation: "Verify", classical: { algorithm: "Schnorr / secp256k1", ms: vf.ms, bytes: hex(sigC.R) + hex(sigC.s), label: "signature" }, postQuantum: { algorithm: "ML-DSA-65", ms: pvf.ms, bytes: hex(sigP), label: "signature" } },
      { operation: "Key agreement (initiator)", classical: { algorithm: "ECDH / secp256k1", ms: ecdh.ms, bytes: b.publicKey.length, label: "public share" }, postQuantum: { algorithm: "ML-KEM-768 encapsulate", ms: encap.ms, bytes: ct.cipherText.length, label: "ciphertext" } },
      { operation: "Key agreement (responder)", classical: { algorithm: "ECDH / secp256k1", ms: ecdh.ms, bytes: a.publicKey.length, label: "public share" }, postQuantum: { algorithm: "ML-KEM-768 decapsulate", ms: decap.ms, bytes: kem.publicKey.length, label: "public key" } },
    ],
  };
}

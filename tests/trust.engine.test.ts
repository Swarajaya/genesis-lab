import { describe, expect, it } from "vitest";
import { issueCredential, type HeldCredential } from "@/lib/engines/trust/credentials";
import { CRED_IDS, DEFAULT_POLICY, VERIFIERS, compilePolicy, dayNumber, group, leaf, minimumDisclosure, todayIso, totalAttributeCount, validatePolicy, lifecycleOf, type CredId, type PolicyNode, type RegistryStatus } from "@/lib/engines/trust/model";
import { buildProof, ProveError } from "@/lib/engines/trust/prover";
import type { ChallengeInfo, ProofBundle, SecurityMode } from "@/lib/engines/trust/proof";
import { verifyBundle, type VerifyReport } from "@/lib/engines/trust/verifier";
import { benchmark, kemKeysFromSeed, openPayload, sealPayload } from "@/lib/engines/trust/pq";

const SEED = "unit-test-seed";
const NOW = Date.now();
const today = dayNumber(todayIso(NOW));

function vault(over: Partial<Record<CredId, Record<string, number>>> = {}): Record<CredId, HeldCredential> {
  const base: Record<CredId, Record<string, number>> = {
    ID: { dob: dayNumber("2001-04-12"), country: 1, expiry: today + 900 },
    UNI: { student: 1, degree: 2, gpa: 352, expiry: today + 700 },
    CERT: { level: 2, expiry: today + 400 },
    CLR: { level: 3, expiry: today + 300 },
  };
  const out = {} as Record<CredId, HeldCredential>;
  for (const c of CRED_IDS) out[c] = issueCredential(SEED, c, { ...base[c], ...(over[c] ?? {}) }, NOW);
  return out;
}

/** Minimal in-memory verifier service mirroring the API route. */
class Service {
  registry = new Map<string, RegistryStatus>();
  used = new Set<string>();
  register(v: Record<CredId, HeldCredential>) {
    for (const c of CRED_IDS) this.registry.set(v[c].handle, "active");
  }
  challenge(policy: PolicyNode, mode: SecurityMode = "classical", ttl = 30_000, now = NOW): ChallengeInfo {
    const asOf = todayIso(now);
    const asOfDay = dayNumber(asOf);
    const c = compilePolicy(policy, asOfDay);
    if (!c.ok) throw new Error("bad policy");
    return { nonce: Math.random().toString(16).slice(2).padEnd(32, "0"), asOf, asOfDay, iat: now, exp: now + ttl, verifierId: "lab", policy, policyHash: c.policyHash, mode };
  }
  verify(bundle: unknown, ch: ChallengeInfo | null, now = NOW + 1000): VerifyReport {
    const replayed = !!ch && this.used.has(ch.nonce);
    if (ch) this.used.add(ch.nonce);
    return verifyBundle({ bundle, challenge: ch, replayed, now, seed: SEED, registry: (h) => this.registry.get(h) });
  }
}
const stage = (r: VerifyReport, id: string) => r.stages.find((s) => s.id === id)?.state;

describe("policy compiler", () => {
  it("compiles the default policy to three claims and zero raw attributes", () => {
    const c = compilePolicy(DEFAULT_POLICY, today);
    expect(c.ok).toBe(true);
    expect(c.claims).toHaveLength(3);
    expect(c.policyHash).toMatch(/^[0-9a-f]{64}$/);
    const d = minimumDisclosure(c.claims, today);
    expect(d.rawDisclosed).toBe(0);
    expect(d.requiredClaims).toBe(3);
    expect(d.attributesTouched).toBe(3); // UNI.expiry, CERT.expiry, CLR.level
    expect(d.unnecessary).toBe(totalAttributeCount() - 3);
  });
  it("is deterministic and changes hash when the policy changes", () => {
    const a = compilePolicy(DEFAULT_POLICY, today).policyHash;
    expect(compilePolicy(DEFAULT_POLICY, today).policyHash).toBe(a);
    expect(compilePolicy(group("AND", DEFAULT_POLICY, leaf("student")), today).policyHash).not.toBe(a);
  });
  it("pushes NOT down and rejects NOT on registry claims", () => {
    const c = compilePolicy(leaf("clearance_gte", 2, undefined, true), today);
    expect(c.ok && c.claims[0].prim).toMatchObject({ kind: "lte", value: 1 });
    expect(compilePolicy(leaf("cred_active", undefined, "UNI", true), today).ok).toBe(false);
  });
  it("rejects unknown claims and oversized policies", () => {
    expect(validatePolicy({ t: "leaf", spec: "nope" }).ok).toBe(false);
    const many = group("AND", ...Array.from({ length: 20 }, () => leaf("student")));
    expect(validatePolicy(many).ok).toBe(false);
  });
});

describe("zero-knowledge composite proofs", () => {
  it("proves and verifies a composite policy without exposing raw values", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    const ch = svc.challenge(DEFAULT_POLICY);
    const bundle = buildProof(v, ch, { now: NOW });
    const json = JSON.stringify(bundle);
    // no secret openings or raw private values anywhere in the transmitted proof
    for (const c of CRED_IDS) for (const a of Object.values(v[c].attrs)) expect(json.includes(a.r)).toBe(false);
    expect(json).not.toMatch(/"(student|degree|gpa|level|dob|country)":\s*\d/); // no raw attribute values
    expect(json).not.toMatch(/fullName|universityName/);
    const r = svc.verify(bundle, ch);
    expect(r.stages.filter((s) => s.state !== "pass")).toEqual([]);
    expect(r.trust).toBe("VERIFIED");
    expect(r.learned.rawAttributesReceived).toBe(0);
  });
  it("supports eq, lte (age) and OR policies", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    const p = group("AND", leaf("age_gte", 18), leaf("student"), group("OR", leaf("clearance_gte", 5), leaf("cert_level_gte", 2)));
    const ch = svc.challenge(p);
    const r = svc.verify(buildProof(v, ch, { now: NOW }), ch);
    expect(r.trust).toBe("VERIFIED");
  });
  it("honest prover refuses a false statement", () => {
    const v = vault({ CLR: { level: 1 } });
    const ch = new Service().challenge(DEFAULT_POLICY);
    expect(() => buildProof(v, ch, { now: NOW })).toThrow(ProveError);
  });
  it("a forged proof for a false statement is rejected", () => {
    const v = vault({ CLR: { level: 1 } });
    const svc = new Service();
    svc.register(v);
    const ch = svc.challenge(DEFAULT_POLICY);
    const r = svc.verify(buildProof(v, ch, { now: NOW, cheat: true }), ch);
    expect(r.trust).toBe("REJECTED");
    expect(stage(r, "proof")).toBe("fail");
  });
});

describe("attacks produce real rejections", () => {
  function setup(policy: PolicyNode = DEFAULT_POLICY) {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    const ch = svc.challenge(policy);
    return { v, svc, ch, bundle: buildProof(v, ch, { now: NOW }) };
  }
  it("tamper proof", () => {
    const { svc, ch, bundle } = setup();
    const b = structuredClone(bundle) as ProofBundle;
    const key = Object.keys(b.claims).find((k) => b.claims[k].zk?.type === "range") as string;
    const z = b.claims[key].zk as { type: "range"; bits: { s0: string }[] };
    z.bits[3].s0 = z.bits[3].s0.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
    const r = svc.verify(b, ch);
    expect(r.trust).toBe("REJECTED");
    expect(stage(r, "proof")).toBe("fail");
    expect(stage(r, "signature")).toBe("pass");
  });
  it("alter claim", () => {
    const { svc, ch, bundle } = setup();
    const b = structuredClone(bundle) as ProofBundle;
    const k = Object.keys(b.claims).find((x) => b.claims[x].claim.kind === "gte" && "attr" in b.claims[x].claim && (b.claims[x].claim as { attr: string }).attr === "level") as string;
    (b.claims[k].claim as { value: number }).value = 0;
    const r = svc.verify(b, ch);
    expect(stage(r, "claim")).toBe("fail");
    expect(r.trust).toBe("REJECTED");
  });
  it("modify private value", () => {
    const v = vault({ CLR: { level: 1 } });
    const svc = new Service();
    svc.register(v);
    const ch = svc.challenge(DEFAULT_POLICY);
    const r = svc.verify(buildProof(v, ch, { now: NOW, assume: { "CLR.level": 5 } }), ch);
    expect(r.trust).toBe("REJECTED");
    expect(stage(r, "commitment")).toBe("fail");
  });
  it("replay", () => {
    const { svc, ch, bundle } = setup();
    expect(svc.verify(bundle, ch).trust).toBe("VERIFIED");
    const again = svc.verify(bundle, ch);
    expect(again.trust).toBe("REJECTED");
    expect(again.replay).toBe(true);
    expect(again.stages.find((s) => s.id === "nonce")?.detail).toMatch(/REPLAY/);
  });
  it("expired proof", () => {
    const { svc, ch, bundle } = setup();
    const r = svc.verify(bundle, ch, NOW + 31_000);
    expect(stage(r, "expiration")).toBe("fail");
    expect(r.trust).toBe("REJECTED");
  });
  it("revoked, suspended and reinstated credentials", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    svc.registry.set(v.CLR.handle, "revoked");
    svc.registry.set(v.UNI.handle, "suspended");
    const ch = svc.challenge(DEFAULT_POLICY);
    const r = svc.verify(buildProof(v, ch, { now: NOW }), ch);
    expect(stage(r, "revocation")).toBe("fail");
    expect(stage(r, "proof")).toBe("pass");
    expect(r.trust).toBe("REJECTED");
    svc.registry.set(v.UNI.handle, "active");
    svc.registry.set(v.CLR.handle, "active");
    const ch2 = svc.challenge(DEFAULT_POLICY);
    expect(svc.verify(buildProof(v, ch2, { now: NOW }), ch2).trust).toBe("VERIFIED");
  });
  it("notRevoked tolerates suspension but not revocation", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    svc.registry.set(v.CLR.handle, "suspended");
    const p = leaf("cred_not_revoked", undefined, "CLR");
    let ch = svc.challenge(p);
    expect(svc.verify(buildProof(v, ch, { now: NOW }), ch).trust).toBe("VERIFIED");
    svc.registry.set(v.CLR.handle, "revoked");
    ch = svc.challenge(p);
    expect(svc.verify(buildProof(v, ch, { now: NOW }), ch).trust).toBe("REJECTED");
  });
  it("expired credential cannot be proven active", () => {
    const v = vault({ UNI: { expiry: today - 3 } });
    const ch = new Service().challenge(leaf("cred_active", undefined, "UNI"));
    expect(() => buildProof(v, ch, { now: NOW })).toThrow(ProveError);
    const svc = new Service();
    svc.register(v);
    const forged = svc.verify(buildProof(v, ch, { now: NOW, cheat: true }), ch);
    expect(forged.trust).toBe("REJECTED");
    expect(lifecycleOf(today - 3, today, "active")).toBe("EXPIRED");
  });
  it("change signature", () => {
    const { svc, ch, bundle } = setup();
    const b = structuredClone(bundle) as ProofBundle;
    const p = Object.values(b.presentations)[0]!;
    p.sig = { ...p.sig, s: "0".repeat(63) + "1" };
    const r = svc.verify(b, ch);
    expect(stage(r, "signature")).toBe("fail");
  });
  it("wrong nonce", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    const ch = svc.challenge(DEFAULT_POLICY);
    const bad = buildProof(v, { ...ch, nonce: "f".repeat(32) }, { now: NOW });
    const r = svc.verify(bad, ch);
    expect(stage(r, "nonce")).toBe("fail");
    expect(r.trust).toBe("REJECTED");
  });
  it("invalid proof", () => {
    const { svc, ch } = setup();
    const r = svc.verify({ hello: "world" }, ch);
    expect(stage(r, "structure")).toBe("fail");
    expect(r.trust).toBe("REJECTED");
    expect(svc.verify(null, svc.challenge(DEFAULT_POLICY)).trust).toBe("REJECTED");
  });
  it("policy change invalidates an old proof; a new proof verifies", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    const A: PolicyNode = leaf("student");
    const B: PolicyNode = group("AND", leaf("student"), leaf("clearance_gte", 2));
    const chA = svc.challenge(A);
    const proofA = buildProof(v, chA, { now: NOW });
    expect(svc.verify(proofA, chA).trust).toBe("VERIFIED");
    const chB = svc.challenge(B);
    const old = svc.verify(proofA, chB);
    expect(old.trust).toBe("REJECTED");
    expect(stage(old, "nonce")).toBe("fail");
    expect(stage(old, "claim")).toBe("fail");
    const chB2 = svc.challenge(B);
    expect(svc.verify(buildProof(v, chB2, { now: NOW }), chB2).trust).toBe("VERIFIED");
  });
  it("proof for verifier presets", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    for (const p of VERIFIERS) {
      const ch = svc.challenge(p.policy);
      expect(svc.verify(buildProof(v, ch, { now: NOW }), ch).trust).toBe("VERIFIED");
    }
  });
});

describe("post-quantum layer", () => {
  it("hybrid mode requires and verifies ML-DSA-65 co-signatures", () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    const ch = svc.challenge(DEFAULT_POLICY, "hybrid-pq");
    const b = buildProof(v, ch, { now: NOW });
    expect(Object.values(b.presentations).every((p) => !!p?.pqSig)).toBe(true);
    expect(verifyBundle({ bundle: b, challenge: ch, replayed: false, now: NOW + 500, seed: SEED, registry: (h) => svc.registry.get(h), channel: { required: true, ok: true } }).trust).toBe("VERIFIED");
    // stripping the PQ signature breaks hybrid verification
    const ch2 = svc.challenge(DEFAULT_POLICY, "hybrid-pq");
    const b2 = buildProof(v, ch2, { now: NOW });
    for (const p of Object.values(b2.presentations)) delete p!.pqSig;
    const r = verifyBundle({ bundle: b2, challenge: ch2, replayed: false, now: NOW + 500, seed: SEED, registry: (h) => svc.registry.get(h), channel: { required: true, ok: true } });
    expect(stage(r, "signature")).toBe("fail");
  });
  it("ML-KEM sealed channel round-trips and rejects tampering", async () => {
    const k = kemKeysFromSeed("t");
    const s = await sealPayload('{"a":1}', k.publicHex, "nonce1");
    expect(await openPayload(s, k.secretHex, "nonce1")).toBe('{"a":1}');
    expect(await openPayload(s, k.secretHex, "nonce2")).toBeNull();
    expect(await openPayload({ ...s, ct: s.ct.replace(/.$/, (c) => (c === "0" ? "1" : "0")) }, k.secretHex, "nonce1")).toBeNull();
  });
  it("benchmark reports measured sizes", () => {
    const b = benchmark(2);
    const sign = b.rows.find((r) => r.operation === "Sign")!;
    expect(sign.postQuantum.bytes).toBe(3309); // ML-DSA-65 signature size
    expect(sign.classical.bytes).toBe(65);
  });
});

import { ATTACKS, alterClaim, breakSignature, invalidBundle, mutatePolicy, tamperBundle } from "@/lib/engines/trust/attacks";

describe("attack mutators hit the expected verifier stage", () => {
  const mk = () => {
    const v = vault();
    const svc = new Service();
    svc.register(v);
    const ch = svc.challenge(DEFAULT_POLICY);
    return { svc, ch, b: buildProof(v, ch, { now: NOW }), v };
  };
  const cases: [string, (b: ProofBundle) => ProofBundle][] = [
    ["tamper", tamperBundle],
    ["alter", alterClaim],
    ["signature", breakSignature],
  ];
  for (const [id, fn] of cases) {
    it(id, () => {
      const { svc, ch, b } = mk();
      const r = svc.verify(fn(b), ch);
      expect(r.trust).toBe("REJECTED");
      expect(stage(r, ATTACKS.find((a) => a.id === id)!.stage)).toBe("fail");
    });
  }
  it("invalid", () => {
    const { svc, ch } = mk();
    expect(stage(svc.verify(invalidBundle(), ch), "structure")).toBe("fail");
  });
  it("policy mutation compiles and breaks an old proof", () => {
    const { svc, b } = mk();
    const ch2 = svc.challenge(mutatePolicy(DEFAULT_POLICY));
    const r = svc.verify(b, ch2);
    expect(r.trust).toBe("REJECTED");
    expect(stage(r, "claim")).toBe("fail");
  });
});

import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => {
  const store = new Map<string, string>();
  return { cookies: async () => ({ get: (k: string) => (store.has(k) ? { value: store.get(k) } : undefined), set: (k: string, v: string) => void store.set(k, v), delete: (k: string) => void store.delete(k) }) };
});

import { POST } from "@/app/api/trust/route";
import type { HeldCredential } from "@/lib/engines/trust/credentials";
import { CRED_IDS, DEFAULT_POLICY, VERIFIERS, dayNumber, todayIso, type CredId } from "@/lib/engines/trust/model";
import { buildProof } from "@/lib/engines/trust/prover";
import { sealPayload } from "@/lib/engines/trust/pq";
import type { ChallengeInfo } from "@/lib/engines/trust/proof";
import type { VerifyReport } from "@/lib/engines/trust/verifier";
import { mutatePolicy } from "@/lib/engines/trust/attacks";

let n = 0;
async function call<T>(body: unknown): Promise<{ status: number; data: T; error?: { code: string; message: string } }> {
  const res = await POST(new Request("http://x/api/trust", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++n % 250}` }, body: JSON.stringify(body) }));
  const j = await res.json();
  return { status: res.status, data: j.data as T, error: j.error };
}
const today = dayNumber(todayIso());
const values: Record<CredId, Record<string, number>> = {
  ID: { dob: dayNumber("2001-04-12"), country: 1, expiry: today + 900 },
  UNI: { student: 1, degree: 2, gpa: 352, expiry: today + 700 },
  CERT: { level: 2, expiry: today + 400 },
  CLR: { level: 3, expiry: today + 300 },
};
const vault: Partial<Record<CredId, HeldCredential>> = {};
const stage = (r: VerifyReport, id: string) => r.stages.find((s) => s.id === id)?.state;
type Ch = { info: ChallengeInfo; token: string; kemPublicHex: string | null };
const challenge = async (policy: unknown, mode: "classical" | "hybrid-pq" = "classical") => (await call<Ch>({ action: "challenge", verifierId: "lab", policy, mode })).data;
const verify = async (token: string, bundle: unknown) => (await call<{ report: VerifyReport }>({ action: "verify", challengeToken: token, bundle })).data.report;

beforeAll(async () => {
  for (const c of CRED_IDS) vault[c] = (await call<{ credential: HeldCredential }>({ action: "issue", cred: c, values: values[c] })).data.credential;
});

describe("trust API (real route, in-process)", () => {
  it("config reports issuers", async () => {
    const r = await call<{ issuers: unknown[] }>({ action: "config" });
    expect(r.data.issuers).toHaveLength(4);
  });
  it("rejects out-of-range issuance", async () => {
    const r = await call({ action: "issue", cred: "CLR", values: { level: 99, expiry: 1 } });
    expect(r.status).toBe(400);
  });
  it("full flow: verify, replay, revoke, reinstate", async () => {
    const ch = await challenge(DEFAULT_POLICY);
    const bundle = buildProof(vault, ch.info);
    const ok = await verify(ch.token, bundle);
    expect(ok.trust).toBe("VERIFIED");
    const replay = await verify(ch.token, bundle);
    expect(replay.replay).toBe(true);
    expect(replay.trust).toBe("REJECTED");

    const clr = vault.UNI!.handle; // DEFAULT_POLICY requires UNI to be active
    expect((await call({ action: "registry", op: "set", handle: clr, status: "revoked" })).status).toBe(200);
    const ch2 = await challenge(DEFAULT_POLICY);
    const r2 = await verify(ch2.token, buildProof(vault, ch2.info));
    expect(stage(r2, "revocation")).toBe("fail");
    await call({ action: "registry", op: "set", handle: clr, status: "active" });
    const ch3 = await challenge(DEFAULT_POLICY);
    expect((await verify(ch3.token, buildProof(vault, ch3.info))).trust).toBe("VERIFIED");
  });
  it("unknown credential handle cannot be modified", async () => {
    const r = await call({ action: "registry", op: "set", handle: "a".repeat(64), status: "revoked" });
    expect(r.status).toBe(404);
  });
  it("a forged challenge token is rejected at the nonce stage", async () => {
    const ch = await challenge(DEFAULT_POLICY);
    const b = buildProof(vault, ch.info);
    const forged = ch.token.slice(0, -4) + "AAAA";
    const r = await verify(forged, b);
    expect(stage(r, "nonce")).toBe("fail");
  });
  it("policy change: old proof fails, new proof passes", async () => {
    const chA = await challenge(DEFAULT_POLICY);
    const proofA = buildProof(vault, chA.info);
    expect((await verify(chA.token, proofA)).trust).toBe("VERIFIED");
    const chB = await challenge(mutatePolicy(DEFAULT_POLICY));
    expect((await verify(chB.token, proofA)).trust).toBe("REJECTED");
    const chB2 = await challenge(mutatePolicy(DEFAULT_POLICY));
    expect((await verify(chB2.token, buildProof(vault, chB2.info))).trust).toBe("VERIFIED");
  });
  it("hybrid post-quantum: sealed ML-KEM channel + ML-DSA co-signatures", async () => {
    const ch = await challenge(VERIFIERS[1].policy, "hybrid-pq");
    expect(ch.kemPublicHex).toBeTruthy();
    const bundle = buildProof(vault, ch.info);
    const sealed = await sealPayload(JSON.stringify(bundle), ch.kemPublicHex!, ch.info.nonce);
    const r = (await call<{ report: VerifyReport }>({ action: "verify", challengeToken: ch.token, sealed })).data.report;
    expect(r.trust).toBe("VERIFIED");
    expect(stage(r, "channel")).toBe("pass");
    // plaintext submission in hybrid mode is refused
    const ch2 = await challenge(VERIFIERS[1].policy, "hybrid-pq");
    const r2 = await verify(ch2.token, buildProof(vault, ch2.info));
    expect(stage(r2, "channel")).toBe("fail");
    expect(r2.trust).toBe("REJECTED");
  });
  it("expired challenge fails the expiration stage", async () => {
    const real = Date.now;
    const ch = await challenge(DEFAULT_POLICY);
    const b = buildProof(vault, ch.info);
    Date.now = () => real() + 31_000;
    try {
      expect(stage(await verify(ch.token, b), "expiration")).toBe("fail");
    } finally {
      Date.now = real;
    }
  });
  it("natural-language parsing falls back to the rule parser and compiles", async () => {
    const r = await call<{ policy: unknown; source: string }>({ action: "parse", text: "Allow access only to users with a valid university credential, active research certification and clearance level of at least 2." });
    expect(r.data.source).toBe("rules");
    const c = await call<Ch>({ action: "challenge", verifierId: "x", policy: r.data.policy, mode: "classical" });
    expect(c.status).toBe(200);
  });
  it("explain degrades gracefully without AI keys", async () => {
    const r = await call<{ explanation: unknown; note: string }>({ action: "explain", kind: "verification", facts: { policy: "p", trust: "VERIFIED", stages: [{ label: "Proof", state: "pass", detail: "ok" }] } });
    expect(r.data.explanation).toBeNull();
    expect(r.data.note).toMatch(/unavailable/);
  });
  it("pqbench returns measured rows", async () => {
    const r = await call<{ rows: { postQuantum: { bytes: number } }[] }>({ action: "pqbench" });
    expect(r.data.rows.length).toBeGreaterThan(3);
  });
});

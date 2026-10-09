import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { control, displayState, issue, spend, sync, updatePolicy, validateDraft, verifyChain, type PolicyDraft, type TxnRequest } from "./policy";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const T0 = Date.UTC(2026, 9, 9, 10, 0, 0);
const draft = (o: Partial<PolicyDraft> = {}): PolicyDraft => ({ amountPaise: 150_000, recipientType: "STUDENT", recipientId: "STUDENT-042", purposes: ["FOOD", "TRANSPORT"], maxTxnPaise: 40_000, expiresInSeconds: 60, allocations: {}, merchants: [], ...o });
const req = (amountRupees: number, purpose: TxnRequest["purpose"] = "FOOD", recipient = "STUDENT-042", merchant = "Canteen"): TxnRequest => ({ amountPaise: amountRupees * 100, purpose, recipient, merchant });
const fresh = (o: Partial<PolicyDraft> = {}) => issue(draft(o), { walletId: "w1", policyId: "POL-1", nowMs: T0 }, hash).wallet;

describe("issue", () => {
  it("emits ISSUE then ACTIVATE and lands ACTIVE", () => {
    const r = issue(draft(), { walletId: "w1", policyId: "POL-1", nowMs: T0 }, hash);
    expect(r.events.map((e) => e.type)).toEqual(["ISSUE", "ACTIVATE"]);
    expect(r.wallet.status).toBe("ACTIVE");
    expect(r.wallet.policy.maxTransactionPaise).toBe(40_000);
    expect(Date.parse(r.wallet.policy.expiresAt) - T0).toBe(60_000);
  });
  it("rejects conflicting allocations deterministically", () => {
    const c = validateDraft(draft({ amountPaise: 50_000, allocations: { FOOD: 40_000, TRANSPORT: 30_000 } }));
    expect(c[0].code).toBe("ALLOCATION_OVERFLOW");
    expect(c[0].allocatedPaise).toBe(70_000);
    expect(() => issue(draft({ amountPaise: 50_000, allocations: { FOOD: 40_000, TRANSPORT: 30_000 } }), { walletId: "w", policyId: "p", nowMs: T0 }, hash)).toThrow();
  });
});

describe("verification", () => {
  it("approves a valid spend and deducts balance", () => {
    const r = spend(fresh(), req(300), T0 + 1000, hash);
    expect(r.verification.decision).toBe("APPROVED");
    expect(r.wallet.balancePaise).toBe(120_000);
    expect(r.wallet.status).toBe("PARTIALLY_SPENT");
  });
  it("rejects limit, purpose, recipient with exact codes and no balance change", () => {
    const w = fresh();
    expect(spend(w, req(600), T0, hash).events[0].reason).toBe("LIMIT_VIOLATION");
    expect(spend(w, req(100, "ELECTRONICS"), T0, hash).events[0].reason).toBe("PURPOSE_VIOLATION");
    expect(spend(w, req(100, "FOOD", "STUDENT-091"), T0, hash).events[0].reason).toBe("RECIPIENT_VIOLATION");
    const r = spend(w, req(600), T0, hash);
    expect(r.wallet.balancePaise).toBe(150_000);
    expect(r.wallet.rejected).toBe(1);
    expect(r.events[0].trace?.failedRule).toBe("MAX_TRANSACTION");
  });
  it("rejects over balance", () => {
    let w = fresh({ amountPaise: 50_000, maxTxnPaise: 50_000 });
    w = spend(w, req(400), T0, hash).wallet;
    expect(spend(w, req(200), T0, hash).events[0].reason).toBe("INSUFFICIENT_BALANCE");
  });
  it("enforces allocations", () => {
    let w = fresh({ amountPaise: 200_000, maxTxnPaise: 100_000, allocations: { FOOD: 100_000, TRANSPORT: 50_000 } });
    w = spend(w, req(800), T0, hash).wallet;
    expect(spend(w, req(300), T0, hash).events[0].reason).toBe("ALLOCATION_VIOLATION");
    expect(spend(w, req(200), T0, hash).verification.decision).toBe("APPROVED");
  });
  it("enforces merchant allow-list", () => {
    const w = fresh({ merchants: ["Campus Canteen"] });
    expect(spend(w, req(100, "FOOD", "STUDENT-042", "Elsewhere"), T0, hash).events[0].reason).toBe("MERCHANT_VIOLATION");
    expect(spend(w, req(100, "FOOD", "STUDENT-042", "campus canteen"), T0, hash).verification.decision).toBe("APPROVED");
  });
});

describe("lifecycle", () => {
  it("depletes", () => {
    let w = fresh({ amountPaise: 50_000, maxTxnPaise: 50_000 });
    w = spend(w, req(500), T0, hash).wallet;
    expect(w.status).toBe("DEPLETED");
    expect(spend(w, req(1), T0, hash).events[0].reason).toBe("STATE_VIOLATION");
  });
  it("suspend blocks, resume restores, revoke is terminal", () => {
    let w = fresh();
    w = control(w, "SUSPEND", T0, hash).wallet;
    expect(spend(w, req(100), T0, hash).events[0].reason).toBe("STATE_VIOLATION");
    w = control(w, "RESUME", T0, hash).wallet;
    expect(w.status).toBe("ACTIVE");
    expect(spend(w, req(100), T0, hash).verification.decision).toBe("APPROVED");
    w = control(w, "REVOKE", T0, hash).wallet;
    expect(w.status).toBe("REVOKED");
    expect(() => control(w, "RESUME", T0, hash)).toThrow();
    expect(spend(w, req(100), T0, hash).events[0].reason).toBe("STATE_VIOLATION");
  });
  it("resume after partial spend returns PARTIALLY_SPENT", () => {
    let w = spend(fresh(), req(100), T0, hash).wallet;
    w = control(w, "SUSPEND", T0, hash).wallet;
    expect(control(w, "RESUME", T0, hash).wallet.status).toBe("PARTIALLY_SPENT");
  });
});

describe("expiry", () => {
  it("records EXPIRE and rejects with EXPIRATION_VIOLATION after the timestamp", () => {
    const w = fresh();
    expect(displayState(w.status, w.policy.expiresAt, T0 + 59_999)).toBe("ACTIVE");
    expect(displayState(w.status, w.policy.expiresAt, T0 + 60_000)).toBe("EXPIRED");
    const r = spend(w, req(100), T0 + 61_000, hash);
    expect(r.events.map((e) => e.type)).toEqual(["EXPIRE", "SPEND"]);
    expect(r.events[1].reason).toBe("EXPIRATION_VIOLATION");
    expect(r.wallet.status).toBe("EXPIRED");
  });
  it("sync is idempotent", () => {
    const a = sync(fresh(), T0 + 61_000, hash);
    expect(a.events).toHaveLength(1);
    expect(sync(a.wallet, T0 + 62_000, hash).events).toHaveLength(0);
  });
  it("does not expire before the timestamp", () => {
    expect(sync(fresh(), T0 + 30_000, hash).events).toHaveLength(0);
  });
});

describe("versioning and ledger", () => {
  it("creates v2 and old events keep v1", () => {
    let w = fresh();
    const a = spend(w, req(100), T0, hash);
    w = a.wallet;
    const u = updatePolicy(w, draft({ purposes: ["FOOD", "TRANSPORT", "HEALTH"] }), true, T0 + 1000, hash);
    expect(u.wallet.policy.policyVersion).toBe(2);
    expect(u.wallet.policies).toHaveLength(2);
    expect(a.events[0].policyVersion).toBe(1);
    expect(spend(u.wallet, req(100, "HEALTH"), T0 + 2000, hash).events[0].policyVersion).toBe(2);
  });
  it("rejects allocation below spent in an update", () => {
    let w = fresh({ allocations: { FOOD: 100_000 } });
    w = spend(w, req(300), T0, hash).wallet;
    expect(() => updatePolicy(w, draft({ allocations: { FOOD: 10_000 } }), true, T0, hash)).toThrow();
  });
  it("hash chain verifies and detects tampering", () => {
    const evs = [] as ReturnType<typeof issue>["events"];
    const i = issue(draft(), { walletId: "w", policyId: "p", nowMs: T0 }, hash);
    evs.push(...i.events);
    const s = spend(i.wallet, req(600), T0 + 1, hash);
    evs.push(...s.events);
    expect(verifyChain(evs, hash).valid).toBe(true);
    const bad = evs.map((e) => ({ ...e }));
    bad[2] = { ...bad[2], result: "APPROVED" };
    expect(verifyChain(bad, hash)).toEqual({ valid: false, brokenAt: 2 });
  });
});

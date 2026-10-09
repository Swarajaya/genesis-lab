import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONSTRAINTS, DEMO_DONORS, evaluateDonor, rankDonors, type Recipient } from "@/lib/engines/blood/engine";
import { entryPayload, evaluate, lifecycle, verifyChain, type LedgerEntry, type MoneyRule } from "@/lib/engines/money/engine";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const recipient: Recipient = { abo: "A", rh: "+", antibodies: [], unitsNeeded: 2, urgency: "urgent", chronicTransfusion: false };

describe("blood compatibility", () => {
  it("rejects ABO-incompatible donors and ranks compatible ones first", () => {
    const ranked = rankDonors(recipient, DEMO_DONORS, DEFAULT_CONSTRAINTS);
    const b = ranked.find((r) => r.donor.code === "D-105");
    expect(b?.verdict).toBe("INCOMPATIBLE");
    expect(ranked[0].verdict).toBe("MATCH");
    expect(ranked[ranked.length - 1].verdict).toBe("INCOMPATIBLE");
  });

  it("fails donors carrying an antigen the recipient has an antibody against", () => {
    const r: Recipient = { ...recipient, abo: "O", rh: "-", antibodies: ["anti-K"] };
    const kPos = DEMO_DONORS.find((d) => d.code === "D-109")!;
    const res = evaluateDonor(r, kPos, DEFAULT_CONSTRAINTS);
    expect(res.verdict).toBe("INCOMPATIBLE");
    expect(res.factors.find((f) => f.id === "antibody")?.status).toBe("fail");
  });

  it("Rh mismatch is incompatible unless the emergency override is enabled (then partial)", () => {
    const r: Recipient = { ...recipient, abo: "O", rh: "-" };
    const donor = DEMO_DONORS.find((d) => d.code === "D-102")!;
    expect(evaluateDonor(r, donor, DEFAULT_CONSTRAINTS).verdict).toBe("INCOMPATIBLE");
    expect(evaluateDonor(r, donor, { ...DEFAULT_CONSTRAINTS, allowRhMismatch: true }).verdict).toBe("PARTIAL");
  });

  it("critical urgency rejects far donors by transport window", () => {
    const r: Recipient = { ...recipient, urgency: "critical" };
    const far = { ...DEMO_DONORS[0], code: "FAR", distanceKm: 40 };
    expect(evaluateDonor(r, far, { ...DEFAULT_CONSTRAINTS, maxDistanceKm: 100 }).factors.find((f) => f.id === "distance")?.status).toBe("fail");
  });

  it("insufficient units gives a partial match", () => {
    const r: Recipient = { ...recipient, abo: "AB", unitsNeeded: 5 };
    const res = evaluateDonor(r, DEMO_DONORS.find((d) => d.code === "D-107")!, DEFAULT_CONSTRAINTS);
    expect(res.verdict).toBe("PARTIAL");
  });
});

describe("expiry money rules", () => {
  const issued = Date.parse("2026-10-05T00:00:00Z");
  const rule: MoneyRule = {
    allowedCategories: ["food"],
    recipientType: "student",
    maxPerTxnPaise: 50000,
    issuedAt: new Date(issued).toISOString(),
    expiresAt: new Date(issued + 48 * 3600_000).toISOString(),
  };
  const txn = (amountPaise: number, category: "food" | "electronics") => ({ amountPaise, category, merchant: "Shop", spenderType: "student" as const });

  it("approves ₹300 food", () => {
    expect(evaluate(rule, txn(30000, "food"), 100000, issued + 3600_000).decision).toBe("APPROVED");
  });
  it("rejects ₹700 electronics with every reason", () => {
    const e = evaluate(rule, txn(70000, "electronics"), 100000, issued + 3600_000);
    expect(e.decision).toBe("REJECTED");
    expect(e.reasons.length).toBe(2);
  });
  it("rejects after expiry", () => {
    expect(evaluate(rule, txn(50000, "food"), 100000, issued + 49 * 3600_000).decision).toBe("REJECTED");
    expect(lifecycle(rule, 100000, issued + 49 * 3600_000)).toBe("EXPIRED");
  });
  it("rejects wrong recipient and insufficient balance", () => {
    expect(evaluate(rule, { ...txn(1000, "food"), spenderType: "worker" }, 100000, issued).decision).toBe("REJECTED");
    expect(evaluate(rule, txn(30000, "food"), 1000, issued).decision).toBe("REJECTED");
  });
  it("lifecycle moves to EXPIRING near the end", () => {
    expect(lifecycle(rule, 100000, issued + 40 * 3600_000)).toBe("EXPIRING");
    expect(lifecycle(rule, 100000, issued)).toBe("ACTIVE");
  });
  it("hash chain detects tampering", () => {
    const build = (prev: string | null, amt: number, bal: number): LedgerEntry => {
      const base = { walletId: "w", amountPaise: amt, category: "food", merchant: "m", decision: "APPROVED" as const, evaluatedAt: "t", balanceAfterPaise: bal, prevHash: prev };
      return { ...base, entryHash: sha(entryPayload(base)) };
    };
    const e1 = build(null, 100, 900);
    const e2 = build(e1.entryHash, 200, 700);
    expect(verifyChain([e1, e2], sha).valid).toBe(true);
    expect(verifyChain([{ ...e1, amountPaise: 1 }, e2], sha).valid).toBe(false);
  });
});

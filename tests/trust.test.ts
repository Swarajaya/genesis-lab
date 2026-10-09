import { describe, expect, it } from "vitest";
import { cutoffDay, daysSince1900, issuerKeysFromSeed, issueCredential, proveAge, verifyAge } from "@/lib/engines/trust/zk";

const issuer = issuerKeysFromSeed("test");
const asOf = "2026-10-05";
const nonce = "n-123";

function run(dob: string, tamper?: (p: ReturnType<typeof proveAge>) => void, cheat = false) {
  const cred = issueCredential(issuer, dob);
  const proof = proveAge(cred, 18, asOf, nonce, { cheat });
  tamper?.(proof);
  return { cred, report: verifyAge({ issuerPublicHex: issuer.publicHex, C: cred.C, sig: cred.sig, proof, expectedAsOf: asOf, expectedNonce: nonce }) };
}

describe("trust: age range proof", () => {
  it("date helpers", () => {
    expect(daysSince1900("1900-01-02")).toBe(1);
    expect(cutoffDay("2026-10-05", 18)).toBe(daysSince1900("2008-10-05"));
  });

  it("accepts an honest adult proof", () => {
    expect(run("1999-04-12").report.valid).toBe(true);
  });

  it("accepts someone who turns 18 today and rejects the day before", () => {
    expect(run("2008-10-05").report.valid).toBe(true);
    expect(() => run("2008-10-06")).toThrow();
  });

  it("honest prover refuses to prove a false statement", () => {
    expect(() => run("2015-01-01")).toThrow(/cannot prove/);
  });

  it("rejects a cheating minor", () => {
    const { report } = run("2012-01-01", undefined, true);
    expect(report.valid).toBe(false);
    expect(report.checks.find((c) => c.id === "sum")?.ok).toBe(false);
  });

  it("rejects tampered proofs, wrong nonce and forged issuer signatures", () => {
    expect(run("1990-01-01", (p) => (p.bits[3].s0 = p.bits[3].s1)).report.valid).toBe(false);
    const cred = issueCredential(issuer, "1990-01-01");
    const proof = proveAge(cred, 18, asOf, nonce);
    expect(verifyAge({ issuerPublicHex: issuer.publicHex, C: cred.C, sig: cred.sig, proof, expectedAsOf: asOf, expectedNonce: "other" }).valid).toBe(false);
    const other = issuerKeysFromSeed("evil");
    expect(verifyAge({ issuerPublicHex: other.publicHex, C: cred.C, sig: cred.sig, proof, expectedAsOf: asOf, expectedNonce: nonce }).valid).toBe(false);
  });

  it("proof does not contain the birth date or blinding factor", () => {
    const cred = issueCredential(issuer, "1990-01-01");
    const blob = JSON.stringify(proveAge(cred, 18, asOf, nonce));
    expect(blob).not.toContain(cred.r);
    expect(blob).not.toContain("1990-01-01");
  });
});

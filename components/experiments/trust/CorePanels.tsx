"use client";
import { useMemo } from "react";
import { CREDS, describePrim, isLife, leafLabel, type PolicyNode, type Prim } from "@/lib/engines/trust/model";
import type { StageId, VerifyReport } from "@/lib/engines/trust/verifier";
import type { TrustLab } from "./useTrustLab";
import { Btn, Masked, Panel, Pill, Stat, TONE, hhmmss, type Tone } from "./ui";

function leaves(n: PolicyNode, out: string[] = []): string[] {
  if (n.t === "leaf") out.push(leafLabel(n));
  else n.children.forEach((c) => leaves(c, out));
  return out;
}
const constraint = (p: Prim): string => {
  if (isLife(p)) return p.kind === "notRevoked" ? "Registry lookup of the credential handle (no zero-knowledge part)" : `Range proof: ${p.cred}.expiry − today ∈ [0, 2¹⁶) + registry status = active`;
  if (p.kind === "eq") return `Σ-proof of knowledge: C(${p.cred}.${p.attr}) − ${p.value}·G = r·H`;
  if (p.kind === "gte") return `Range proof: ${p.cred}.${p.attr} − ${p.value} ∈ [0, 2¹⁶), 16 bit OR-proofs`;
  return `Range proof: ${p.value} − ${p.cred}.${p.attr} ∈ [0, 2¹⁶), 16 bit OR-proofs`;
};

export function CompilerPanel({ lab }: { lab: TrustLab }) {
  const c = lab.compiled;
  const d = lab.disclosure;
  const steps = useMemo(() => {
    const ls = leaves(lab.policy);
    return [
      { k: "Natural language", v: lab.parseNote ?? "Optional: typed requirement parsed into conditions", on: true },
      { k: "Claim extraction", v: ls.join(" · "), on: true },
      { k: "Logical expression", v: c.ok ? c.expression : "—", on: c.ok },
      { k: "Policy validation", v: c.ok ? "Operators, parameters, depth and negations valid" : c.errors.map((e) => e.message).join(" "), on: c.ok },
      { k: "Cryptographic constraints", v: c.ok ? c.claims.map((x) => constraint(x.prim)).join("\n") : "—", on: c.ok },
      { k: "Proof requirements", v: c.ok ? `${c.claims.length} claim${c.claims.length === 1 ? "" : "s"} · ${c.credentials.length} credential${c.credentials.length === 1 ? "" : "s"} presented as signed commitments${c.hasOr ? " · OR branch choice is revealed" : ""}` : "—", on: c.ok },
    ];
  }, [lab.policy, lab.parseNote, c]);
  return (
    <Panel title="Policy compiler" kicker="Language → logic → cryptography" accent="#7be0d0" right={<Pill tone={c.ok ? "ok" : "bad"}>{c.ok ? "Policy compiled ✓" : "Invalid"}</Pill>}>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.k} className="grid grid-cols-[1.4rem_1fr] gap-2">
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border font-mono text-[0.74rem]" style={{ borderColor: s.on ? TONE.info : TONE.bad, color: s.on ? TONE.info : TONE.bad }}>{i + 1}</span>
            <div className="min-w-0">
              <span className="label block !text-[0.74rem]">{s.k}</span>
              <p className={`whitespace-pre-line break-words text-sm ${i === 2 ? "font-mono text-signal" : "text-dim"}`}>{s.v}</p>
            </div>
          </li>
        ))}
      </ol>
      {c.ok && (
        <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
          <Stat label="Claims required" value={c.claims.length} tone="info" />
          <Stat label="Raw attributes required by verifier" value={0} tone="ok" />
          <Stat label="Policy hash" value={<span className="text-base">{c.policyHash.slice(0, 8)}</span>} />
        </div>
      )}
      <p className="mt-2 text-[0.82rem] leading-snug text-faint">Attributes proven: {d.attributesTouched} of {d.privateAttributes} · unnecessary data withheld: {d.unnecessary}.</p>
    </Panel>
  );
}

const STAGE_TONE: Record<string, Tone> = { pass: "ok", fail: "bad", skipped: "dim" };

export function StageList({ report }: { report: VerifyReport }) {
  return (
    <ul className="space-y-1" aria-label="Verification stages">
      {report.stages.map((s) => (
        <li key={s.id} className="grid grid-cols-[1.2rem_8.5rem_1fr] items-start gap-2 text-sm">
          <span className="font-mono" style={{ color: TONE[STAGE_TONE[s.state]] }}>{s.state === "pass" ? "✓" : s.state === "fail" ? "✕" : "–"}</span>
          <span className="font-mono text-[0.82rem] uppercase tracking-wider text-text">{s.label}</span>
          <span className="text-faint">{s.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function DecisionPanel({ lab }: { lab: TrustLab }) {
  const cur = lab.current;
  const rep = cur?.report ?? null;
  const d = lab.disclosure;
  const trustTone: Tone = !rep ? "dim" : rep.trust === "VERIFIED" ? "ok" : "bad";
  const worst = (["REVOKED", "SUSPENDED", "EXPIRED", "EXPIRING", "ACTIVE", "ISSUED"] as const).find((s) => lab.issued && (["ID", "UNI", "CERT", "CLR"] as const).some((c) => lab.lifecycle(c) === s));
  const revoked = (["ID", "UNI", "CERT", "CLR"] as const).some((c) => lab.lifecycle(c) === "REVOKED" || lab.lifecycle(c) === "SUSPENDED");
  const proofStatus = !cur ? "—" : rep ? (rep.trust === "VERIFIED" ? "VALID" : "REJECTED") : "GENERATED";
  const expStatus = !cur ? "—" : lab.expired ? "EXPIRED" : "VALID";
  const explainKey = "verification";
  return (
    <Panel title="Trust decision" kicker="Deterministic security state" accent={TONE[trustTone]} right={rep ? <Pill tone={trustTone}>{rep.trust}</Pill> : <Pill>awaiting proof</Pill>}>
      <div className="grid gap-5 2xl:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="font-mono text-4xl tracking-tight xl:text-5xl" style={{ color: TONE[trustTone] }} role="status">{!rep ? "NO PROOF YET" : rep.trust === "VERIFIED" ? "TRUST VERIFIED" : "TRUST REJECTED"}</p>
          <p className="mt-1 text-base text-dim">
            {!rep ? "Generate a proof, then verify it. This state comes only from the verifier's checks." : rep.trust === "VERIFIED" ? "The verifier learned one bit: the policy is satisfied. No raw attribute crossed the boundary." : rep.replay ? "Replay detected: the challenge was already answered." : `Rejected at: ${rep.failed.map((f) => rep.stages.find((s) => s.id === f)?.label).join(", ")}.`}
          </p>
          {rep ? <div className="mt-3"><StageList report={rep} /></div> : <p className="mt-3 text-sm text-faint">Stages: structure · signature · commitment · nonce · expiration · revocation · claim · proof · policy.</p>}
          {rep && (
            <div className="mt-3 border-t border-line pt-3">
              <Btn ghost disabled={!!lab.busy} onClick={() => lab.explainReport(explainKey, "verification", rep)}>Explain result (AI)</Btn>
              {lab.explain?.key === explainKey && (
                <div className="mt-2 text-sm text-dim">
                  {lab.explain.explanation ? (
                    <>
                      <p>{lab.explain.explanation.summary}</p>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-faint">{lab.explain.explanation.points.map((p) => <li key={p}>{p}</li>)}</ul>
                    </>
                  ) : <p className="text-faint">{lab.explain.note}</p>}
                  <p className="mt-1.5 text-[0.82rem] text-faint">Explanation only. The verdict above is computed deterministically.</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <span className="label">Privacy metrics</span>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-3">
            <Stat label="Private attributes" value={d.privateAttributes} />
            <Stat label="Policy claims" value={lab.planned} tone="info" />
            <Stat label="Raw attributes shared" value={cur ? cur.leaks : 0} tone={cur && cur.leaks > 0 ? "bad" : "ok"} sub={cur ? "payload audited" : "by construction"} />
            <Stat label="Proof status" value={<span className="text-base">{proofStatus}</span>} tone={proofStatus === "VALID" ? "ok" : proofStatus === "REJECTED" ? "bad" : "dim"} />
            <Stat label="Credential status" value={<span className="text-base">{worst ?? "—"}</span>} tone={worst === "ACTIVE" || worst === "ISSUED" ? "ok" : worst ? "warn" : "dim"} />
            <Stat label="Revocation status" value={<span className="text-base">{!lab.issued ? "—" : revoked ? "FLAGGED" : "CLEAR"}</span>} tone={!lab.issued ? "dim" : revoked ? "bad" : "ok"} />
            <Stat label="Proof expiration" value={<span className="text-base">{expStatus}</span>} tone={expStatus === "VALID" ? "ok" : expStatus === "EXPIRED" ? "bad" : "dim"} />
            <Stat label="Unnecessary data" value={d.unnecessary} sub="withheld" />
          </div>
          <div className="mt-4" aria-label="Selective disclosure">
            <span className="label">Selective disclosure</span>
            <div className="mt-1.5 flex flex-wrap gap-[3px]" role="img" aria-label={`${d.attributesTouched} of ${d.privateAttributes} attributes proven, 0 disclosed`}>
              {Array.from({ length: d.privateAttributes }, (_, i) => (
                <span key={i} className="h-2.5 w-2.5 rounded-[1px]" style={{ background: i < d.attributesTouched ? TONE.info : "rgb(255 255 255 / 0.1)", boxShadow: i < d.attributesTouched ? `0 0 6px ${TONE.info}` : "none" }} />
              ))}
            </div>
            <p className="mt-1.5 text-[0.82rem] leading-snug text-faint">{d.attributesTouched} proven as claims · {d.rawDisclosed} disclosed raw · {d.opaqueCommitmentsPresented} opaque commitments presented from {d.credentialsPresented} credential{d.credentialsPresented === 1 ? "" : "s"}.</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function EventStream({ lab }: { lab: TrustLab }) {
  return (
    <Panel title="Security event stream" kicker="Live · real events only" accent="#5fe3a1" right={<Pill>{lab.events.length}</Pill>}>
      <ol className="max-h-96 space-y-1.5 overflow-y-auto pr-1 font-mono text-[0.9rem]" aria-live="polite">
        {lab.events.length === 0 && <li className="text-faint">No events yet. Issue credentials to begin.</li>}
        {lab.events.map((e) => (
          <li key={e.id} className="grid grid-cols-[4.2rem_0.8rem_1fr] gap-1.5">
            <span className="text-faint">{hhmmss(e.t)}</span>
            <span style={{ color: TONE[e.tone === "info" ? "info" : e.tone] }}>●</span>
            <span className="break-words text-dim">{e.text}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function ProofExplorer({ lab }: { lab: TrustLab }) {
  const cur = lab.current;
  const b = cur?.bundle;
  const firstClaim = b ? Object.values(b.claims).find((c) => c.zk) : undefined;
  const response = firstClaim?.zk?.type === "range" ? firstClaim.zk.bits[0].s0 : firstClaim?.zk?.type === "eq" ? firstClaim.zk.s : "";
  const sig = b ? Object.values(b.presentations)[0]?.sig.s : "";
  const commit = b ? Object.values(b.presentations)[0] && Object.values(Object.values(b.presentations)[0]!.commitments)[0] : "";
  const bits = b ? Object.values(b.claims).reduce((n, c) => n + (c.zk?.type === "range" ? c.zk.bits.length : 0), 0) : 0;
  return (
    <Panel title="Proof explorer" kicker="Structure, never secrets" accent="#b48bff">
      {!b ? (
        <p className="text-sm text-faint">Generate a proof to inspect its architecture.</p>
      ) : (
        <div className="divide-y divide-line">
          <Masked label="Commitment" value={commit ?? ""} />
          <Masked label="Challenge (nonce)" value={b.nonce} />
          <Masked label="Response" value={response ?? ""} />
          <Masked label="Nonce binding" value={b.policyHash} />
          <Masked label="Signature" value={sig ?? ""} />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-2 font-mono text-[0.82rem]">
            <dt className="text-faint">CLAIM PROOFS</dt><dd>{Object.keys(b.claims).length}</dd>
            <dt className="text-faint">BIT OR-PROOFS</dt><dd>{bits}</dd>
            <dt className="text-faint">CREDENTIALS PRESENTED</dt><dd>{Object.keys(b.presentations).join(", ")}</dd>
            <dt className="text-faint">PAYLOAD</dt><dd>{(cur!.bytes / 1024).toFixed(1)} KB</dd>
            <dt className="text-faint">PROVE (BROWSER)</dt><dd>{cur!.proveMs} ms</dd>
            <dt className="text-faint">VERIFY (ROUND TRIP)</dt><dd>{cur!.verifyMs !== undefined ? `${cur!.verifyMs} ms` : "—"}</dd>
          </dl>
          <p className="pt-2 text-[0.82rem] leading-snug text-faint">Shown fields are public proof elements. Attribute values and blinding factors are not part of the proof and are not displayed.</p>
        </div>
      )}
    </Panel>
  );
}

export function claimLabel(p: Prim): string {
  return isLife(p) ? `${CREDS[p.cred].label} ${p.kind}` : describePrim(p);
}
export type { StageId };

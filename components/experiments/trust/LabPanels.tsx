"use client";
import { useState } from "react";
import { ATTACKS } from "@/lib/engines/trust/attacks";
import type { TrustLab } from "./useTrustLab";
import { StageList } from "./CorePanels";
import { Btn, Panel, Pill, TONE } from "./ui";

export function AttackLab({ lab }: { lab: TrustLab }) {
  const a = lab.attack;
  const def = a ? ATTACKS.find((x) => x.id === a.id) : null;
  return (
    <Panel title="Attack current proof" kicker="Security testing · every result is a real verification" accent="#ff6b7a" right={lab.countdown !== null ? <Pill tone="warn">expiring in {lab.countdown}s</Pill> : undefined}>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {ATTACKS.map((x) => (
              <li key={x.id}>
                <button type="button" disabled={!!lab.busy || !lab.issued || (x.id === "replay" && !lab.current)} onClick={() => lab.runAttack(x.id)} title={x.what} className="group flex w-full items-start gap-2 border border-line px-2.5 py-2 text-left transition hover:border-bad/50 hover:bg-bad/[0.05] disabled:pointer-events-none disabled:opacity-35" style={a?.id === x.id ? { borderColor: `${TONE.bad}99` } : undefined}>
                  <span className="font-mono text-[0.82rem] text-faint">{String(x.n).padStart(2, "0")}</span>
                  <span>
                    <span className="block font-mono text-[0.9rem] uppercase tracking-wider text-text">{x.label}</span>
                    <span className="block text-[0.82rem] leading-snug text-faint">{x.what}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!lab.issued && <p className="mt-2 text-sm text-faint">Issue credentials to enable testing.</p>}
        </div>
        <div>
          {!a ? (
            <p className="text-sm text-faint">Pick an attack. A fresh honest proof is built (or the current one is reused for replay), modified, and submitted to the real verifier.</p>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="bad">Attack: {def?.label}</Pill>
                <Pill tone={a.report.trust === "REJECTED" ? "bad" : "warn"}>{a.report.trust === "REJECTED" ? "Trust rejected ✕" : "Accepted"}</Pill>
                <span className="font-mono text-[0.82rem] text-faint">{a.ms} ms</span>
              </div>
              <p className="mt-2 text-sm text-dim">
                {a.report.trust === "REJECTED"
                  ? `Caught at: ${a.report.failed.map((f) => a.report.stages.find((s) => s.id === f)?.label).join(", ")}${def && a.report.failed.includes(def.stage) ? " (expected stage)" : ""}.`
                  : "This attack had no effect on this policy, which does not check the affected property."}
              </p>
              {a.note && <p className="mt-1 text-sm text-faint">{a.note}</p>}
              <div className="mt-3"><StageList report={a.report} /></div>
              <div className="mt-3 border-t border-line pt-3">
                <Btn ghost disabled={!!lab.busy} onClick={() => lab.explainReport(`attack-${a.id}`, "attack", a.report, def?.label)}>Explain attack (AI)</Btn>
                {lab.explain?.key === `attack-${a.id}` && (
                  <div className="mt-2 text-sm text-dim">
                    {lab.explain.explanation ? <><p>{lab.explain.explanation.summary}</p><ul className="mt-1 list-disc pl-4 text-faint">{lab.explain.explanation.points.map((p) => <li key={p}>{p}</li>)}</ul></> : <p className="text-faint">{lab.explain.note}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {lab.attackHistory.length > 1 && (
        <ol className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
          {lab.attackHistory.map((h, i) => (
            <li key={i}><Pill tone={h.report.trust === "REJECTED" ? "bad" : "warn"}>{ATTACKS.find((x) => x.id === h.id)?.label}: {h.report.trust === "REJECTED" ? "✕" : "✓"}</Pill></li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const COMPONENTS: { name: string; role: string; family: string; pq: "classical" | "quantum-resistant" | "mixed"; note: string; hybridOnly?: boolean }[] = [
  { name: "Pedersen commitments", role: "Hide attribute values", family: "Discrete log (secp256k1)", pq: "mixed", note: "Hiding is information-theoretic and survives quantum attackers. Binding relies on discrete log, which Shor's algorithm breaks." },
  { name: "Range / equality proofs", role: "Prove claims in zero knowledge", family: "Σ-protocols, Fiat–Shamir", pq: "classical", note: "Soundness rests on discrete log. A quantum attacker could forge proofs. Migration target: lattice or hash-based proof systems." },
  { name: "Schnorr issuer signature", role: "Authenticate credentials", family: "Discrete log", pq: "classical", note: "Forgeable with a large quantum computer." },
  { name: "ML-DSA-65 (FIPS 204)", role: "Co-sign credentials", family: "Module lattices", pq: "quantum-resistant", note: "Required in hybrid mode alongside Schnorr.", hybridOnly: true },
  { name: "ML-KEM-768 (FIPS 203)", role: "Seal the proof in transit", family: "Module lattices", pq: "quantum-resistant", note: "Key encapsulation to the verifier, then AES-256-GCM.", hybridOnly: true },
  { name: "SHA-256 / AES-256-GCM / HMAC", role: "Transcripts, envelope, challenge tokens", family: "Symmetric / hash", pq: "quantum-resistant", note: "Grover's algorithm halves the effective security level; 256-bit parameters keep a comfortable margin." },
];

export function PqPanel({ lab }: { lab: TrustLab }) {
  const hybrid = lab.mode === "hybrid-pq";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Quantum threat analysis" kicker="Which parts are classical, which are quantum-resistant" accent="#b48bff" right={<Pill tone={hybrid ? "violet" : "info"}>{hybrid ? "Hybrid active" : "Classical active"}</Pill>}>
        <ol className="mb-3 flex items-center gap-2 font-mono text-[0.82rem] uppercase tracking-wider text-faint" aria-label="Migration path">
          <li className="text-text">Current cryptography</li><li>›</li><li style={{ color: TONE.warn }}>Future quantum threat</li><li>›</li><li style={{ color: TONE.violet }}>Post-quantum migration</li>
        </ol>
        <ul className="divide-y divide-line">
          {COMPONENTS.map((c) => {
            const active = !c.hybridOnly || hybrid;
            const tone = c.pq === "classical" ? "bad" : c.pq === "mixed" ? "warn" : "ok";
            return (
              <li key={c.name} className="py-2" style={{ opacity: active ? 1 : 0.45 }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[0.9rem] uppercase tracking-wider text-text">{c.name}</span>
                  <span className="flex gap-1.5"><Pill tone={tone}>{c.pq}</Pill>{c.hybridOnly && <Pill tone={hybrid ? "violet" : "dim"}>{hybrid ? "in use" : "off in classical mode"}</Pill>}</span>
                </div>
                <p className="text-[0.82rem] text-faint">{c.role} · {c.family}</p>
                <p className="text-sm text-dim">{c.note}</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[0.82rem] leading-snug text-faint">This system does not run on a quantum computer and does not claim to be quantum-proof. Hybrid mode protects issuer authenticity and the proof transport; the zero-knowledge layer is still discrete-log based.</p>
      </Panel>
      <Panel title="Classical vs post-quantum" kicker="Measured on the server, not estimated" accent="#b48bff" right={<Btn ghost tone="violet" disabled={!!lab.busy} onClick={lab.runBench}>{lab.bench ? "Re-measure" : "Measure"}</Btn>}>
        {!lab.bench ? (
          <p className="text-sm text-faint">Run the benchmark to time real Schnorr / ECDH and ML-DSA-65 / ML-KEM-768 operations and read the actual key, signature and ciphertext sizes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left font-mono text-[0.82rem]">
              <thead className="text-faint">
                <tr><th className="py-1 pr-2 font-normal">Operation</th><th className="pr-2 font-normal">Classical</th><th className="pr-2 font-normal">ms</th><th className="pr-2 font-normal">bytes</th><th className="pr-2 font-normal">Post-quantum</th><th className="pr-2 font-normal">ms</th><th className="font-normal">bytes</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lab.bench.rows.map((r) => (
                  <tr key={r.operation}>
                    <td className="py-1.5 pr-2 text-text">{r.operation}</td>
                    <td className="pr-2 text-dim">{r.classical.algorithm}</td><td className="pr-2">{r.classical.ms}</td><td className="pr-2" title={r.classical.label}>{r.classical.bytes}</td>
                    <td className="pr-2" style={{ color: TONE.violet }}>{r.postQuantum.algorithm}</td><td className="pr-2">{r.postQuantum.ms}</td><td title={r.postQuantum.label}>{r.postQuantum.bytes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.82rem] text-faint">Median of {lab.bench.runs} runs on this {lab.bench.measuredOn}. Timings vary by machine.</p>
          </div>
        )}
        <div className="mt-4 border-t border-line pt-3">
          <Btn tone="violet" disabled={!!lab.busy} onClick={() => lab.setMode(hybrid ? "classical" : "hybrid-pq")}>{hybrid ? "Switch to classical mode" : "Enable hybrid post-quantum mode"}</Btn>
          <p className="mt-1.5 text-[0.82rem] text-faint">Generate and verify again after switching: hybrid proofs carry ML-DSA-65 co-signatures and travel sealed with ML-KEM-768.</p>
        </div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ security map
const LAYERS = ["Identity", "Credential", "Commitment", "Proof", "Verification", "Trust"] as const;
const OVERLAYS = ["Privacy", "Security", "Revocation", "Expiration", "Post-quantum"] as const;
type Overlay = (typeof OVERLAYS)[number];

const NOTES: Record<Overlay, string[]> = {
  Privacy: ["Name and attributes never leave the private domain", "Only commitments are signed; values stay with the holder", "Perfectly hiding Pedersen commitments", "Zero-knowledge: reveals the claim result, not the value", "Verifier sees claims, not attributes", "One bit of information: policy satisfied"],
  Security: ["Issuer keys sign commitment vectors", "Binding under discrete log (classical)", "Signature + handle must match the commitments", "Fiat–Shamir transcript bound to policy, nonce, verifier", "Nine independent stages, none short-circuited", "Deterministic: no AI in the decision"],
  Revocation: ["Issuer controls registry status", "Registry keyed by opaque credential handle", "Handle is consistent across a credential's proofs", "Lifecycle claims checked by the verifier", "Revoked/suspended credentials fail the revocation stage", "Active requires registry status active"],
  Expiration: ["Expiry is a committed attribute", "Credential expiry ≥ today proven by range proof", "—", "Proof carries creation time and a 30 s lifetime", "Expired proofs fail verification", "Expired credential cannot be proven active"],
  "Post-quantum": ["ML-DSA-65 issuer signature (hybrid)", "ML-DSA-65 co-signature on every credential (hybrid)", "Pedersen binding remains discrete-log based", "Σ-proofs remain discrete-log based", "ML-KEM-768 sealed channel (hybrid)", "Hash and AES-256 symmetric layers"],
};

export function SecurityMap({ lab }: { lab: TrustLab }) {
  const [overlay, setOverlay] = useState<Overlay>("Privacy");
  const hybrid = lab.mode === "hybrid-pq";
  const lit = (i: number) => (i <= 1 ? lab.issued : i === 2 ? lab.issued : i === 3 ? !!lab.current : i === 4 ? !!lab.current?.report : lab.verdict === "valid");
  const flagged = (i: number) => (overlay === "Post-quantum" && (i === 2 || i === 3) ? "warn" : overlay === "Post-quantum" && hybrid && (i === 1 || i === 4) ? "violet" : overlay === "Revocation" && lab.current?.report?.failed.includes("revocation") && (i === 1 || i === 4) ? "bad" : overlay === "Expiration" && lab.current?.report?.failed.includes("expiration") && i === 3 ? "bad" : null);
  return (
    <Panel title="Cryptographic security map" kicker="Interactive overlays" accent="#7be0d0">
      <div role="tablist" aria-label="Overlay" className="mb-3 flex flex-wrap gap-1.5">
        {OVERLAYS.map((o) => (
          <button key={o} role="tab" aria-selected={overlay === o} type="button" onClick={() => setOverlay(o)} className="rounded-sm border px-2 py-1 font-mono text-[0.82rem] uppercase tracking-wider" style={overlay === o ? { color: "#04110e", background: TONE.info, borderColor: TONE.info } : { color: "#9aa5b8", borderColor: "rgb(255 255 255 / 0.1)" }}>{o}</button>
        ))}
      </div>
      <ol className="grid gap-2 sm:grid-cols-6">
        {LAYERS.map((l, i) => {
          const f = flagged(i);
          const color = f ? TONE[f] : lit(i) ? TONE.ok : "#4a5468";
          return (
            <li key={l} className="relative border p-2.5" style={{ borderColor: `${color}77`, background: `${color}0d` }}>
              <span className="font-mono text-[0.74rem] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="block font-mono text-[0.9rem] uppercase tracking-wider" style={{ color }}>{l}</span>
              <span className="mt-1 block text-[0.82rem] leading-snug text-dim">{NOTES[overlay][i]}</span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

// ------------------------------------------------------------------ trust graph
export function TrustGraph({ lab }: { lab: TrustLab }) {
  const rep = lab.current?.report ?? null;
  const st = (id: string) => rep?.stages.find((s) => s.id === id)?.state;
  const col = (on: boolean, s?: string) => (s === "fail" ? TONE.bad : s === "pass" ? TONE.ok : on ? TONE.info : "#303a4c");
  const hybrid = lab.mode === "hybrid-pq";
  const N: Record<string, [number, number]> = { ISSUER: [60, 90], CREDENTIAL: [190, 90], HOLDER: [320, 90], PROOF: [450, 90], VERIFIER: [580, 90], POLICY: [580, 30], NONCE: [450, 28], REVOCATION: [190, 28], EXPIRATION: [320, 28], PQ: [60, 28] };
  const edges: [string, string, string][] = [
    ["ISSUER", "CREDENTIAL", col(lab.issued)],
    ["CREDENTIAL", "HOLDER", col(lab.issued)],
    ["HOLDER", "PROOF", col(!!lab.current)],
    ["PROOF", "VERIFIER", col(!!rep, rep ? (rep.trust === "VERIFIED" ? "pass" : "fail") : undefined)],
    ["POLICY", "VERIFIER", col(lab.compiled.ok, lab.compiled.ok ? undefined : "fail")],
    ["NONCE", "PROOF", col(!!lab.current, st("nonce"))],
    ["REVOCATION", "CREDENTIAL", col(lab.issued, st("revocation"))],
    ["EXPIRATION", "HOLDER", col(!!lab.current, st("expiration"))],
    ["PQ", "ISSUER", hybrid ? TONE.violet : "#303a4c"],
  ];
  return (
    <Panel title="Trust graph" kicker="Edges follow real system state" accent="#5fe3a1">
      <svg viewBox="0 0 640 150" className="w-full" role="img" aria-label="Trust graph: issuer, credential, holder, proof, verifier with policy, nonce, revocation, expiration and post-quantum nodes">
        {edges.map(([a, b, c]) => (
          <line key={a + b} x1={N[a][0]} y1={N[a][1]} x2={N[b][0]} y2={N[b][1]} stroke={c} strokeWidth="1.4" strokeOpacity="0.9" strokeDasharray={c === "#303a4c" ? "3 4" : undefined} />
        ))}
        {Object.entries(N).map(([k, [x, y]]) => {
          const main = ["ISSUER", "CREDENTIAL", "HOLDER", "PROOF", "VERIFIER"].includes(k);
          const c = k === "PQ" ? (hybrid ? TONE.violet : "#4a5468") : k === "PROOF" ? col(!!lab.current) : "#9aa5b8";
          return (
            <g key={k}>
              <circle cx={x} cy={y} r={main ? 18 : 11} fill="#070a10" stroke={c} strokeWidth="1.3" />
              <text x={x} y={y + (main ? 36 : 26)} textAnchor="middle" fill={c} fontSize="12" fontFamily="monospace" letterSpacing="0.5">{k === "PQ" ? "POST-QUANTUM" : k}</text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

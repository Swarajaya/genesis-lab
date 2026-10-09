"use client";
import { useState } from "react";
import { COUNTRIES, CRED_IDS, CREDS, SPECS, SPEC_IDS, VERIFIERS, group, leaf, type PolicyNode, type SpecId } from "@/lib/engines/trust/model";
import type { TrustLab } from "./useTrustLab";
import { Btn, Panel, Pill, TONE } from "./ui";

type Updater = (n: PolicyNode | null) => void;

function Node({ node, onChange, root }: { node: PolicyNode; onChange: Updater; root?: boolean }) {
  const not = node.not === true;
  const toggleNot = () => onChange({ ...node, not: !not } as PolicyNode);
  if (node.t === "leaf") {
    const spec = SPECS[node.spec];
    return (
      <div className="flex flex-wrap items-center gap-1.5 border border-line bg-white/[0.02] px-2 py-1.5">
        <button type="button" onClick={toggleNot} aria-pressed={not} className="rounded-sm border px-1.5 py-0.5 font-mono text-[0.74rem] uppercase tracking-wider" style={{ color: not ? TONE.bad : "#6b768a", borderColor: not ? `${TONE.bad}88` : "rgb(255 255 255 / 0.1)" }}>Not</button>
        <select aria-label="Condition" value={node.spec} onChange={(e) => { const s = SPECS[e.target.value as SpecId]; onChange({ t: "leaf", spec: s.id, ...(s.param ? { param: s.param.def } : {}), ...(s.pickCred ? { cred: s.cred } : {}), ...(not ? { not } : {}) }); }} className="!w-auto !py-1.5 !text-sm">
          {SPEC_IDS.map((id) => (
            <option key={id} value={id}>{SPECS[id].label}</option>
          ))}
        </select>
        {spec.pickCred && (
          <select aria-label="Credential" value={node.cred ?? spec.cred} onChange={(e) => onChange({ ...node, cred: e.target.value as (typeof CRED_IDS)[number] })} className="!w-auto !py-1.5 !text-sm">
            {CRED_IDS.map((c) => (
              <option key={c} value={c}>{CREDS[c].label}</option>
            ))}
          </select>
        )}
        {spec.param && (node.spec === "country_eq" ? (
          <select aria-label="Country" value={node.param ?? spec.param.def} onChange={(e) => onChange({ ...node, param: Number(e.target.value) })} className="!w-auto !py-1.5 !text-sm">
            {Object.entries(COUNTRIES).map(([k, n]) => (
              <option key={k} value={k}>{n}</option>
            ))}
          </select>
        ) : (
          <input aria-label={spec.param.label} type="number" min={spec.param.min} max={spec.param.max} value={node.param ?? spec.param.def} onChange={(e) => onChange({ ...node, param: Math.min(spec.param!.max, Math.max(spec.param!.min, Math.round(Number(e.target.value) || 0))) })} className="!w-16 !py-1.5 !text-sm" />
        ))}
        {!root && <button type="button" aria-label="Remove condition" onClick={() => onChange(null)} className="ml-auto px-1 text-faint hover:text-bad">×</button>}
      </div>
    );
  }
  const setChild = (i: number) => (n: PolicyNode | null) => {
    const kids = node.children.slice();
    if (n === null) kids.splice(i, 1);
    else kids[i] = n;
    onChange(kids.length ? { ...node, children: kids } : null);
  };
  const add = (n: PolicyNode) => onChange({ ...node, children: [...node.children, n] });
  return (
    <div className="border-l-2 pl-2.5" style={{ borderColor: node.op === "AND" ? `${TONE.info}66` : `${TONE.violet}77` }}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={toggleNot} aria-pressed={not} className="rounded-sm border px-1.5 py-0.5 font-mono text-[0.74rem] uppercase tracking-wider" style={{ color: not ? TONE.bad : "#6b768a", borderColor: not ? `${TONE.bad}88` : "rgb(255 255 255 / 0.1)" }}>Not</button>
        {(["AND", "OR"] as const).map((op) => (
          <button key={op} type="button" aria-pressed={node.op === op} onClick={() => onChange({ ...node, op })} className="rounded-sm border px-2 py-0.5 font-mono text-[0.82rem] tracking-wider" style={node.op === op ? { color: "#04110e", background: op === "AND" ? TONE.info : TONE.violet, borderColor: "transparent" } : { color: "#6b768a", borderColor: "rgb(255 255 255 / 0.1)" }}>{op}</button>
        ))}
        {!root && <button type="button" aria-label="Remove group" onClick={() => onChange(null)} className="ml-auto px-1 text-faint hover:text-bad">×</button>}
      </div>
      <div className="space-y-1.5">
        {node.children.map((c, i) => (
          <div key={i}>
            {i > 0 && <div className="py-0.5 pl-1 font-mono text-[0.74rem] tracking-[0.2em]" style={{ color: node.op === "AND" ? TONE.info : TONE.violet }}>{node.op}</div>}
            <Node node={c} onChange={setChild(i)} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <Btn ghost onClick={() => add(leaf("student"))}>+ Condition</Btn>
        <Btn ghost tone="violet" onClick={() => add(group("OR", leaf("student")))}>+ Group</Btn>
      </div>
    </div>
  );
}

export function VerifierPanel({ lab }: { lab: TrustLab }) {
  const [nl, setNl] = useState("Allow access only to users with a valid university credential, active research certification and clearance level of at least 2.");
  const preset = VERIFIERS.find((v) => v.id === lab.verifierId);
  const cur = lab.current;
  return (
    <Panel title="Verifier · trust policy" kicker="What do you need to prove?" accent="#7be0d0" right={<Pill tone={lab.mode === "hybrid-pq" ? "violet" : "info"}>{lab.mode === "hybrid-pq" ? "Hybrid PQ" : "Classical"}</Pill>}>
      <div className="space-y-3">
        <div role="tablist" aria-label="Verifier" className="flex flex-wrap gap-1">
          {VERIFIERS.map((v) => (
            <button key={v.id} role="tab" aria-selected={lab.verifierId === v.id} type="button" onClick={() => lab.selectVerifier(v.id)} className="rounded-sm border px-2 py-1 font-mono text-[0.82rem] uppercase tracking-wider" style={lab.verifierId === v.id ? { color: "#04110e", background: TONE.info, borderColor: TONE.info } : { color: "#9aa5b8", borderColor: "rgb(255 255 255 / 0.1)" }}>{v.name}</button>
          ))}
          {lab.verifierId === "custom" && <span className="rounded-sm border border-line px-2 py-1 font-mono text-[0.82rem] uppercase tracking-wider text-violet-300">Custom policy</span>}
        </div>
        {preset && <p className="text-sm text-dim">“{preset.question}”</p>}

        <Node node={lab.policy} root onChange={(n) => { if (n) { lab.setPolicy(n); if (lab.verifierId !== "custom") lab.setVerifierId("custom"); } }} />

        <div>
          <label htmlFor="nl-policy" className="label mb-1 block">Describe the requirement</label>
          <textarea id="nl-policy" rows={3} value={nl} maxLength={600} onChange={(e) => setNl(e.target.value)} className="w-full !text-sm" />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[0.82rem] leading-snug text-faint">{lab.parseNote ?? "An LLM extracts conditions; the deterministic compiler validates them. It never decides access."}</p>
            <Btn ghost disabled={!!lab.busy || nl.trim().length < 4} onClick={() => lab.parseText(nl)}>Parse</Btn>
          </div>
        </div>

        <fieldset className="border-t border-line pt-3">
          <legend className="label">Security mode</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {(["classical", "hybrid-pq"] as const).map((m) => (
              <label key={m} className="cursor-pointer border px-2.5 py-1.5 text-sm" style={lab.mode === m ? { borderColor: m === "classical" ? TONE.info : TONE.violet, background: "rgb(255 255 255 / 0.04)" } : { borderColor: "rgb(255 255 255 / 0.09)" }}>
                <input type="radio" name="mode" className="sr-only" checked={lab.mode === m} onChange={() => lab.setMode(m)} />
                <span className="block font-mono text-[0.82rem] uppercase tracking-wider text-text">{m === "classical" ? "Classical" : "Hybrid post-quantum"}</span>
                <span className="text-[0.82rem] text-faint">{m === "classical" ? "Schnorr issuer signatures" : "+ ML-DSA-65 signatures, ML-KEM-768 sealed channel"}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Btn disabled={!!lab.busy || !lab.issued || !lab.compiled.ok} onClick={lab.generate}>Generate proof</Btn>
          <Btn tone="ok" disabled={!!lab.busy || !cur} onClick={lab.verify}>Verify</Btn>
          <Btn ghost disabled={!!lab.busy || !lab.issued || !lab.compiled.ok} onClick={lab.proveAndVerify}>Prove + verify</Btn>
          {!lab.issued && <span className="text-[0.82rem] text-faint">Issue credentials first.</span>}
          {lab.busy && <span className="font-mono text-[0.82rem] text-signal">{lab.busy}…</span>}
        </div>

        {cur && (
          <div className="border border-line bg-white/[0.02] p-2.5 font-mono text-[0.82rem]">
            <div className="flex justify-between"><span className="text-faint">PROOF CREATED</span><span>{new Date(cur.bundle.createdAt).toISOString().slice(11, 19)}</span></div>
            <div className="flex justify-between"><span className="text-faint">EXPIRES</span><span>{new Date(cur.bundle.expiresAt).toISOString().slice(11, 19)}</span></div>
            <div className="flex justify-between"><span className="text-faint">VALIDITY</span><span style={{ color: lab.expired ? TONE.bad : TONE.ok }}>{lab.expired ? "EXPIRED" : `VALID · ${lab.secondsLeft}s`}</span></div>
            <div className="flex justify-between"><span className="text-faint">BOUND TO POLICY</span><span>{cur.bundle.policyHash.slice(0, 10)}…</span></div>
            {lab.stale && (
              <div className="mt-2 border-t border-line pt-2 text-warn">
                The policy changed after this proof was generated. The proof stays bound to the old policy; a new proof is required.
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

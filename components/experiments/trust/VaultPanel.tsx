"use client";
import { COUNTRIES, CRED_IDS, CREDS, DEGREES, dayNumber, isoFromDay, type CredId, type Lifecycle } from "@/lib/engines/trust/model";
import type { TrustLab } from "./useTrustLab";
import { Btn, Panel, Pill, TONE, type Tone } from "./ui";

const LIFE_TONE: Record<Lifecycle, Tone> = { ISSUED: "info", ACTIVE: "ok", EXPIRING: "warn", EXPIRED: "bad", SUSPENDED: "warn", REVOKED: "bad" };
const CHAIN_OK: Lifecycle[] = ["ISSUED", "ACTIVE", "EXPIRING", "EXPIRED"];
const CHAIN_BAD: Lifecycle[] = ["ISSUED", "ACTIVE", "SUSPENDED", "REVOKED"];

function Chain({ state }: { state: Lifecycle | null }) {
  const chain = state === "SUSPENDED" || state === "REVOKED" ? CHAIN_BAD : CHAIN_OK;
  const idx = state ? chain.indexOf(state) : -1;
  const reached = state === "ISSUED" ? 0 : state === "ACTIVE" ? 1 : idx;
  return (
    <ol className="flex items-center gap-1 font-mono text-[0.74rem] uppercase tracking-wider" aria-label="Credential lifecycle">
      {chain.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span style={{ color: state && i <= reached ? TONE[LIFE_TONE[s]] : "#4a5468" }}>{s}</span>
          {i < chain.length - 1 && <span className="text-faint">›</span>}
        </li>
      ))}
    </ol>
  );
}

function Field({ cred, name, lab }: { cred: CredId; name: string; lab: TrustLab }) {
  const def = CREDS[cred].attrs[name];
  const v = lab.draft[cred][name];
  const set = (n: number) => lab.setDraft((d) => ({ ...d, [cred]: { ...d[cred], [name]: n } }));
  const id = `${cred}-${name}`;
  return (
    <label htmlFor={id} className="grid grid-cols-[9.5rem_1fr] items-center gap-2 text-sm">
      <span className="text-faint">{def.label}</span>
      {def.kind === "date" ? (
        <input id={id} type="date" value={isoFromDay(v)} onChange={(e) => e.target.value && set(dayNumber(e.target.value))} className="!py-1.5 !text-sm" />
      ) : def.kind === "country" ? (
        <select id={id} value={v} onChange={(e) => set(Number(e.target.value))} className="!py-1.5 !text-sm">
          {Object.entries(COUNTRIES).map(([k, n]) => (
            <option key={k} value={k}>{n}</option>
          ))}
        </select>
      ) : def.kind === "flag" ? (
        <select id={id} value={v} onChange={(e) => set(Number(e.target.value))} className="!py-1.5 !text-sm">
          <option value={1}>true</option>
          <option value={0}>false</option>
        </select>
      ) : name === "degree" ? (
        <select id={id} value={v} onChange={(e) => set(Number(e.target.value))} className="!py-1.5 !text-sm">
          {Object.entries(DEGREES).map(([k, n]) => (
            <option key={k} value={k}>{n}</option>
          ))}
        </select>
      ) : (
        <input id={id} type="number" min={def.min} max={def.max} value={v} onChange={(e) => set(Math.min(def.max, Math.max(def.min, Math.round(Number(e.target.value) || 0))))} className="!py-1.5 !text-sm" />
      )}
    </label>
  );
}

export function VaultPanel({ lab }: { lab: TrustLab }) {
  const { vault, text } = lab;
  return (
    <Panel title="Private credential vault" kicker="Private domain" accent="#b48bff" right={<Pill tone="violet">{lab.totalAttributes} private attributes</Pill>}>
      <div className="space-y-3">
        <div className="grid gap-2 border-b border-line pb-3">
          {([ ["fullName", "Full name"], ["universityName", "University"] ] as const).map(([k, l]) => (
            <label key={k} className="grid grid-cols-[9.5rem_1fr] items-center gap-2 text-sm">
              <span className="text-faint">{l}</span>
              <input value={text[k]} maxLength={60} onChange={(e) => lab.setText({ ...text, [k]: e.target.value })} className="!py-1.5 !text-sm" autoComplete="off" />
            </label>
          ))}
          <p className="text-[0.82rem] leading-snug text-faint">Text fields live only in this browser. They are never committed, so no claim can reveal them.</p>
        </div>
        {CRED_IDS.map((c) => {
          const held = vault[c];
          const life = lab.lifecycle(c);
          return (
            <div key={c} className="border border-line bg-white/[0.015] p-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <span className="font-mono text-[0.9rem] uppercase tracking-wider text-text">{CREDS[c].label}</span>
                  <span className="block text-[0.82rem] text-faint">Issuer: {CREDS[c].issuer}{held ? ` · ID ${held.handle.slice(0, 8).toUpperCase()}` : ""}</span>
                </div>
                {life ? <Pill tone={LIFE_TONE[life]}>{life}</Pill> : <Pill>not issued</Pill>}
              </div>
              <div className="space-y-1.5">
                {Object.keys(CREDS[c].attrs).map((n) => (
                  <Field key={n} cred={c} name={n} lab={lab} />
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                <Chain state={life} />
                {held && (
                  <div className="flex gap-1" role="group" aria-label={`Issuer console for ${CREDS[c].label}`}>
                    <Btn ghost tone="warn" disabled={!!lab.busy} onClick={() => lab.setStatus(c, "suspended")}>Suspend</Btn>
                    <Btn ghost tone="bad" disabled={!!lab.busy} onClick={() => lab.setStatus(c, "revoked")}>Revoke</Btn>
                    <Btn ghost tone="ok" disabled={!!lab.busy} onClick={() => lab.setStatus(c, "active")}>Reinstate</Btn>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.82rem] leading-snug text-faint">Issuing signs a commitment to each value (Schnorr + ML-DSA-65). Values and blinding factors return to this browser only.</p>
          <Btn tone="violet" disabled={!!lab.busy} onClick={lab.issueAll}>{lab.issued ? "Re-issue" : "Issue credentials"}</Btn>
        </div>
      </div>
    </Panel>
  );
}

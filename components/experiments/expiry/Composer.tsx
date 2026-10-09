"use client";
import { useId, useMemo, useState } from "react";
import { PURPOSES, RECIPIENT_TYPES, fmtSpan, inr, normalizeDraft, validateDraft, type Policy, type PolicyDraft, type Purpose, type RecipientType } from "@/lib/engines/money/policy";
import { DURATIONS, parseRupees, type Explanation } from "./types";
import { Chip } from "./ui";

export interface CompileOut {
  draft: PolicyDraft;
  conflicts: { code: string }[];
  provider?: string;
}

interface Form {
  amount: string;
  type: RecipientType;
  recipientId: string;
  purposes: Purpose[];
  maxTxn: string;
  duration: string; // seconds as string or "custom"
  customSeconds: string;
  alloc: Partial<Record<Purpose, string>>;
  merchants: string;
}

const EMPTY: Form = { amount: "1500", type: "STUDENT", recipientId: "STUDENT-042", purposes: ["FOOD", "TRANSPORT"], maxTxn: "400", duration: "60", customSeconds: "120", alloc: {}, merchants: "" };

export function plusLabel(secs: number): string {
  if (secs < 120) return `+${Math.round(secs)} SECONDS`;
  if (secs < 7200) return `+${Math.round(secs / 60)} MINUTES`;
  if (secs <= 345_600) return `+${Math.round(secs / 3600)} HOURS`;
  return `+${Math.round(secs / 86_400)} DAYS`;
}

function toForm(d: PolicyDraft): Form {
  const preset = DURATIONS.find((x) => x.s === Math.round(d.expiresInSeconds));
  return {
    amount: String(d.amountPaise / 100),
    type: d.recipientType,
    recipientId: d.recipientId,
    purposes: d.purposes,
    maxTxn: d.maxTxnPaise === null ? "" : String(d.maxTxnPaise / 100),
    duration: preset ? String(preset.s) : "custom",
    customSeconds: String(Math.round(d.expiresInSeconds)),
    alloc: Object.fromEntries(Object.entries(d.allocations).map(([k, v]) => [k, String((v ?? 0) / 100)])),
    merchants: d.merchants.join(", "),
  };
}

export function policyToForm(p: Policy): Form {
  return toForm({ amountPaise: p.amountPaise, recipientType: p.recipient.type, recipientId: p.recipient.id, purposes: p.allowedPurposes, maxTxnPaise: p.maxTransactionPaise, expiresInSeconds: Math.max(10, Math.round((Date.parse(p.expiresAt) - Date.now()) / 1000)), allocations: p.allocations, merchants: p.merchantConstraints });
}

function toDraft(f: Form): { draft: PolicyDraft | null; message: string | null } {
  const amount = parseRupees(f.amount);
  if (amount === null) return { draft: null, message: "Enter a valid amount." };
  const maxTxn = f.maxTxn.trim() === "" ? null : parseRupees(f.maxTxn);
  if (f.maxTxn.trim() !== "" && maxTxn === null) return { draft: null, message: "Enter a valid per-transaction limit." };
  const secs = f.duration === "custom" ? Number(f.customSeconds) : Number(f.duration);
  const allocations: Partial<Record<Purpose, number>> = {};
  for (const p of f.purposes) {
    const raw = f.alloc[p];
    if (raw !== undefined && raw.trim() !== "") {
      const v = parseRupees(raw);
      if (v === null) return { draft: null, message: `Enter a valid ${p} allocation.` };
      allocations[p] = v;
    }
  }
  return { draft: normalizeDraft({ amountPaise: amount, recipientType: f.type, recipientId: f.recipientId.trim() || "*", purposes: f.purposes, maxTxnPaise: maxTxn, expiresInSeconds: secs, allocations, merchants: f.merchants.split(",") }), message: null };
}

export function Composer({
  mode,
  initial,
  busy,
  onSubmit,
  onCompile,
  onExplain,
  spent,
  error,
}: {
  mode: "issue" | "update";
  initial?: Form;
  busy: boolean;
  onSubmit: (d: PolicyDraft, keepExpiry: boolean) => void;
  onCompile?: (text: string) => Promise<CompileOut>;
  onExplain?: (headline: string, lines: string[]) => Promise<Explanation>;
  spent?: Record<string, number>;
  error?: string | null;
}) {
  const id = useId();
  const [f, setF] = useState<Form>(initial ?? EMPTY);
  const [nl, setNl] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [compiled, setCompiled] = useState<{ provider?: string } | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);
  const [exp, setExp] = useState<Explanation | null>(null);
  const update = mode === "update";

  const parsed = useMemo(() => toDraft(f), [f]);
  const conflicts = useMemo(() => (parsed.draft ? validateDraft(parsed.draft, spent) : []), [parsed, spent]);
  const set = (p: Partial<Form>) => {
    setF((x) => ({ ...x, ...p }));
    setExp(null);
  };
  const toggle = (p: Purpose) => set({ purposes: f.purposes.includes(p) ? f.purposes.filter((x) => x !== p) : [...f.purposes, p] });
  const d = parsed.draft;
  const secs = d?.expiresInSeconds ?? 0;
  const lines: [string, string][] = d
    ? [
        ["AMOUNT", inr(d.amountPaise)],
        ["RECIPIENT", d.recipientId === "*" ? `ANY ${d.recipientType}` : d.recipientId],
        ["PURPOSES", d.purposes.join(", ") || "—"],
        ["MAX_TRANSACTION", d.maxTxnPaise === null ? "NONE (budget only)" : inr(d.maxTxnPaise)],
        ["EXPIRY", Number.isFinite(secs) ? plusLabel(secs) : "—"],
        ...Object.entries(d.allocations).map(([k, v]): [string, string] => [`ALLOC.${k}`, inr(v ?? 0)]),
        ...(d.merchants.length ? ([["MERCHANTS", d.merchants.join(", ")]] as [string, string][]) : []),
      ]
    : [];

  const compile = async () => {
    if (!onCompile || nl.trim().length < 8) return;
    setCompiling(true);
    setAiErr(null);
    try {
      const out = await onCompile(nl);
      setF(toForm(out.draft));
      setCompiled({ provider: out.provider });
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "AI compiler unavailable. Use the structured controls.");
      setCompiled(null);
    } finally {
      setCompiling(false);
    }
  };

  const explainConflict = async () => {
    if (!onExplain) return;
    setExp({ text: null, note: null, loading: true });
    setExp(await onExplain("POLICY CONFLICT detected by the deterministic validator", conflicts.map((c) => `${c.title}: ${c.message}`)));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (d && conflicts.length === 0 && !busy) onSubmit(d, keep);
      }}
    >
      {!update && onCompile && (
        <div>
          <label htmlFor={`${id}-nl`} className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">
            Policy compiler · natural language
          </label>
          <textarea id={`${id}-nl`} rows={3} maxLength={600} value={nl} onChange={(e) => setNl(e.target.value)} placeholder="Give ₹1500 to a student for food and transport for three days, but no single transaction should exceed ₹400." className="mt-1.5 resize-none !rounded-none text-base" />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void compile()} disabled={compiling || nl.trim().length < 8} className="border border-signal/50 px-3 py-1.5 font-mono text-[0.84rem] uppercase tracking-[0.16em] text-signal transition hover:bg-signal/10 disabled:opacity-40">
              {compiling ? "Interpreting…" : "Interpret with AI"}
            </button>
            <span className="text-[0.86rem] text-faint">AI fills the controls below. Only the deterministic engine validates and enforces.</span>
          </div>
          {aiErr && (
            <p role="alert" className="mt-2 font-mono text-[0.84rem] text-warn">
              {aiErr} The structured controls below still work.
            </p>
          )}
        </div>
      )}

      <fieldset>
        <legend className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">Allowed purposes</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PURPOSES.map((p) => {
            const on = f.purposes.includes(p);
            return (
              <label key={p} className={`cursor-pointer border px-2.5 py-1 font-mono text-[0.84rem] tracking-[0.1em] transition focus-within:outline focus-within:outline-2 focus-within:outline-signal ${on ? "border-signal/70 bg-signal/10 text-text" : "border-white/10 text-dim hover:border-white/25"}`}>
                <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(p)} />
                {p}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-amt`} className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">
            Amount (₹){update ? " · fixed" : ""}
          </label>
          <input id={`${id}-amt`} className="mt-1.5 !rounded-none" type="number" inputMode="decimal" min={1} disabled={update} value={f.amount} onChange={(e) => set({ amount: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-max`} className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">
            Max transaction (₹)
          </label>
          <input id={`${id}-max`} className="mt-1.5 !rounded-none" type="number" inputMode="decimal" min={0} placeholder="no limit" value={f.maxTxn} onChange={(e) => set({ maxTxn: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-rt`} className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">
            Recipient type
          </label>
          <select id={`${id}-rt`} className="mt-1.5 !rounded-none" value={f.type} onChange={(e) => set({ type: e.target.value as RecipientType, recipientId: e.target.value === "ANY" ? "*" : f.recipientId === "*" ? `${e.target.value}-001` : f.recipientId })}>
            {RECIPIENT_TYPES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-rid`} className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">
            Recipient ID (* = any)
          </label>
          <input id={`${id}-rid`} className="mt-1.5 !rounded-none font-mono" maxLength={40} value={f.recipientId} onChange={(e) => set({ recipientId: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-dur`} className="font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">
            Expiry · {update ? "applies only if expiry is not kept" : "real countdown from issue"}
          </label>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select id={`${id}-dur`} className="!rounded-none" value={f.duration} onChange={(e) => set({ duration: e.target.value })}>
              {DURATIONS.map((x) => (
                <option key={x.s} value={x.s}>
                  {x.label}
                </option>
              ))}
              <option value="custom">Custom (seconds)</option>
            </select>
            {f.duration === "custom" && <input aria-label="Custom expiry in seconds" className="!rounded-none sm:w-36" type="number" min={10} value={f.customSeconds} onChange={(e) => set({ customSeconds: e.target.value })} />}
          </div>
        </div>
      </div>

      <details className="border border-white/[0.07] px-3 py-2" open={Object.keys(f.alloc).some((k) => f.alloc[k as Purpose])}>
        <summary className="cursor-pointer font-mono text-[0.78rem] uppercase tracking-[0.18em] text-faint">Allocations &amp; merchant allow-list (optional, enforced)</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {f.purposes.length === 0 && <p className="text-sm text-faint">Select purposes first.</p>}
          {f.purposes.map((p) => (
            <div key={p}>
              <label htmlFor={`${id}-a-${p}`} className="font-mono text-[0.76rem] tracking-[0.14em] text-dim">
                {p} (₹)
              </label>
              <input id={`${id}-a-${p}`} className="mt-1 !rounded-none" type="number" min={0} placeholder="shared pool" value={f.alloc[p] ?? ""} onChange={(e) => set({ alloc: { ...f.alloc, [p]: e.target.value } })} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-mer`} className="font-mono text-[0.76rem] tracking-[0.14em] text-dim">
              MERCHANTS (comma separated, empty = any)
            </label>
            <input id={`${id}-mer`} className="mt-1 !rounded-none" value={f.merchants} onChange={(e) => set({ merchants: e.target.value })} />
          </div>
        </div>
      </details>

      {/* Compiled policy / conflict output, derived only from the current inputs by the deterministic validator */}
      <div className={`border px-3 py-2.5 font-mono text-sm ${conflicts.length || !d ? "border-bad/40 bg-bad/[0.05]" : "border-signal/30 bg-signal/[0.04]"}`} aria-live="polite">
        {!d ? (
          <p className="text-bad">{parsed.message}</p>
        ) : conflicts.length ? (
          <div className="space-y-2">
            <p className="tracking-[0.16em] text-bad">POLICY CONFLICT</p>
            {conflicts.map((c) => (
              <div key={c.code + c.message} className="text-dim">
                <p>{c.message}</p>
                {c.allocatedPaise !== undefined && c.availablePaise !== undefined && (
                  <p className="mt-0.5 text-faint">
                    Allocated: {inr(c.allocatedPaise)} · Available: {inr(c.availablePaise)}
                  </p>
                )}
              </div>
            ))}
            {onExplain && (
              <button type="button" onClick={() => void explainConflict()} className="text-[0.82rem] uppercase tracking-[0.14em] text-signal underline-offset-2 hover:underline">
                {exp?.loading ? "Explaining…" : "Explain with AI"}
              </button>
            )}
            {exp && !exp.loading && <p className="text-dim">{exp.text ?? exp.note}</p>}
          </div>
        ) : (
          <div>
            <p className="tracking-[0.16em] text-signal">
              POLICY COMPILED <span className="ml-2 text-faint">{compiled ? `interpreted by ${compiled.provider ?? "AI"} · validated by engine` : "validated by engine"}</span>
            </p>
            <dl className="mt-2 grid gap-x-6 sm:grid-cols-2">
              {lines.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-0.5">
                  <dt className="text-faint">{k}</dt>
                  <dd className="truncate text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {update && (
        <label className="flex items-center gap-2 text-sm text-dim">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the current expiry timestamp
        </label>
      )}
      {error && (
        <p role="alert" className="font-mono text-sm text-bad">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !d || conflicts.length > 0} className="bg-signal px-5 py-2.5 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-[#04110e] shadow-[0_0_36px_-10px_rgba(123,224,208,.9)] transition hover:bg-[#9af0e2] disabled:pointer-events-none disabled:opacity-35">
          {busy ? "Working…" : update ? "[ Seal new policy version ]" : "[ Compile & issue money ]"}
        </button>
        {update && <Chip color="#7be0d0">history keeps its original version</Chip>}
        {!update && d && !conflicts.length && <span className="font-mono text-[0.82rem] text-faint">{fmtSpan(Math.round(secs))} validity</span>}
      </div>
    </form>
  );
}

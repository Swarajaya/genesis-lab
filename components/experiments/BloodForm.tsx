"use client";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Glass } from "@/components/ui/Glass";
import type { Abo, Antibody, Constraints, Donor, Recipient, Rh, Urgency } from "@/lib/engines/blood/engine";

export const ANTIBODIES: Antibody[] = ["anti-K", "anti-c", "anti-E", "anti-Fya"];
const ABOS: Abo[] = ["O", "A", "B", "AB"];
const URGENCIES: { id: Urgency; label: string; hint: string }[] = [
  { id: "routine", label: "Routine", hint: "24 h window" },
  { id: "urgent", label: "Urgent", hint: "4 h window" },
  { id: "critical", label: "Critical", hint: "1 h window" },
];

export interface FormState {
  recipient: Recipient;
  /** Kept as text so the field can be edited freely; validated on submit. */
  unitsText: string;
  constraints: Constraints;
  extraDonors: Donor[];
}

export const INITIAL_FORM: FormState = {
  recipient: { abo: "A", rh: "+", antibodies: [], unitsNeeded: 2, urgency: "urgent", chronicTransfusion: false },
  unitsText: "2",
  constraints: { maxDistanceKm: 30, minHoursToExpiry: 24, allowRhMismatch: false },
  extraDonors: [],
};

/** A realistic emergency: Rh-negative recipient with anti-K, critical, needs 3 units, short window. */
export const EMERGENCY_EXAMPLE: FormState = {
  recipient: { abo: "B", rh: "-", antibodies: ["anti-K", "anti-E"], unitsNeeded: 3, urgency: "critical", chronicTransfusion: true },
  unitsText: "3",
  constraints: { maxDistanceKm: 20, minHoursToExpiry: 48, allowRhMismatch: false },
  extraDonors: [],
};

const field = "w-full rounded-lg border border-line bg-white/[0.03] px-3 py-2 text-sm text-text outline-none transition focus:border-signal/60";

function Seg<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: { id: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label mb-1.5">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.id} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal ${value === o.id ? "border-signal/60 bg-signal/10 text-text" : "border-line text-dim hover:border-white/20"}`}>
            <input type="radio" className="sr-only" name={legend} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
            {o.hint && <span className="ml-1.5 text-[0.68rem] text-faint">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition ${checked ? "border-signal/60 bg-signal/10 text-text" : "border-line text-dim hover:border-white/20"}`}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#7be0d0]" />
      {children}
    </label>
  );
}

interface DonorDraft {
  code: string;
  abo: Abo;
  rh: Rh;
  kell: Donor["kell"];
  rhc: Donor["rhc"];
  rhe: Donor["rhe"];
  duffy: Donor["duffy"];
  units: string;
  distanceKm: string;
  hoursToExpiry: string;
  available: boolean;
}

const EMPTY_DRAFT: DonorDraft = { code: "", abo: "O", rh: "-", kell: "K-", rhc: "c-", rhe: "E-", duffy: "Fy(a-)", units: "2", distanceKm: "5", hoursToExpiry: "200", available: true };

function Sel<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <div>
      <label htmlFor={id} className="label mb-1 block">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={field}>
        {options.map((o) => (
          <option key={o} value={o} className="bg-ink">{o}</option>
        ))}
      </select>
    </div>
  );
}

function ExtraDonors({ donors, takenCodes, onChange }: { donors: Donor[]; takenCodes: string[]; onChange: (d: Donor[]) => void }) {
  const [d, setD] = useState<DonorDraft>(EMPTY_DRAFT);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof DonorDraft>(k: K, v: DonorDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const add = () => {
    const code = d.code.trim().replace(/\s+/g, "-").slice(0, 20);
    const units = Number(d.units);
    const km = Number(d.distanceKm);
    const hrs = Number(d.hoursToExpiry);
    if (!code) return setErr("Give the donor option a code, e.g. X-201.");
    if ([...takenCodes, ...donors.map((x) => x.code)].some((c) => c.toLowerCase() === code.toLowerCase())) return setErr("That code is already in the inventory. Use a unique one.");
    if (!Number.isInteger(units) || units < 0 || units > 100) return setErr("Units must be a whole number from 0 to 100.");
    if (!Number.isFinite(km) || km < 0 || km > 500) return setErr("Distance must be between 0 and 500 km.");
    if (!Number.isFinite(hrs) || hrs < 0 || hrs > 2000 || d.hoursToExpiry.trim() === "") return setErr("Hours to expiry must be between 0 and 2000.");
    setErr(null);
    onChange([...donors, { code, abo: d.abo, rh: d.rh, kell: d.kell, rhc: d.rhc, rhe: d.rhe, duffy: d.duffy, units, distanceKm: km, available: d.available, hoursToExpiry: hrs }]);
    setD(EMPTY_DRAFT);
  };

  return (
    <div>
      <span className="label">Donor options (optional, up to 10)</span>
      <p className="mt-1 text-xs text-faint">Add your own donor unit to the inventory and see where it lands in the ranking.</p>
      {donors.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {donors.map((x) => (
            <li key={x.code} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-xs text-dim">
              <span className="min-w-0 truncate">
                <span className="font-mono text-text">{x.code}</span> · {x.abo}{x.rh} · {x.kell} {x.rhc} {x.rhe} {x.duffy} · {x.units}u · {x.distanceKm} km · {x.hoursToExpiry} h{!x.available && " · unavailable"}
              </span>
              <button type="button" onClick={() => onChange(donors.filter((y) => y.code !== x.code))} aria-label={`Remove donor option ${x.code}`} className="shrink-0 rounded p-1 text-faint hover:text-bad">
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {donors.length < 10 ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="bd-code" className="label mb-1 block">Code</label>
            <input id="bd-code" value={d.code} maxLength={20} onChange={(e) => set("code", e.target.value)} placeholder="X-201" className={field} />
          </div>
          <Sel id="bd-abo" label="ABO" value={d.abo} options={ABOS} onChange={(v) => set("abo", v)} />
          <Sel id="bd-rh" label="Rh" value={d.rh} options={["+", "-"] as Rh[]} onChange={(v) => set("rh", v)} />
          <Sel id="bd-kell" label="Kell" value={d.kell} options={["K+", "K-"] as Donor["kell"][]} onChange={(v) => set("kell", v)} />
          <Sel id="bd-c" label="Rh c" value={d.rhc} options={["c+", "c-"] as Donor["rhc"][]} onChange={(v) => set("rhc", v)} />
          <Sel id="bd-e" label="Rh E" value={d.rhe} options={["E+", "E-"] as Donor["rhe"][]} onChange={(v) => set("rhe", v)} />
          <Sel id="bd-duffy" label="Duffy" value={d.duffy} options={["Fy(a+)", "Fy(a-)"] as Donor["duffy"][]} onChange={(v) => set("duffy", v)} />
          <div>
            <label htmlFor="bd-units" className="label mb-1 block">Units</label>
            <input id="bd-units" inputMode="numeric" value={d.units} onChange={(e) => set("units", e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="bd-km" className="label mb-1 block">Distance km</label>
            <input id="bd-km" inputMode="decimal" value={d.distanceKm} onChange={(e) => set("distanceKm", e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="bd-hrs" className="label mb-1 block">Hours to expiry</label>
            <input id="bd-hrs" inputMode="decimal" value={d.hoursToExpiry} onChange={(e) => set("hoursToExpiry", e.target.value)} className={field} />
          </div>
          <div className="col-span-2 flex items-end gap-2 sm:col-span-2">
            <Check id="bd-avail" checked={d.available} onChange={(v) => set("available", v)}>Available</Check>
            <Button variant="ghost" onClick={add} className="!px-4 !py-2">
              <Plus className="h-4 w-4" aria-hidden /> Add donor
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-warn">Maximum of 10 donor options reached. Remove one to add another.</p>
      )}
      {err && (
        <p role="alert" className="mt-2 text-xs text-bad">
          {err}
        </p>
      )}
    </div>
  );
}

export function BloodForm({ form, onChange, onSubmit, onExample, onReset, busy, takenCodes }: { form: FormState; onChange: (f: FormState) => void; onSubmit: () => void; onExample: () => void; onReset: () => void; busy: boolean; takenCodes: string[] }) {
  const { recipient: r, constraints: c } = form;
  const setR = (p: Partial<Recipient>) => onChange({ ...form, recipient: { ...r, ...p } });
  const setC = (p: Partial<Constraints>) => onChange({ ...form, constraints: { ...c, ...p } });
  const unitsNum = Number(form.unitsText);
  const unitsBad = form.unitsText.trim() === "" || !Number.isInteger(unitsNum) || unitsNum < 1 || unitsNum > 20;

  return (
    <Glass className="p-5 sm:p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!unitsBad) onSubmit();
        }}
        className="space-y-6"
        noValidate
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-medium">Recipient</h2>
          <Button variant="ghost" onClick={onExample} className="!px-4 !py-1.5 text-xs">
            Load emergency example
          </Button>
        </div>
        <Seg legend="ABO group" value={r.abo} options={ABOS.map((a) => ({ id: a, label: a }))} onChange={(abo) => setR({ abo })} />
        <Seg legend="Rh(D)" value={r.rh} options={[{ id: "+" as Rh, label: "Positive" }, { id: "-" as Rh, label: "Negative" }]} onChange={(rh) => setR({ rh })} />
        <fieldset>
          <legend className="label mb-1.5">Known antibodies</legend>
          <div className="flex flex-wrap gap-1.5">
            {ANTIBODIES.map((a) => (
              <Check key={a} id={`ab-${a}`} checked={r.antibodies.includes(a)} onChange={(v) => setR({ antibodies: v ? [...r.antibodies, a] : r.antibodies.filter((x) => x !== a) })}>
                {a}
              </Check>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
          <div>
            <label htmlFor="bf-units" className="label mb-1.5 block">Units needed</label>
            <input id="bf-units" inputMode="numeric" value={form.unitsText} aria-invalid={unitsBad} aria-describedby={unitsBad ? "bf-units-err" : undefined} onChange={(e) => onChange({ ...form, unitsText: e.target.value, recipient: { ...r, unitsNeeded: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : r.unitsNeeded } })} className={`${field} ${unitsBad ? "!border-bad/60" : ""}`} />
            {unitsBad && <p id="bf-units-err" role="alert" className="mt-1 text-xs text-bad">Enter a whole number from 1 to 20.</p>}
          </div>
          <Seg legend="Urgency" value={r.urgency} options={URGENCIES} onChange={(urgency) => setR({ urgency })} />
        </div>
        <Check id="bf-chronic" checked={r.chronicTransfusion} onChange={(chronicTransfusion) => setR({ chronicTransfusion })}>
          Chronic transfusion or child-bearing potential (extended antigen matching)
        </Check>

        <div className="hairline" />
        <h2 className="text-base font-medium">Constraints</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="bf-dist" className="label mb-1.5 flex justify-between">
              <span>Max distance</span>
              <span className="text-text">{c.maxDistanceKm} km</span>
            </label>
            <input id="bf-dist" type="range" min={1} max={150} step={1} value={c.maxDistanceKm} onChange={(e) => setC({ maxDistanceKm: Number(e.target.value) })} className="w-full accent-[#7be0d0]" />
          </div>
          <div>
            <label htmlFor="bf-exp" className="label mb-1.5 flex justify-between">
              <span>Min hours to expiry</span>
              <span className="text-text">{c.minHoursToExpiry} h</span>
            </label>
            <input id="bf-exp" type="range" min={0} max={240} step={1} value={c.minHoursToExpiry} onChange={(e) => setC({ minHoursToExpiry: Number(e.target.value) })} className="w-full accent-[#7be0d0]" />
          </div>
        </div>
        <Check id="bf-rh" checked={c.allowRhMismatch} onChange={(allowRhMismatch) => setC({ allowRhMismatch })}>
          Allow Rh mismatch (simulated emergency override)
        </Check>

        <div className="hairline" />
        <ExtraDonors donors={form.extraDonors} takenCodes={takenCodes} onChange={(extraDonors) => onChange({ ...form, extraDonors })} />

        <div className="flex flex-wrap gap-2.5 pt-1">
          <Button type="submit" disabled={busy || unitsBad}>
            {busy ? "Matching…" : "Run matching"}
          </Button>
          <Button variant="ghost" onClick={onReset} disabled={busy}>
            Reset
          </Button>
        </div>
      </form>
    </Glass>
  );
}

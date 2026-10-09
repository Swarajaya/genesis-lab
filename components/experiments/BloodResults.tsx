"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CircleAlert, X } from "lucide-react";
import BloodNetwork from "@/components/3d/blood/BloodNetwork";
import { VERDICT_COLOR } from "@/components/3d/blood/layout";
import { Glass } from "@/components/ui/Glass";
import type { FactorStatus, MatchResult, Verdict } from "@/lib/engines/blood/engine";

export interface BloodResponse {
  ranking: MatchResult[];
  counts: Record<Verdict, number>;
  explanation: { summary: string; points: string[] } | null;
  aiNote: string | null;
  provider: string | null;
  inventorySource: string;
  saved: boolean;
}

const VERDICT_LABEL: Record<Verdict, string> = { MATCH: "Match", PARTIAL: "Partial", INCOMPATIBLE: "Incompatible" };

function FactorIcon({ s }: { s: FactorStatus }) {
  if (s === "pass") return <Check className="h-3.5 w-3.5 text-ok" aria-label="Pass" />;
  if (s === "warn") return <CircleAlert className="h-3.5 w-3.5 text-warn" aria-label="Warning" />;
  return <X className="h-3.5 w-3.5 text-bad" aria-label="Fail" />;
}

function VerdictPill({ v }: { v: Verdict }) {
  return (
    <span className="label rounded-full border px-2 py-0.5" style={{ color: VERDICT_COLOR[v], borderColor: `${VERDICT_COLOR[v]}55` }}>
      {VERDICT_LABEL[v]}
    </span>
  );
}

export function BloodResults({ data, selected, hovered, onSelect, onHover }: { data: BloodResponse; selected: string | null; hovered: string | null; onSelect: (c: string | null) => void; onHover: (c: string | null) => void }) {
  const focus = data.ranking.find((r) => r.donor.code === (hovered ?? selected)) ?? null;
  const best = data.ranking[0];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["MATCH", "PARTIAL", "INCOMPATIBLE"] as Verdict[]).map((v) => (
          <Glass key={v} className="flex items-center justify-between p-4">
            <div>
              <span className="label" style={{ color: VERDICT_COLOR[v] }}>{VERDICT_LABEL[v]}</span>
              <p className="display mt-1 text-4xl">{data.counts[v]}</p>
            </div>
            <span className="h-3 w-3 rounded-full" style={{ background: VERDICT_COLOR[v], boxShadow: `0 0 18px ${VERDICT_COLOR[v]}` }} aria-hidden />
          </Glass>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Glass className="relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
            <span className="label">Living network</span>
            <span className="text-[0.7rem] text-faint">Edge weight = score · node size = units in stock · hover or click a node</span>
          </div>
          <div className="relative mx-auto aspect-square max-h-[560px] w-full">
            <BloodNetwork ranking={data.ranking} selected={selected} hovered={hovered} onSelect={(c) => onSelect(c === selected ? null : c)} onHover={onHover} />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 min-h-[3.25rem] rounded-xl border border-line bg-black/40 px-3.5 py-2 text-xs backdrop-blur" aria-live="polite">
              {focus ? (
                <>
                  <span className="font-mono text-text">{focus.donor.code}</span> · {focus.donor.abo}{focus.donor.rh} · <span style={{ color: VERDICT_COLOR[focus.verdict] }}>{VERDICT_LABEL[focus.verdict]}</span> · score {focus.score} · ETA {focus.etaMinutes} min · {focus.donor.units} units
                </>
              ) : (
                <span className="text-faint">Recipient at the centre. Closer orbit means shorter distance.</span>
              )}
            </div>
          </div>
        </Glass>

        <div className="space-y-5">
          <Glass className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label">AI explanation</span>
              {data.provider && <span className="label">via {data.provider}</span>}
            </div>
            {data.explanation ? (
              <div className="mt-2">
                <p className="text-sm leading-relaxed">{data.explanation.summary}</p>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-dim">
                  {data.explanation.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-dim">{data.aiNote ?? "No AI explanation was returned for this run."}</p>
            )}
          </Glass>
          <Glass className="p-5">
            <span className="label">Run details</span>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-faint">Inventory source</dt>
              <dd>{data.inventorySource}</dd>
              <dt className="text-faint">Donor units evaluated</dt>
              <dd>{data.ranking.length}</dd>
              {best && best.verdict !== "INCOMPATIBLE" && (
                <>
                  <dt className="text-faint">Fastest top pick ETA</dt>
                  <dd>{best.donor.code}, {best.etaMinutes} min</dd>
                </>
              )}
              <dt className="text-faint">Run record</dt>
              <dd className={data.saved ? "text-ok" : "text-dim"}>{data.saved ? "Saved to Supabase" : "Not persisted"}</dd>
            </dl>
          </Glass>
        </div>
      </div>

      <Glass className="p-5">
        <span className="label">Ranked donors</span>
        {data.counts.MATCH + data.counts.PARTIAL === 0 && (
          <p role="status" className="mt-2 rounded-xl border border-warn/30 bg-warn/[0.07] px-3.5 py-2.5 text-sm text-warn">
            No compatible donor units under these constraints. Try widening the distance, lowering the minimum shelf life, or enabling the Rh override to see how the ranking changes.
          </p>
        )}
        <ol className="mt-3 space-y-2">
          {data.ranking.map((r, i) => {
            const open = r.donor.code === selected;
            const c = VERDICT_COLOR[r.verdict];
            return (
              <li key={r.donor.code} className={`rounded-xl border transition ${open ? "border-white/25 bg-white/[0.05]" : "border-line"}`} onMouseEnter={() => onHover(r.donor.code)} onMouseLeave={() => onHover(null)}>
                <button type="button" aria-expanded={open} aria-controls={`bf-${r.donor.code}`} onClick={() => onSelect(open ? null : r.donor.code)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left">
                  <span className="label w-6">{i + 1}</span>
                  <span className="font-mono text-sm">{r.donor.code}</span>
                  <span className="text-sm text-dim">{r.donor.abo}{r.donor.rh} · {r.donor.units}u · {r.donor.distanceKm} km</span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-dim">ETA {r.etaMinutes} min</span>
                    <span className="flex items-center gap-2" aria-label={`Score ${r.score} of 100`}>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10" aria-hidden>
                        <motion.span className="block h-full rounded-full" style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${r.score}%` }} transition={{ duration: 0.6 }} />
                      </span>
                      <span className="w-7 text-right font-mono text-xs">{r.score}</span>
                    </span>
                    <VerdictPill v={r.verdict} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div id={`bf-${r.donor.code}`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35 }} className="overflow-hidden">
                      <ul className="space-y-2 border-t border-line px-4 py-3">
                        {r.factors.map((f) => (
                          <li key={f.id} className="flex gap-2.5 text-sm">
                            <span className="mt-0.5 shrink-0"><FactorIcon s={f.status} /></span>
                            <span>
                              <span className="text-text">{f.label}</span>
                              <span className="block text-dim">{f.detail}</span>
                            </span>
                          </li>
                        ))}
                        <li className="pt-1 text-xs text-faint">
                          Antigens: {r.donor.kell} {r.donor.rhc} {r.donor.rhe} {r.donor.duffy} · {r.donor.hoursToExpiry} h to expiry · {r.donor.available ? "available" : "unavailable"}
                        </li>
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ol>
      </Glass>
    </div>
  );
}

"use client";
import { useEffect, useRef } from "react";
import { SDGS } from "@/lib/sdgs";
import { sdgsFor, ruleExplanation } from "@/lib/engines/object/scoring";
import { BANDS, CI_WEIGHTS } from "@/lib/engines/object/scoring";
import { CATEGORY_META, MATERIAL_COLOR, MATERIAL_LABEL, PROV_COLOR, candidateCount, clock, fmtKg, fmtTime, num3, type BaselineFuture, type EngineEvent, type ObjectAnalysis, type Pathway } from "./model";
import type { ObjectRunResult } from "@/lib/engines/object/types";
import { Bar, Metric, Panel, ProvTag, Ticker } from "./ui";

/* ============================================================ MATERIAL DNA */

export function MaterialDnaPanel({ analysis }: { analysis: ObjectAnalysis }) {
  const { profile, dna } = analysis;
  const estProv = profile.components[0]?.prov ?? "UNKNOWN";
  const indicators: { label: string; value: number; invert?: boolean; what: string; assumptions: string[] }[] = [
    { label: "Recoverability", value: dna.recoverability, what: "Mass-weighted chance that parts can be kept in use or recovered if handled properly.", assumptions: ["Each component carries a 0..1 recoverability judgement.", "Weighted by the component's share of mass."] },
    { label: "Repairability", value: dna.repairability, what: "How feasible it is to restore the whole object to working order.", assumptions: ["A single 0..1 judgement for the object, not a repair-index score."] },
    { label: "Separability", value: dna.separability, what: "Mass-weighted ease of separating components from each other.", assumptions: ["Glued or fused assemblies score low.", "Judged from object type, not from a teardown."] },
    { label: "Durability", value: dna.durability, what: "Expected resistance to further wear.", assumptions: ["A single 0..1 judgement for the object type."] },
    { label: "Contamination risk", value: dna.contaminationRisk, invert: true, what: profile.contamination.note || "Likelihood that residue or foreign material limits reuse or recycling.", assumptions: [`Level: ${dna.contaminationLevel}. Mapped to 0.15 / 0.45 / 0.8 for low / medium / high.`] },
    { label: "Retention potential", value: dna.retentionPotential, what: "Highest share of the object's mass that any discovered pathway keeps in use or in a recovery loop.", assumptions: ["Computed after pathway search from the scoring model's material-retained term."] },
  ];
  const srcText = profile.source === "reference" ? "Curated in-app reference table for this object type. It is a typical profile, not a measurement of your item." : profile.imageUsed ? "A vision-capable model inferred this from your photo. A photo cannot reveal exact composition." : "A language model inferred this from the object name. No physical measurement was made.";
  return (
    <Panel title="Material DNA" tag={<ProvTag prov={profile.materials[0]?.prov ?? "UNKNOWN"} />}>
      <div className="space-y-2.5">
        {profile.materials.map((m) => (
          <div key={m.material}>
            <div className="flex items-baseline justify-between text-base">
              <span className="text-[var(--x5-text)]">{MATERIAL_LABEL[m.material]}</span>
              <span className="x5-mono tabular-nums text-[var(--x5-dim)]">
                ≈ <Ticker value={m.share * 100} digits={0} />%
              </span>
            </div>
            <Bar value={m.share} color={MATERIAL_COLOR[m.material]} label={`${MATERIAL_LABEL[m.material]} ${Math.round(m.share * 100)} percent`} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-[var(--x5-faint)]">Shares are estimates by mass. {srcText}</p>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4" style={{ borderColor: "var(--x5-line)" }}>
        {indicators.map((i) => (
          <Metric
            key={i.label}
            label={i.label}
            value={<span className="x5-mono text-xl tabular-nums">{Math.round(i.value * 100)}</span>}
            bar={i.value}
            barColor={i.invert ? "var(--x5-warn)" : "var(--x5-cyan)"}
            prov={i.label === "Retention potential" ? "HEURISTIC" : estProv}
            explain={{ what: i.what, source: i.label === "Retention potential" ? "Derived from the deterministic scoring model after search." : srcText, assumptions: i.assumptions }}
          />
        ))}
      </div>
    </Panel>
  );
}

/* ============================================================ COMPONENT MAP (list) */

export function ComponentList({ analysis, active, onActive, counts }: { analysis: ObjectAnalysis; active: string | null; onActive: (id: string | null) => void; counts?: Map<string, number> }) {
  const p = analysis.profile;
  return (
    <Panel title={`Component map · ${p.components.length}`} bodyClassName="p-0">
      <ul className="x5-scroll max-h-[19rem] divide-y overflow-y-auto" style={{ borderColor: "var(--x5-line)" }}>
        {p.components.map((c) => (
          <li key={c.id} style={{ borderColor: "var(--x5-line)" }}>
            <button type="button" onMouseEnter={() => onActive(c.id)} onMouseLeave={() => onActive(null)} onFocus={() => onActive(c.id)} onBlur={() => onActive(null)} onClick={() => onActive(active === c.id ? null : c.id)} aria-pressed={active === c.id} className={`block w-full px-4 py-2.5 text-left transition hover:bg-white/[0.03] ${active === c.id ? "bg-white/[0.05]" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0" style={{ background: MATERIAL_COLOR[c.material] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-lg text-[var(--x5-text)]">{c.name}</span>
                {c.hazardous && <span className="x5-mono border px-1 text-[0.8rem] tracking-widest" style={{ borderColor: "var(--x5-bad)", color: "var(--x5-bad)" }}>HAZARD</span>}
                <ProvTag prov={c.prov} />
              </div>
              <div className="x5-mono mt-1 flex flex-wrap gap-x-3 text-[0.9rem] text-[var(--x5-dim)]">
                <span>{MATERIAL_LABEL[c.material].toLowerCase()}</span>
                <span>≈ {Math.round(c.massFraction * 100)}% · {c.massKg < 0.1 ? `${Math.round(c.massKg * 1000)} g` : `${c.massKg.toFixed(2)} kg`}</span>
                <span>{c.condition}</span>
                <span>recov. {Math.round(c.recoverability * 100)}</span>
                {counts && <span className="text-[var(--x5-cyan)]">{counts.get(c.id) ?? 0} futures</span>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ============================================================ CIRCULARITY INDEX */

export function CircularityPanel({ pathway, baseline, spaceIndex }: { pathway: Pathway | null; baseline: BaselineFuture; spaceIndex: number | null }) {
  const s = pathway?.score;
  const ci = s?.circularityIndex ?? 0;
  return (
    <Panel title="Circularity index" tag={<ProvTag prov="HEURISTIC" />}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-5xl font-light leading-none text-[var(--x5-cyan)]">
            <Ticker value={ci} digits={1} />
          </div>
          <p className="x5-label mt-2">{pathway ? `pathway #${num3(pathway.num)}` : "no pathway selected"}</p>
        </div>
        <div className="text-right">
          <p className="x5-label">Disposal</p>
          <p className="x5-mono text-2xl tabular-nums text-[var(--x5-faint)]">{baseline.score.circularityIndex.toFixed(1)}</p>
          {spaceIndex !== null && (
            <>
              <p className="x5-label mt-1">Top-10 mean</p>
              <p className="x5-mono text-lg tabular-nums text-[var(--x5-dim)]">{spaceIndex.toFixed(1)}</p>
            </>
          )}
        </div>
      </div>
      {s && (
        <div className="mt-4 space-y-3 border-t pt-3" style={{ borderColor: "var(--x5-line)" }}>
          <div>
            <p className="x5-label mb-1.5">Contributors</p>
            <ul className="space-y-1.5">
              {s.contributors.map((t) => (
                <li key={t.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-base" title={`value ${t.value} × weight ${t.weight}`}>
                  <span className="truncate text-[var(--x5-dim)]">+ {t.label}</span>
                  <span className="x5-mono tabular-nums text-[var(--x5-green)]">+{t.points.toFixed(1)}</span>
                  <div className="col-span-2">
                    <Bar value={t.points} max={100 * t.weight} color="var(--x5-green)" label={t.label} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="x5-label mb-1.5">Penalties</p>
            <ul className="space-y-1.5">
              {s.penalties.map((t) => (
                <li key={t.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-base" title={`value ${t.value} × weight ${t.weight}`}>
                  <span className="truncate text-[var(--x5-dim)]">− {t.label}</span>
                  <span className="x5-mono tabular-nums text-[var(--x5-bad)]">{t.points.toFixed(1)}</span>
                  <div className="col-span-2">
                    <Bar value={-t.points} max={100 * t.weight} color="var(--x5-bad)" label={t.label} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <details className="text-[0.9rem] text-[var(--x5-faint)]">
            <summary className="x5-label cursor-pointer hover:!text-[var(--x5-dim)]">Inspect calculation</summary>
            <div className="mt-2 space-y-1.5 leading-relaxed">
              <p>
                index = clamp( Σ w·term − Σ w·penalty ) × 100. Weights: retained {CI_WEIGHTS.contributors.retained}, lifetime {CI_WEIGHTS.contributors.lifetime}, components {CI_WEIGHTS.contributors.components}, reversibility {CI_WEIGHTS.contributors.reversibility}, future recovery {CI_WEIGHTS.contributors.future}; penalties: inputs {CI_WEIGHTS.penalties.added}, processing {CI_WEIGHTS.penalties.processing}, irreversible {CI_WEIGHTS.penalties.irreversible}.
              </p>
              <p>
                Band values: retention full {BANDS.retention.full}, high {BANDS.retention.high}, medium {BANDS.retention.medium}, low {BANDS.retention.low}; lifetime normalised against 10 years. Weights and bands are heuristic design choices, not calibrated measurements.
              </p>
              <p>Each term&apos;s raw value × weight gives the points shown above; hover a row for its raw value.</p>
            </div>
          </details>
        </div>
      )}
    </Panel>
  );
}

/* ============================================================ BASELINE VS SECOND LIFE */

export function BaselinePanel({ baseline, pathway }: { baseline: BaselineFuture; pathway: Pathway | null }) {
  const b = baseline.score.metrics;
  const m = pathway?.score.metrics;
  const rows: { label: string; base: number; alt: number | null; fmt: (n: number) => string; max: number; good: boolean }[] = [
    { label: "Material retained", base: b.materialRetained, alt: m?.materialRetained ?? null, fmt: (n) => `${Math.round(n * 100)}%`, max: 1, good: true },
    { label: "Useful lifetime added", base: b.lifetimeYears, alt: m?.lifetimeYears ?? null, fmt: (n) => `${n.toFixed(1)} yr`, max: 12, good: true },
    { label: "Waste diverted", base: b.wasteDivertedKg, alt: m?.wasteDivertedKg ?? null, fmt: (n) => `${fmtKg(n)} kg`, max: Math.max(b.wasteDivertedKg, m?.wasteDivertedKg ?? 0, 1e-6), good: true },
    { label: "Processing burden", base: b.processingBurden, alt: m?.processingBurden ?? null, fmt: (n) => `${Math.round(n * 100)}%`, max: 1, good: false },
  ];
  return (
    <Panel title="Baseline vs second life" tag={<ProvTag prov="HEURISTIC" />}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-base">
        <p className="x5-label !text-[var(--x5-bad)]">Baseline · disposal</p>
        <p className="x5-label !text-[var(--x5-green)]">{pathway ? `Second life · #${num3(pathway.num)}` : "Second life"}</p>
      </div>
      <div className="mt-3 space-y-3.5">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="x5-label mb-1">{r.label}</p>
            <div className="grid grid-cols-2 gap-x-4">
              <div>
                <Bar value={r.base} max={r.max} color="var(--x5-bad)" label={`baseline ${r.label}`} />
                <p className="x5-mono mt-1 text-[0.9rem] tabular-nums text-[var(--x5-dim)]">{r.fmt(r.base)}</p>
              </div>
              <div>
                <Bar value={r.alt ?? 0} max={r.max} color={r.good ? "var(--x5-green)" : "var(--x5-warn)"} label={`second life ${r.label}`} />
                <p className="x5-mono mt-1 text-[0.9rem] tabular-nums text-[var(--x5-text)]">{r.alt === null ? "—" : r.fmt(r.alt)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-[var(--x5-faint)]">{baseline.assumptions[0]} Differences are model outputs for comparison, not measured environmental claims.</p>
    </Panel>
  );
}

/* ============================================================ SDG */

export function SdgStrip({ pathway }: { pathway: Pathway | null }) {
  const hits = pathway ? sdgsFor(pathway) : [];
  return (
    <Panel title="SDG alignment" tag={pathway ? <span className="x5-label">#{num3(pathway.num)}</span> : undefined}>
      {hits.length === 0 ? (
        <p className="text-base text-[var(--x5-faint)]">{pathway ? "No goal is justified by this pathway's numbers." : "Select a pathway to see which goals its numbers support."}</p>
      ) : (
        <ul className="space-y-2.5">
          {hits.map((h) => (
            <li key={h.id} className="flex gap-3">
              <span className="x5-mono flex h-9 w-9 shrink-0 items-center justify-center text-lg font-semibold text-white" style={{ background: (SDGS[h.id] ?? { color: "#4a5a63" }).color }} aria-hidden>
                {h.id}
              </span>
              <div className="min-w-0">
                <p className="text-base text-[var(--x5-text)]">
                  <span className="x5-label mr-2">{h.level}</span>
                  SDG {h.id} · {(SDGS[h.id] ?? { title: "" }).title}
                </p>
                <p className="mt-0.5 text-[0.9rem] leading-relaxed text-[var(--x5-dim)]">{h.reason}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ============================================================ METRICS STRIP */

export function MetricsStrip({ result }: { result: ObjectRunResult }) {
  const st = result.stats;
  const best = (f: (p: Pathway) => number) => result.pathways.reduce((m, p) => Math.max(m, f(p)), 0);
  const items: { label: string; value: string }[] = [
    { label: "Pathways discovered", value: String(st.selected) },
    { label: "Candidates evaluated", value: String(st.evaluated) },
    { label: "Components analysed", value: String(result.analysis.profile.components.length) },
    { label: "Categories", value: String(st.categoriesPresent) },
    { label: "Duplicates removed", value: String(st.duplicatesRemoved) },
    { label: "Rejected by rules", value: String(st.rejected) },
    { label: "Best circularity", value: best((p) => p.score.circularityIndex).toFixed(1) },
    { label: "Best feasibility", value: best((p) => p.score.practicality).toFixed(0) },
    { label: "Max material retained", value: `${Math.round(best((p) => p.score.metrics.materialRetained) * 100)}%` },
  ];
  return (
    <div className="x5-panel grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9" role="list" aria-label="Research metrics">
      {items.map((i) => (
        <div key={i.label} role="listitem" className="border-r border-b px-3 py-2.5 last:border-r-0" style={{ borderColor: "var(--x5-line)" }}>
          <p className="x5-label !text-[0.8rem] leading-tight">{i.label}</p>
          <p className="x5-mono mt-1 text-2xl tabular-nums text-[var(--x5-text)]">{i.value}</p>
        </div>
      ))}
    </div>
  );
}

/* ============================================================ PIPELINE PROGRESS */

const STAGES: { key: string; label: string; done: (codes: Set<string>) => boolean; active: (codes: Set<string>) => boolean }[] = [
  { key: "mat", label: "MATERIAL ANALYSIS", done: (c) => c.has("MATERIAL_ANALYSIS"), active: (c) => c.has("OBJECT_RECEIVED") },
  { key: "cmp", label: "COMPONENT DECOMPOSITION", done: (c) => c.has("COMPONENTS"), active: (c) => c.has("MATERIAL_ANALYSIS") },
  { key: "con", label: "CONSTRAINT EXTRACTION", done: (c) => c.has("CONSTRAINTS"), active: (c) => c.has("COMPONENTS") },
  { key: "gen", label: "PATHWAY GENERATION", done: (c) => c.has("VALIDATION"), active: (c) => c.has("SEARCH_START") },
  { key: "val", label: "PATHWAY VALIDATION", done: (c) => c.has("VALIDATION"), active: (c) => c.has("SEARCH_START") },
  { key: "sco", label: "PATHWAY SCORING", done: (c) => c.has("SCORING"), active: (c) => c.has("VALIDATION") },
  { key: "opt", label: "OPTIMIZATION", done: (c) => c.has("OPTIMIZATION"), active: (c) => c.has("DEDUPE") },
];

export function PipelineProgress({ events, running }: { events: EngineEvent[]; running: boolean }) {
  const codes = new Set(events.map((e) => e.code));
  const cand = candidateCount(events);
  let activeFound = false;
  return (
    <Panel title="Possibility space" tag={running ? <span className="x5-label x5-blink !text-[var(--x5-cyan)]">computing</span> : undefined}>
      <ol className="space-y-1.5" aria-live="polite">
        {STAGES.map((s) => {
          const done = s.done(codes);
          const act = !done && !activeFound && (s.active(codes) || codes.size === 0 && s.key === "mat");
          if (act) activeFound = true;
          const state = done ? "COMPLETE" : act && running ? "IN PROGRESS" : "WAITING";
          return (
            <li key={s.key} className="flex items-center gap-3 text-base">
              <span className={`h-2 w-2 shrink-0 ${act && running ? "x5-blink" : ""}`} style={{ background: done ? "var(--x5-green)" : act && running ? "var(--x5-cyan)" : "rgb(255 255 255 / 0.14)" }} aria-hidden />
              <span className={`x5-mono tracking-wider ${done || act ? "text-[var(--x5-text)]" : "text-[var(--x5-faint)]"}`}>{s.label}</span>
              <span className="x5-mono ml-auto text-[0.85rem] tracking-widest text-[var(--x5-faint)]">→ {state}</span>
            </li>
          );
        })}
      </ol>
      {cand !== null && (
        <p className="x5-mono mt-3 border-t pt-3 text-base text-[var(--x5-dim)]" style={{ borderColor: "var(--x5-line)" }}>
          <span className="text-[var(--x5-cyan)]">{cand}</span> candidates generated so far
        </p>
      )}
    </Panel>
  );
}

/* ============================================================ EVENT STREAM */

export function EventStream({ events, className = "" }: { events: EngineEvent[]; className?: string }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);
  return (
    <Panel title="Event stream" className={className} bodyClassName="p-0">
      <ol ref={ref} className="x5-term x5-scroll max-h-56 overflow-y-auto px-4 py-3" aria-live="polite" aria-label="Engine events">
        {events.length === 0 && <li className="text-[var(--x5-faint)]">AWAITING OBJECT</li>}
        {events.map((e, i) => (
          <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-x-2">
            <time className="text-[var(--x5-faint)]">{clock(e.at)}</time>
            <span>
              <span className={e.code.includes("FAILED") || e.code.includes("NOT_SAVED") ? "text-[var(--x5-bad)]" : e.code === "OPTIMIZATION" || e.code === "SELECTED" ? "text-[var(--x5-green)]" : "text-[#e8ecf4]"}>{e.label}</span>
              {e.detail && <span className="text-[var(--x5-faint)]"> — {e.detail}</span>}
            </span>
          </li>
        ))}
        <li className="x5-blink text-[var(--x5-cyan)]" aria-hidden>
          ▌
        </li>
      </ol>
    </Panel>
  );
}

/* ============================================================ PATHWAY DETAIL */

export interface ExplainState {
  loading: boolean;
  summary: string;
  points: string[];
  from: "model" | "rules";
  provider: string | null;
}

export function PathwayDetail({ p, base, objectName, total, explain, inCompare, onToggleCompare, compareFull, constraintsNote }: { p: Pathway; base: BaselineFuture; objectName: string; total: number; explain: ExplainState | null; inCompare: boolean; onToggleCompare: () => void; compareFull: boolean; constraintsNote?: string }) {
  const meta = CATEGORY_META[p.category];
  const m = p.score.metrics;
  const unitProv = p.source === "model" ? "MODEL_ESTIMATE" : "HEURISTIC";
  void objectName;
  void total;
  const rows: { label: string; value: string; bar: number; color?: string; what: string; assumptions: string[] }[] = [
    { label: "Circularity", value: p.score.circularityIndex.toFixed(1), bar: p.score.circularityIndex / 100, what: "Circularity index of this pathway from the deterministic model.", assumptions: ["Weighted retained material, lifetime, component recovery, reversibility and future recovery, minus penalties for added inputs, processing and irreversibility."] },
    { label: "Feasibility", value: p.score.practicality.toFixed(0), bar: p.score.practicality / 100, what: "How practical the pathway is for an ordinary person.", assumptions: [`${p.tools.length} tool(s), skill ${p.skill}/5, ≈ ${fmtTime(p.timeMinutes)}, ${p.steps.length} steps, ${p.materials.length} extra material(s).`] },
    { label: "Material retention", value: `${Math.round(m.materialRetained * 100)}%`, bar: m.materialRetained, what: "Share of the object's mass kept in use or in a recovery loop.", assumptions: [`Retention band "${p.retention}" = ${BANDS.retention[p.retention]}, applied to ${p.target.kind === "whole" || (p.target.kind === "component" && p.target.wholeEffect) ? "the whole object" : "the targeted component only"}.`] },
    { label: "Waste diversion", value: `${fmtKg(m.wasteDivertedKg)} kg`, bar: m.materialRetained, what: "Object mass × material retained.", assumptions: ["Depends on the mass given or estimated for the object."] },
    { label: "Processing burden", value: `${Math.round(m.processingBurden * 100)}%`, bar: m.processingBurden, color: "var(--x5-warn)", what: "Relative processing intensity of the transformation.", assumptions: [`Transformation class "${p.transform}" = ${BANDS.processing[p.transform]}.`] },
    { label: "Additional inputs", value: `${Math.round(m.additionalInputs * 100)}%`, bar: m.additionalInputs, color: "var(--x5-warn)", what: "New materials or parts the pathway needs.", assumptions: [`Band "${p.added}" = ${BANDS.added[p.added]}.`] },
  ];
  return (
    <div className="space-y-4" aria-live="polite">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="x5-mono text-base text-[var(--x5-faint)]">PATHWAY #{num3(p.num)}</span>
          <span className="x5-label" style={{ color: meta.color }}>{meta.label}</span>
          <span className="x5-label">rank {p.rank}</span>
          <ProvTag prov={p.source === "model" ? "MODEL_ESTIMATE" : "HEURISTIC"} />
        </div>
        <h3 className="mt-1 text-3xl font-light leading-snug text-[var(--x5-text)]">{p.title}</h3>
        <p className="mt-1.5 text-lg leading-relaxed text-[var(--x5-dim)]">{p.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        {rows.map((r) => (
          <Metric key={r.label} label={r.label} value={<span className="x5-mono text-xl tabular-nums">{r.value}</span>} bar={r.bar} barColor={r.color} prov="HEURISTIC" explain={{ what: r.what, source: p.source === "model" ? "Qualitative bands proposed by a language model, converted to numbers by the deterministic scorer." : "Rule-library bands converted to numbers by the deterministic scorer.", assumptions: r.assumptions }} />
        ))}
        <Metric label="Confidence" value={<span className="x5-mono text-xl tabular-nums">{Math.round(p.score.confidence * 100)}%</span>} bar={p.score.confidence} prov="HEURISTIC" explain={{ what: "How much to trust this pathway's descriptors.", source: "Base 0.75 for rule-library pathways or 0.6 for model-proposed ones, scaled by confidence in the object profile and reduced when the engine had to correct a descriptor.", assumptions: ["Not a statistical probability."] }} />
        <Metric label="Emissions benefit (est.)" value={<span className="x5-mono text-xl tabular-nums">≈ {fmtKg(m.emissionsKg)} kg CO₂e</span>} prov={unitProv} explain={{ what: "Indicative embodied emissions of new material that this pathway avoids producing.", source: "Rounded per-material emission factors × mass × share of new production displaced, reduced by processing, added inputs and transport.", assumptions: ["Not a life-cycle assessment.", "Use-phase and end-of-life emissions are excluded.", `Baseline disposal is ${base.score.metrics.emissionsKg} by definition.`] }} />
      </div>

      {explain && (
        <div className="border-l-2 pl-3" style={{ borderColor: explain.from === "model" ? "var(--x5-warn)" : "var(--x5-line-strong)" }}>
          <div className="flex items-center gap-2">
            <span className="x5-label">Explanation</span>
            <ProvTag prov={explain.from === "model" ? "MODEL_ESTIMATE" : "HEURISTIC"} />
            {explain.loading && <span className="x5-label x5-blink">model refining</span>}
            {explain.from === "model" && explain.provider && <span className="x5-label">{explain.provider}</span>}
          </div>
          <p className="mt-1 text-lg leading-relaxed text-[var(--x5-text)]">{explain.summary}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-base leading-relaxed text-[var(--x5-dim)]">
            {explain.points.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="x5-label mb-1">Assumptions</p>
        <ul className="list-disc space-y-0.5 pl-4 text-base leading-relaxed text-[var(--x5-dim)]">
          {[...p.assumptions, ...p.notes, ...(constraintsNote ? [constraintsNote] : [])].map((a, i) => (
            <li key={i}>{a}</li>
          ))}
          <li>
            Descriptors: retention {p.retention}, transform {p.transform}, inputs {p.added}, lifetime {p.lifetime}, transport {p.transport}, reversible {p.reversible}.
          </li>
        </ul>
      </div>

      <div>
        <p className="x5-label mb-1">Required steps</p>
        <ol className="list-decimal space-y-1 pl-5 text-lg text-[var(--x5-dim)]">
          {p.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ChipList label="Tools" items={p.tools} />
        <ChipList label="Skills" items={p.skills} />
        <ChipList label="Extra materials" items={p.materials} />
      </div>

      <button type="button" className="x5-btn ghost" onClick={onToggleCompare} disabled={!inCompare && compareFull} aria-pressed={inCompare}>
        {inCompare ? "− Remove from comparison" : compareFull ? "Comparison full (4)" : "+ Add to comparison"}
      </button>
    </div>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="x5-label mb-1">{label}</p>
      {items.length === 0 ? (
        <p className="x5-mono text-[0.9rem] text-[var(--x5-faint)]">none</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {items.map((t, i) => (
            <li key={i} className="x5-mono border px-1.5 py-0.5 text-[0.9rem] text-[var(--x5-dim)]" style={{ borderColor: "var(--x5-line)" }}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============================================================ DATA PROVENANCE LEGEND */

export function ProvenanceLegend({ analysis }: { analysis: ObjectAnalysis }) {
  const p = analysis.profile;
  const rows: { label: string; value: string; prov: ObjectAnalysis["profile"]["nameProv"] }[] = [
    { label: "Object identity", value: p.name, prov: p.nameProv },
    { label: "Mass", value: `${p.massKg} kg`, prov: p.massProv },
    { label: "Condition", value: `${p.condition}${p.damage ? ` · ${p.damage}` : ""}`, prov: p.conditionProv },
    { label: "Contamination", value: p.contamination.level, prov: p.contamination.prov },
    { label: "Profile confidence", value: `${Math.round(p.confidence * 100)}%`, prov: "HEURISTIC" },
  ];
  return (
    <Panel title="Data provenance">
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 text-base">
            <span className="text-[var(--x5-dim)]">{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="x5-mono max-w-[11rem] truncate text-[var(--x5-text)]" title={r.value}>{r.value}</span>
              <ProvTag prov={r.prov} />
            </span>
          </li>
        ))}
      </ul>
      {p.notes && <p className="mt-3 border-t pt-3 text-[0.9rem] leading-relaxed text-[var(--x5-faint)]" style={{ borderColor: "var(--x5-line)" }}>{p.notes}</p>}
      <p className="mt-2 flex flex-wrap gap-1.5">
        {(["USER_INPUT", "VISION", "MODEL_ESTIMATE", "DATABASE", "HEURISTIC", "UNKNOWN"] as const).map((k) => (
          <span key={k} className="x5-mono text-[0.8rem] tracking-widest" style={{ color: PROV_COLOR[k] }}>
            ■ {k.replace("_", " ")}
          </span>
        ))}
      </p>
    </Panel>
  );
}

export { ruleExplanation };

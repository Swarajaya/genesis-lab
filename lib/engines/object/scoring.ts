import { factorFor, MATERIAL_VALUE, round } from "./knowledge";
import type {
  Added, BaselineFuture, Candidate, CiTerm, Constraint, Level, Lifetime, MaterialDna, Metrics, ObjectProfile, Pathway, Retention, Reversible, ScoreCard, Transform, Transport,
} from "./types";

/**
 * Deterministic multi-objective scoring. No model output ever sets a number here:
 * models and library rules supply qualitative bands, and the tables below convert bands to values.
 * Every table is exported so the UI can show its assumptions.
 */

export const BANDS = {
  retention: { none: 0, low: 0.25, medium: 0.5, high: 0.75, full: 0.95 } as Record<Retention, number>,
  processing: { none: 0, manual: 0.1, mechanical: 0.3, thermal: 0.55, chemical: 0.7, industrial: 0.8 } as Record<Transform, number>,
  energy: { none: 0, manual: 0.02, mechanical: 0.3, thermal: 0.8, chemical: 0.6, industrial: 0.7 } as Record<Transform, number>,
  added: { none: 0, minor: 0.15, moderate: 0.4, major: 0.7 } as Record<Added, number>,
  lifetimeYears: { none: 0, short: 0.5, medium: 2, long: 6, extended: 12 } as Record<Lifetime, number>,
  value: { none: 0, low: 0.2, medium: 0.5, high: 0.8 } as Record<Level, number>,
  displaces: { none: 0, low: 0.25, medium: 0.55, high: 0.85 } as Record<Level, number>,
  transport: { none: 0, local: 0.1, regional: 0.25, industrial: 0.4 } as Record<Transport, number>,
  reversible: { yes: 1, partly: 0.5, no: 0 } as Record<Reversible, number>,
};

export const CI_WEIGHTS = {
  contributors: { retained: 0.3, lifetime: 0.22, components: 0.18, reversibility: 0.12, future: 0.18 },
  penalties: { added: 0.2, processing: 0.15, irreversible: 0.1 },
};
export const COMPOSITE_WEIGHTS = { circularity: 0.35, practicality: 0.2, environmental: 0.2, economic: 0.1, lowCost: 0.15 };
export const LIFETIME_NORM_YEARS = 10;

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const pct = (n: number) => round(n * 100, 1);

export function affectedFraction(profile: ObjectProfile, c: Pick<Candidate, "target">): number {
  if (c.target.kind === "whole" || c.target.wholeEffect) return 1;
  const id = c.target.componentId;
  return profile.components.find((x) => x.id === id)?.massFraction ?? 1;
}

function mixedFactor(profile: ObjectProfile, c: Pick<Candidate, "target">): number {
  if (c.target.kind === "component") {
    const id = c.target.componentId;
    const comp = profile.components.find((x) => x.id === id);
    if (comp && !c.target.wholeEffect) return factorFor(comp.material);
  }
  return profile.materials.reduce((s, m) => s + m.share * factorFor(m.material), 0);
}

function materialValueIndex(profile: ObjectProfile, c: Pick<Candidate, "target">): number {
  if (c.target.kind === "component" && !c.target.wholeEffect) {
    const id = c.target.componentId;
    const comp = profile.components.find((x) => x.id === id);
    if (comp) return MATERIAL_VALUE[comp.material];
  }
  return profile.materials.reduce((s, m) => s + m.share * MATERIAL_VALUE[m.material], 0);
}

/** Share of object mass whose parts are kept or recovered, weighting each affected component by its recoverability. */
function componentRecovery(profile: ObjectProfile, c: Candidate): number {
  const band = BANDS.retention[c.retention];
  if (c.target.kind === "whole" || c.target.wholeEffect) return clamp(profile.components.reduce((s, k) => s + k.massFraction * band * k.recoverability, 0));
  const id = c.target.componentId;
  const comp = profile.components.find((x) => x.id === id);
  return comp ? clamp(comp.massFraction * band * comp.recoverability) : 0;
}

export function scoreCandidate(profile: ObjectProfile, c: Candidate, srcConfidence = 0.7): ScoreCard {
  const a = affectedFraction(profile, c);
  const R = a * BANDS.retention[c.retention];
  const Ly = a * BANDS.lifetimeYears[c.lifetime];
  const Ln = clamp(Ly / LIFETIME_NORM_YEARS);
  const V = BANDS.reversible[c.reversible];
  const A = BANDS.added[c.added];
  const P = BANDS.processing[c.transform];
  const E = BANDS.energy[c.transform];
  const T = BANDS.transport[c.transport];
  const D = BANDS.displaces[c.displaces];
  const C = componentRecovery(profile, c);
  const F = clamp(R * (0.5 * (1 - A) + 0.5 * V));
  const factor = mixedFactor(profile, c);
  const gross = profile.massKg * a * D * factor;
  const net = Math.max(0, gross * (1 - 0.5 * P - 0.3 * A - 0.5 * T));
  const emisNorm = profile.massKg * factor > 0 ? clamp(net / (profile.massKg * factor)) : 0;

  const transformationCost = clamp(0.35 * A + 0.3 * P + 0.2 * E + 0.15 * (T / 0.4));
  const toolN = Math.min(1, c.tools.length / 6);
  const skillN = (clamp(c.skill, 1, 5) - 1) / 4;
  const timeN = Math.min(1, Math.log10(1 + Math.max(0, c.timeMinutes)) / Math.log10(1 + 4320));
  const stepN = Math.min(1, Math.max(0, c.steps.length - 2) / 8);
  const accessPenalty = 0.5 * Math.min(1, c.materials.length / 4) + 0.5 * (T / 0.4);
  const feasibility = clamp(1 - (0.25 * toolN + 0.3 * skillN + 0.15 * timeN + 0.15 * stepN + 0.15 * accessPenalty));
  const economic = clamp(0.6 * BANDS.value[c.value] + 0.4 * materialValueIndex(profile, c) * R);

  const w = CI_WEIGHTS.contributors;
  const contributors: CiTerm[] = [
    { key: "retained", label: "Material retained", value: R, weight: w.retained, points: 100 * w.retained * R },
    { key: "lifetime", label: "Useful lifetime added", value: Ln, weight: w.lifetime, points: 100 * w.lifetime * Ln },
    { key: "components", label: "Component recovery", value: C, weight: w.components, points: 100 * w.components * C },
    { key: "reversibility", label: "Reversibility", value: V, weight: w.reversibility, points: 100 * w.reversibility * V },
    { key: "future", label: "Future recovery potential", value: F, weight: w.future, points: 100 * w.future * F },
  ];
  const pw = CI_WEIGHTS.penalties;
  const irreversible = c.transform === "none" ? 0 : 1 - V;
  const penalties: CiTerm[] = [
    { key: "added", label: "Additional inputs", value: A, weight: pw.added, points: -100 * pw.added * A },
    { key: "processing", label: "Processing burden", value: P, weight: pw.processing, points: -100 * pw.processing * P },
    { key: "irreversible", label: "Irreversible transformation", value: irreversible, weight: pw.irreversible, points: -100 * pw.irreversible * irreversible },
  ];
  const ci = clamp((contributors.reduce((s, t) => s + t.points, 0) + penalties.reduce((s, t) => s + t.points, 0)) / 100);

  const environmental = clamp(0.3 * R + 0.25 * emisNorm + 0.2 * D + 0.25 * (1 - P));
  const cw = COMPOSITE_WEIGHTS;
  const composite = cw.circularity * ci * 100 + cw.practicality * feasibility * 100 + cw.environmental * environmental * 100 + cw.economic * economic * 100 + cw.lowCost * (1 - transformationCost) * 100;

  const metrics: Metrics = {
    materialRetained: round(R, 4), wasteDivertedKg: round(profile.massKg * R, 4), lifetimeYears: round(Ly, 2), emissionsKg: round(net, 3), displacement: round(D * a, 4),
    processingBurden: round(P, 3), additionalInputs: round(A, 3), transportBurden: round(T, 3), energyBurden: round(E, 3), transformationCost: round(transformationCost, 3),
    componentRecovery: round(C, 4), reversibility: V, futureRecovery: round(F, 4), feasibility: round(feasibility, 4), economic: round(economic, 4),
  };
  return {
    metrics, environmental: pct(environmental), circularityDim: pct(ci), practicality: pct(feasibility), economicDim: pct(economic), transformation: pct(transformationCost),
    circularityIndex: pct(ci), contributors: contributors.map(roundTerm), penalties: penalties.map(roundTerm), composite: round(composite, 2), confidence: srcConfidence,
  };
}

const roundTerm = (t: CiTerm): CiTerm => ({ ...t, value: round(t.value, 3), points: round(t.points, 1) });

/** Baseline: mixed disposal with no recovery assumed. Scored by the same model so comparisons are like for like. */
export function baselineFuture(profile: ObjectProfile): BaselineFuture {
  const cand: Candidate = {
    key: "baseline", title: "Disposal (mixed waste)", category: "material_recovery", description: "The object is thrown away with mixed waste.", steps: ["Place in general waste", "Collected", "Landfilled or incinerated"], tools: [], skills: [], materials: [],
    target: { kind: "whole" }, community: false, source: "library", assumptions: [], notes: [], retention: "none", transform: "none", added: "none", lifetime: "none", value: "none", displaces: "none", transport: "regional", reversible: "no", skill: 1, timeMinutes: 0,
  };
  return {
    title: cand.title,
    score: scoreCandidate(profile, cand, 0.9),
    assumptions: [
      "Disposal assumes mixed waste with no material recovery. Informal or municipal recycling that may occur is not counted.",
      "Collection and transport to disposal is a regional-distance assumption, not a measured route.",
      "Landfill and incineration emissions are not modelled, so the baseline emissions benefit is zero by definition.",
    ],
  };
}

/* ============================================================ material DNA, constraints */

export function computeDna(profile: ObjectProfile): MaterialDna {
  const comps = profile.components;
  const wsum = (f: (c: (typeof comps)[number]) => number) => comps.reduce((s, c) => s + c.massFraction * f(c), 0);
  const level = { low: 0.15, medium: 0.45, high: 0.8, unknown: 0.5 }[profile.contamination.level];
  return {
    shares: profile.materials,
    recoverability: round(wsum((c) => c.recoverability), 3),
    repairability: round(profile.repairPotential, 3),
    separability: round(wsum((c) => c.separability), 3),
    durability: round(profile.durability, 3),
    contaminationRisk: level,
    contaminationLevel: profile.contamination.level,
    retentionPotential: 0,
  };
}

export function extractConstraints(profile: ObjectProfile): Constraint[] {
  const out: Constraint[] = [];
  const haz = profile.components.filter((c) => c.hazardous);
  if (haz.length) out.push({ id: "hazard", label: `Hazardous components: ${haz.map((h) => h.name).join(", ")}`, effect: "Do-it-yourself dismantling or repurposing pathways that involve these parts are rejected. Certified recovery routes remain allowed.", prov: "HEURISTIC" });
  if (profile.components.some((c) => c.kind === "storage") || /phone|laptop|computer|tablet/.test(profile.name.toLowerCase())) out.push({ id: "data", label: "Personal data may be present", effect: "Pathways that hand the device on must include a secure wipe step.", prov: "HEURISTIC" });
  if (profile.contamination.level === "high" || profile.contamination.level === "medium") out.push({ id: "contam", label: `Contamination risk: ${profile.contamination.level}`, effect: profile.contamination.note || "Cleaning is required before reuse or recycling.", prov: profile.contamination.prov });
  const sep = computeDna(profile).separability;
  out.push({ id: "sep", label: `Component separability ≈ ${Math.round(sep * 100)}%`, effect: sep < 0.6 ? "Parts are hard to separate. Pathways that need clean separation are limited." : "Parts separate reasonably, so component pathways are viable.", prov: profile.components[0]?.prov ?? "UNKNOWN" });
  if (profile.massKg < 0.1) out.push({ id: "scale", label: `Small mass (${profile.massKg} kg)`, effect: "Transport-heavy and industrial pathways have low absolute benefit per item.", prov: profile.massProv });
  if (profile.condition === "damaged") out.push({ id: "damage", label: "Object is damaged", effect: `${profile.damage || "Damage noted"}. Repair and component pathways gain relevance; direct resale loses it.`, prov: profile.conditionProv });
  return out;
}

/* ============================================================ explanations and impact */

export interface Explanation {
  summary: string;
  points: string[];
}

const P = (n: number) => `${Math.round(n * 100)}%`;

export function ruleExplanation(profile: ObjectProfile, base: BaselineFuture, p: Pathway, rankTotal: number): Explanation {
  const m = p.score.metrics;
  const top = [...p.score.contributors].sort((a, b) => b.points - a.points)[0];
  const heavy = [...p.score.penalties].sort((a, b) => a.points - b.points)[0];
  const parts: string[] = [];
  parts.push(`Pathway #${String(p.num).padStart(3, "0")} ranks ${p.rank} of ${rankTotal} with a circularity index of ${p.score.circularityIndex.toFixed(1)} against ${base.score.circularityIndex.toFixed(1)} for disposal.`);
  const summary = `${parts[0]} It keeps about ${P(m.materialRetained)} of the object's mass in use or in a recovery loop${m.additionalInputs <= 0.15 ? " while needing few additional inputs" : ` but needs ${m.additionalInputs >= 0.4 ? "substantial" : "some"} additional inputs`}.`;
  const points = [
    `Largest contributor: ${top.label.toLowerCase()} (+${top.points.toFixed(1)} points).`,
    heavy && heavy.points < 0 ? `Largest penalty: ${heavy.label.toLowerCase()} (${heavy.points.toFixed(1)} points).` : "No penalties apply to this pathway.",
    `Feasibility is ${p.score.practicality.toFixed(0)}/100 given ${p.tools.length} tool(s), skill level ${p.skill} of 5 and about ${p.timeMinutes} minutes.`,
    `Estimated emissions benefit is ≈ ${m.emissionsKg} kg CO₂e (indicative, heuristic factors, not a life-cycle result).`,
  ];
  return { summary, points };
}

export interface SdgHit {
  id: number;
  level: "primary" | "secondary" | "contextual";
  reason: string;
}

/** SDGs are attached only when the pathway's own numbers justify them. */
export function sdgsFor(p: Pathway): SdgHit[] {
  const m = p.score.metrics;
  const hits: SdgHit[] = [];
  if (m.materialRetained > 0) hits.push({ id: 12, level: "primary", reason: `Retains about ${P(m.materialRetained)} of the object's mass in use or in a recovery loop (modelled).` });
  if (m.emissionsKg > 0) hits.push({ id: 13, level: "secondary", reason: `Avoids an estimated ≈ ${m.emissionsKg} kg CO₂e of new production (indicative heuristic).` });
  if (p.community || p.transport === "local") hits.push({ id: 11, level: "contextual", reason: "The route runs through local or community channels and keeps the object out of municipal waste." });
  return hits;
}

export function aggregate(pathways: Pathway[]) {
  const cats = new Set(pathways.map((p) => p.category));
  const best = (f: (p: Pathway) => number) => pathways.reduce((mx, p) => Math.max(mx, f(p)), 0);
  const top10 = [...pathways].sort((a, b) => b.score.circularityIndex - a.score.circularityIndex).slice(0, 10);
  return {
    categories: cats.size,
    bestCircularity: best((p) => p.score.circularityIndex),
    bestFeasibility: best((p) => p.score.practicality),
    bestRetention: best((p) => p.score.metrics.materialRetained),
    bestEmissions: best((p) => p.score.metrics.emissionsKg),
    spaceIndex: top10.length ? round(top10.reduce((s, p) => s + p.score.circularityIndex, 0) / top10.length, 1) : 0,
  };
}

/* ============================================================ counterfactual comparison */

export interface CompareDim {
  key: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  max: number;
  get: (s: ScoreCard) => number;
  prov: "HEURISTIC" | "MODEL_ESTIMATE";
}

export const COMPARE_DIMS: CompareDim[] = [
  { key: "ci", label: "Circularity index", unit: "/100", higherIsBetter: true, max: 100, get: (s) => s.circularityIndex, prov: "HEURISTIC" },
  { key: "retained", label: "Material retained", unit: "%", higherIsBetter: true, max: 100, get: (s) => pct(s.metrics.materialRetained), prov: "HEURISTIC" },
  { key: "waste", label: "Waste diverted", unit: "kg", higherIsBetter: true, max: 0, get: (s) => s.metrics.wasteDivertedKg, prov: "HEURISTIC" },
  { key: "life", label: "Useful lifetime added", unit: "yr", higherIsBetter: true, max: 12, get: (s) => s.metrics.lifetimeYears, prov: "HEURISTIC" },
  { key: "proc", label: "Processing burden", unit: "%", higherIsBetter: false, max: 100, get: (s) => pct(s.metrics.processingBurden), prov: "HEURISTIC" },
  { key: "inputs", label: "Additional inputs", unit: "%", higherIsBetter: false, max: 100, get: (s) => pct(s.metrics.additionalInputs), prov: "HEURISTIC" },
  { key: "feas", label: "Feasibility", unit: "/100", higherIsBetter: true, max: 100, get: (s) => s.practicality, prov: "HEURISTIC" },
  { key: "econ", label: "Economic potential", unit: "/100", higherIsBetter: true, max: 100, get: (s) => s.economicDim, prov: "HEURISTIC" },
  { key: "co2", label: "Emissions benefit (est.)", unit: "kg CO₂e", higherIsBetter: true, max: 0, get: (s) => s.metrics.emissionsKg, prov: "MODEL_ESTIMATE" },
];

export interface CompareRow {
  dim: CompareDim;
  values: number[];
  /** index into values of the best entry, or -1 when all tie */
  best: number;
  /** delta of each value vs the first column (the reference), in the dimension's unit */
  delta: number[];
  scaleMax: number;
}

export function buildComparison(cards: ScoreCard[]): CompareRow[] {
  return COMPARE_DIMS.map((dim) => {
    const values = cards.map((c) => round(dim.get(c), 2));
    const max = Math.max(dim.max, ...values, 1e-9);
    const target = dim.higherIsBetter ? Math.max(...values) : Math.min(...values);
    const winners = values.filter((v) => v === target).length;
    return { dim, values, best: winners === values.length ? -1 : values.indexOf(target), delta: values.map((v) => round(v - values[0], 2)), scaleMax: max };
  });
}

/** Maps a pathway to the five-stage future simulator labels. */
export function phasesFor(p: Pick<Pathway, "category" | "target">): [string, string, string, string, string] {
  switch (p.category) {
    case "direct_reuse": return ["INSPECT", "CLEAN", "VERIFY", "HAND ON", "SECOND LIFE"];
    case "repair": return ["DIAGNOSE", "OPEN", "REPLACE", "REASSEMBLE", "SECOND LIFE"];
    case "remanufacturing": return ["DISASSEMBLE", "GRADE", "REBUILD", "TEST", "SECOND LIFE"];
    case "recycling": case "material_recovery": case "industrial_recovery": return ["DISASSEMBLE", "RECOVER", "SEPARATE", "PROCESS", "SECOND LIFE"];
    default: return ["DISASSEMBLE", "RECOVER", "SEPARATE", "TRANSFORM", "SECOND LIFE"];
  }
}

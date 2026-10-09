import { OPERATIONS, round, type Op } from "./knowledge";
import { scoreCandidate } from "./scoring";
import type { Candidate, Category, ObjectProfile, Pathway, Target } from "./types";

/**
 * Possibility space: expansion (rule library), normalisation (model proposals), validation, semantic de-duplication
 * and stratified selection. Pure and deterministic given its inputs.
 */

const SKILL_TEXT = ["", "No special skill", "Basic hand skills", "Intermediate craft or technical skill", "Advanced technical skill", "Expert skill"];
const fill = (s: string, o: string, c = "") => s.replace(/\{o\}/g, o).replace(/\{c\}/g, c);

function opApplies(op: Op, p: ObjectProfile): boolean {
  if (op.scope === "whole") {
    if (op.forms && !op.forms.includes(p.form)) return false;
    if (op.mats && !p.materials.some((m) => m.share >= 0.3 && op.mats?.includes(m.material))) return false;
    if (op.re && !op.re.test(p.name.toLowerCase())) return false;
    return true;
  }
  return p.components.length > 0;
}

function fromOp(op: Op, p: ObjectProfile, comp?: ObjectProfile["components"][number]): Candidate {
  const [retention, transform, added, lifetime, value, displaces, transport, reversible] = op.d;
  const target: Target = comp ? { kind: "component", componentId: comp.id, wholeEffect: Boolean(op.whole) } : { kind: "whole" };
  const unusedBy = op.whole ? "keeps the whole object in service" : comp ? "acts on this part only; the rest follows disposal in the model" : "acts on the whole object";
  return {
    key: `${op.k}:${comp?.id ?? "whole"}`,
    title: fill(op.title, p.name, comp?.name),
    category: op.c,
    description: fill(op.desc, p.name, comp?.name),
    steps: op.steps.map((s) => fill(s, p.name, comp?.name)),
    tools: [...op.tools],
    skills: [SKILL_TEXT[op.skill]],
    materials: [...op.mat],
    target,
    community: Boolean(op.comm),
    source: "library",
    assumptions: [`Rule "${op.k}" ${unusedBy}.`],
    notes: [],
    retention, transform, added, lifetime, value, displaces, transport, reversible, skill: op.skill, timeMinutes: op.time,
  };
}

export function expandLibrary(p: ObjectProfile): Candidate[] {
  const out: Candidate[] = [];
  for (const op of OPERATIONS) {
    if (!opApplies(op, p)) continue;
    if (op.scope === "whole") {
      out.push(fromOp(op, p));
      continue;
    }
    for (const comp of p.components) {
      if (op.kinds && !op.kinds.includes(comp.kind)) continue;
      if (op.mats && !op.mats.includes(comp.material)) continue;
      out.push(fromOp(op, p, comp));
    }
  }
  return out;
}

/* ============================================================ model proposals */

export interface RawModelCandidate {
  category: Category;
  title: string;
  description: string;
  steps: string[];
  tools: string[];
  materials: string[];
  component: string;
  community: boolean;
  retention: Candidate["retention"];
  transform: Candidate["transform"];
  added: Candidate["added"];
  lifetime: Candidate["lifetime"];
  value: Candidate["value"];
  displaces: Candidate["displaces"];
  transport: Candidate["transport"];
  reversible: Candidate["reversible"];
  skill: number;
  timeMinutes: number;
}

const STOP = new Set(["the", "a", "an", "of", "to", "for", "and", "or", "into", "in", "on", "with", "your", "old", "from", "as", "by", "its", "it", "this", "that", "use", "make", "turn", "convert"]);

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function resolveComponent(name: string, p: ObjectProfile) {
  const w = new Set(words(name));
  if (w.size === 0) return null;
  let best: { id: string; score: number } | null = null;
  for (const c of p.components) {
    const cw = words(c.name);
    const hit = cw.filter((x) => w.has(x)).length;
    if (hit > 0 && (!best || hit > best.score)) best = { id: c.id, score: hit };
  }
  return best ? p.components.find((c) => c.id === best.id) ?? null : null;
}

export function normalizeModel(raw: RawModelCandidate[], p: ObjectProfile): Candidate[] {
  return raw.map((r, i) => {
    const comp = r.component ? resolveComponent(r.component, p) : null;
    const wholeEffect = r.category === "repair" || r.category === "remanufacturing";
    const target: Target = comp ? { kind: "component", componentId: comp.id, wholeEffect } : { kind: "whole" };
    return {
      key: `m:${r.category}:${i}`,
      title: r.title, category: r.category, description: r.description, steps: r.steps, tools: r.tools, skills: [SKILL_TEXT[clampInt(r.skill, 1, 5)]], materials: r.materials,
      target, community: r.community, source: "model" as const,
      assumptions: ["Pathway proposed by a language model; bands were converted to numbers by the deterministic scorer."],
      notes: r.component && !comp ? [`Component "${r.component}" was not found, so the pathway is scored on the whole object.`] : [],
      retention: r.retention, transform: r.transform, added: r.added, lifetime: r.lifetime, value: r.value, displaces: r.displaces, transport: r.transport, reversible: r.reversible,
      skill: clampInt(r.skill, 1, 5), timeMinutes: Math.min(10080, Math.max(1, Math.round(r.timeMinutes))),
    };
  });
}

const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/* ============================================================ validation */

export interface Validation {
  kept: Candidate[];
  adjusted: number;
  rejected: { title: string; reason: string }[];
}

const DIY: Category[] = ["direct_reuse", "adaptive_reuse", "upcycling", "component_reuse", "creative_transformation"];
const DISMANTLE_HAZARD = /(open|dismantl|cut|puncture|disassembl|extract|remov|repurpos|rewir|reus|solder|heat|burn)\w*[^.]{0,50}\b(battery|batteries|lithium|li-ion|cell pack|mercury|asbestos)/i;
const WIPE = /\b(wipe|erase|reset|sanitis|sanitiz|delete)\w*/i;

export function validate(cands: Candidate[], p: ObjectProfile): Validation {
  const kept: Candidate[] = [];
  const rejected: Validation["rejected"] = [];
  let adjusted = 0;
  const hasData = p.form === "device" || p.components.some((c) => c.kind === "storage");
  for (const original of cands) {
    const c: Candidate = { ...original, steps: [...original.steps], notes: [...original.notes] };
    let touched = false;
    const adjust = (note: string) => {
      touched = true;
      c.notes.push(note);
    };
    if (c.title.length < 6 || c.title.length > 100 || c.steps.filter((s) => s.trim().length >= 3).length < 2) {
      rejected.push({ title: c.title.slice(0, 60), reason: "incomplete" });
      continue;
    }
    const text = `${c.title} ${c.steps.join(" ")} ${c.materials.join(" ")}`;
    const compTarget = c.target.kind === "component" ? p.components.find((x) => x.id === (c.target as { componentId: string }).componentId) : undefined;
    if ((DIY.includes(c.category) && (DISMANTLE_HAZARD.test(text) || (compTarget?.hazardous ?? false))) || (c.category === "repair" && compTarget?.hazardous && DISMANTLE_HAZARD.test(text) && c.skill < 3)) {
      rejected.push({ title: c.title.slice(0, 60), reason: "hazard" });
      continue;
    }
    // Category-descriptor coherence. The engine corrects the band rather than trusting the proposer.
    if (c.category === "direct_reuse") {
      if (c.transform !== "none" && c.transform !== "manual") { c.transform = "manual"; adjust("Transformation band corrected for a direct-reuse pathway."); }
      if (c.added === "moderate" || c.added === "major") { c.added = "minor"; adjust("Added-input band corrected for a direct-reuse pathway."); }
    }
    if (c.category === "repair" && (c.retention === "none" || c.retention === "low")) { c.retention = "medium"; adjust("Retention band raised: a repaired object stays in use."); }
    if ((c.category === "remanufacturing" || c.category === "industrial_recovery") && (c.transform === "none" || c.transform === "manual")) { c.transform = c.category === "remanufacturing" ? "mechanical" : "industrial"; adjust("Processing band corrected for an industrial route."); }
    if ((c.category === "recycling" || c.category === "material_recovery" || c.category === "industrial_recovery") && c.retention === "full") { c.retention = "high"; adjust("Retention capped below full: recovery routes lose some material."); }
    if ((c.category === "recycling" || c.category === "material_recovery" || c.category === "industrial_recovery") && (c.lifetime === "long" || c.lifetime === "extended")) { c.lifetime = "short"; adjust("Lifetime band reduced for a recovery route."); }
    if ((c.transform === "thermal" || c.transform === "chemical") && DIY.includes(c.category) && c.skill < 3) { c.skill = 3; c.skills = ["Intermediate craft or technical skill"]; adjust("Skill raised: thermal or chemical steps need care."); }
    if (c.retention === "none" && c.category !== "creative_transformation") { c.retention = "low"; adjust("Retention band raised above none for a non-disposal pathway."); }
    if (hasData && (c.category === "direct_reuse" || c.category === "remanufacturing" || (c.target.kind === "component" && compTarget?.kind === "storage")) && !WIPE.test(c.steps.join(" "))) {
      c.steps.unshift("Back up and securely wipe all personal data");
      adjust("A data-wipe step was added by the safety rule for devices.");
    }
    if (touched) adjusted++;
    kept.push(c);
  }
  return { kept, adjusted, rejected };
}

/* ============================================================ semantic de-duplication */

const SYN: string[][] = [
  ["planter", "pot", "flowerpot", "garden", "plant", "herb", "seedling"],
  ["organizer", "organiser", "holder", "caddy", "rack", "tidy", "pen", "desk", "tray"],
  ["lamp", "light", "lantern", "pendant", "shade"],
  ["bag", "tote", "carrier", "sack"],
  ["cloth", "rag", "wipe", "duster", "cloths", "rags"],
  ["feeder", "birdhouse", "feeding"],
  ["recycle", "recycling", "recycler", "remelt", "remelting", "reprocess", "recycled"],
  ["donate", "donation", "gift", "charity", "give"],
  ["resell", "sell", "sale", "marketplace", "resale"],
  ["repair", "fix", "mend", "restore", "renew", "refurbish", "refurbished"],
  ["storage", "store", "stash"],
  ["shelf", "shelves", "shelving"],
];
const CANON = new Map<string, string>();
for (const g of SYN) for (const w of g) CANON.set(w, g[0]);

function canon(w: string): string {
  const base = w.replace(/(ing|ed|es|s)$/, (m) => (w.length - m.length >= 4 ? "" : m));
  return CANON.get(w) ?? CANON.get(base) ?? base;
}

export function semanticTokens(c: Pick<Candidate, "title" | "category">): Set<string> {
  return new Set(words(c.title).map(canon));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let i = 0;
  for (const w of a) if (b.has(w)) i++;
  return i / (a.size + b.size - i);
}

const targetKey = (c: Candidate) => (c.target.kind === "whole" ? "whole" : c.target.componentId);

/** Keep the higher-scoring pathway of each semantic cluster. Input must be sorted by composite descending. */
export function dedupe(sorted: Pathway[]): { kept: Pathway[]; removed: number } {
  const kept: { p: Pathway; t: Set<string> }[] = [];
  let removed = 0;
  for (const p of sorted) {
    const t = semanticTokens(p);
    const dup = kept.some((k) => {
      const j = jaccard(t, k.t);
      if (j >= 0.6) return true;
      return k.p.category === p.category && targetKey(k.p) === targetKey(p) && j >= 0.4;
    });
    if (dup) removed++;
    else kept.push({ p, t });
  }
  return { kept: kept.map((k) => k.p), removed };
}

/* ============================================================ scoring and selection */

export function scoreAll(cands: Candidate[], p: ObjectProfile): Pathway[] {
  const base = round(0.7 + 0.3 * p.confidence, 3);
  return cands.map((c, i) => {
    const src = c.source === "library" ? 0.75 : 0.6;
    const conf = round(Math.min(1, src * (0.7 + 0.3 * p.confidence) * (c.notes.length ? 0.9 : 1)), 2);
    void base;
    return { ...c, id: "", num: 0, rank: i, score: scoreCandidate(p, c, conf) };
  });
}

export function sortByComposite(list: Pathway[]): Pathway[] {
  return [...list].sort((a, b) => b.score.composite - a.score.composite || b.score.circularityIndex - a.score.circularityIndex || a.title.localeCompare(b.title));
}

/**
 * Stratified selection: every represented category gets a floor so the tree stays meaningful,
 * a cap stops one category from dominating, and the remainder is filled by composite score.
 */
export function selectTop(sortedUnique: Pathway[], n: number): Pathway[] {
  if (sortedUnique.length <= n) return finalize(sortedUnique);
  const byCat = new Map<Category, Pathway[]>();
  for (const p of sortedUnique) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  const k = byCat.size;
  const floor = Math.max(1, Math.floor((n * 0.4) / k));
  const cap = Math.max(floor, Math.ceil(n * 0.22));
  const picked = new Set<Pathway>();
  const counts = new Map<Category, number>();
  for (const [cat, list] of byCat) {
    list.slice(0, floor).forEach((p) => picked.add(p));
    counts.set(cat, Math.min(floor, list.length));
  }
  for (const p of sortedUnique) {
    if (picked.size >= n) break;
    if (picked.has(p)) continue;
    if ((counts.get(p.category) ?? 0) >= cap) continue;
    picked.add(p);
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  for (const p of sortedUnique) {
    if (picked.size >= n) break;
    picked.add(p);
  }
  return finalize(sortedUnique.filter((p) => picked.has(p)));
}

function finalize(list: Pathway[]): Pathway[] {
  return list.map((p, i) => ({ ...p, rank: i + 1, num: i + 1, id: `P${String(i + 1).padStart(3, "0")}` }));
}

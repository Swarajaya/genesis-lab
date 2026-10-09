import type { Category, ComponentSpec, Material, ObjectAnalysis, BaselineFuture, EngineEvent, Pathway, Provenance } from "@/lib/engines/object/types";

export type { Category, ComponentSpec, ObjectAnalysis, BaselineFuture, EngineEvent, Pathway, Provenance };
export { CATEGORY_META, CATEGORIES, MATERIAL_LABEL, PROVENANCE_LABEL } from "@/lib/engines/object/types";

export const EXAMPLES = ["plastic bottle", "old phone", "cardboard box", "broken chair", "glass jar", "old clothing", "old laptop"] as const;

export const PROV_COLOR: Record<Provenance, string> = {
  USER_INPUT: "#7be0d0",
  VISION: "#b49bff",
  MODEL_ESTIMATE: "#f2c260",
  DATABASE: "#6fb8ff",
  HEURISTIC: "#9aa5b8",
  UNKNOWN: "#ff7d95",
};

export const MATERIAL_COLOR: Record<Material, string> = {
  plastic: "#6fb8ff", glass: "#7be0d0", paper: "#e6d36a", metal: "#c3ccd8", textile: "#e58cff", wood: "#d69a6b", electronics: "#5fe3a1", rubber: "#ff9a6b", ceramic: "#f2c260", other: "#8aa0ab",
};

export interface LeafLayout {
  id: string;
  num: number;
  x: number;
  y: number;
  z: number;
  size: number;
  glow: number;
  category: Category;
  hub: number;
}

export interface HubLayout {
  category: Category;
  x: number;
  y: number;
  z: number;
  count: number;
}

export interface TreeLayout {
  leaves: LeafLayout[];
  hubs: HubLayout[];
}

const GOLDEN = 0.6180339887;

/** Deterministic radial layout: category hubs on a ring, pathways spiral outward from their hub; stronger pathways sit closer in. */
export function computeLayout(pathways: Pathway[]): TreeLayout {
  const cats = [...new Set(pathways.map((p) => p.category))];
  const comps = pathways.map((p) => p.score.composite);
  const lo = Math.min(...comps, 100);
  const hi = Math.max(...comps, 0);
  const span = Math.max(hi - lo, 1e-6);
  const sector = (Math.PI * 2) / Math.max(cats.length, 1);
  const leaves: LeafLayout[] = [];
  const hubs: HubLayout[] = [];
  cats.forEach((cat, k) => {
    const members = pathways.filter((p) => p.category === cat).sort((a, b) => b.score.composite - a.score.composite);
    const base = k * sector - Math.PI / 2;
    const hy = Math.sin(k * 2.1) * 0.35;
    hubs.push({ category: cat, x: Math.cos(base) * 1.25, y: hy, z: Math.sin(base) * 1.25, count: members.length });
    members.forEach((p, j) => {
      const t = members.length > 1 ? j / (members.length - 1) : 0;
      const angle = base + (((j * GOLDEN) % 1) - 0.5) * sector * 0.82;
      const norm = (p.score.composite - lo) / span;
      const r = 2 + 2.6 * Math.pow(t, 0.8) + (1 - norm) * 0.5;
      const y = hy + (((j * GOLDEN * 1.7 + k * 0.23) % 1) - 0.5) * (0.8 + 2 * t);
      leaves.push({ id: p.id, num: p.num, x: Math.cos(angle) * r, y, z: Math.sin(angle) * r, size: 0.075 + 0.12 * norm, glow: 0.35 + 0.65 * norm, category: cat, hub: k });
    });
  });
  return { leaves, hubs };
}

export const fmtNum = (n: number, d = 1) => n.toFixed(d);
export const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

export function fmtKg(n: number): string {
  if (n === 0) return "0";
  if (n < 0.01) return "<0.01";
  return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
}

export function fmtTime(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 60 * 48) return `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)} h`;
  return `${Math.round(min / 1440)} days`;
}

export const num3 = (n: number) => String(n).padStart(3, "0");

export function clock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Pulls the most recent "N CANDIDATES GENERATED" count out of the real event log. */
export function candidateCount(events: EngineEvent[]): number | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const m = /^(\d+) CANDIDATES GENERATED$/.exec(events[i].label);
    if (m) return Number(m[1]);
  }
  return null;
}

export const bestBy = (list: Pathway[], f: (p: Pathway) => number) => list.reduce<Pathway | null>((b, p) => (!b || f(p) > f(b) ? p : b), null);

/** Which pathways a "lens" in the what-if panel draws from. */
export const LENSES: { key: string; label: string; cats: Category[] }[] = [
  { key: "repair", label: "REPAIR", cats: ["repair", "remanufacturing"] },
  { key: "reuse", label: "REUSE / UPCYCLE", cats: ["direct_reuse", "adaptive_reuse", "upcycling", "creative_transformation", "component_reuse"] },
  { key: "recovery", label: "MATERIAL RECOVERY", cats: ["material_recovery", "recycling", "industrial_recovery"] },
];

export type Fate = "transform" | "discard";

/**
 * What happens to each component in the future simulator. This mirrors the scoring assumption:
 * a pathway that acts on one component leaves the other parts to disposal.
 */
export function fatesFor(components: ComponentSpec[], p: Pathway | null): Map<string, Fate> {
  const m = new Map<string, Fate>();
  for (const c of components) {
    const all = !p || p.target.kind === "whole" || p.target.wholeEffect;
    const hit = !p || all || (p.target.kind === "component" && p.target.componentId === c.id);
    m.set(c.id, hit ? "transform" : "discard");
  }
  return m;
}

/** Repair-like pathways on the whole object end with the parts put back together. */
export const reassembles = (p: Pathway | null): boolean => !!p && ["repair", "direct_reuse", "remanufacturing"].includes(p.category) && (p.target.kind === "whole" || p.target.wholeEffect);

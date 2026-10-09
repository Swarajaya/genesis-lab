export const MATERIALS = ["plastic", "glass", "paper", "metal", "textile", "wood", "electronics", "rubber", "ceramic", "other"] as const;
export type Material = (typeof MATERIALS)[number];

export const PATHWAY_CATEGORIES = ["reuse", "repair", "repurpose", "recycle", "upcycle", "material_recovery"] as const;
export type PathwayCategory = (typeof PATHWAY_CATEGORIES)[number];

/**
 * Indicative embodied-emission factors for producing 1 kg of VIRGIN material (kg CO2e/kg).
 * Rounded, order-of-magnitude values in the range reported by public life-cycle databases.
 * They are used only to compare pathways with each other, never as exact claims.
 */
export const EMISSION_FACTORS: Record<Material, { kgCo2ePerKg: number; note: string }> = {
  plastic: { kgCo2ePerKg: 2.5, note: "Typical thermoplastics such as PET/HDPE, roughly 2 to 3." },
  glass: { kgCo2ePerKg: 0.9, note: "Container glass, roughly 0.8 to 1.0." },
  paper: { kgCo2ePerKg: 1.1, note: "Paper and cardboard, roughly 0.9 to 1.3." },
  metal: { kgCo2ePerKg: 6, note: "Blend of steel (about 2) and aluminium (about 10 or more)." },
  textile: { kgCo2ePerKg: 8, note: "Cotton/polyester fabrics, roughly 5 to 10." },
  wood: { kgCo2ePerKg: 0.5, note: "Sawn timber, excluding biogenic carbon accounting." },
  electronics: { kgCo2ePerKg: 60, note: "Small electronics embody very high emissions per kg; very rough." },
  rubber: { kgCo2ePerKg: 2.8, note: "Synthetic/natural rubber blend, roughly 2 to 3." },
  ceramic: { kgCo2ePerKg: 0.8, note: "Fired ceramics, roughly 0.6 to 1.0." },
  other: { kgCo2ePerKg: 2, note: "Generic fallback." },
};

export interface RawPathway {
  category: PathwayCategory;
  title: string;
  summary: string;
  steps: string[];
  resources: string[];
  /** 1 (very hard to do) .. 10 (easy to do) */
  feasibility: number;
  /** 1 (material lost) .. 10 (material fully preserved) */
  materialPreservation: number;
  /** 1 (trivial) .. 5 (expert) */
  difficulty: number;
  /** Share of NEW virgin material this pathway avoids producing, 0..1 */
  displacedVirginFraction: number;
  timeMinutes: number;
}

export interface RankedPathway extends RawPathway {
  id: string;
  rank: number;
  score: number;
  wasteAvoidedKg: number;
  co2AvoidedKg: number;
}

export const WEIGHTS = { feasibility: 0.3, preservation: 0.25, environment: 0.25, resources: 0.1, ease: 0.1 } as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function tokens(t: string): Set<string> {
  return new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}

function similar(a: string, b: string): boolean {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return a.toLowerCase() === b.toLowerCase();
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter) >= 0.7;
}

export function rankPathways(raw: RawPathway[], object: { massKg: number; material: Material }): RankedPathway[] {
  // de-duplicate near-identical titles, keeping the first occurrence
  const unique: RawPathway[] = [];
  for (const p of raw) if (!unique.some((u) => similar(u.title, p.title))) unique.push(p);

  const factor = EMISSION_FACTORS[object.material].kgCo2ePerKg;
  const ranked = unique.map((p) => {
    const feas = clamp(p.feasibility, 1, 10);
    const pres = clamp(p.materialPreservation, 1, 10);
    const disp = clamp(p.displacedVirginFraction, 0, 1);
    const diff = clamp(p.difficulty, 1, 5);
    const resources = clamp(1 - (p.resources.length - 1) / 6, 0, 1);
    const score =
      WEIGHTS.feasibility * (feas / 10) +
      WEIGHTS.preservation * (pres / 10) +
      WEIGHTS.environment * disp +
      WEIGHTS.resources * resources +
      WEIGHTS.ease * ((5 - diff) / 4);
    return {
      ...p,
      feasibility: feas,
      materialPreservation: pres,
      displacedVirginFraction: disp,
      difficulty: diff,
      score: Math.round(score * 1000) / 10,
      wasteAvoidedKg: Math.round(object.massKg * (pres / 10) * 1000) / 1000,
      co2AvoidedKg: Math.round(object.massKg * disp * factor * 1000) / 1000,
      id: "",
      rank: 0,
    } as RankedPathway;
  });

  ranked.sort((a, b) => b.score - a.score || b.co2AvoidedKg - a.co2AvoidedKg || a.title.localeCompare(b.title));
  ranked.forEach((p, i) => {
    p.rank = i + 1;
    p.id = `p${i + 1}`;
  });
  return ranked;
}

export function assumptionsFor(object: { massKg: number; material: Material }): string[] {
  const f = EMISSION_FACTORS[object.material];
  return [
    `Object mass is estimated at ${object.massKg} kg. Adjust it above to rescale every number.`,
    `Waste avoided = mass x material-preservation score / 10 (the part kept in use or recovered instead of discarded).`,
    `CO2e avoided = mass x share of virgin material displaced x ${f.kgCo2ePerKg} kg CO2e per kg of virgin ${object.material}. ${f.note}`,
    "Emission factors are rounded, indicative values for comparing pathways, not audited life-cycle results.",
    "Transport, energy used in the pathway itself, and use-phase effects are not included.",
    `Ranking weights: feasibility ${WEIGHTS.feasibility * 100}%, material preservation ${WEIGHTS.preservation * 100}%, environmental benefit ${WEIGHTS.environment * 100}%, light resource needs ${WEIGHTS.resources * 100}%, ease ${WEIGHTS.ease * 100}%.`,
  ];
}

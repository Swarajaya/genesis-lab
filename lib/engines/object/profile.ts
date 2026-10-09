import { findReference, round } from "./knowledge";
import type { ComponentSpec, Material, MaterialShare, ObjectProfile, Provenance } from "./types";
import type { AiObjectAnalysis } from "@/lib/validation/objectSchemas";

/** Builds an ObjectProfile from a validated model analysis, attaching provenance to every inferred field. */
export function profileFromModel(a: AiObjectAnalysis, opts: { typedName: string; userMassKg: number | null; imageUsed: boolean }): ObjectProfile {
  const ref = findReference(opts.typedName || a.objectName);
  const inferred: Provenance = opts.imageUsed ? "VISION" : "MODEL_ESTIMATE";

  const total = a.components.reduce((s, c) => s + Math.max(0, c.massFraction), 0);
  const fractions = a.components.map((c) => (total > 0 ? Math.max(0, c.massFraction) / total : 1 / a.components.length));

  let massKg: number;
  let massProv: Provenance;
  if (opts.userMassKg) {
    massKg = opts.userMassKg;
    massProv = "USER_INPUT";
  } else if (a.massKg > 0 && a.massKg <= 500) {
    massKg = a.massKg;
    massProv = "MODEL_ESTIMATE";
  } else if (ref) {
    massKg = ref.massKg;
    massProv = "DATABASE";
  } else {
    massKg = 1;
    massProv = "UNKNOWN";
  }

  const components: ComponentSpec[] = a.components.map((c, i) => ({
    id: `c${i + 1}`, name: c.name, kind: c.kind, material: c.material as Material, massFraction: round(fractions[i], 4), massKg: round(massKg * fractions[i], 4),
    condition: c.condition, recoverability: c.recoverability, separability: c.separability, hazardous: c.hazardous || c.kind === "battery",
    prov: opts.imageUsed && c.visible ? "VISION" : "MODEL_ESTIMATE",
  }));

  const byMat = new Map<Material, number>();
  for (const c of components) byMat.set(c.material, (byMat.get(c.material) ?? 0) + c.massFraction);
  const materials: MaterialShare[] = [...byMat].map(([material, share]) => ({ material, share: round(share, 3), prov: inferred })).sort((x, y) => y.share - x.share);

  const base = opts.typedName ? (opts.imageUsed ? 0.85 : 0.8) : 0.65;
  return {
    name: opts.typedName || a.objectName,
    form: a.form,
    nameProv: opts.typedName ? "USER_INPUT" : inferred,
    massKg: round(massKg, 4),
    massProv,
    condition: a.condition,
    conditionText: a.conditionText,
    damage: a.damage,
    conditionProv: a.condition === "unknown" ? "UNKNOWN" : inferred,
    materials,
    components,
    contamination: { level: a.contaminationLevel, note: a.contaminationNote, prov: a.contaminationLevel === "unknown" ? "UNKNOWN" : inferred },
    reusePotential: a.reusePotential,
    repairPotential: a.repairPotential,
    durability: a.durability,
    indexProv: "MODEL_ESTIMATE",
    confidence: round(base * (0.5 + 0.5 * a.confidence), 2),
    notes: a.notes,
    source: "model",
    imageUsed: opts.imageUsed,
  };
}

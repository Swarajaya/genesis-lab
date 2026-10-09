import { z } from "zod";
import { MATERIALS } from "@/lib/engines/object/engine";
import { ADDED, CATEGORIES, COMPONENT_KINDS, LEVEL, LIFETIME, OBJECT_FORMS, RETENTION, REVERSIBLE, TRANSFORM, TRANSPORT } from "@/lib/engines/object/types";
import type { RawModelCandidate } from "@/lib/engines/object/space";
import { cleanText } from "./text";

/**
 * Experiment 05 schemas. Model output is parsed leniently field by field: a single malformed descriptor
 * falls back to a neutral default instead of discarding the whole answer, and malformed candidates are skipped.
 */

const text = (max: number, min = 0) => z.string().transform((s) => cleanText(s, max)).pipe(z.string().min(min).max(max));
const unit = z.number().finite().transform((n) => Math.min(1, Math.max(0, n)));

export const aiObjectAnalysis = z.object({
  objectName: text(80, 1),
  form: z.enum(OBJECT_FORMS).catch("generic"),
  massKg: z.number().finite().catch(0),
  condition: z.enum(["good", "worn", "damaged", "unknown"]).catch("unknown"),
  conditionText: text(80).catch(""),
  damage: text(160).catch(""),
  contaminationLevel: z.enum(["low", "medium", "high", "unknown"]).catch("unknown"),
  contaminationNote: text(200).catch(""),
  reusePotential: unit.catch(0.5),
  repairPotential: unit.catch(0.5),
  durability: unit.catch(0.5),
  confidence: unit.catch(0.5),
  notes: text(300).catch(""),
  components: z
    .array(
      z.object({
        name: text(60, 1),
        kind: z.enum(COMPONENT_KINDS).catch("other"),
        material: z.enum(MATERIALS).catch("other"),
        massFraction: z.number().finite().catch(0.1),
        condition: z.enum(["good", "worn", "damaged", "unknown"]).catch("unknown"),
        recoverability: unit.catch(0.5),
        separability: unit.catch(0.5),
        hazardous: z.boolean().catch(false),
        visible: z.boolean().catch(false),
      }),
    )
    .min(2)
    .max(14),
});
export type AiObjectAnalysis = z.infer<typeof aiObjectAnalysis>;

export const aiCandidateBatch = z.object({ pathways: z.array(z.unknown()).min(1).max(60) });

const candidate = z.object({
  category: z.enum(CATEGORIES),
  title: text(100, 6),
  description: text(260, 10),
  steps: z.array(text(200, 4)).min(2).max(8),
  tools: z.array(text(60, 1)).max(8).catch([]),
  materials: z.array(text(60, 1)).max(8).catch([]),
  component: text(60).catch(""),
  community: z.boolean().catch(false),
  retention: z.enum(RETENTION).catch("medium"),
  transform: z.enum(TRANSFORM).catch("manual"),
  added: z.enum(ADDED).catch("minor"),
  lifetime: z.enum(LIFETIME).catch("medium"),
  value: z.enum(LEVEL).catch("low"),
  displaces: z.enum(LEVEL).catch("low"),
  transport: z.enum(TRANSPORT).catch("none"),
  reversible: z.enum(REVERSIBLE).catch("partly"),
  skill: z.number().finite().catch(2),
  timeMinutes: z.number().finite().catch(60),
});

export function parseCandidates(items: unknown[]): { ok: RawModelCandidate[]; skipped: number } {
  const ok: RawModelCandidate[] = [];
  let skipped = 0;
  for (const it of items) {
    const r = candidate.safeParse(it);
    if (r.success) ok.push(r.data as RawModelCandidate);
    else skipped++;
  }
  return { ok, skipped };
}

const num = (min: number, max: number) => z.number().finite().min(min).max(max);

export const explainRequest = z.object({
  runId: z.string().max(64).nullable().optional(),
  mode: z.enum(["single", "compare"]),
  objectName: text(80, 1),
  baseline: z.object({ ci: num(0, 100), retained: num(0, 100) }),
  pathways: z
    .array(
      z.object({
        num: num(1, 999),
        title: text(100, 1),
        category: z.enum(CATEGORIES),
        ci: num(0, 100),
        feasibility: num(0, 100),
        retained: num(0, 100),
        wasteKg: num(0, 1000),
        emissionsKg: num(0, 100000),
        processing: num(0, 100),
        inputs: num(0, 100),
        economic: num(0, 100),
        topContributor: text(60),
        topPenalty: text(60).catch(""),
        rank: num(1, 999),
      }),
    )
    .min(1)
    .max(4),
});
export type ExplainRequest = z.infer<typeof explainRequest>;

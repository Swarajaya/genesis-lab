import { z } from "zod";
import { MATERIALS, PATHWAY_CATEGORIES } from "@/lib/engines/object/engine";
import { CATEGORIES, RECIPIENT_TYPES } from "@/lib/engines/money/engine";
import { cleanText } from "./text";
import { CRED_IDS, SPEC_IDS, type CredId, type PolicyNode, type SpecId } from "@/lib/engines/trust/model";

const text = (max: number, min = 1) => z.string().transform((s) => cleanText(s, max)).pipe(z.string().min(min).max(max));
const num = (min: number, max: number) => z.number().finite().min(min).max(max);

// ------------------------------------------------------------------ AI OUTPUT (never trusted until parsed)

export const aiNutritionIdentify = z.object({
  ingredients: z
    .array(z.object({ name: text(60), estGrams: num(1, 5000), state: text(40, 0).optional().default("") }))
    .min(1)
    .max(20),
});

const per100 = z.object({ kcal: num(0, 900), protein: num(0, 100), carbs: num(0, 100), fat: num(0, 100), fiber: num(0, 100) });

export const aiMeals = z.object({
  meals: z
    .array(
      z.object({
        name: text(80),
        description: text(240),
        servings: num(1, 12),
        uses: z.array(z.object({ name: text(60), grams: num(1, 3000), per100g: per100.optional() })).min(1).max(15),
        steps: z.array(text(240)).min(2).max(10),
        substitutions: z.array(text(160)).max(6).default([]),
        timeMinutes: num(1, 480).default(30),
      }),
    )
    .min(1)
    .max(4),
});
export type AiMeals = z.infer<typeof aiMeals>;

export const aiObjectIdentify = z.object({
  objectName: text(80),
  material: z.enum(MATERIALS),
  massKg: num(0.001, 500),
  condition: text(80, 0).default(""),
  notes: text(240, 0).default(""),
});

export const aiPathways = z.object({
  pathways: z
    .array(
      z.object({
        category: z.enum(PATHWAY_CATEGORIES),
        title: text(80),
        summary: text(220),
        steps: z.array(text(200)).min(2).max(8),
        resources: z.array(text(60)).min(1).max(8),
        feasibility: num(1, 10),
        materialPreservation: num(1, 10),
        difficulty: num(1, 5),
        displacedVirginFraction: num(0, 1),
        timeMinutes: num(1, 10080),
      }),
    )
    .min(1)
    .max(40),
});

export const aiNarration = z.object({ narration: text(900, 20) });
export const aiExplanation = z.object({ summary: text(500, 20), points: z.array(text(220)).min(1).max(6) });

// ------------------------------------------------------------------ REQUESTS

export const nutritionRequest = z.object({
  ingredients: z.array(text(60)).max(15).default([]),
  servings: num(1, 12).default(2),
  assetId: z.string().uuid().optional(),
});

export const objectRequest = z.object({
  objectName: text(80, 0).default(""),
  massKg: num(0.001, 500).optional(),
  count: num(10, 100).default(100),
});

const donorSchema = z.object({
  code: text(20),
  abo: z.enum(["O", "A", "B", "AB"]),
  rh: z.enum(["+", "-"]),
  kell: z.enum(["K+", "K-"]),
  rhc: z.enum(["c+", "c-"]),
  rhe: z.enum(["E+", "E-"]),
  duffy: z.enum(["Fy(a+)", "Fy(a-)"]),
  units: num(0, 100),
  distanceKm: num(0, 500),
  available: z.boolean(),
  hoursToExpiry: num(0, 2000),
});

export const bloodRequest = z.object({
  recipient: z.object({
    abo: z.enum(["O", "A", "B", "AB"]),
    rh: z.enum(["+", "-"]),
    antibodies: z.array(z.enum(["anti-K", "anti-c", "anti-E", "anti-Fya"])).max(4).default([]),
    unitsNeeded: num(1, 20),
    urgency: z.enum(["routine", "urgent", "critical"]),
    chronicTransfusion: z.boolean().default(false),
  }),
  constraints: z.object({ maxDistanceKm: num(1, 500), minHoursToExpiry: num(0, 1000), allowRhMismatch: z.boolean() }),
  extraDonors: z.array(donorSchema).max(10).default([]),
  explain: z.boolean().default(true),
});

export const moneyRuleSchema = z.object({
  allowedCategories: z.array(z.enum(CATEGORIES as [string, ...string[]])).max(7),
  recipientType: z.enum(RECIPIENT_TYPES as [string, ...string[]]),
  maxPerTxnPaise: z.number().int().min(0).max(100_000_000),
  expiresInHours: num(0.01, 24 * 365),
});

export const expiryRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), amountPaise: z.number().int().min(100).max(100_000_000), rule: moneyRuleSchema }),
  z.object({
    action: z.literal("spend"),
    token: z.string().min(20).max(4000),
    amountPaise: z.number().int().min(1).max(100_000_000),
    category: z.enum(CATEGORIES as [string, ...string[]]),
    merchant: text(60),
    spenderType: z.enum(RECIPIENT_TYPES as [string, ...string[]]),
    clockOffsetHours: num(0, 24 * 400),
  }),
  z.object({ action: z.literal("update_rule"), token: z.string().min(20).max(4000), rule: moneyRuleSchema }),
]);

const specEnum = z.enum(SPEC_IDS as [SpecId, ...SpecId[]]);
const credEnum = z.enum(CRED_IDS as [CredId, ...CredId[]]);
export const policyNodeSchema: z.ZodType<PolicyNode> = z.lazy(() =>
  z.union([
    z.object({ t: z.literal("leaf"), spec: specEnum, param: z.number().finite().optional(), cred: credEnum.optional(), not: z.boolean().optional() }),
    z.object({ t: z.literal("group"), op: z.enum(["AND", "OR"]), children: z.array(policyNodeSchema).min(1).max(8), not: z.boolean().optional() }),
  ]),
);
export const aiPolicyParse = z.object({ policy: policyNodeSchema });

const hexStr = (max: number) => z.string().regex(/^[0-9a-f]*$/).max(max);

export const trustRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config") }),
  z.object({ action: z.literal("issue"), cred: credEnum, values: z.record(z.string().max(20), z.number().int().min(0).max(65535)).refine((o) => Object.keys(o).length <= 8) }),
  z.object({ action: z.literal("challenge"), verifierId: text(40), policy: policyNodeSchema, mode: z.enum(["classical", "hybrid-pq"]) }),
  z.object({ action: z.literal("registry"), op: z.enum(["status", "set"]), handles: z.array(z.string().regex(/^[0-9a-f]{64}$/)).max(8).optional(), handle: z.string().regex(/^[0-9a-f]{64}$/).optional(), status: z.enum(["active", "suspended", "revoked"]).optional() }),
  z.object({
    action: z.literal("verify"),
    challengeToken: z.string().min(20).max(6000),
    bundle: z.unknown().optional(),
    sealed: z.object({ kemCt: hexStr(4000), iv: hexStr(64), ct: hexStr(400_000) }).optional(),
  }),
  z.object({ action: z.literal("parse"), text: text(600, 4) }),
  z.object({
    action: z.literal("explain"),
    kind: z.enum(["verification", "attack", "claim", "security"]),
    facts: z.object({
      policy: text(500, 0),
      trust: z.enum(["VERIFIED", "REJECTED"]),
      attack: text(80, 0).optional(),
      mode: z.enum(["classical", "hybrid-pq"]).optional(),
      stages: z.array(z.object({ label: text(60), state: z.enum(["pass", "fail", "skipped"]), detail: text(240, 0) })).max(12),
    }),
  }),
  z.object({ action: z.literal("pqbench") }),
]);

const posSchema = z.object({ x: z.number().int().min(0).max(6), y: z.number().int().min(0).max(6) });
const stateSchema = z.object({
  pos: posSchema,
  collected: z.array(z.string().regex(/^\d,\d$/)).max(49),
  score: z.number().int().min(0).max(49),
  wins: z.number().int().min(0).max(1000),
  steps: z.number().int().min(0).max(100000),
});

const seedStr = z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
const moveEnum = z.enum(["up", "down", "left", "right"]);

export const gamezeroRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("new"), seed: seedStr.optional(), transferFrom: seedStr.optional() }),
  z.object({
    action: z.literal("step"),
    seed: seedStr,
    state: stateSchema,
    move: moveEnum,
  }),
  z.object({
    action: z.literal("counterfactual"),
    seed: seedStr,
    state: stateSchema,
  }),
  z.object({
    action: z.literal("save"),
    seed: seedStr,
    summary: z.object({
      status: z.enum(["observing", "hypothesizing", "testing", "learned", "playing"]),
      surviving: z.array(text(120)).max(60),
      rejected: z.array(z.object({ id: text(120), reason: text(300), step: z.number().int() })).max(60),
    }),
    observations: z
      .array(z.object({ before: stateSchema, action: moveEnum, after: stateSchema, event: z.enum(["none", "reward", "hazard", "goal"]) }))
      .max(300),
    // The learned world model is stored as-is in the run summary, so its exact shape is not enforced here.
    model: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("explain"),
    topic: text(120),
    facts: z.array(text(300)).min(1).max(30),
  }),
  z.object({
    action: z.literal("narrate"),
    movement: text(300),
    terrain: z.array(z.object({ label: text(40), terrain: z.enum(["free", "solid", "reward", "hazard", "goal"]) })).max(60),
    rejectedCount: z.number().int().min(0).max(100),
    demonstrations: z.number().int().min(0).max(500),
    experiments: z.number().int().min(0).max(500),
    solvedInSteps: z.number().int().min(0).max(1000).nullable(),
    knowledge: num(0, 1_000_000).optional(),
    confirmedRules: z.array(text(120)).max(60).optional(),
    counterfactuals: z.number().int().min(0).max(10000).optional(),
    transfer: z.object({ baseline: z.number().int().min(0).max(100000), transferred: z.number().int().min(0).max(100000) }).optional(),
  }),
]);

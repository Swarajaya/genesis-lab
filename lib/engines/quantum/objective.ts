import { lookupFood, type Per100 } from "@/lib/engines/nutrition/foods";
import type { QScores } from "./types";

/** Objective weights. Sum of the five positive weights is 1; penalty is subtracted. */
export const WEIGHTS = { nutrition: 0.3, waste: 0.25, coverage: 0.15, serving: 0.15, compatibility: 0.15, penalty: 0.5 } as const;

/** Generic reference targets for one balanced meal (not dietary advice). */
export const TARGETS = { kcal: 550, protein: 20, fiber: 8, servingG: 400, fatShare: [0.2, 0.35], carbShare: [0.45, 0.65] } as const;

/** Per-ingredient penalty for something the user does not have. */
export const MISSING_PENALTY = 0.2;

/** Pantry staples are assumed available and are not part of the state space. */
const STAPLE = /\b(oil|ghee|butter|salt|pepper|spices?|water|vinegar|sugar|herbs?|seasoning|stock|broth|masala|cumin|turmeric)\b/i;
export const isStaple = (name: string) => STAPLE.test(name);

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface Item {
  name: string;
  grams: number;
  nutrition: Per100 | null;
  detected: boolean;
}

export interface ScoreContext {
  servings: number;
  /** Total grams of every detected ingredient in the state space (waste denominator). */
  detectedTotalG: number;
  detectedCount: number;
  /** Lower-cased ingredient names that co-occur in at least one AI-designed meal, as "a|b" with a<b. */
  pairs: Set<string>;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Closeness of x to the range [lo, hi]: 1 inside, falling linearly to 0 at distance 0.35. */
const band = (x: number, lo: number, hi: number) => (x >= lo && x <= hi ? 1 : clamp01(1 - (x < lo ? lo - x : x - hi) / 0.35));

export function resolveNutrition(name: string, fallback?: Per100 | null): Per100 | null {
  const ref = lookupFood(name);
  if (ref) return { kcal: ref.kcal, protein: ref.protein, carbs: ref.carbs, fat: ref.fat, fiber: ref.fiber };
  return fallback ?? null;
}

/** The objective function J in [0,1]. Higher is better. Energy is H = 1 - J. */
export function scoreItems(items: Item[], ctx: ScoreContext): QScores {
  const active = items.filter((i) => !isStaple(i.name) && i.grams > 0);
  if (active.length === 0) return { nutrition: 0, waste: 0, coverage: 0, serving: 0, compatibility: 0, penalty: 0, overall: 0 };

  const servings = Math.max(1, ctx.servings);
  let kcal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, totalG = 0, knownG = 0;
  for (const i of active) {
    totalG += i.grams;
    if (!i.nutrition) continue;
    const f = i.grams / 100;
    knownG += i.grams;
    kcal += i.nutrition.kcal * f;
    protein += i.nutrition.protein * f;
    carbs += i.nutrition.carbs * f;
    fat += i.nutrition.fat * f;
    fiber += i.nutrition.fiber * f;
  }

  // Nutrition balance per serving: energy fit, protein, fibre, and macro-energy split.
  const ps = { kcal: kcal / servings, protein: protein / servings, fiber: fiber / servings };
  const kcalFit = 1 - Math.min(1, Math.abs(ps.kcal - TARGETS.kcal) / TARGETS.kcal);
  const proteinFit = Math.min(1, ps.protein / TARGETS.protein);
  const fiberFit = Math.min(1, ps.fiber / TARGETS.fiber);
  const macroKcal = protein * 4 + carbs * 4 + fat * 9;
  const split = macroKcal > 0 ? (band(fat * 9 / macroKcal, TARGETS.fatShare[0], TARGETS.fatShare[1]) + band(carbs * 4 / macroKcal, TARGETS.carbShare[0], TARGETS.carbShare[1])) / 2 : 0;
  // Ingredients with no nutrition data shrink the score in proportion to the mass they hide.
  const knownShare = totalG > 0 ? knownG / totalG : 0;
  const nutrition = clamp01(((kcalFit + proteinFit + fiberFit + split) / 4) * knownShare);

  const detected = active.filter((i) => i.detected);
  const usedDetectedG = detected.reduce((s, i) => s + i.grams, 0);
  const waste = ctx.detectedTotalG > 0 ? clamp01(usedDetectedG / ctx.detectedTotalG) : 0;
  const coverage = ctx.detectedCount > 0 ? clamp01(detected.length / ctx.detectedCount) : 0;
  const serving = 1 - Math.min(1, Math.abs(totalG / servings - TARGETS.servingG) / TARGETS.servingG);

  let pairsSeen = 0, pairsOk = 0;
  for (let a = 0; a < active.length; a++)
    for (let b = a + 1; b < active.length; b++) {
      pairsSeen++;
      if (ctx.pairs.has(pairKey(active[a].name.toLowerCase(), active[b].name.toLowerCase()))) pairsOk++;
    }
  const compatibility = pairsSeen === 0 ? 1 : pairsOk / pairsSeen;

  const external = active.filter((i) => !i.detected).length;
  const penalty = Math.min(1, external * MISSING_PENALTY);

  const overall = clamp01(
    WEIGHTS.nutrition * nutrition + WEIGHTS.waste * waste + WEIGHTS.coverage * coverage + WEIGHTS.serving * serving + WEIGHTS.compatibility * compatibility - WEIGHTS.penalty * penalty,
  );
  return { nutrition: r3(nutrition), waste: r3(waste), coverage: r3(coverage), serving: r3(serving), compatibility: r3(compatibility), penalty: r3(penalty), overall: r3(overall) };
}

import { generateStructured, aiConfigured } from "@/lib/ai";
import { NUTRITION_IDENTIFY_PROMPT, NUTRITION_IDENTIFY_SYSTEM, NUTRITION_MEALS_SYSTEM, nutritionMealsPrompt } from "@/lib/ai/prompts/nutrition";
import { AIUnavailableError } from "@/lib/ai/errors";
import { runQuantumOptimizer, type QuantumResult } from "@/lib/engines/quantum";
import { CO2E_PER_KG_FOOD_WASTE, lookupFood, totals, type NutritionLine } from "@/lib/engines/nutrition/foods";
import { ApiError, streamRoute } from "@/lib/security/api";
import { getSessionId } from "@/lib/security/session";
import { readImageFile } from "@/lib/security/upload";
import { recordRun, saveNutrition, storeUpload } from "@/lib/supabase/persist";
import { cleanText } from "@/lib/validation/text";
import { aiMeals, aiNutritionIdentify } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_GRAMS = 150;

export const POST = streamRoute({ scope: "nutrition", limit: 10 }, async (req, emit) => {
  const t0 = Date.now();
  if (!aiConfigured()) throw new AIUnavailableError("no_keys", 0);
  const sessionId = await getSessionId();

  emit("analyzing");
  const form = await req.formData();
  const typed = String(form.get("ingredients") ?? "")
    .split(/[\n,]/)
    .map((s) => cleanText(s, 60))
    .filter(Boolean)
    .slice(0, 15);
  const servings = Math.min(12, Math.max(1, Number(form.get("servings")) || 2));
  const file = form.get("image");

  let assetId: string | null = null;
  const identified: { name: string; grams: number; source: "typed" | "image" }[] = typed.map((name) => ({ name, grams: DEFAULT_GRAMS, source: "typed" as const }));

  if (file instanceof File && file.size > 0) {
    const img = await readImageFile(file);
    assetId = await storeUpload(sessionId, "nutrition", img.bytes, img.mime);
    emit("understanding");
    const { data } = await generateStructured(aiNutritionIdentify, {
      system: NUTRITION_IDENTIFY_SYSTEM,
      prompt: NUTRITION_IDENTIFY_PROMPT,
      image: { mimeType: img.mime, data: img.base64 },
      temperature: 0.2,
      tag: "nutrition",
    });
    for (const i of data.ingredients) if (!identified.some((x) => x.name.toLowerCase() === i.name.toLowerCase())) identified.push({ name: i.name, grams: Math.round(i.estGrams), source: "image" });
  }
  if (identified.length === 0) throw new ApiError(400, "no_ingredients", "Add at least one ingredient or upload a photo.");

  emit("generating");
  const { data, meta } = await generateStructured(aiMeals, {
    system: NUTRITION_MEALS_SYSTEM,
    prompt: nutritionMealsPrompt(identified, servings),
    temperature: 0.5,
    tag: "nutrition",
  });

  emit("validating");
  const inputNames = identified.map((i) => i.name.toLowerCase());
  const matchesInput = (name: string) => {
    const n = name.toLowerCase();
    return inputNames.findIndex((i) => i.includes(n) || n.includes(i) || (lookupFood(i) && lookupFood(i) === lookupFood(n)));
  };

  const meals = data.meals.map((m) => {
    const lines: NutritionLine[] = [];
    const unknown: string[] = [];
    let wasteG = 0;
    for (const u of m.uses) {
      const ref = lookupFood(u.name);
      if (ref) lines.push({ name: u.name, grams: u.grams, source: "reference-table", nutrition: ref });
      else if (u.per100g) lines.push({ name: u.name, grams: u.grams, source: "ai-estimate", nutrition: u.per100g });
      else unknown.push(u.name);
      const idx = matchesInput(u.name);
      if (idx >= 0) wasteG += Math.min(u.grams, identified[idx].grams);
    }
    const total = totals(lines);
    const perServing = { kcal: Math.round(total.kcal / m.servings), protein: Math.round((total.protein / m.servings) * 10) / 10, carbs: Math.round((total.carbs / m.servings) * 10) / 10, fat: Math.round((total.fat / m.servings) * 10) / 10, fiber: Math.round((total.fiber / m.servings) * 10) / 10 };
    return { ...m, lines, unknownNutrition: unknown, total, perServing, wasteDivertedG: Math.round(wasteG) };
  });

  const best = meals.reduce((a, b) => (b.wasteDivertedG > a.wasteDivertedG ? b : a), meals[0]);
  const wasteDivertedG = best.wasteDivertedG;
  // Quantum-inspired optimizer runs on the validated meals. It is additive: if it throws, the pipeline result is unchanged.
  let quantum: QuantumResult | undefined;
  try {
    quantum = runQuantumOptimizer({ ingredients: identified.map((i) => ({ name: i.name, grams: i.grams })), meals: meals.map((m) => ({ name: m.name, lines: m.lines })), servings });
  } catch {
    quantum = undefined;
  }

  const result = {
    ingredients: identified,
    meals,
    quantum,
    wasteDivertedG,
    co2eAvoidedKg: Math.round((wasteDivertedG / 1000) * CO2E_PER_KG_FOOD_WASTE * 100) / 100,
    notes: [
      "Nutrition values are ESTIMATES: reference values per 100 g are approximate, and ingredient weights are estimated unless you measured them.",
      `CO2e figure assumes about ${CO2E_PER_KG_FOOD_WASTE} kg CO2e per kg of food waste avoided (indicative).`,
      ...(typed.length ? [`Typed ingredients without a weight were assumed to be ${DEFAULT_GRAMS} g each.`] : []),
    ],
  };

  const runId = await recordRun("nutrition", sessionId, { ingredientCount: identified.length, usedImage: Boolean(assetId) || file instanceof File }, { meals: meals.length, wasteDivertedG }, Date.now() - t0);
  const saved = await saveNutrition(runId, sessionId, identified, result, wasteDivertedG, assetId);
  return { ...result, provider: meta.provider, saved };
});

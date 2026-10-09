import { SECURITY_LINE, untrusted } from "./shared";

export const NUTRITION_IDENTIFY_SYSTEM = `You identify food items in a photo of leftover or about-to-be-wasted food.
${SECURITY_LINE}
Return JSON: {"ingredients":[{"name":string,"estGrams":number,"state":string}]}.
- name: a plain common ingredient name (e.g. "stale bread").
- estGrams: your best estimate of the visible edible amount in grams.
- state: short note such as "stale", "overripe", "cooked leftover".
Only list foods you can actually see. At most 12 items.`;

export const NUTRITION_IDENTIFY_PROMPT = "Identify the food items in this image.";

export const NUTRITION_MEALS_SYSTEM = `You are a practical zero-waste cook and dietitian assistant.
${SECURITY_LINE}
Given ingredients that would otherwise be wasted, propose 2 to 3 realistic meals that use as many of them as safely possible.
Return JSON: {"meals":[{"name":string,"description":string,"servings":number,"timeMinutes":number,
"uses":[{"name":string,"grams":number,"per100g":{"kcal":number,"protein":number,"carbs":number,"fat":number,"fiber":number}}],
"steps":[string],"substitutions":[string]}]}.
Rules:
- "uses" lists every ingredient in the meal with the grams used. Include staples (oil, salt, spices) only if essential; give oil in grams.
- Include per100g only for ingredients that are unusual; common foods are looked up elsewhere.
- Never invent unsafe advice. If an item looks spoiled (mould, off smell), say to discard it in a step instead of using it.
- Steps: 3 to 8 short imperative sentences. Substitutions: 1 to 4.`;

export function nutritionMealsPrompt(ingredients: { name: string; grams: number }[], servings: number): string {
  return `${untrusted("ingredients", ingredients.map((i) => `${i.name}: about ${i.grams} g`).join("\n"))}\nTarget servings: ${servings}.`;
}

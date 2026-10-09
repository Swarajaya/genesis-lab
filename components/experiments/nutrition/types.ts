import type { QuantumResult } from "@/lib/engines/quantum";
import type { NutritionLine, NutritionTotals, Per100 } from "@/lib/engines/nutrition/foods";

export interface IdentifiedIngredient {
  name: string;
  grams: number;
  source: "typed" | "image";
}

export interface MealResult {
  name: string;
  description: string;
  servings: number;
  uses: { name: string; grams: number }[];
  steps: string[];
  substitutions: string[];
  timeMinutes: number;
  lines: NutritionLine[];
  unknownNutrition: string[];
  total: NutritionTotals;
  perServing: Per100;
  wasteDivertedG: number;
}

export interface NutritionResult {
  ingredients: IdentifiedIngredient[];
  meals: MealResult[];
  quantum?: QuantumResult;
  wasteDivertedG: number;
  co2eAvoidedKg: number;
  notes: string[];
  provider?: string;
  saved?: unknown;
}

/** One blob in the food visualization. */
export interface FoodBlob {
  name: string;
  grams: number;
  source: NutritionLine["source"];
}

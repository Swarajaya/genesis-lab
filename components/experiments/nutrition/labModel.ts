import type { Stage } from "@/components/ui/AiProgress";
import { classifyFood, classifyMeal } from "@/components/3d/nutrition/foodKinds";
import type { MatterItem, SynthItem, SynthMeal } from "@/components/3d/nutrition/labTypes";
import { isStaple } from "@/lib/engines/quantum/objective";
import type { MealResult, NutritionResult } from "./types";

export type EngineState = "standby" | "active" | "done" | "off";

export interface EngineRow {
  key: string;
  label: string;
  state: EngineState;
  text: string;
}

/** Maps real server stages (and the finished result) onto engine statuses. Nothing here is time-based. */
export function engineRows(args: { stage: Stage | null; loading: boolean; hasImage: boolean; result: NutritionResult | null; synthDone: boolean; synthRunning: boolean }): EngineRow[] {
  const { stage, loading, hasImage, result, synthDone, synthRunning } = args;
  const order = ["analyzing", "understanding", "generating", "validating", "complete"];
  const at = stage ? order.indexOf(stage) : -1;
  const idle = !loading && !result;
  const q = result?.quantum;

  const vision: EngineRow = idle
    ? { key: "vision", label: "Vision engine", state: "standby", text: "STANDBY" }
    : !hasImage && !result?.ingredients.some((i) => i.source === "image")
      ? { key: "vision", label: "Vision engine", state: "off", text: "NOT USED" }
      : result || at > 1
        ? { key: "vision", label: "Vision engine", state: "done", text: "COMPLETE" }
        : { key: "vision", label: "Vision engine", state: at === 1 ? "active" : "standby", text: at === 1 ? "ACTIVE" : "QUEUED" };

  const extract: EngineRow = idle
    ? { key: "extract", label: "Ingredient extraction", state: "standby", text: "STANDBY" }
    : result || at > 1 || (!hasImage && at >= 1)
      ? { key: "extract", label: "Ingredient extraction", state: "done", text: "COMPLETE" }
      : { key: "extract", label: "Ingredient extraction", state: at === 1 ? "active" : "standby", text: at === 1 ? "ACTIVE" : "QUEUED" };

  const nutrition: EngineRow = idle
    ? { key: "nutrition", label: "Nutrition engine", state: "standby", text: "STANDBY" }
    : result
      ? { key: "nutrition", label: "Nutrition engine", state: "done", text: "COMPLETE" }
      : at >= 2
        ? { key: "nutrition", label: "Nutrition engine", state: "active", text: at === 2 ? "DESIGNING MEALS" : "COMPUTING" }
        : { key: "nutrition", label: "Nutrition engine", state: "standby", text: "QUEUED" };

  const quantum: EngineRow = idle
    ? { key: "quantum", label: "Quantum core", state: "standby", text: "STANDBY" }
    : result
      ? q && q.qubits > 0
        ? { key: "quantum", label: "Quantum core", state: "done", text: "CONVERGED" }
        : { key: "quantum", label: "Quantum core", state: "off", text: "UNAVAILABLE" }
      : at >= 3
        ? { key: "quantum", label: "Quantum core", state: "active", text: "SEARCHING" }
        : { key: "quantum", label: "Quantum core", state: "standby", text: "QUEUED" };

  const synth: EngineRow = !result
    ? { key: "synth", label: "3D synthesis", state: idle ? "standby" : "standby", text: idle ? "STANDBY" : "QUEUED" }
    : synthRunning
      ? { key: "synth", label: "3D synthesis", state: "active", text: "RUNNING" }
      : synthDone
        ? { key: "synth", label: "3D synthesis", state: "done", text: "READY" }
        : { key: "synth", label: "3D synthesis", state: "standby", text: "ARMED" };

  const impact: EngineRow = result ? { key: "impact", label: "Impact engine", state: "done", text: "COMPLETE" } : { key: "impact", label: "Impact engine", state: idle ? "standby" : "standby", text: idle ? "STANDBY" : "QUEUED" };

  return [vision, extract, nutrition, quantum, synth, impact];
}

export function matterItems(result: NutritionResult): MatterItem[] {
  return result.ingredients.map((i) => ({ name: i.name, grams: i.grams, kind: classifyFood(i.name), source: i.source }));
}

const norm = (s: string) => s.toLowerCase();
const same = (a: string, b: string) => norm(a) === norm(b) || norm(a).includes(norm(b)) || norm(b).includes(norm(a));

export function synthItems(result: NutritionResult, meal: MealResult): SynthItem[] {
  return result.ingredients.map((i) => ({ name: i.name, grams: i.grams, kind: classifyFood(i.name), inMeal: meal.lines.some((l) => !isStaple(l.name) && same(l.name, i.name)) }));
}

export function synthMeal(meal: MealResult): SynthMeal {
  return { name: meal.name, kind: classifyMeal(meal.name, meal.description), lines: meal.lines.map((l) => ({ name: l.name, grams: l.grams })) };
}

export const pct = (n: number) => `${Math.round(n * 100)}`;

import type { FoodKind, MealKind } from "./foodKinds";

export interface MatterItem {
  name: string;
  grams: number;
  kind: FoodKind;
  source: "typed" | "image";
}

export interface SynthItem {
  name: string;
  grams: number;
  kind: FoodKind;
  /** True when this detected ingredient is part of the meal being materialised. */
  inMeal: boolean;
}

export interface SynthMeal {
  name: string;
  kind: MealKind;
  lines: { name: string; grams: number }[];
}

/** Seconds at which each of the seven transformation phases begins; the last value is the total duration. */
export const SYNTH_PHASES = [0, 0.7, 1.3, 1.9, 2.7, 3.3, 4.0, 5.0] as const;
export const SYNTH_DURATION = SYNTH_PHASES[SYNTH_PHASES.length - 1];

export const SYNTH_LABELS = [
  "WASTE DETECTED",
  "FOOD MATTER EXTRACTED",
  "QUANTUM STATE SPACE INITIALIZED",
  "CANDIDATE MEALS EXPLORED",
  "OPTIMAL STATE CONVERGED",
  "INGREDIENTS SYNTHESIZED",
  "FINAL MEAL MATERIALIZED",
] as const;

export function phaseAt(t: number): number {
  for (let i = SYNTH_PHASES.length - 2; i >= 0; i--) if (t >= SYNTH_PHASES[i]) return i;
  return 0;
}

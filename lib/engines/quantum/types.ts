/** Shared types for the quantum-inspired meal optimizer. Pure data, safe on server and client. */

export interface QPoolItem {
  name: string;
  /** Grams available (detected) or the amount an AI meal asked for (external). */
  availableG: number;
  /** Grams used when this ingredient is switched on in a state. */
  portionG: number;
  role: "detected" | "external";
  /** True when per-100 g nutrition could be resolved (reference table or AI estimate). */
  nutritionKnown: boolean;
}

export interface QScores {
  nutrition: number;
  waste: number;
  coverage: number;
  serving: number;
  compatibility: number;
  /** Missing-ingredient penalty (0 = none). */
  penalty: number;
  overall: number;
}

export interface QCandidate {
  /** 1-based label shown as STATE 01.. */
  rank: number;
  /** Bitstring, one char per pool ingredient (1 = ingredient used). */
  bits: string;
  ingredients: string[];
  /** Measurement probability after the final evolution step. */
  probability: number;
  scores: QScores;
  optimal: boolean;
}

export interface QNode {
  bits: string;
  /** Objective energy H = 1 - overall. */
  energy: number;
  overall: number;
  /** Probability at every evolution step, index 0 = initial uniform superposition. */
  probs: number[];
}

export interface QTracePoint {
  step: number;
  /** Probability mass on the selected optimal state. */
  pOptimal: number;
  /** Expected energy <H> over the state distribution. */
  meanEnergy: number;
}

export interface QMealScore {
  mealIndex: number;
  name: string;
  scores: QScores;
  /** Jaccard similarity between the meal's ingredient set and the optimal state (0..1). */
  alignment: number;
}

export interface QuantumResult {
  engine: "state-vector-annealing";
  qubits: number;
  stateCount: number;
  steps: number;
  pool: QPoolItem[];
  /** Detected ingredients that did not fit in the state space (largest ingredients are kept). */
  overflow: string[];
  /** Pool ingredients whose nutrition could not be resolved. */
  unknownNutrition: string[];
  weights: { nutrition: number; waste: number; coverage: number; serving: number; compatibility: number; penalty: number };
  candidates: QCandidate[];
  nodes: QNode[];
  trace: QTracePoint[];
  optimalBits: string;
  /** True when the converged state equals the exhaustive minimum of the objective (verification only). */
  matchesExhaustive: boolean;
  energyMin: number;
  energyMax: number;
  /** Counts of states per equal-width energy bin between energyMin and energyMax. */
  energyHistogram: number[];
  /** Which histogram bin holds the optimal state. */
  optimalBin: number;
  meals: QMealScore[];
  bestMealIndex: number;
  ms: number;
}

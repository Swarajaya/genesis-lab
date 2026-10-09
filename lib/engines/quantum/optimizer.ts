import type { NutritionLine, Per100 } from "@/lib/engines/nutrition/foods";
import { isStaple, pairKey, resolveNutrition, scoreItems, WEIGHTS, type Item, type ScoreContext } from "./objective";
import type { QCandidate, QMealScore, QNode, QPoolItem, QTracePoint, QuantumResult } from "./types";

/**
 * Quantum-inspired meal optimizer: a classical state-vector simulation of quantum annealing.
 *
 * Each ingredient is one qubit (on = used in the meal), so n ingredients span 2^n basis states, each a candidate
 * meal composition. A cost Hamiltonian H(x) = 1 - J(x) is diagonal in that basis, with J the objective in objective.ts.
 * The state starts in the uniform superposition and evolves under a Trotterised schedule that blends the cost phase
 * with a transverse-field mixer, so amplitude flows toward low-energy states. The simulation is exact (no sampling),
 * deterministic, and runs on a normal CPU. It is NOT quantum hardware and makes no quantum-advantage claim.
 */

export const MAX_QUBITS = 12;
export const STEPS = 48;
const MAX_DETECTED = 10;
const MAX_EXTERNAL = 2;
const TOP_NODES = 16;
const TOP_CANDIDATES = 5;
const HIST_BINS = 24;
const PORTION_CAP_PER_SERVING_G = 250;
const GAMMA_SWEEP = 16;
const BETA_SWEEP = 0.5;

export interface OptimizerIngredient {
  name: string;
  grams: number;
}
export interface OptimizerMeal {
  name: string;
  lines: Pick<NutritionLine, "name" | "grams" | "nutrition">[];
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

function bitsOf(x: number, n: number): string {
  let s = "";
  for (let q = 0; q < n; q++) s += (x >> q) & 1;
  return s;
}

export function runQuantumOptimizer(input: { ingredients: OptimizerIngredient[]; meals: OptimizerMeal[]; servings: number }): QuantumResult {
  const t0 = Date.now();
  const servings = Math.max(1, Math.round(input.servings) || 1);
  const portionCap = PORTION_CAP_PER_SERVING_G * servings;

  // Resolve nutrition for names the meals mention, so detected ingredients outside the reference table can still count.
  const mealNutrition = new Map<string, Per100>();
  for (const m of input.meals) for (const l of m.lines) mealNutrition.set(l.name.toLowerCase(), l.nutrition);
  const nutritionFor = (name: string) => resolveNutrition(name, mealNutrition.get(name.toLowerCase()) ?? null);

  // Detected ingredients: merge duplicates, keep the largest ones that fit.
  const merged = new Map<string, OptimizerIngredient>();
  for (const i of input.ingredients) {
    const k = i.name.toLowerCase();
    const prev = merged.get(k);
    if (prev) prev.grams += i.grams;
    else merged.set(k, { name: i.name, grams: i.grams });
  }
  const detectedAll = [...merged.values()].filter((i) => !isStaple(i.name)).sort((a, b) => b.grams - a.grams);
  const detected = detectedAll.slice(0, MAX_DETECTED);
  const overflow = detectedAll.slice(MAX_DETECTED).map((i) => i.name);
  const inDetected = (name: string) => {
    const n = name.toLowerCase();
    return detectedAll.some((d) => d.name.toLowerCase() === n || n.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(n));
  };

  // External ingredients the AI meals add that the user does not have: most requested first.
  const ext = new Map<string, { name: string; grams: number; count: number }>();
  for (const m of input.meals)
    for (const l of m.lines) {
      if (isStaple(l.name) || inDetected(l.name)) continue;
      const k = l.name.toLowerCase();
      const e = ext.get(k) ?? { name: l.name, grams: 0, count: 0 };
      e.grams = Math.max(e.grams, l.grams);
      e.count++;
      ext.set(k, e);
    }
  const externals = [...ext.values()].sort((a, b) => b.count - a.count || b.grams - a.grams).slice(0, Math.min(MAX_EXTERNAL, Math.max(0, MAX_QUBITS - detected.length)));

  const pool: QPoolItem[] = [
    ...detected.map((d): QPoolItem => ({ name: d.name, availableG: Math.round(d.grams), portionG: Math.max(1, Math.round(Math.min(d.grams, portionCap))), role: "detected", nutritionKnown: nutritionFor(d.name) !== null })),
    ...externals.map((e): QPoolItem => ({ name: e.name, availableG: Math.round(e.grams), portionG: Math.max(1, Math.round(e.grams)), role: "external", nutritionKnown: nutritionFor(e.name) !== null })),
  ];
  const n = pool.length;
  const emptyScores = { nutrition: 0, waste: 0, coverage: 0, serving: 0, compatibility: 0, penalty: 0, overall: 0 };
  if (n === 0) {
    return { engine: "state-vector-annealing", qubits: 0, stateCount: 0, steps: 0, pool, overflow, unknownNutrition: [], weights: { ...WEIGHTS }, candidates: [], nodes: [], trace: [], optimalBits: "", matchesExhaustive: true, energyMin: 0, energyMax: 0, energyHistogram: [], optimalBin: 0, meals: input.meals.map((m, i) => ({ mealIndex: i, name: m.name, scores: emptyScores, alignment: 0 })), bestMealIndex: 0, ms: Date.now() - t0 };
  }

  const poolItems = pool.map((p) => ({ item: { name: p.name, grams: p.portionG, nutrition: nutritionFor(p.name), detected: p.role === "detected" } satisfies Item }));
  const detectedTotalG = detected.reduce((s, d) => s + Math.min(d.grams, portionCap), 0);

  // Meal ingredient names are mapped onto pool names so variants ("tomatoes" vs "tomato") share identity.
  const canon = (name: string) => {
    const n2 = name.toLowerCase();
    const hit = pool.find((p) => p.name.toLowerCase() === n2 || n2.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(n2));
    return hit ? hit.name : name;
  };
  // Ingredient pairs that an AI-designed meal actually combines.
  const pairsCanon = new Set<string>();
  for (const m of input.meals) {
    const names = [...new Set(m.lines.filter((l) => !isStaple(l.name)).map((l) => canon(l.name).toLowerCase()))];
    for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) pairsCanon.add(pairKey(names[a], names[b]));
  }
  const ctx: ScoreContext = { servings, detectedTotalG, detectedCount: detected.length, pairs: pairsCanon };

  // Cost Hamiltonian, diagonal over all 2^n basis states.
  const N = 1 << n;
  const overall = new Float64Array(N);
  const energy = new Float64Array(N);
  for (let x = 0; x < N; x++) {
    const items: Item[] = [];
    for (let q = 0; q < n; q++) if ((x >> q) & 1) items.push(poolItems[q].item);
    overall[x] = scoreItems(items, ctx).overall;
    energy[x] = 1 - overall[x];
  }
  let eMin = Infinity, eMax = -Infinity, exhaustive = 0;
  for (let x = 0; x < N; x++) {
    if (energy[x] < eMin) { eMin = energy[x]; exhaustive = x; }
    if (energy[x] > eMax) eMax = energy[x];
  }

  // Trotterised adiabatic evolution. Cost phase strength rises, mixer strength falls.
  const range = Math.max(eMax - eMin, 1e-6);
  const GAMMA = GAMMA_SWEEP / range;
  const BETA = BETA_SWEEP;
  const re = new Float64Array(N).fill(1 / Math.sqrt(N));
  const im = new Float64Array(N);
  const probAt: Float64Array[] = [];
  const meanEnergy: number[] = [];
  const snapshot = () => {
    const p = new Float64Array(N);
    let me = 0;
    for (let x = 0; x < N; x++) {
      p[x] = re[x] * re[x] + im[x] * im[x];
      me += p[x] * energy[x];
    }
    probAt.push(p);
    meanEnergy.push(me);
  };
  snapshot();
  for (let k = 1; k <= STEPS; k++) {
    const s = k / STEPS;
    // exp(-i * gamma * s * (H - Hmin)) on the diagonal
    for (let x = 0; x < N; x++) {
      const th = -GAMMA * s * (energy[x] - eMin);
      const c = Math.cos(th), sn = Math.sin(th);
      const a = re[x], b = im[x];
      re[x] = a * c - b * sn;
      im[x] = a * sn + b * c;
    }
    // exp(+i * beta * (1 - s) * X) on every qubit (ground state of the transverse field is the uniform state)
    const cb = Math.cos(BETA * (1 - s)), sb = Math.sin(BETA * (1 - s));
    for (let q = 0; q < n; q++) {
      const bit = 1 << q;
      for (let x = 0; x < N; x++) {
        if (x & bit) continue;
        const y = x | bit;
        const ar = re[x], ai = im[x], br = re[y], bi = im[y];
        re[x] = cb * ar - sb * bi;
        im[x] = cb * ai + sb * br;
        re[y] = cb * br - sb * ai;
        im[y] = cb * bi + sb * ar;
      }
    }
    snapshot();
  }

  // Measurement distribution after the final step; the converged state is the highest-probability state.
  const final = probAt[STEPS];
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => final[b] - final[a] || energy[a] - energy[b]);
  // The empty meal is not a candidate: it stays in the state space but is never offered or selected.
  const top = order.filter((x) => x !== 0).slice(0, TOP_CANDIDATES);
  const converged = top[0];

  const toItems = (x: number): Item[] => poolItems.filter((_, q) => (x >> q) & 1).map((p) => p.item);
  const candidates: QCandidate[] = top.map((x, i) => ({
    rank: i + 1,
    bits: bitsOf(x, n),
    ingredients: pool.filter((_, q) => (x >> q) & 1).map((p) => p.name),
    probability: r4(final[x]),
    scores: scoreItems(toItems(x), ctx),
    optimal: x === converged,
  }));

  const nodeIdx = new Set(order.slice(0, Math.min(TOP_NODES, N)));
  nodeIdx.add(exhaustive);
  const nodes: QNode[] = [...nodeIdx].map((x) => ({ bits: bitsOf(x, n), energy: r4(energy[x]), overall: r4(overall[x]), probs: probAt.map((p) => r4(p[x])) }));

  const trace: QTracePoint[] = probAt.map((p, step) => ({ step, pOptimal: r4(p[converged]), meanEnergy: r4(meanEnergy[step]) }));

  const span = Math.max(eMax - eMin, 1e-9);
  const hist = new Array<number>(HIST_BINS).fill(0);
  const binOf = (e: number) => Math.min(HIST_BINS - 1, Math.floor(((e - eMin) / span) * HIST_BINS));
  for (let x = 0; x < N; x++) hist[binOf(energy[x])]++;

  // Score every AI meal with the same objective and compare it with the converged composition.
  const optimalSet = new Set(pool.filter((_, q) => (converged >> q) & 1).map((p) => p.name.toLowerCase()));
  const meals: QMealScore[] = input.meals.map((m, mealIndex) => {
    const items: Item[] = m.lines.map((l) => ({ name: canon(l.name), grams: l.grams, nutrition: l.nutrition, detected: inDetected(l.name) }));
    const set = new Set(items.filter((i) => !isStaple(i.name)).map((i) => i.name.toLowerCase()));
    let inter = 0;
    for (const s of set) if (optimalSet.has(s)) inter++;
    const union = new Set([...set, ...optimalSet]).size;
    return { mealIndex, name: m.name, scores: scoreItems(items, ctx), alignment: union === 0 ? 0 : r4(inter / union) };
  });
  let bestMealIndex = 0;
  for (const m of meals) {
    const b = meals[bestMealIndex];
    if (m.scores.overall > b.scores.overall || (m.scores.overall === b.scores.overall && m.alignment > b.alignment)) bestMealIndex = m.mealIndex;
  }

  return {
    engine: "state-vector-annealing",
    qubits: n,
    stateCount: N,
    steps: STEPS,
    pool,
    overflow,
    unknownNutrition: pool.filter((p) => !p.nutritionKnown).map((p) => p.name),
    weights: { ...WEIGHTS },
    candidates,
    nodes,
    trace,
    optimalBits: bitsOf(converged, n),
    matchesExhaustive: converged === exhaustive,
    energyMin: r4(eMin),
    energyMax: r4(eMax),
    energyHistogram: hist,
    optimalBin: binOf(energy[converged]),
    meals,
    bestMealIndex,
    ms: Date.now() - t0,
  };
}

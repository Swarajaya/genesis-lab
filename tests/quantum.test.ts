import { describe, expect, it } from "vitest";
import { runQuantumOptimizer, STEPS } from "@/lib/engines/quantum";
import { lookupFood } from "@/lib/engines/nutrition/foods";

const line = (name: string, grams: number) => {
  const r = lookupFood(name)!;
  return { name, grams, nutrition: { kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber } };
};

const base = {
  servings: 2,
  ingredients: [{ name: "stale bread", grams: 200 }, { name: "tomato", grams: 300 }, { name: "lettuce", grams: 100 }, { name: "rice", grams: 200 }, { name: "lentils", grams: 150 }],
  meals: [
    { name: "Panzanella", lines: [line("bread", 200), line("tomato", 300), line("lettuce", 100)] },
    { name: "Dal rice", lines: [line("rice", 200), line("lentils", 150), line("tomato", 100)] },
  ],
};

describe("quantum optimizer", () => {
  it("is deterministic and keeps probabilities normalised at every step", () => {
    const a = runQuantumOptimizer(base);
    const b = runQuantumOptimizer(base);
    expect({ ...a, ms: 0 }).toEqual({ ...b, ms: 0 });
    for (let k = 0; k <= STEPS; k++) {
      const sum = a.nodes.reduce((s, n) => s + n.probs[k], 0);
      expect(sum).toBeLessThanOrEqual(1.0001);
    }
  });

  it("converges onto the exhaustive optimum and raises its probability", () => {
    const r = runQuantumOptimizer(base);
    expect(r.qubits).toBe(5);
    expect(r.stateCount).toBe(32);
    expect(r.matchesExhaustive).toBe(true);
    expect(r.trace[STEPS].pOptimal).toBeGreaterThan(r.trace[0].pOptimal * 4);
    expect(r.trace[STEPS].meanEnergy).toBeLessThan(r.trace[0].meanEnergy);
    const best = r.candidates.find((c) => c.optimal)!;
    expect(best.bits).toBe(r.optimalBits);
    expect(Math.max(...r.candidates.map((c) => c.scores.overall))).toBeGreaterThanOrEqual(best.scores.overall - 0.02);
  });

  it("never offers the empty meal as a candidate", () => {
    const r = runQuantumOptimizer(base);
    expect(r.candidates.every((c) => c.bits.includes("1"))).toBe(true);
    expect(r.candidates.length).toBeGreaterThan(0);
  });

  it("scores every meal and picks the best with the same objective", () => {
    const r = runQuantumOptimizer(base);
    expect(r.meals).toHaveLength(2);
    expect(r.meals[r.bestMealIndex].scores.overall).toBe(Math.max(...r.meals.map((m) => m.scores.overall)));
  });

  it("penalises ingredients the user does not have", () => {
    const r = runQuantumOptimizer({ ...base, meals: [{ name: "Fancy", lines: [line("bread", 200), line("cheese", 100), line("tomato", 100)] }] });
    expect(r.pool.some((p) => p.role === "external" && p.name === "cheese")).toBe(true);
    expect(r.meals[0].scores.penalty).toBeGreaterThan(0);
  });

  it("caps the state space and reports overflow", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ name: `item ${i}`, grams: 100 + i }));
    const r = runQuantumOptimizer({ servings: 2, ingredients: many, meals: [] });
    expect(r.qubits).toBeLessThanOrEqual(12);
    expect(r.overflow.length).toBe(4);
  });

  it("handles empty input without throwing", () => {
    const r = runQuantumOptimizer({ servings: 2, ingredients: [], meals: [] });
    expect(r.qubits).toBe(0);
    expect(r.candidates).toEqual([]);
  });
});

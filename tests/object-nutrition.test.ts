import { describe, expect, it } from "vitest";
import { EMISSION_FACTORS, rankPathways, type RawPathway } from "@/lib/engines/object/engine";
import { lookupFood, totals } from "@/lib/engines/nutrition/foods";

const mk = (over: Partial<RawPathway>): RawPathway => ({
  category: "reuse",
  title: "Plant pot",
  summary: "s",
  steps: ["a"],
  resources: ["soil"],
  feasibility: 8,
  materialPreservation: 8,
  difficulty: 1,
  displacedVirginFraction: 0.5,
  timeMinutes: 10,
  ...over,
});

describe("object lifecycle ranking", () => {
  it("orders by composite score and computes transparent impact numbers", () => {
    const ranked = rankPathways(
      [mk({ title: "Landfill-ish idea", feasibility: 2, materialPreservation: 2, displacedVirginFraction: 0.05, difficulty: 5, resources: ["a", "b", "c", "d"] }), mk({ title: "Bird feeder" })],
      { massKg: 0.5, material: "plastic" },
    );
    expect(ranked[0].title).toBe("Bird feeder");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].co2AvoidedKg).toBeCloseTo(0.5 * 0.5 * EMISSION_FACTORS.plastic.kgCo2ePerKg, 3);
    expect(ranked[0].wasteAvoidedKg).toBeCloseTo(0.4, 3);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it("removes near-duplicate pathways and clamps out-of-range values", () => {
    const ranked = rankPathways([mk({ title: "Make a plant pot" }), mk({ title: "Plant pot make" }), mk({ title: "Candle holder", feasibility: 99, displacedVirginFraction: 7 })], { massKg: 1, material: "glass" });
    expect(ranked.length).toBe(2);
    expect(ranked.find((r) => r.title === "Candle holder")?.feasibility).toBe(10);
    expect(ranked.every((r) => r.displacedVirginFraction <= 1)).toBe(true);
  });
});

describe("nutrition", () => {
  it("looks up foods by alias", () => {
    expect(lookupFood("stale bread")?.name).toBe("bread");
    expect(lookupFood("overripe bananas")?.name).toBe("banana");
    expect(lookupFood("unicorn meat")).toBeNull();
  });
  it("computes totals from grams", () => {
    const bread = lookupFood("bread")!;
    const t = totals([{ name: "bread", grams: 200, source: "reference-table", nutrition: bread }]);
    expect(t.kcal).toBe(530);
    expect(t.grams).toBe(200);
  });
});

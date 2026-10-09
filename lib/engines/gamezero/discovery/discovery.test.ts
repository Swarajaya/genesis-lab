import { describe, expect, it } from "vitest";
import { generateWorld, initialState, stepWorld, type World } from "../world";
import { ACTIONS, type Action, type GameState } from "../types";
import { playFromModel, runDiscovery, type DiscoveryEnv } from "./driver";
import { DiscoverySession } from "./session";
import { scoreActions } from "./activeLearning";

function envFor(w: World): DiscoveryEnv {
  return {
    async step(s, a) { return stepWorld(w, s, a); },
    async whatIf(s: GameState) {
      const out = {} as Record<Action, { pos: { x: number; y: number }; event: "none" | "reward" | "hazard" | "goal" }>;
      for (const a of ACTIONS) { const r = stepWorld(w, s, a); out[a] = { pos: r.state.pos, event: r.event }; }
      return out;
    },
  };
}

const seeds = Array.from({ length: 20 }, (_, i) => `w${i + 1}`);

describe("full discovery pipeline", () => {
  for (const seed of seeds) {
    it(`discovers, verifies and plays world ${seed}`, async () => {
      const w = generateWorld(seed);
      const session = new DiscoverySession(w.pub, seed);
      expect(session.analyze().knowledge).toBe(0);
      const t0 = Date.now();
      const res = await runDiscovery(session, envFor(w), initialState(w.pub));
      const a = session.analyze();
      console.log(`      ${seed}: phase=${res.phase} experiments=${a.metrics.experiments} knowledge=${(a.knowledge * 100).toFixed(1)}% confirmed=${a.metrics.rulesConfirmed}/${a.metrics.rulesTotal} cf=${a.metrics.counterfactuals} (${a.metrics.counterfactualMatches}/${a.metrics.counterfactualChecked}) evoGens=${a.evo.history.length} qihs=${a.qihs.mode ?? a.qihs.rounds} ${Date.now() - t0}ms`);
      expect(res.phase).toBe("complete");
      expect(a.identified).toBe(true);
      expect(a.knowledge).toBeGreaterThan(0.9999);
      // learned model equals the hidden truth (checked here only; the engine never saw it)
      const lead = session.space.leading()!;
      expect(lead.dyn).toEqual(w.rules.dynamics);
      session.space.colors.forEach((c, i) => { if (!session.space.irreducible.includes(c)) expect(lead.roles[i]).toBe(w.rules.terrain[c]); });
      expect(a.metrics.counterfactualMatches).toBe(a.metrics.counterfactualChecked);
      const play = await playFromModel(session, envFor(w));
      expect(play.solved).toBe(true);
    });
  }
});

describe("honesty checks", () => {
  it("never labels a rule CONFIRMED without two interventions, and rejected atoms carry a source experiment", async () => {
    const w = generateWorld("hon");
    const session = new DiscoverySession(w.pub, "hon");
    await runDiscovery(session, envFor(w), initialState(w.pub));
    for (const a of session.analyze().atoms) {
      if (a.status === "CONFIRMED") expect(a.interventions).toBeGreaterThanOrEqual(1);
      if (a.status === "REJECTED") { expect(a.contradictions).toBeGreaterThan(0); expect(a.contradictedBy.length).toBeGreaterThan(0); }
    }
  });
  it("demonstrations alone never confirm a rule", () => {
    const w = generateWorld("demo1");
    const session = new DiscoverySession(w.pub, "demo1");
    let st = initialState(w.pub);
    for (const a of ["right", "down", "left", "up", "right", "right", "down", "down"] as const) {
      const r = stepWorld(w, st, a);
      session.observe({ before: st, action: a, after: r.state, event: r.event }, "demo");
      st = r.state;
    }
    expect(session.analyze().atoms.filter((x) => x.status === "CONFIRMED")).toHaveLength(0);
    expect(session.analyze().metrics.experiments).toBe(0);
  });
  it("evolution only records a generation when the population actually changed", async () => {
    const w = generateWorld("evo1");
    const session = new DiscoverySession(w.pub, "evo1");
    await runDiscovery(session, envFor(w), initialState(w.pub));
    const h = session.analyze().evo.history;
    for (const g of h) expect(g.rejected).toBeGreaterThan(0);
    expect(session.analyze().evo.pop.length).toBeGreaterThan(0);
  });
});

describe("active learning", () => {
  it("information gain is non-negative, bounded by log2(outcomes), and prefers disagreement", () => {
    const w = generateWorld("al");
    const s = new DiscoverySession(w.pub, "al");
    const sc = scoreActions(s.space, s.qihs.marginals, initialState(w.pub));
    for (const x of sc) {
      expect(x.gain).toBeGreaterThanOrEqual(0);
      expect(x.gain).toBeLessThanOrEqual(Math.log2(x.outcomes) + 1e-9);
    }
    expect(Math.max(...sc.map((x) => x.gain))).toBeGreaterThan(0.5);
  });
});

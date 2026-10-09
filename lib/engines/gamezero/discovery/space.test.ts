import { describe, expect, it } from "vitest";
import { Learner } from "../learner";
import { generateWorld, initialState, stepWorld } from "../world";
import { ACTIONS, type Observation } from "../types";
import { CandidateSpace, DYNAMICS } from "./space";
import { dynamicsId } from "../dynamics";
import { runQihs } from "./qihs";

function randomObservations(seed: string, n: number) {
  const w = generateWorld(seed);
  let s = initialState(w.pub);
  const obs: Observation[] = [];
  let r = 12345;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    const a = ACTIONS[Math.floor(rnd() * 4)];
    const res = stepWorld(w, s, a);
    obs.push({ before: s, action: a, after: res.state, event: res.event });
    s = res.state;
  }
  return { w, obs };
}

describe("candidate space", () => {
  it("never eliminates the true world and agrees with the existing Learner on movement rules", () => {
    for (const seed of ["a1", "b2", "c3", "d4", "e5", "f6"]) {
      const { w, obs } = randomObservations(seed, 40);
      const space = new CandidateSpace(w.pub);
      const learner = new Learner(w.pub);
      for (const o of obs) {
        space.observe(o);
        learner.observe(o);
      }
      const trueIdx = DYNAMICS.findIndex((d) => dynamicsId(d) === dynamicsId(w.rules.dynamics));
      expect(space.alive[trueIdx]).toBe(true);
      for (const c of space.colors) {
        const ci = space.colorIndex(c);
        const m = space.masks[trueIdx][ci];
        const role = w.rules.terrain[c];
        const bit = { free: 1, solid: 2, reward: 4, hazard: 8, goal: 16 }[role];
        expect((m & bit) !== 0).toBe(true);
      }
      const colorAlive = new Set(learner.alive().filter((h) => h.model === "color").map((h) => dynamicsId(h.dyn)));
      const mine = new Set(space.dynamicsAlive().map(dynamicsId));
      expect([...mine].sort()).toEqual([...colorAlive].sort());
    }
  });

  it("knowledge is 0 before any observation, monotone, and 1 only when one world remains", () => {
    const { w, obs } = randomObservations("k9", 80);
    const space = new CandidateSpace(w.pub);
    expect(space.knowledge()).toBe(0);
    let last = 0;
    for (const o of obs) {
      space.observe(o);
      const k = space.knowledge();
      expect(k).toBeGreaterThanOrEqual(last - 1e-12);
      last = k;
      if (k > 1 - 1e-9) expect(space.totalWorlds()).toBe(1);
    }
  });
});

describe("QIHS", () => {
  it("matches the exact Bayesian marginals and amplifies the consistent subspace", () => {
    const { w, obs } = randomObservations("q7", 25);
    const space = new CandidateSpace(w.pub);
    for (const o of obs) space.observe(o);
    const r = runQihs(space);
    expect(r.summary.mode).toBe("amplitude-amplification");
    expect(r.summary.agreement).toBeLessThan(1e-9);
    expect(r.summary.goodProbability).toBeGreaterThan(r.summary.priorGoodMass);
    expect(r.summary.goodProbability).toBeGreaterThan(0.5);
    expect(r.summary.qubits).toBe(17);
  });
  it("does nothing (0 rounds) before any observation", () => {
    const w = generateWorld("z");
    const space = new CandidateSpace(w.pub);
    const r = runQihs(space);
    expect(r.summary.rounds).toBe(0);
    expect(r.summary.goodStates).toBe(75000);
  });
});

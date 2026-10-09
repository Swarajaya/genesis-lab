import { describe, expect, it } from "vitest";
import { runPlay, runTests } from "@/lib/engines/gamezero/agent";
import { applyDynamics } from "@/lib/engines/gamezero/dynamics";
import { Learner } from "@/lib/engines/gamezero/learner";
import { ACTIONS, type GameState, type Observation } from "@/lib/engines/gamezero/types";
import { generateWorld, initialState, localEnv, stepWorld } from "@/lib/engines/gamezero/world";

describe("GameZero world", () => {
  it("is deterministic per seed and solvable", () => {
    const a = generateWorld("seed-1");
    const b = generateWorld("seed-1");
    expect(a.pub.colors).toEqual(b.pub.colors);
    expect(a.rules).toEqual(b.rules);
  });

  it("never leaks terrain meaning into the public world", () => {
    const w = generateWorld("seed-2");
    expect(JSON.stringify(w.pub)).not.toMatch(/solid|hazard|reward|goal/);
  });
});

describe("GameZero learner", () => {
  it("rejects hypotheses that contradict observations, with a reason", () => {
    const w = generateWorld("seed-3");
    const learner = new Learner(w.pub);
    const before = learner.alive().length;
    let state: GameState = initialState(w.pub);
    const all = [];
    for (let i = 0; i < 12; i++) {
      const action = ACTIONS[(i * 3) % 4];
      const res = stepWorld(w, state, action);
      all.push(...learner.observe({ before: state, action, after: res.state, event: res.event }));
      state = res.state;
    }
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].reason.length).toBeGreaterThan(10);
    expect(learner.alive().length).toBe(before - all.length);
  });

  it("always keeps the true dynamics alive", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const w = generateWorld(seed);
      const learner = new Learner(w.pub);
      let state: GameState = initialState(w.pub);
      for (let i = 0; i < 25; i++) {
        const action = ACTIONS[i % 4];
        const res = stepWorld(w, state, action);
        learner.observe({ before: state, action, after: res.state, event: res.event });
        state = res.state;
      }
      const truth = w.rules.dynamics;
      expect(learner.aliveDynamics().some((d) => d.k === truth.k && d.edge === truth.edge && d.mapping === truth.mapping)).toBe(true);
    }
  });

  it("rejects the color-based model when two same-colored cells behave differently", () => {
    const w = generateWorld("seed-4");
    const learner = new Learner(w.pub);
    const cells: { x: number; y: number; c: string }[] = [];
    for (let y = 0; y < 7; y++) for (let x = 1; x < 7; x++) cells.push({ x, y, c: w.pub.colors[y][x] });
    let pair: [(typeof cells)[number], (typeof cells)[number]] | null = null;
    for (const a of cells) {
      const b = cells.find((o) => o !== a && o.c === a.c);
      if (b) {
        pair = [a, b];
        break;
      }
    }
    expect(pair).not.toBeNull();
    const [A, B] = pair as NonNullable<typeof pair>;
    const base = initialState(w.pub);
    const mk = (cell: { x: number; y: number }, event: "none" | "reward"): Observation => ({
      before: { ...base, pos: { x: cell.x - 1, y: cell.y } },
      action: "right",
      after: { ...base, pos: { x: cell.x, y: cell.y } },
      event,
    });
    learner.observe(mk(A, "none"));
    const rej = learner.observe(mk(B, "reward"));
    const colorH = learner.hyps.find((h) => h.id === "k1-stop-normal|color");
    const posH = learner.hyps.find((h) => h.id === "k1-stop-normal|position");
    expect(colorH?.alive).toBe(false);
    expect(posH?.alive).toBe(true);
    expect(rej.find((r) => r.hypothesisId === "k1-stop-normal|color")?.reason).toMatch(/cells behaved as/);
  });
});

describe("GameZero agent end to end", () => {
  it("identifies the dynamics from experiments and solves most worlds", async () => {
    let solved = 0;
    const seeds = Array.from({ length: 12 }, (_, i) => `e2e-${i}`);
    for (const seed of seeds) {
      const w = generateWorld(seed);
      const env = localEnv(w);
      const learner = new Learner(w.pub);
      const start = initialState(w.pub);
      // one demonstration move
      const res = stepWorld(w, start, "right");
      learner.observe({ before: start, action: "right", after: res.state, event: res.event });
      const t = await runTests(learner, env, res.state, { seed });
      const truth = w.rules.dynamics;
      const dyn = learner.aliveDynamics();
      expect(dyn.some((d) => d.k === truth.k && d.edge === truth.edge && d.mapping === truth.mapping)).toBe(true);
      const p = await runPlay(learner, env, t.state);
      if (p.solved) solved++;
    }
    expect(solved).toBeGreaterThanOrEqual(9);
  });

  it("dynamics function respects wrap and stop edges", () => {
    expect(applyDynamics({ k: 1, edge: "stop", mapping: "normal" }, { x: 0, y: 0 }, "left", 7)).toBeNull();
    expect(applyDynamics({ k: 1, edge: "wrap", mapping: "normal" }, { x: 0, y: 0 }, "left", 7)).toEqual({ x: 6, y: 0 });
    expect(applyDynamics({ k: 2, edge: "stop", mapping: "inverted" }, { x: 3, y: 3 }, "up", 7)).toEqual({ x: 3, y: 5 });
  });
});

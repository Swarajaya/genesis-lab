import { applyDynamics } from "./dynamics";
import type { Hypothesis, Learner } from "./learner";
import { ACTIONS, key, samePos, type Action, type GameState, type Pos } from "./types";

interface PathResult {
  first: Action;
  length: number;
  target: Pos;
}

/** Dijkstra over the learner's believed model. Solid and hazard cells are never entered. Unknown cells cost extra. */
export function pathTo(learner: Learner, h: Hypothesis, from: Pos, isTarget: (p: Pos) => boolean, avoidKnownGoalUntilTarget = false): PathResult | null {
  const size = learner.world.size;
  const dist = new Map<string, number>([[key(from), 0]]);
  const firstMove = new Map<string, Action>();
  const done = new Set<string>();
  const nodes = new Map<string, Pos>([[key(from), from]]);

  while (true) {
    let curKey: string | null = null;
    let best = Infinity;
    for (const [k, d] of dist) if (!done.has(k) && d < best) {
        best = d;
        curKey = k;
      }
    if (curKey === null) return null;
    done.add(curKey);
    const cur = nodes.get(curKey) as Pos;
    if (!samePos(cur, from) && isTarget(cur)) {
      return { first: firstMove.get(curKey) as Action, length: best, target: cur };
    }
    for (const a of ACTIONS) {
      const t = applyDynamics(h.dyn, cur, a, size);
      if (!t || samePos(t, cur)) continue;
      const tt = learner.terrainBelief(h, t);
      if (tt === "solid" || tt === "hazard") continue;
      if (tt === "goal" && !isTarget(t) && avoidKnownGoalUntilTarget) continue;
      const k = key(t);
      const nd = best + (tt === "unknown" ? 2 : 1);
      if (nd < (dist.get(k) ?? Infinity)) {
        dist.set(k, nd);
        nodes.set(k, t);
        firstMove.set(k, samePos(cur, from) ? a : (firstMove.get(curKey) as Action));
      }
    }
  }
}

/** Choose the next move to play: collect nearby known rewards, then reach the goal; explore if the goal is unknown. */
export function planPlayMove(learner: Learner, state: GameState): { action: Action; intent: string } | null {
  const h = learner.best();
  if (!h) return null;
  const size = learner.world.size;
  const cells: Pos[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push({ x, y });

  const isGoal = (p: Pos) => learner.terrainBelief(h, p) === "goal";
  const isReward = (p: Pos) => learner.terrainBelief(h, p) === "reward" && !state.collected.includes(key(p));
  const isUnknown = (p: Pos) => learner.terrainBelief(h, p) === "unknown";

  const goalPath = pathTo(learner, h, state.pos, isGoal);
  const rewardPath = pathTo(learner, h, state.pos, isReward, true);
  if (rewardPath && rewardPath.length <= 6 && state.score < 2) return { action: rewardPath.first, intent: "collect reward" };
  if (goalPath) return { action: goalPath.first, intent: "head to goal" };
  const explore = pathTo(learner, h, state.pos, isUnknown);
  if (explore) return { action: explore.first, intent: "explore unknown terrain" };
  if (rewardPath) return { action: rewardPath.first, intent: "collect reward" };
  return null;
}

function entropy(counts: number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  return -counts.reduce((s, c) => (c === 0 ? s : s + (c / n) * Math.log2(c / n)), 0);
}

/** How well does `action` from `pos` split the surviving hypotheses? 0 means all agree. */
export function splitScore(learner: Learner, pos: Pos, action: Action): number {
  const groups = new Map<string, number>();
  for (const h of learner.alive()) {
    const p = learner.predict(h, pos, action);
    const sig = `${p.target ? key(p.target) : "stay"}|${p.terrain}`;
    groups.set(sig, (groups.get(sig) ?? 0) + 1);
  }
  return entropy([...groups.values()]);
}

/** TEST phase: pick the experiment that best discriminates between surviving hypotheses. */
export function chooseExperiment(learner: Learner, state: GameState): { action: Action; why: string } | null {
  const h = learner.best();
  if (!h) return null;

  let bestAction: Action | null = null;
  let bestScore = 0;
  for (const a of ACTIONS) {
    const s = splitScore(learner, state.pos, a);
    if (s > bestScore + 1e-9) {
      bestScore = s;
      bestAction = a;
    }
  }
  if (bestAction) return { action: bestAction, why: `splits ${learner.alive().length} hypotheses (${bestScore.toFixed(2)} bits)` };

  // Nothing here discriminates: walk to the nearest cell where some action would.
  const disagree = pathTo(learner, h, state.pos, (p) => ACTIONS.some((a) => splitScore(learner, p, a) > 1e-9));
  if (disagree) return { action: disagree.first, why: "walking to a cell where hypotheses disagree" };

  const unknown = pathTo(learner, h, state.pos, (p) => learner.terrainBelief(h, p) === "unknown");
  if (unknown) return { action: unknown.first, why: "probing terrain not yet understood" };

  return null;
}

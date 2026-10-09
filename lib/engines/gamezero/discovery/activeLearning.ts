import { applyDynamics } from "../dynamics";
import type { Learner } from "../learner";
import { stepWorld } from "../world";
import { ACTIONS, key, type Action, type Color, type GameState, type Pos, type PublicWorld } from "../types";
import { DYNAMICS, TERRAINS, popcount, rolesOf, simulateOutcome, type CandidateSpace, type Marginals } from "./space";

export interface ActionScore {
  action: Action;
  /** expected information gain in bits = entropy of the predicted outcome under the current posterior */
  gain: number;
  /** number of distinct outcomes the surviving worlds disagree about */
  outcomes: number;
}

const H = (ws: number[]) => ws.reduce((s, p) => (p > 0 ? s - p * Math.log2(p) : s), 0);

/**
 * "Which action will teach me the most?"  For every action, every surviving candidate world (weighted by the
 * QIHS posterior) predicts an outcome via the real engine step. The information gain of the action is the entropy
 * of that predicted-outcome distribution: the more the surviving worlds disagree, the more the action reveals.
 */
export function scoreActions(space: CandidateSpace, marg: Marginals, state: GameState): ActionScore[] {
  const pub = space.pub;
  return ACTIONS.map((action) => {
    const groups = new Map<string, number>();
    DYNAMICS.forEach((d, i) => {
      if (!space.alive[i] || marg.dyn[i] <= 0) return;
      const t = applyDynamics(d, state.pos, action, pub.size);
      if (t === null) {
        const k = `${state.pos.x},${state.pos.y}|none`;
        groups.set(k, (groups.get(k) ?? 0) + marg.dyn[i]);
        return;
      }
      const color = pub.colors[t.y][t.x];
      const ci = space.colorIndex(color);
      TERRAINS.forEach((role, ri) => {
        const p = marg.joint[i][ci][ri];
        if (p <= 0) return;
        const o = simulateOutcome(pub, state, action, d, color, role);
        groups.set(o.key, (groups.get(o.key) ?? 0) + p);
      });
    });
    const ws = [...groups.values()];
    return { action, gain: H(ws), outcomes: groups.size };
  });
}

export interface ExperimentPlan {
  action: Action;
  gain: number;
  scores: ActionScore[];
  question: string;
  actionText: string;
  /** "direct": an action here discriminates. "walk": no action here does, so move toward one that will. */
  mode: "direct" | "walk";
  targetColor: Color | null;
  /** for "walk" plans: where the agent is heading and the best information gain available there */
  walkTarget?: Pos;
  walkGain?: number;
}

/** Which cell/color does `action` aim at under each surviving movement rule (weighted)? */
function describeTarget(space: CandidateSpace, marg: Marginals, state: GameState, action: Action) {
  const byCell = new Map<string, { pos: Pos | null; w: number }>();
  DYNAMICS.forEach((d, i) => {
    if (!space.alive[i] || marg.dyn[i] <= 0) return;
    const t = applyDynamics(d, state.pos, action, space.pub.size);
    const k = t ? `${t.x},${t.y}` : "edge";
    const e = byCell.get(k) ?? { pos: t, w: 0 };
    e.w += marg.dyn[i];
    byCell.set(k, e);
  });
  return [...byCell.values()].sort((a, b) => b.w - a.w);
}

export function designExperiment(space: CandidateSpace, marg: Marginals, state: GameState, learner: Learner | null): ExperimentPlan | null {
  const scores = scoreActions(space, marg, state);
  const best = [...scores].sort((a, b) => b.gain - a.gain)[0];
  const pub: PublicWorld = space.pub;
  if (best && best.gain > 1e-9) {
    const targets = describeTarget(space, marg, state, best.action);
    if (targets.length > 1) {
      return { action: best.action, gain: best.gain, scores, mode: "direct", targetColor: null, question: "How do the controls map to movement on this board?", actionText: `Press ${best.action} and observe where the piece ends up.` };
    }
    const t = targets[0]?.pos ?? null;
    if (!t) return { action: best.action, gain: best.gain, scores, mode: "direct", targetColor: null, question: "Is the board edge a wall or does it wrap?", actionText: `Press ${best.action} at the edge of the board.` };
    const color = pub.colors[t.y][t.x];
    return { action: best.action, gain: best.gain, scores, mode: "direct", targetColor: color, question: `What does ${color} terrain do?`, actionText: `Move the player ${best.action} onto the ${color} cell at (${t.x},${t.y}).` };
  }
  // No action from this cell separates the surviving worlds: imagine paths through the learned model and walk to
  // the cell where an experiment will teach the most per step.
  const walk = walkToInformation(space, marg, state);
  if (walk) {
    return {
      action: walk.action, gain: 0, scores, mode: "walk", targetColor: null, walkTarget: walk.target, walkGain: walk.gain,
      question: "Where can an experiment still tell the surviving worlds apart?",
      actionText: `No action here is informative. Move ${walk.action} toward (${walk.target.x},${walk.target.y}), where an experiment is worth ${walk.gain.toFixed(2)} bits.`,
    };
  }
  void learner;
  return null;
}

/**
 * Multi-step lookahead. Imagines the leading world (unknown terrain assumed walkable, known hazards/goals avoided),
 * evaluates the best single-action information gain at every reachable cell, and heads for the best gain per step.
 */
export function walkToInformation(space: CandidateSpace, marg: Marginals, state: GameState): { action: Action; target: Pos; gain: number; steps: number } | null {
  const lead = space.leading();
  const model = space.asWorld();
  if (!lead || !model) return null;
  const known = (c: Color) => {
    const m = space.masks[lead.dynIndex][space.colorIndex(c)];
    return popcount(m) === 1 ? rolesOf(m)[0] : null;
  };
  const seen = new Set<string>([key(state.pos)]);
  const queue: { s: GameState; first: Action | null; d: number }[] = [{ s: state, first: null, d: 0 }];
  let best: { action: Action; target: Pos; gain: number; steps: number; value: number } | null = null;
  while (queue.length) {
    const cur = queue.shift() as { s: GameState; first: Action | null; d: number };
    if (cur.first) {
      const g = Math.max(...scoreActions(space, marg, cur.s).map((x) => x.gain));
      const value = g / cur.d;
      if (g > 1e-9 && (!best || value > best.value + 1e-12)) best = { action: cur.first, target: cur.s.pos, gain: g, steps: cur.d, value };
    }
    if (cur.d >= 12) continue;
    for (const a of ACTIONS) {
      const t = applyDynamics(model.rules.dynamics, cur.s.pos, a, space.pub.size);
      if (t) {
        const role = known(space.pub.colors[t.y][t.x]);
        if (role === "hazard" || role === "goal" || role === "solid") continue;
      }
      const r = stepWorld(model, cur.s, a);
      const k = key(r.state.pos);
      if (seen.has(k) || r.event === "hazard" || r.event === "goal") continue;
      seen.add(k);
      queue.push({ s: r.state, first: cur.first ?? a, d: cur.d + 1 });
    }
  }
  return best ? { action: best.action, target: best.target, gain: best.gain, steps: best.steps } : null;
}

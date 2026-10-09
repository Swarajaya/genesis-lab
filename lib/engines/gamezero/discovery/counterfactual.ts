import type { Action, GameEvent, GameState, Observation, Pos } from "../types";
import { DYNAMICS, TERRAINS, simulateOutcome, type CandidateSpace } from "./space";
import { applyDynamics } from "../dynamics";
import { ACTIONS } from "../types";

export type OutcomeLabel = "BLOCKED" | "SAFE" | "REWARD" | "HAZARD" | "GOAL";

export interface EngineOutcome {
  pos: Pos;
  event: GameEvent;
}

export function labelOutcome(before: GameState, o: EngineOutcome): OutcomeLabel {
  if (o.event === "hazard") return "HAZARD";
  if (o.event === "goal") return "GOAL";
  if (o.event === "reward") return "REWARD";
  return o.pos.x === before.pos.x && o.pos.y === before.pos.y ? "BLOCKED" : "SAFE";
}

const k = (o: EngineOutcome) => `${o.pos.x},${o.pos.y}|${o.event}`;

/**
 * What the learned world model predicts for `action` from `before`, or null when the surviving worlds still disagree.
 * Never guesses: if the model is undetermined for this move, the prediction is withheld.
 */
export function modelPrediction(space: CandidateSpace, before: GameState, action: Action): EngineOutcome | null {
  const seen = new Map<string, EngineOutcome>();
  for (let i = 0; i < DYNAMICS.length; i++) {
    if (!space.alive[i]) continue;
    const t = applyDynamics(DYNAMICS[i], before.pos, action, space.pub.size);
    if (t === null) {
      const o = { pos: before.pos, event: "none" as GameEvent };
      seen.set(k(o), o);
      continue;
    }
    const color = space.pub.colors[t.y][t.x];
    const m = space.masks[i][space.colorIndex(color)];
    TERRAINS.forEach((role, ri) => {
      if ((m & (1 << ri)) === 0) return;
      const r = simulateOutcome(space.pub, before, action, DYNAMICS[i], color, role);
      const o = { pos: r.pos, event: r.event as GameEvent };
      seen.set(k(o), o);
    });
  }
  if (seen.size !== 1) return null;
  return [...seen.values()][0];
}

export interface CounterfactualRow {
  action: Action;
  taken: boolean;
  engine: EngineOutcome;
  label: OutcomeLabel;
  predicted: EngineOutcome | null;
  predictedLabel: OutcomeLabel | null;
  /** null when the model withheld a prediction */
  match: boolean | null;
}

export interface CounterfactualReport {
  step: number;
  reason: string;
  rows: CounterfactualRow[];
}

/** Is this observation worth a "what if" analysis? */
export function isImportant(obs: Observation, rejectedNow: number): string | null {
  if (obs.event === "hazard") return "hazard hit";
  if (obs.event === "goal") return "goal reached";
  if (obs.event === "reward") return "reward collected";
  if (obs.after.pos.x === obs.before.pos.x && obs.after.pos.y === obs.before.pos.y) return "move was blocked";
  if (rejectedNow > 0) return "hypotheses were rejected";
  return null;
}

/** Predictions the model made BEFORE seeing the move, so the comparison with the engine is out-of-sample. */
export function predictAll(space: CandidateSpace, before: GameState): Record<Action, EngineOutcome | null> {
  const out = {} as Record<Action, EngineOutcome | null>;
  for (const a of ACTIONS) out[a] = modelPrediction(space, before, a);
  return out;
}

/** Build the report from outcomes the REAL ENGINE returned for every action from the same state. */
export function buildReport(step: number, reason: string, before: GameState, taken: Action, engine: Record<Action, EngineOutcome>, predictions: Record<Action, EngineOutcome | null>): CounterfactualReport {
  const rows: CounterfactualRow[] = ACTIONS.map((a) => {
    const e = engine[a];
    const predicted = predictions[a];
    return {
      action: a,
      taken: a === taken,
      engine: e,
      label: labelOutcome(before, e),
      predicted,
      predictedLabel: predicted ? labelOutcome(before, predicted) : null,
      match: predicted ? k(predicted) === k(e) : null,
    };
  });
  return { step, reason, rows };
}

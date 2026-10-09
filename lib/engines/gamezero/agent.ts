import { chooseExperiment, planPlayMove } from "./planner";
import { Learner, type Rejection } from "./learner";
import type { Action, Env, GameState, Observation, PublicWorld } from "./types";

export type Phase = "observe" | "hypothesize" | "test" | "learn" | "play";

export interface AgentEvent {
  phase: Phase;
  message: string;
  action?: Action;
  observation?: Observation;
  rejections?: Rejection[];
  aliveHypotheses: number;
}

export interface TestResult {
  state: GameState;
  steps: number;
}

/** TEST phase: run experiments in the real environment until dynamics are identified and colors understood. */
export async function runTests(
  learner: Learner,
  env: Env,
  start: GameState,
  opts: { budget?: number; seed?: string; onEvent?: (e: AgentEvent) => void | Promise<void> } = {},
): Promise<TestResult> {
  const budget = opts.budget ?? 40;
  let state = start;
  let steps = 0;
  while (steps < budget) {
    const dynLeft = learner.aliveDynamics().length;
    const best = learner.best();
    if (!best) break;
    const colorsInGrid = new Set(learner.world.colors.flat());
    const unknownColors = best.model === "color" ? [...colorsInGrid].filter((c) => best.table[c] === undefined).length : 0;
    if (dynLeft === 1 && unknownColors === 0) break;
    const exp = chooseExperiment(learner, state);
    if (!exp) break;
    const res = await env.step(state, exp.action);
    const obs: Observation = { before: state, action: exp.action, after: res.state, event: res.event };
    const rejections = learner.observe(obs);
    state = res.state;
    steps++;
    await opts.onEvent?.({ phase: "test", message: `Experiment: ${exp.action}, ${exp.why}`, action: exp.action, observation: obs, rejections, aliveHypotheses: learner.alive().length });
  }
  return { state, steps };
}

export interface PlayResult {
  solved: boolean;
  steps: number;
  state: GameState;
}

/** PLAY phase: act from the learned model; if reality contradicts it, the hypothesis is rejected and we replan. */
export async function runPlay(
  learner: Learner,
  env: Env,
  start: GameState,
  opts: { budget?: number; onEvent?: (e: AgentEvent) => void | Promise<void> } = {},
): Promise<PlayResult> {
  const budget = opts.budget ?? 120;
  let state = start;
  const startWins = start.wins;
  let steps = 0;
  while (steps < budget) {
    const move = planPlayMove(learner, state);
    if (!move) break;
    const res = await env.step(state, move.action);
    const obs: Observation = { before: state, action: move.action, after: res.state, event: res.event };
    const rejections = learner.observe(obs);
    state = res.state;
    steps++;
    await opts.onEvent?.({ phase: "play", message: `${move.intent}: ${move.action}`, action: move.action, observation: obs, rejections, aliveHypotheses: learner.alive().length });
    if (state.wins > startWins) return { solved: true, steps, state };
  }
  return { solved: false, steps, state };
}

export function newLearner(world: PublicWorld) {
  return new Learner(world);
}

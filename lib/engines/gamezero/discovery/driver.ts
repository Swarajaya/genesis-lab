import { planPlayMove } from "../planner";
import { initialState } from "../world";
import { ACTIONS, type Action, type Env, type GameEvent, type GameState, type Observation } from "../types";
import type { ExperimentPlan } from "./activeLearning";
import type { Intervention } from "./causal";
import { buildReport, isImportant, predictAll, type EngineOutcome } from "./counterfactual";
import type { Atom, ObsSource } from "./ledger";
import type { DiscoverySession } from "./session";

/** The environment as the agent sees it. `whatIf` evaluates every action from a state in the REAL engine (no state change). */
export interface DiscoveryEnv extends Env {
  whatIf(state: GameState): Promise<Record<Action, EngineOutcome>>;
}

export type Phase = "identify" | "verify" | "complete" | "stalled" | "budget";

export interface Hooks {
  onPhase?(p: Phase): void | Promise<void>;
  /** Called BEFORE an experiment is executed, so the UI can show the experiment card. */
  onPlan?(p: { kind: "experiment"; plan: ExperimentPlan } | { kind: "intervention"; plan: Intervention }): void | Promise<void>;
  /** Called after the result has been folded into the session. */
  onResult?(r: { obs: Observation; source: ObsSource; state: GameState; collapsed: Atom[]; confirmed: Atom[]; knowledgeBefore: number; knowledgeAfter: number }): void | Promise<void>;
  /** Throw from here to cancel. */
  checkpoint?(): void;
}

export interface RunOptions {
  budget?: number;
  verifyBudget?: number;
  hooks?: Hooks;
}

export interface RunResult {
  state: GameState;
  phase: Phase;
}

async function act(session: DiscoverySession, env: DiscoveryEnv, state: GameState, action: Action, source: ObsSource, hooks: Hooks): Promise<GameState> {
  const predictions = predictAll(session.space, state);
  const res = await env.step(state, action);
  const obs: Observation = { before: state, action, after: res.state, event: res.event };
  const knowledgeBefore = session.space.knowledge();
  const { collapsed, confirmed } = session.observe(obs, source);
  const reason = isImportant(obs, collapsed.length);
  if (reason && source !== "play") {
    try {
      const engine = await env.whatIf(state);
      session.addCounterfactual(buildReport(session.log.length, reason, state, action, engine, predictions));
    } catch {
      /* counterfactual evaluation is best-effort; discovery continues */
    }
  }
  await hooks.onResult?.({ obs, source, state: res.state, collapsed, confirmed, knowledgeBefore, knowledgeAfter: session.space.knowledge() });
  return res.state;
}

/** Discovery loop: identify the world with maximum-information experiments, then verify each rule with interventions. */
export async function runDiscovery(session: DiscoverySession, env: DiscoveryEnv, start: GameState, opts: RunOptions = {}): Promise<RunResult> {
  const hooks = opts.hooks ?? {};
  const budget = opts.budget ?? 70;
  const verifyBudget = opts.verifyBudget ?? 40;
  let state = start;
  let n = 0;
  await hooks.onPhase?.("identify");
  while (!session.space.identified() && n < budget) {
    hooks.checkpoint?.();
    const plan = session.planExperiment(state);
    if (!plan) {
      if (session.declareExhausted()) break;
      return { state, phase: "stalled" };
    }
    await hooks.onPlan?.({ kind: "experiment", plan });
    state = await act(session, env, state, plan.action, "experiment", hooks);
    n++;
  }
  if (!session.space.identified()) return { state, phase: n >= budget ? "budget" : "stalled" };
  await hooks.onPhase?.("verify");
  let v = 0;
  while (!session.analyze().verified && v < verifyBudget) {
    hooks.checkpoint?.();
    const iv = session.planVerification(state);
    if (!iv) break;
    await hooks.onPlan?.({ kind: "intervention", plan: iv });
    const before = session.atoms.find((a) => a.id === iv.atomId);
    const was = (before?.interventions ?? 0) + (before?.evidence ?? 0);
    const wasPos = `${state.pos.x},${state.pos.y}`;
    state = await act(session, env, state, iv.action, "verify", hooks);
    const after = session.atoms.find((a) => a.id === iv.atomId);
    // an "approach" step only walks toward the test; a "do" step that adds no evidence means this atom cannot be tested further
    if (iv.mode === "do" && (after?.interventions ?? 0) + (after?.evidence ?? 0) <= was) session.unverifiable.add(iv.atomId);
    void wasPos;
    v++;
  }
  const done = session.analyze().verified;
  await hooks.onPhase?.(done ? "complete" : "stalled");
  return { state, phase: done ? "complete" : "stalled" };
}

export interface PlayOutcome {
  solved: boolean;
  steps: number;
  state: GameState;
}

/** Autonomous play from the learned model only (the existing planner reads the Learner, which holds observations only). */
export async function playFromModel(session: DiscoverySession, env: DiscoveryEnv, hooks: Hooks = {}, budget = 120): Promise<PlayOutcome> {
  let state = initialState(session.pub);
  const startWins = state.wins;
  let steps = 0;
  while (steps < budget) {
    hooks.checkpoint?.();
    const move = planPlayMove(session.learner, state);
    if (!move) break;
    state = await act(session, env, state, move.action, "play", hooks);
    steps++;
    if (state.wins > startWins) return { solved: true, steps, state };
  }
  return { solved: false, steps, state };
}

export const eventOf = (e: GameEvent) => e;
export { ACTIONS };

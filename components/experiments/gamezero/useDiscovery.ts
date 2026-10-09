"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { postJson, toUiError } from "@/lib/client";
import type { UiError } from "@/components/ui/ErrorState";
import type { ActionScore } from "@/lib/engines/gamezero/discovery/activeLearning";
import { playFromModel, runDiscovery, type DiscoveryEnv, type Phase } from "@/lib/engines/gamezero/discovery/driver";
import type { EngineOutcome } from "@/lib/engines/gamezero/discovery/counterfactual";
import type { Atom } from "@/lib/engines/gamezero/discovery/ledger";
import { categoryCosts, transferPlan, type GameRecord, type MetaLibrary } from "@/lib/engines/gamezero/discovery/meta";
import { DiscoverySession, type Analysis } from "@/lib/engines/gamezero/discovery/session";
import { dynamicsId } from "@/lib/engines/gamezero/dynamics";
import type { Action, GameEvent, GameState, Observation, Pos, PublicWorld } from "@/lib/engines/gamezero/types";
import { initialState } from "@/lib/engines/gamezero/world";
import { loadMeta, saveMeta } from "./metaStore";

export type Mode = "lab" | "judge";
export type UiPhase = "idle" | "perceive" | "identify" | "verify" | "model" | "play" | "done" | "stalled";
/** Hero status lights, in pipeline order. */
export const STAGES = ["PERCEPTION", "HYPOTHESIS", "QUANTUM SEARCH", "EXPERIMENT", "CAUSALITY", "LEARNING", "PLAY"] as const;

export interface PlanView {
  kind: "experiment" | "intervention";
  question: string;
  actionText: string;
  action: Action;
  gain: number | null;
  scores: ActionScore[] | null;
  note: string;
  rival?: string;
}

export interface LastUpdate {
  label: string;
  collapsed: Atom[];
  confirmed: Atom[];
  knowledgeBefore: number;
  knowledgeAfter: number;
  source: string;
}

export interface Flash {
  n: number;
  pos: Pos;
  event: Exclude<GameEvent, "none">;
}

interface NewWorld {
  seed: string;
  world: PublicWorld;
  state: GameState;
  transfer: boolean;
}

export interface TransferInfo {
  active: boolean;
  fromSeed: string | null;
  fromExperiments: number | null;
  carriedMass: number | null;
  carriedDyn: string | null;
  validated: boolean | null;
  gameBExperiments: number | null;
  note: string | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const pct = (x: number) => Math.round(x * 100);

export function useDiscovery(mode: Mode, reducedMotion: boolean) {
  const [seed, setSeed] = useState<string | null>(null);
  const [world, setWorld] = useState<PublicWorld | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [last, setLast] = useState<LastUpdate | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [trail, setTrail] = useState<Pos[]>([]);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [playResult, setPlayResult] = useState<{ solved: boolean; steps: number } | null>(null);
  const [narration, setNarration] = useState<{ text: string; source: "ai" | "deterministic" } | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [transfer, setTransfer] = useState<TransferInfo>({ active: false, fromSeed: null, fromExperiments: null, carriedMass: null, carriedDyn: null, validated: null, gameBExperiments: null, note: null });
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [complete, setComplete] = useState(false);
  const [autoStart, setAutoStart] = useState(false);

  const session = useRef<DiscoverySession | null>(null);
  const meta = useRef<MetaLibrary | null>(null);
  const gen = useRef(0);
  const alive = useRef(true);
  const flashN = useRef(0);
  const gameA = useRef<{ seed: string; experiments: number } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      gen.current++;
    };
  }, []);

  const bump = useCallback(() => setTick((t) => t + 1), []);
  const analysis: Analysis | null = useMemo(() => {
    void tick;
    return session.current ? session.current.analyze() : null;
  }, [tick]);

  const pace = useMemo(() => {
    if (reducedMotion) return { plan: 40, result: 40, phase: 40 };
    return mode === "judge" ? { plan: 1500, result: 1000, phase: 2200 } : { plan: 520, result: 420, phase: 900 };
  }, [mode, reducedMotion]);

  const env = useMemo<DiscoveryEnv | null>(() => {
    if (!seed) return null;
    return {
      async step(s: GameState, a: Action) {
        return postJson<{ state: GameState; event: GameEvent }>("/api/gamezero", { action: "step", seed, state: s, move: a });
      },
      async whatIf(s: GameState) {
        const r = await postJson<{ outcomes: Record<Action, EngineOutcome> }>("/api/gamezero", { action: "counterfactual", seed, state: s });
        return r.outcomes;
      },
    };
  }, [seed]);

  const newWorld = useCallback(
    async (opts?: { transferFrom?: string }) => {
      const g = ++gen.current;
      setError(null);
      setBusy(true);
      try {
        const res = await postJson<NewWorld>("/api/gamezero", opts?.transferFrom ? { action: "new", transferFrom: opts.transferFrom } : { action: "new" });
        if (g !== gen.current || !alive.current) return;
        if (!meta.current) meta.current = loadMeta();
        let prior: number[] | undefined;
        let note: string | undefined;
        const info: TransferInfo = { active: false, fromSeed: null, fromExperiments: null, carriedMass: null, carriedDyn: null, validated: null, gameBExperiments: null, note: null };
        if (res.transfer) {
          const tp = transferPlan(meta.current);
          if (tp) {
            prior = tp.prior;
            note = `NEW WORLD DETECTED. Prior knowledge available: movement mechanics from the previous world (${tp.from.dynId}) carried as a hypothesis with prior mass ${pct(tp.carriedMass)}%. Transfer learning active; it will be tested, not assumed.`;
            Object.assign(info, { active: true, fromSeed: tp.from.seed, fromExperiments: tp.from.experiments, carriedMass: tp.carriedMass, carriedDyn: tp.from.dynId, note });
          }
        }
        session.current = new DiscoverySession(res.world, res.seed, { prior, priorNote: note });
        setTransfer(info);
        setSeed(res.seed);
        setWorld(res.world);
        setState(res.state);
        setTrail([res.world.start]);
        setVisited(new Set([`${res.world.start.x},${res.world.start.y}`]));
        setPhase("idle");
        setStage(0);
        setPlan(null);
        setLast(null);
        setPlayResult(null);
        setNarration(null);
        setSaved(null);
        setComplete(false);
        setReplayIndex(null);
        if (res.transfer) setAutoStart(true);
        bump();
      } catch (e) {
        if (g === gen.current) setError(toUiError(e));
      } finally {
        if (g === gen.current) setBusy(false);
      }
    },
    [bump],
  );

  useEffect(() => {
    void newWorld();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyObs = useCallback((obs: Observation) => {
    if (obs.event !== "none") {
      flashN.current++;
      setFlash({ n: flashN.current, pos: obs.after.pos, event: obs.event });
    }
    setState(obs.after);
    setTrail((t) => [...t, obs.after.pos].slice(-60));
    setVisited((v) => new Set(v).add(`${obs.after.pos.x},${obs.after.pos.y}`));
  }, []);

  /** Optional user demonstration (observational data only; never counts as an experiment or an intervention). */
  const demonstrate = useCallback(
    async (a: Action) => {
      const s = session.current;
      if (busy || !env || !state || !s) return;
      const g = gen.current;
      setBusy(true);
      setError(null);
      try {
        setStage(0);
        const res = await env.step(state, a);
        if (g !== gen.current || !alive.current) return;
        const obs: Observation = { before: state, action: a, after: res.state, event: res.event };
        s.observe(obs, "demo");
        applyObs(obs);
        setStage(1);
        bump();
      } catch (e) {
        if (g === gen.current) setError(toUiError(e));
      } finally {
        if (g === gen.current) setBusy(false);
      }
    },
    [busy, env, state, applyObs, bump],
  );

  const persist = useCallback(
    async (s: DiscoverySession, a: Analysis, g: number, solvedIn: number | null) => {
      const model = {
        knowledge: a.knowledge,
        experiments: a.metrics.experiments,
        demonstrations: a.metrics.demonstrations,
        counterfactuals: a.metrics.counterfactuals,
        modelConfidence: a.metrics.modelConfidence,
        rules: a.modelAtoms.slice(0, 40).map((x) => ({ id: x.id, statement: clip(x.statement, 160), confidence: x.confidence, status: x.status })),
        transferFrom: transfer.active ? transfer.fromExperiments : null,
      };
      try {
        const res = await postJson<{ saved: boolean }>("/api/gamezero", {
          action: "save",
          seed: s.seed,
          summary: {
            status: "learned",
            surviving: a.atoms.filter((x) => x.status !== "REJECTED" && x.confidence >= 0.5).slice(0, 60).map((x) => clip(`${x.id} ${x.statement}`, 120)),
            rejected: a.atoms.filter((x) => x.status === "REJECTED").slice(0, 60).map((x) => ({ id: x.id, reason: clip(`${x.statement} (contradicted at step ${x.diedAt})`, 300), step: x.diedAt })),
          },
          observations: s.log.slice(0, 300).map((l) => l.obs),
          model,
        });
        if (g === gen.current && alive.current) setSaved(res.saved === true);
      } catch {
        if (g === gen.current && alive.current) setSaved(false);
      }
      void solvedIn;
    },
    [transfer],
  );

  const narrate = useCallback(async (s: DiscoverySession, a: Analysis, solvedIn: number | null, g: number) => {
    const facts = s.modelFacts();
    try {
      const res = await postJson<{ narration: string; source: "ai" | "deterministic" }>("/api/gamezero", {
        action: "narrate",
        movement: clip(facts.movement, 300),
        terrain: facts.terrain.slice(0, 60).map((t) => ({ label: clip(t.label, 40), terrain: t.terrain })),
        rejectedCount: Math.min(a.atoms.filter((x) => x.status === "REJECTED").length, 100),
        demonstrations: Math.min(a.metrics.demonstrations, 500),
        experiments: Math.min(a.metrics.experiments, 500),
        solvedInSteps: solvedIn,
        knowledge: a.knowledge,
        confirmedRules: a.modelAtoms.filter((x) => x.status === "CONFIRMED").slice(0, 12).map((x) => clip(x.statement, 160)),
        counterfactuals: Math.min(a.metrics.counterfactuals, 500),
        ...(transferCompare(transfer, a) ?? {}),
      });
      if (g === gen.current && alive.current) setNarration({ text: res.narration, source: res.source });
    } catch {
      if (g === gen.current && alive.current) setNarration(null);
    }
  }, [transfer]);

  /** The whole show: observe, hypothesize, search, experiment, verify, compress, play. */
  const discover = useCallback(async () => {
    const s = session.current;
    if (busy || !env || !world || !s || !state) return;
    const g = gen.current;
    const cancelled = () => g !== gen.current || !alive.current;
    setBusy(true);
    setError(null);
    setComplete(false);
    setPlayResult(null);
    try {
      setPhase("perceive");
      setStage(0);
      s.emit("system", "Perception online: reading board colours, boundaries and the player position.");
      bump();
      await sleep(pace.phase);
      setStage(1);
      s.emit("hypothesis", `Hypothesis space active: ${s.atoms.length} hypotheses, ${s.space.totalWorlds().toLocaleString("en-US")} candidate worlds.`);
      bump();
      await sleep(pace.phase * 0.6);
      const result = await runDiscovery(s, env, state, {
        hooks: {
          checkpoint() {
            if (cancelled()) throw new Error("cancelled");
          },
          async onPhase(p: Phase) {
            if (p === "identify") setPhase("identify");
            if (p === "verify") {
              setPhase("verify");
              setStage(4);
            }
            bump();
          },
          async onPlan(p) {
            if (p.kind === "experiment") {
              setStage(3);
              setPlan({ kind: "experiment", question: p.plan.question, actionText: p.plan.actionText, action: p.plan.action, gain: p.plan.gain, scores: p.plan.scores, note: p.plan.mode === "walk" ? "walking toward the most informative cell" : "highest information gain" });
            } else {
              setStage(4);
              setPlan({ kind: "intervention", question: p.plan.question, actionText: p.plan.mode === "do" ? `Intervene: press ${p.plan.action}.` : `Move ${p.plan.action} to reach the test position.`, action: p.plan.action, gain: null, scores: null, note: `causal test against the rival "${p.plan.rival}"`, rival: p.plan.rival });
            }
            bump();
            await sleep(pace.plan);
          },
          async onResult(r) {
            applyObs(r.obs);
            const verb = r.source === "verify" ? "Intervention" : "Experiment";
            setLast({ label: `${verb}: ${r.obs.action.toUpperCase()} → ${r.obs.event === "none" ? (r.obs.after.pos.x === r.obs.before.pos.x && r.obs.after.pos.y === r.obs.before.pos.y ? "BLOCKED" : "MOVED") : r.obs.event.toUpperCase()}`, collapsed: r.collapsed, confirmed: r.confirmed, knowledgeBefore: r.knowledgeBefore, knowledgeAfter: r.knowledgeAfter, source: r.source });
            setStage(2);
            bump();
            await sleep(pace.result);
            setStage(1);
          },
        },
      });
      if (cancelled()) return;
      const a1 = s.analyze();
      if (result.phase !== "complete") {
        setPhase("stalled");
        s.emit("system", `Discovery ended early (${result.phase}). Knowledge ${pct(a1.knowledge)}%, ${a1.metrics.rulesConfirmed}/${a1.metrics.rulesTotal} rules confirmed.`);
        bump();
        return;
      }
      setPhase("model");
      setStage(5);
      setPlan(null);
      s.emit("model", `Rule compression: ${a1.compression.rawObservations} observations → ${a1.compression.patterns} patterns → ${a1.compression.coreRules} core rules. World model complete.`);
      bump();
      await sleep(pace.phase);
      // Autonomous play using only the learned model.
      setPhase("play");
      setStage(6);
      const start = initialState(world);
      setState(start);
      setTrail([start.pos]);
      setVisited(new Set([`${start.pos.x},${start.pos.y}`]));
      s.emit("play", "Autonomous play begins. The agent acts from the learned world model only.");
      bump();
      await sleep(pace.phase * 0.5);
      const play = await playFromModel(s, env, {
        checkpoint() {
          if (cancelled()) throw new Error("cancelled");
        },
        async onResult(r) {
          applyObs(r.obs);
          bump();
          await sleep(reducedMotion ? 30 : mode === "judge" ? 420 : 260);
        },
      });
      if (cancelled()) return;
      setPlayResult({ solved: play.solved, steps: play.steps });
      s.emit("play", play.solved ? `Goal reached in ${play.steps} moves using only the learned model.` : `Stopped after ${play.steps} moves without reaching the goal.`);
      const a2 = s.analyze();
      // Record this game in the strategy library (real counts), used to seed a transfer world.
      if (!meta.current) meta.current = loadMeta();
      const lead = s.space.leading();
      if (lead) {
        const rec: GameRecord = {
          seed: s.seed,
          completedAt: new Date().toISOString(),
          experiments: a2.metrics.experiments,
          observations: s.log.length,
          dyn: lead.dyn,
          dynId: dynamicsId(lead.dyn),
          categoryCost: categoryCosts(s.pub, s.log, a2.atoms, s.prior),
          transferred: transfer.active,
          priorMass: transfer.carriedMass ?? 0,
        };
        meta.current = { version: 1, games: [...meta.current.games, rec] };
        saveMeta(meta.current);
        if (transfer.active) {
          setTransfer((t) => ({ ...t, validated: t.carriedDyn === rec.dynId, gameBExperiments: rec.experiments }));
        } else {
          gameA.current = { seed: s.seed, experiments: rec.experiments };
        }
      }
      setPhase("done");
      setComplete(true);
      bump();
      void persist(s, a2, g, play.solved ? play.steps : null);
      void narrate(s, a2, play.solved ? play.steps : null, g);
    } catch (e) {
      if (!(e instanceof Error && e.message === "cancelled") && g === gen.current) setError(toUiError(e));
    } finally {
      if (g === gen.current) setBusy(false);
    }
  }, [busy, env, world, state, pace, mode, reducedMotion, applyObs, bump, persist, narrate, transfer]);

  useEffect(() => {
    if (autoStart && !busy && session.current && env && world && state) {
      setAutoStart(false);
      void discover();
    }
  }, [autoStart, busy, env, world, state, discover]);

  const startTransfer = useCallback(async () => {
    if (!seed || transfer.active) {
      // from a transfer world we branch from the original base seed
    }
    const base = gameA.current?.seed ?? seed;
    if (!base) return;
    await newWorld({ transferFrom: base.replace(/_tf$/, "") });
  }, [seed, transfer.active, newWorld]);

  const metaLib = meta.current;

  return {
    seed, world, state, phase, stage, busy, error, plan, last, flash, trail, visited, playResult, narration, saved, transfer, complete,
    replayIndex, setReplayIndex, analysis, session: session.current, metaLib, gameAExperiments: gameA.current?.experiments ?? null,
    newWorld, demonstrate, discover, startTransfer,
  };
}

function transferCompare(t: TransferInfo, a: Analysis): { transfer: { baseline: number; transferred: number } } | null {
  if (!t.active || t.fromExperiments === null) return null;
  return { transfer: { baseline: Math.min(500, t.fromExperiments), transferred: Math.min(500, a.metrics.experiments) } };
}

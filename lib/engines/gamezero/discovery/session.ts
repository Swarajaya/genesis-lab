import { describeDynamics } from "../dynamics";
import { Learner } from "../learner";
import type { Action, GameState, Observation, Pos, PublicWorld, Terrain } from "../types";
import { designExperiment, type ExperimentPlan } from "./activeLearning";
import { planIntervention, type Intervention } from "./causal";
import { labelOutcome, type CounterfactualReport } from "./counterfactual";
import { evolve, initPopulation, type EvolutionState } from "./evolution";
import { computeLedger, modelAtoms, type Atom, type AtomStatus, type LoggedObs, type ObsSource } from "./ledger";
import { compression, knowledgeGraph, perception, ruleDna, type Compression, type DnaSegment, type GEdge, type GNode, type Perception } from "./model";
import { runQihs, type QihsResult, type QihsSummary } from "./qihs";
import { CandidateSpace, DYNAMICS, TERRAINS } from "./space";

export type EventKind = "world" | "observation" | "hypothesis" | "quantum" | "information" | "experiment" | "reject" | "confirm" | "causal" | "counterfactual" | "knowledge" | "model" | "play" | "transfer" | "system";

export interface DiscoveryEvent {
  id: number;
  /** ms since the session began */
  t: number;
  /** wall-clock HH:MM:SS */
  wall: string;
  kind: EventKind;
  text: string;
  step?: number;
}

export interface Frame {
  step: number;
  t: number;
  pos: Pos;
  knowledge: number;
  worldsLeft: number;
  aliveAtoms: number;
  eventCount: number;
}

export interface DynNode {
  index: number;
  label: string;
  mass: number;
  prior: number;
  alive: boolean;
  diedAt: number;
}

export interface Analysis {
  version: number;
  knowledge: number;
  entropyBits: number;
  priorEntropyBits: number;
  worldsLeft: number;
  worldsInitial: number;
  atoms: Atom[];
  modelAtoms: Atom[];
  qihs: QihsSummary;
  qihsHistory: { step: number; summary: QihsSummary }[];
  leadHistory: number[];
  dynNodes: DynNode[];
  evo: EvolutionState;
  graph: { nodes: GNode[]; edges: GEdge[] };
  dna: DnaSegment[];
  compression: Compression;
  perception: Perception;
  metrics: {
    knowledge: number;
    hypothesesAlive: number;
    hypothesesTotal: number;
    hypothesesTested: number;
    experiments: number;
    demonstrations: number;
    contradictions: number;
    rulesConfirmed: number;
    rulesTotal: number;
    modelConfidence: number;
    counterfactuals: number;
    counterfactualMatches: number;
    counterfactualChecked: number;
  };
  identified: boolean;
  verified: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const wallClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const DIM_LABEL = (d: (typeof DYNAMICS)[number]) => `${d.k}-step · ${d.mapping} · ${d.edge === "wrap" ? "wrap" : "wall"}`;

export interface SessionOptions {
  prior?: number[];
  priorNote?: string;
  now?: () => number;
}

/**
 * ONE coherent discovery system: every visualisation and metric is derived from this object.
 *   observations -> candidate-world constraints -> QIHS posterior -> atomic hypothesis ledger
 *   -> active experiment choice -> causal verification -> counterfactuals -> knowledge graph -> compression -> world model
 * The existing Learner stays in the loop and remains the authority for autonomous play.
 */
export class DiscoverySession {
  readonly learner: Learner;
  readonly space: CandidateSpace;
  readonly log: LoggedObs[] = [];
  readonly events: DiscoveryEvent[] = [];
  readonly frames: Frame[] = [];
  readonly counterfactuals: CounterfactualReport[] = [];
  readonly qihsHistory: { step: number; summary: QihsSummary }[] = [];
  /** index of the most probable movement rule after each observation: the optimizer's search path */
  readonly leadHistory: number[] = [];
  readonly prior: number[] | undefined;
  evo: EvolutionState;
  qihs: QihsResult;
  atoms: Atom[] = [];
  version = 0;
  private eventId = 0;
  private startMs: number;
  private now: () => number;
  private prevStatus = new Map<string, AtomStatus>();
  private milestones = new Set<number>();
  private cache: Analysis | null = null;

  constructor(
    readonly pub: PublicWorld,
    readonly seed: string,
    opts: SessionOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.startMs = this.now();
    this.prior = opts.prior;
    this.learner = new Learner(pub);
    this.space = new CandidateSpace(pub, opts.prior);
    this.evo = initPopulation(this.space, seed);
    this.qihs = runQihs(this.space);
    this.atoms = computeLedger(pub, [], this.qihs.marginals, opts.prior);
    for (const a of this.atoms) this.prevStatus.set(a.id, a.status);
    this.emit("world", "World unknown. No rules provided to the agent.");
    this.emit("hypothesis", `Hypothesis space created: ${this.atoms.length} atomic hypotheses over ${this.space.initialWorlds().toLocaleString("en-US")} candidate worlds.`);
    if (opts.priorNote) this.emit("transfer", opts.priorNote);
  }

  emit(kind: EventKind, text: string, step?: number) {
    const t = this.now() - this.startMs;
    this.events.push({ id: ++this.eventId, t, wall: wallClock(new Date(this.startMs + t)), kind, text, step });
    this.version++;
    this.cache = null;
  }

  get experiments() {
    return this.log.filter((l) => l.source === "experiment" || l.source === "verify").length;
  }
  get demonstrations() {
    return this.log.filter((l) => l.source === "demo").length;
  }

  /** Fold an observation from the real environment into every layer. */
  observe(obs: Observation, source: ObsSource) {
    const step = this.log.length + 1;
    const beforeWorlds = this.space.totalWorlds();
    this.log.push({ obs, source, step });
    const rejections = this.learner.observe(obs);
    this.space.observe(obs);
    this.qihs = runQihs(this.space);
    this.qihsHistory.push({ step, summary: this.qihs.summary });
    this.leadHistory.push(this.space.leading()?.dynIndex ?? -1);
    const nextAtoms = computeLedger(this.pub, this.log, this.qihs.marginals, this.prior, this.space.irreducible);
    this.evo = evolve(this.evo, this.space, this.log.map((l) => l.obs), this.seed);

    const label = labelOutcome(obs.before, { pos: obs.after.pos, event: obs.event });
    const who = source === "demo" ? "Demonstration" : source === "play" ? "Play move" : source === "verify" ? "Verification" : "Experiment";
    this.emit("observation", `${who} #${step}: ${obs.action.toUpperCase()} → ${label} at (${obs.after.pos.x},${obs.after.pos.y})`, step);

    const collapsed: Atom[] = [];
    const confirmed: Atom[] = [];
    for (const a of nextAtoms) {
      const was = this.prevStatus.get(a.id);
      if (a.status === "REJECTED" && was !== "REJECTED") collapsed.push(a);
      if (a.status === "CONFIRMED" && was !== "CONFIRMED") confirmed.push(a);
      this.prevStatus.set(a.id, a.status);
    }
    this.atoms = nextAtoms;
    if (collapsed.length) {
      const names = collapsed.slice(0, 3).map((a) => a.id).join(", ");
      this.emit("reject", `${collapsed.length} hypothes${collapsed.length === 1 ? "is" : "es"} contradicted and rejected (${names}${collapsed.length > 3 ? ", …" : ""})`, step);
    }
    for (const a of confirmed) this.emit("confirm", `${a.id} CONFIRMED by ${a.interventions} interventions: ${a.statement}`, step);
    if (this.qihs.summary.rounds > 0 || beforeWorlds !== this.space.totalWorlds()) {
      const s = this.qihs.summary;
      this.emit("quantum", s.mode === "amplitude-amplification" ? `Quantum-inspired search: ${s.rounds} amplification rounds, ${beforeWorlds.toLocaleString("en-US")} → ${this.space.totalWorlds().toLocaleString("en-US")} candidate worlds` : `Search ran in classical fallback mode (${this.space.totalWorlds().toLocaleString("en-US")} worlds left)`, step);
    }
    const k = this.space.knowledge();
    for (const m of [0.25, 0.5, 0.75, 0.9, 1]) {
      if (k >= m - 1e-9 && !this.milestones.has(m)) {
        this.milestones.add(m);
        this.emit("knowledge", `Knowledge reached ${Math.round(m * 100)}%`, step);
      }
    }
    this.frames.push({ step, t: this.now() - this.startMs, pos: obs.after.pos, knowledge: k, worldsLeft: this.space.totalWorlds(), aliveAtoms: nextAtoms.filter((a) => a.status !== "REJECTED").length, eventCount: this.events.length });
    this.version++;
    this.cache = null;
    return { rejections, collapsed, confirmed };
  }

  planExperiment(state: GameState): ExperimentPlan | null {
    const plan = designExperiment(this.space, this.qihs.marginals, state, this.learner);
    if (!plan) return null;
    const scores = plan.scores.map((s) => `${s.action.toUpperCase()} ${s.gain.toFixed(2)}`).join(" · ");
    this.emit("information", `Information gain calculated (bits): ${scores}`);
    this.emit("experiment", `Next experiment: ${plan.question} → ${plan.action.toUpperCase()}`);
    return plan;
  }

  /** Atoms whose interventions failed to add evidence; skipped so verification can never loop. */
  readonly unverifiable = new Set<string>();

  /** No reachable experiment can discriminate the remaining worlds. Record what that means. */
  declareExhausted(): boolean {
    const open = this.space.declareExhausted();
    if (open === null) return false;
    this.atoms = computeLedger(this.pub, this.log, this.qihs.marginals, this.prior, this.space.irreducible);
    if (open.length) this.emit("model", `No reachable experiment can reveal ${open.join(", ")} terrain: under the discovered movement rules the player can never touch it. Treated as irrelevant to play.`);
    this.version++;
    this.cache = null;
    return true;
  }

  planVerification(state: GameState): Intervention | null {
    const iv = planIntervention(this.space, this.atoms, state, this.unverifiable);
    if (iv) this.emit("causal", `Intervention planned vs rival "${iv.rival}": ${iv.question}`);
    return iv;
  }

  addCounterfactual(r: CounterfactualReport) {
    this.counterfactuals.push(r);
    const wrong = r.rows.filter((x) => x.match === false).length;
    const ok = r.rows.filter((x) => x.match === true).length;
    this.emit("counterfactual", `Counterfactual analysis (${r.reason}): ${r.rows.map((x) => `${x.action.toUpperCase()}→${x.label}`).join(", ")}${ok + wrong ? ` · model matched ${ok}/${ok + wrong}` : ""}`, r.step);
  }

  modelFacts() {
    const l = this.space.leading();
    return {
      movement: l ? describeDynamics(l.dyn) : "",
      terrain: l
        ? this.space.colors.map((c, i) => ({ label: c, terrain: (l.roles[i] ?? "free") as Terrain, known: l.roles[i] !== null }))
        : [],
    };
  }

  analyze(): Analysis {
    if (this.cache && this.cache.version === this.version) return this.cache;
    const atoms = this.atoms;
    const mAtoms = modelAtoms(atoms);
    const post = this.qihs.marginals.dyn;
    const cfRows = this.counterfactuals.flatMap((c) => c.rows);
    const checked = cfRows.filter((r) => r.match !== null);
    const a: Analysis = {
      version: this.version,
      knowledge: this.space.knowledge(),
      entropyBits: this.space.entropyBits(),
      priorEntropyBits: this.space.priorEntropyBits(),
      worldsLeft: this.space.totalWorlds(),
      worldsInitial: this.space.initialWorlds(),
      atoms,
      modelAtoms: mAtoms,
      qihs: this.qihs.summary,
      qihsHistory: this.qihsHistory,
      leadHistory: this.leadHistory,
      dynNodes: DYNAMICS.map((d, i) => ({ index: i, label: DIM_LABEL(d), mass: post[i], prior: this.space.prior[i], alive: this.space.alive[i], diedAt: this.space.diedAt[i] })),
      evo: this.evo,
      graph: knowledgeGraph(this.space, atoms),
      dna: ruleDna(atoms),
      compression: compression(this.pub, this.log.filter((l) => l.source !== "play"), atoms),
      perception: perception(this.pub, this.log, atoms),
      metrics: {
        knowledge: this.space.knowledge(),
        hypothesesAlive: atoms.filter((x) => x.status !== "REJECTED").length,
        hypothesesTotal: atoms.length,
        hypothesesTested: atoms.filter((x) => x.evidence + x.contradictions > 0).length,
        experiments: this.experiments,
        demonstrations: this.demonstrations,
        contradictions: atoms.filter((x) => x.contradictions > 0).length,
        rulesConfirmed: mAtoms.filter((x) => x.status === "CONFIRMED").length,
        rulesTotal: mAtoms.length,
        modelConfidence: mAtoms.length ? mAtoms.reduce((s, x) => s + x.confidence, 0) / mAtoms.length : 0,
        counterfactuals: this.counterfactuals.length,
        counterfactualMatches: checked.filter((r) => r.match).length,
        counterfactualChecked: checked.length,
      },
      identified: this.space.identified(),
      verified: mAtoms.length > 0 && mAtoms.every((x) => x.status === "CONFIRMED"),
    };
    this.cache = a;
    return a;
  }
}

export type { Action };
export { TERRAINS };

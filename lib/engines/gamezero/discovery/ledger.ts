import { applyDynamics } from "../dynamics";
import { key, samePos, type Color, type Dynamics, type Observation, type PublicWorld, type Terrain } from "../types";
import { stepWorld } from "../world";
import { ALL_MASK, CandidateSpace, DYNAMICS, TERRAINS, allowedRoles, bitOf, popcount, rivalDynamics, testableCells, type Marginals } from "./space";

export type AtomStatus = "UNKNOWN" | "TESTING" | "SUPPORTED" | "CONTRADICTED" | "CONFIRMED" | "REJECTED";
export type Category = "MOVEMENT" | "BOUNDARY" | "TERRAIN" | "COLLISION" | "REWARD" | "GOAL";
export type ObsSource = "demo" | "experiment" | "verify" | "play";

export interface LoggedObs {
  obs: Observation;
  source: ObsSource;
  /** 1-based index among all observations */
  step: number;
}

export interface Atom {
  id: string;
  kind: "movement" | "terrain";
  dim: "step" | "edge" | "mapping" | "terrain";
  category: Category;
  statement: string;
  color?: Color;
  role?: Terrain;
  /** movement value: 1|2|3, "stop"|"wrap", or a mapping name */
  value?: string | number;
  confidence: number;
  evidence: number;
  contradictions: number;
  /** supporting observations that were agent-chosen interventions */
  interventions: number;
  distinctCells: number;
  /** distinct cells (by x,y) where an agent-chosen intervention supported this atom */
  cells: string[];
  status: AtomStatus;
  /** observation steps that support / contradict this atom */
  sources: number[];
  contradictedBy: number[];
  /** step at which the atom's probability mass reached zero (0 = never) */
  diedAt: number;
  /** true when the color can never be reached under the discovered movement rules */
  unreachable?: boolean;
}

const MAPPING_TEXT = {
  normal: "Controls act normally",
  inverted: "Controls are inverted (up goes down, left goes right)",
  swapped: "Axes are swapped (up goes left, right goes down)",
  mirrorH: "Left and right are mirrored",
} as const;

export const ROLE_TEXT: Record<Terrain, string> = {
  free: "is walkable",
  solid: "blocks movement",
  reward: "gives a reward",
  hazard: "is a hazard that resets the player",
  goal: "is the goal",
};

export const ROLE_CATEGORY: Record<Terrain, Category> = { free: "TERRAIN", solid: "COLLISION", hazard: "COLLISION", reward: "REWARD", goal: "GOAL" };

const dimValue = (d: Dynamics, dim: "step" | "edge" | "mapping") => (dim === "step" ? d.k : dim === "edge" ? d.edge : d.mapping);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Which dynamics could, on their own, explain this single observation (terrain left unconstrained)? */
export function singleObservationConsistent(pub: PublicWorld, obs: Observation): boolean[] {
  return DYNAMICS.map((d) => {
    const t = applyDynamics(d, obs.before.pos, obs.action, pub.size);
    if (t === null) return samePos(obs.after.pos, obs.before.pos) && obs.event === "none";
    return allowedRoles(pub, obs, t) !== 0;
  });
}

interface Catalogue {
  atoms: Atom[];
}

export function buildCatalogue(space: CandidateSpace): Catalogue {
  const atoms: Atom[] = [];
  let n = 0;
  const id = () => `H-${String(++n).padStart(3, "0")}`;
  const base = { confidence: 0, evidence: 0, contradictions: 0, interventions: 0, distinctCells: 0, cells: [] as string[], status: "UNKNOWN" as AtomStatus, sources: [] as number[], contradictedBy: [] as number[], diedAt: 0 };
  for (const k of [1, 2, 3])
    atoms.push({ ...base, sources: [], contradictedBy: [], cells: [], id: id(), kind: "movement", dim: "step", category: "MOVEMENT", value: k, statement: k === 1 ? "Each move shifts the player 1 cell" : `Each move shifts the player ${k} cells` });
  for (const m of ["normal", "inverted", "swapped", "mirrorH"] as const)
    atoms.push({ ...base, sources: [], contradictedBy: [], cells: [], id: id(), kind: "movement", dim: "mapping", category: "MOVEMENT", value: m, statement: MAPPING_TEXT[m] });
  for (const e of ["stop", "wrap"] as const)
    atoms.push({ ...base, sources: [], contradictedBy: [], cells: [], id: id(), kind: "movement", dim: "edge", category: "BOUNDARY", value: e, statement: e === "stop" ? "The board edge is a wall" : "The board wraps around its edges" });
  for (const c of space.colors)
    for (const t of TERRAINS)
      atoms.push({ ...base, sources: [], contradictedBy: [], cells: [], id: id(), kind: "terrain", dim: "terrain", category: ROLE_CATEGORY[t], color: c, role: t, statement: `${upper(c)} terrain ${ROLE_TEXT[t]}` });
  return { atoms };
}

export const CONFIRM_CONFIDENCE = 0.999;
const AGENT_SOURCES: ObsSource[] = ["experiment", "verify"];

/** Replay the log to compute evidence ledger entries. Pure and deterministic. */
export function computeLedger(pub: PublicWorld, log: LoggedObs[], marginals: Marginals, prior?: number[], irreducible: Color[] = []): Atom[] {
  const final = new CandidateSpace(pub, prior);
  for (const l of log) final.observe(l.obs);
  final.irreducible = irreducible;
  const { atoms } = buildCatalogue(final);
  const aliveIdx = final.aliveIndices();

  // Confidence: exact marginal mass of each atom under the (QIHS) posterior.
  for (const a of atoms) {
    let p = 0;
    if (a.kind === "movement") {
      DYNAMICS.forEach((d, i) => {
        if (dimValue(d, a.dim as "step" | "edge" | "mapping") === a.value) p += marginals.dyn[i];
      });
    } else {
      const ci = final.colorIndex(a.color as Color);
      const ri = TERRAINS.indexOf(a.role as Terrain);
      DYNAMICS.forEach((_, i) => (p += marginals.joint[i][ci][ri]));
    }
    a.confidence = Math.max(0, Math.min(1, p));
  }

  // Movement atoms: single-observation discrimination + step of death via replay.
  const idModel = final.identified() ? final.asWorld() : null;
  const movement = atoms.filter((a) => a.kind === "movement");
  const replay = new CandidateSpace(pub, prior);
  const everAliveVal = new Map<string, boolean>();
  const massOf = (a: Atom, sp: CandidateSpace) => DYNAMICS.some((d, i) => sp.alive[i] && dimValue(d, a.dim as "step" | "edge" | "mapping") === a.value);
  for (const l of log) {
    const cons = singleObservationConsistent(pub, l.obs);
    for (const a of movement) {
      const dim = a.dim as "step" | "edge" | "mapping";
      const vals = new Set(DYNAMICS.filter((_, i) => cons[i]).map((d) => dimValue(d, dim)));
      const total = new Set(DYNAMICS.map((d) => dimValue(d, dim))).size;
      // Ceteris paribus: once the world is identified, an observation also counts as evidence for the winning value
      // when swapping ONLY that rule (holding the rest of the model fixed) would have predicted a different outcome.
      let causal = false;
      if (idModel && dimValue(idModel.rules.dynamics, dim) === a.value) {
        const o = l.obs;
        const seenOut = (w: typeof idModel) => {
          const r = stepWorld(w, o.before, o.action);
          return `${r.state.pos.x},${r.state.pos.y}|${r.event}`;
        };
        const real = `${o.after.pos.x},${o.after.pos.y}|${o.event}`;
        causal = seenOut(idModel) === real && rivalDynamics(idModel.rules.dynamics, dim).some((rd) => seenOut({ ...idModel, rules: { ...idModel.rules, dynamics: rd } }) !== real);
      }
      if (vals.size >= total && !causal) continue; // not discriminating on this dimension
      if (causal || vals.has(a.value as never)) {
        a.evidence++;
        a.sources.push(l.step);
        if (AGENT_SOURCES.includes(l.source)) a.interventions++;
      } else {
        a.contradictions++;
        a.contradictedBy.push(l.step);
      }
    }
    replay.observe(l.obs);
    for (const a of movement) {
      const k = a.id;
      const alive = massOf(a, replay);
      if (!alive && !everAliveVal.get(k) && a.diedAt === 0) a.diedAt = l.step;
    }
  }

  // Terrain atoms: counted only when every surviving movement rule agrees on which cell the move landed on.
  const terrain = atoms.filter((a) => a.kind === "terrain");
  const seenCells = new Map<string, Set<string>>();
  const replay2 = new CandidateSpace(pub, prior);
  for (const l of log) {
    replay2.observe(l.obs);
    const o = l.obs;
    const targets = aliveIdx.map((i) => applyDynamics(DYNAMICS[i], o.before.pos, o.action, pub.size));
    if (targets.length === 0 || targets.every((t) => t === null)) continue;
    if (targets.some((t) => t === null)) continue;
    const ts = targets as NonNullable<(typeof targets)[number]>[];
    const colors = new Set(ts.map((t) => pub.colors[t.y][t.x]));
    if (colors.size !== 1) continue;
    const c = [...colors][0];
    const masks = new Set(ts.map((t) => allowedRoles(pub, o, t)));
    if (masks.size !== 1) continue;
    const m = [...masks][0];
    if (m === 0 || popcount(m) !== 1) continue;
    const sameCell = ts.every((t) => samePos(t, ts[0]));
    const cell = sameCell ? key(ts[0]) : `~${c}`;
    for (const a of terrain) {
      if (a.color !== c) continue;
      if ((m & bitOf(a.role as Terrain)) !== 0) {
        a.evidence++;
        a.sources.push(l.step);
        if (AGENT_SOURCES.includes(l.source)) {
          a.interventions++;
          const sid = a.id;
          const set = seenCells.get(sid) ?? new Set();
          set.add(cell);
          seenCells.set(sid, set);
        }
      } else {
        a.contradictions++;
        a.contradictedBy.push(l.step);
      }
    }
  }
  for (const a of terrain) {
    a.cells = [...(seenCells.get(a.id) ?? [])];
    a.distinctCells = a.cells.length;
  }

  // Death step for terrain atoms and for movement atoms whose death only appeared jointly.
  const space2 = new CandidateSpace(pub, prior);
  const dead = new Set<string>();
  const marg = (sp: CandidateSpace) => sp.marginals();
  for (const l of log) {
    space2.observe(l.obs);
    const mg = marg(space2);
    for (const a of atoms) {
      if (dead.has(a.id)) continue;
      let p = 0;
      if (a.kind === "movement") DYNAMICS.forEach((d, i) => { if (dimValue(d, a.dim as "step" | "edge" | "mapping") === a.value) p += mg.dyn[i]; });
      else {
        const ci = space2.colorIndex(a.color as Color);
        const ri = TERRAINS.indexOf(a.role as Terrain);
        DYNAMICS.forEach((_, i) => (p += mg.joint[i][ci][ri]));
      }
      if (p <= 1e-12) {
        dead.add(a.id);
        a.diedAt = l.step;
        if (a.contradictions === 0) {
          a.contradictions = 1;
          a.contradictedBy.push(l.step);
        }
      }
    }
  }

  const cellsOfColor = (c: Color) => pub.colors.flat().filter((x) => x === c).length;
  const testable = idModel ? testableCells(idModel) : null;
  for (const a of atoms) {
    if (a.kind === "terrain" && irreducible.includes(a.color as Color)) a.unreachable = true;
    const touched = a.evidence + a.contradictions > 0;
    const avail = a.kind === "terrain" ? Math.max(1, testable ? (testable.get(a.color as Color)?.size ?? 0) : cellsOfColor(a.color as Color)) : 0;
    const needCells = a.kind === "terrain" ? Math.min(2, avail) : 0;
    // a reward can be collected once per cell, so it can only be replicated as often as there are testable reward cells
    const needIv = a.kind === "terrain" && a.role === "reward" ? Math.min(2, avail) : 2;
    if (a.confidence <= 1e-12) a.status = "REJECTED";
    else if (a.contradictions > 0) a.status = "CONTRADICTED";
    else if (a.confidence >= CONFIRM_CONFIDENCE && a.interventions >= needIv && a.distinctCells >= needCells) a.status = "CONFIRMED";
    else if (a.confidence >= 0.9 && touched) a.status = "SUPPORTED";
    else if (touched || a.confidence > 0.9) a.status = a.confidence >= 0.9 ? "SUPPORTED" : "TESTING";
    else a.status = "UNKNOWN";
  }
  void ALL_MASK;
  return atoms;
}

/** Atoms that describe the final world model: the surviving value of every rule dimension. */
export function modelAtoms(atoms: Atom[]): Atom[] {
  const out: Atom[] = [];
  const groups = new Map<string, Atom[]>();
  for (const a of atoms) {
    if (a.unreachable) continue;
    const g = a.kind === "movement" ? a.dim : `terrain:${a.color}`;
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }
  for (const list of groups.values()) {
    const top = [...list].sort((x, y) => y.confidence - x.confidence)[0];
    out.push(top);
  }
  return out;
}

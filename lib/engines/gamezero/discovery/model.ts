import { key, type Color, type GameState, type PublicWorld, type Terrain } from "../types";
import { ROLE_CATEGORY, modelAtoms, type Atom, type AtomStatus, type Category, type LoggedObs } from "./ledger";
import type { CandidateSpace } from "./space";

/* ------------------------------------------------------------------ perception */

export interface Perception {
  objects: number;
  terrainTypes: number;
  observedStates: number;
  interactions: number;
  unknownVariables: number;
  collisions: number;
  rewards: number;
  penalties: number;
  goals: number;
  transitions: number;
  visitedCells: number;
}

/** Connected same-colour regions = distinct objects on the board (4-neighbourhood). */
export function countObjects(pub: PublicWorld): number {
  const seen = new Set<string>();
  let n = 0;
  for (let y = 0; y < pub.size; y++)
    for (let x = 0; x < pub.size; x++) {
      if (seen.has(`${x},${y}`)) continue;
      n++;
      const c = pub.colors[y][x];
      const stack = [{ x, y }];
      seen.add(`${x},${y}`);
      while (stack.length) {
        const p = stack.pop() as { x: number; y: number };
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = { x: p.x + dx, y: p.y + dy };
          if (q.x < 0 || q.y < 0 || q.x >= pub.size || q.y >= pub.size) continue;
          const k = key(q);
          if (seen.has(k) || pub.colors[q.y][q.x] !== c) continue;
          seen.add(k);
          stack.push(q);
        }
      }
    }
  return n;
}

const stateKey = (s: GameState) => `${s.pos.x},${s.pos.y}|${s.score}|${s.wins}|${s.collected.length}`;

export function perception(pub: PublicWorld, log: LoggedObs[], atoms: Atom[]): Perception {
  const states = new Set<string>();
  const cells = new Set<string>([key(pub.start)]);
  let collisions = 0, rewards = 0, penalties = 0, goals = 0;
  for (const { obs } of log) {
    states.add(stateKey(obs.before));
    states.add(stateKey(obs.after));
    cells.add(key(obs.after.pos));
    if (obs.event === "reward") rewards++;
    else if (obs.event === "hazard") penalties++;
    else if (obs.event === "goal") goals++;
    else if (obs.after.pos.x === obs.before.pos.x && obs.after.pos.y === obs.before.pos.y) collisions++;
  }
  const model = modelAtoms(atoms);
  const unknown = model.filter((a) => a.confidence < 0.999).length;
  if (log.length === 0) states.add(stateKey({ pos: pub.start, collected: [], score: 0, wins: 0, steps: 0 }));
  return {
    objects: countObjects(pub) + 1,
    terrainTypes: new Set(pub.colors.flat()).size,
    observedStates: states.size,
    interactions: collisions + rewards + penalties + goals,
    unknownVariables: log.length === 0 ? model.length : unknown,
    collisions,
    rewards,
    penalties,
    goals,
    transitions: log.length,
    visitedCells: cells.size,
  };
}

/* ------------------------------------------------------------------ knowledge graph */

export type GraphState = "unknown" | "testing" | "supported" | "confirmed";
export interface GNode {
  id: string;
  label: string;
  type: "player" | "mechanic" | "color" | "role";
  color?: Color;
  strength: number;
}
export interface GEdge {
  from: string;
  to: string;
  label: string;
  strength: number;
  state: GraphState;
}

const ROLE_NODE: Record<Terrain, { id: string; label: string; verb: string; onPlayer: string }> = {
  solid: { id: "role:collision", label: "COLLISION", verb: "is", onPlayer: "blocks" },
  hazard: { id: "role:hazard", label: "HAZARD", verb: "is", onPlayer: "resets" },
  reward: { id: "role:reward", label: "REWARD", verb: "gives", onPlayer: "rewards" },
  goal: { id: "role:goal", label: "GOAL", verb: "is", onPlayer: "wins" },
  free: { id: "role:safe", label: "SAFE", verb: "is", onPlayer: "allows" },
};

const stateOf = (a: Atom): GraphState => (a.status === "CONFIRMED" ? "confirmed" : a.status === "SUPPORTED" ? "supported" : a.status === "UNKNOWN" ? "unknown" : "testing");

export function knowledgeGraph(space: CandidateSpace, atoms: Atom[]): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [{ id: "player", label: "PLAYER", type: "player", strength: 1 }];
  const edges: GEdge[] = [];
  const top = (dim: string) => [...atoms.filter((a) => a.dim === dim)].sort((a, b) => b.confidence - a.confidence)[0];
  const step = top("step");
  const map = top("mapping");
  const edge = top("edge");
  const moveStrength = Math.min(step?.confidence ?? 0, map?.confidence ?? 0);
  nodes.push({ id: "movement", label: "MOVEMENT", type: "mechanic", strength: moveStrength });
  nodes.push({ id: "boundary", label: "BOUNDARY", type: "mechanic", strength: edge?.confidence ?? 0 });
  const worst = [step, map].filter(Boolean).sort((a, b) => a.confidence - b.confidence)[0];
  edges.push({ from: "player", to: "movement", label: "moves by", strength: moveStrength, state: worst ? stateOf(worst) : "unknown" });
  if (edge) edges.push({ from: "movement", to: "boundary", label: edge.value === "wrap" ? "wraps at" : "stops at", strength: edge.confidence, state: stateOf(edge) });
  const roleStrength = new Map<string, { s: number; st: GraphState }>();
  for (const c of space.colors) {
    const cand = atoms.filter((a) => a.kind === "terrain" && a.color === c).sort((a, b) => b.confidence - a.confidence);
    const best = cand[0];
    nodes.push({ id: `color:${c}`, label: `${c.toUpperCase()} TERRAIN`, type: "color", color: c, strength: best?.confidence ?? 0 });
    if (!best) continue;
    const known = best.confidence > 0.2 + 1e-9;
    const r = ROLE_NODE[best.role as Terrain];
    if (known) {
      edges.push({ from: `color:${c}`, to: r.id, label: r.verb === "is" ? "is" : "gives", strength: best.confidence, state: stateOf(best) });
      const prev = roleStrength.get(r.id);
      if (!prev || best.confidence > prev.s) roleStrength.set(r.id, { s: best.confidence, st: stateOf(best) });
    } else {
      edges.push({ from: `color:${c}`, to: "role:unknown", label: "?", strength: best.confidence, state: "unknown" });
    }
  }
  nodes.push({ id: "role:unknown", label: "UNKNOWN", type: "role", strength: 0 });
  for (const role of ["solid", "hazard", "reward", "goal", "free"] as Terrain[]) {
    const r = ROLE_NODE[role];
    const rs = roleStrength.get(r.id);
    nodes.push({ id: r.id, label: r.label, type: "role", strength: rs?.s ?? 0 });
    edges.push({ from: r.id, to: "player", label: r.onPlayer, strength: rs?.s ?? 0, state: rs ? rs.st : "unknown" });
  }
  return { nodes, edges };
}

/* ------------------------------------------------------------------ rule DNA + compression */

export interface DnaSegment {
  category: Category;
  label: string;
  confidence: number;
  status: AtomStatus;
  atomId: string;
  color?: Color;
}

export const DNA_CATEGORIES: Category[] = ["MOVEMENT", "TERRAIN", "COLLISION", "REWARD", "GOAL", "BOUNDARY"];

export function ruleDna(atoms: Atom[]): DnaSegment[] {
  const segs: DnaSegment[] = [];
  for (const a of modelAtoms(atoms)) {
    const category: Category = a.kind === "terrain" ? ROLE_CATEGORY[a.role as Terrain] : a.category;
    const label = a.kind === "terrain" ? `${a.color} ${a.role}` : a.dim === "step" ? `${a.value}-cell step` : a.dim === "mapping" ? `${a.value} controls` : a.value === "wrap" ? "wrapping edge" : "solid edge";
    segs.push({ category, label, confidence: a.confidence, status: a.status, atomId: a.id, color: a.color });
  }
  return segs.sort((x, y) => DNA_CATEGORIES.indexOf(x.category) - DNA_CATEGORIES.indexOf(y.category));
}

export interface Compression {
  rawObservations: number;
  patterns: number;
  coreRules: number;
  totalRules: number;
  complete: boolean;
  ratio: number;
}

/** Patterns = distinct (action, landing-colour-or-edge, outcome) regularities actually seen in the log. */
export function compression(pub: PublicWorld, log: LoggedObs[], atoms: Atom[]): Compression {
  const sigs = new Set<string>();
  for (const { obs } of log) {
    const moved = obs.after.pos.x !== obs.before.pos.x || obs.after.pos.y !== obs.before.pos.y;
    const dx = obs.after.pos.x - obs.before.pos.x;
    const dy = obs.after.pos.y - obs.before.pos.y;
    sigs.add(`${obs.action}|${obs.event}|${moved ? `${Math.sign(dx)},${Math.sign(dy)},${Math.max(Math.abs(dx), Math.abs(dy))}` : "stay"}`);
  }
  const model = modelAtoms(atoms);
  const core = model.filter((a) => a.confidence >= 0.999).length;
  const complete = model.length > 0 && model.every((a) => a.status === "CONFIRMED");
  void pub;
  return { rawObservations: log.length, patterns: sigs.size, coreRules: core, totalRules: model.length, complete, ratio: core > 0 ? log.length / core : 0 };
}

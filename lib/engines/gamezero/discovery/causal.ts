import { applyDynamics } from "../dynamics";
import { stepWorld, type World } from "../world";
import { ACTIONS, key, type Action, type Dynamics, type GameState, type Terrain } from "../types";
import type { Atom } from "./ledger";
import { buildWorld, type CandidateSpace } from "./space";

/**
 * CAUSAL VERIFICATION
 * Seeing a pattern is not enough. An atom is only CONFIRMED after the agent has deliberately INTERVENED, at least
 * twice, with an action whose outcome would have been different if the rule were false.
 * Here the agent imagines a rival world (the same model with exactly this one rule changed), finds a reachable
 * state where the two worlds predict different outcomes, goes there inside the real environment, and acts.
 */

export interface Intervention {
  atomId: string;
  action: Action;
  /** "do": the discriminating action itself. "approach": a move toward the place where it can be done. */
  mode: "do" | "approach";
  question: string;
  rival: string;
}

const altRole = (r: Terrain): Terrain[] => (["free", "solid", "reward", "hazard", "goal"] as Terrain[]).filter((x) => x !== r);

function variants(model: World, atom: Atom, space: CandidateSpace): { world: World; label: string }[] {
  const d = model.rules.dynamics;
  const mk = (nd: Dynamics) => ({ ...model, rules: { ...model.rules, dynamics: nd } });
  if (atom.kind === "movement") {
    if (atom.dim === "step") return ([1, 2, 3] as const).filter((k) => k !== d.k).map((k) => ({ world: mk({ ...d, k }), label: `steps of ${k}` }));
    if (atom.dim === "edge") return [{ world: mk({ ...d, edge: d.edge === "stop" ? "wrap" : "stop" }), label: d.edge === "stop" ? "a wrapping board" : "a walled board" }];
    return (["normal", "inverted", "swapped", "mirrorH"] as const).filter((m) => m !== d.mapping).map((m) => ({ world: mk({ ...d, mapping: m }), label: `${m} controls` }));
  }
  return altRole(atom.role as Terrain).map((r) => ({
    world: { ...model, rules: { ...model.rules, terrain: { ...model.rules.terrain, [atom.color as string]: r } } },
    label: `${atom.color} being ${r}`,
  }));
  void space;
}

const sig = (w: World, s: GameState, a: Action) => {
  const r = stepWorld(w, s, a);
  return `${r.state.pos.x},${r.state.pos.y}|${r.event}`;
};

/** Find the next action toward (or at) a state where `model` and `rival` disagree, avoiding accidental resets. */
function route(model: World, rival: World, start: GameState, accept: (s: GameState, a: Action) => boolean): { action: Action; mode: "do" | "approach" } | null {
  const seen = new Set<string>([key(start.pos)]);
  const queue: { s: GameState; first: Action | null }[] = [{ s: start, first: null }];
  while (queue.length) {
    const { s, first } = queue.shift() as { s: GameState; first: Action | null };
    for (const a of ACTIONS) {
      if (sig(model, s, a) !== sig(rival, s, a) && accept(s, a)) return { action: first ?? a, mode: first ? "approach" : "do" };
    }
    for (const a of ACTIONS) {
      const r = stepWorld(model, s, a);
      if (r.event === "hazard" || r.event === "goal") continue;
      const k = key(r.state.pos);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push({ s: r.state, first: first ?? a });
    }
  }
  return null;
}

export function planIntervention(space: CandidateSpace, atoms: Atom[], state: GameState, skip: Set<string> = new Set()): Intervention | null {
  if (!space.identified()) return null;
  const model = space.asWorld();
  if (!model) return null;
  const pending = atoms.filter((a) => a.status === "SUPPORTED" && a.confidence >= 0.999 && !skip.has(a.id));
  const order = (a: Atom) => (a.kind === "movement" ? 0 : 1);
  pending.sort((a, b) => order(a) - order(b) || a.interventions - b.interventions);
  for (const atom of pending) {
    for (const v of variants(model, atom, space)) {
      const accept = (s: GameState, a: Action) => {
        if (atom.kind !== "terrain") return true;
        const t = applyDynamics(model.rules.dynamics, s.pos, a, model.pub.size);
        if (!t) return false;
        return model.pub.colors[t.y][t.x] === atom.color && !atom.cells.includes(key(t));
      };
      let r = route(model, v.world, state, accept);
      if (!r && atom.kind === "terrain" && atom.role !== "reward") r = route(model, v.world, state, (s, a) => {
        const t = applyDynamics(model.rules.dynamics, s.pos, a, model.pub.size);
        return !!t && model.pub.colors[t.y][t.x] === atom.color;
      });
      if (r) return { atomId: atom.id, action: r.action, mode: r.mode, rival: v.label, question: `Is it really true that: ${atom.statement.toLowerCase()}?` };
    }
  }
  return null;
}

export { buildWorld };

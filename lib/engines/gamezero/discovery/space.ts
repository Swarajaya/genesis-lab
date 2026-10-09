import { allDynamics, applyDynamics, dynamicsId } from "../dynamics";
import { stepWorld, type World } from "../world";
import { COLORS, key, samePos, type Action, type Color, type Dynamics, type GameState, type Observation, type Pos, type PublicWorld, type Terrain } from "../types";

/**
 * CANDIDATE WORLD SPACE
 *
 * A candidate world is a fully specified rule set: one movement Dynamics (24 options) plus a terrain role for
 * every color on the board (5 roles per color). With 5 colors that is 24 x 5^5 = 75,000 candidate worlds.
 * Everything here is derived from observations only; the hidden rules are never read.
 *
 * Because the real engine's response to a move depends only on (dynamics, role of the landing cell's color),
 * consistency with an observation can be tracked exactly with one 5-bit "allowed roles" mask per (dynamics, color).
 * That makes every count, entropy and marginal below exact, not sampled.
 */

export const TERRAINS: Terrain[] = ["free", "solid", "reward", "hazard", "goal"];
export const ALL_MASK = 0b11111;
const BIT: Record<Terrain, number> = { free: 1, solid: 2, reward: 4, hazard: 8, goal: 16 };

export const bitOf = (t: Terrain) => BIT[t];
export const popcount = (m: number) => ((m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1));
export function rolesOf(mask: number): Terrain[] {
  return TERRAINS.filter((t) => (mask & BIT[t]) !== 0);
}

export const DYNAMICS: Dynamics[] = allDynamics();

const MAPPING_COST = { normal: 0, mirrorH: 1, inverted: 2, swapped: 3 } as const;

/** Occam prior over movement dynamics: simpler mechanics are a priori more likely. Normalised. */
export function occamPrior(): number[] {
  const w = DYNAMICS.map((d) => 1 / ((1 + (d.k - 1)) * (1 + (d.edge === "wrap" ? 1 : 0)) * (1 + 0.5 * MAPPING_COST[d.mapping])));
  const z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / z);
}

/**
 * Role mask the observation allows for the landing cell `t`, or 0 when the observation contradicts the move target.
 * Mirrors GameState transitions in stepWorld exactly.
 */
export function allowedRoles(pub: PublicWorld, obs: Observation, t: Pos): number {
  const to = obs.after.pos;
  const ev = obs.event;
  if (ev === "hazard") return samePos(to, pub.start) ? BIT.hazard : 0;
  if (ev === "goal") return samePos(to, pub.start) ? BIT.goal : 0;
  if (ev === "reward") return samePos(to, t) ? BIT.reward : 0;
  if (samePos(to, t)) return obs.before.collected.includes(key(t)) ? BIT.free | BIT.reward : BIT.free;
  if (samePos(to, obs.before.pos)) return BIT.solid;
  return 0;
}

export interface Marginals {
  /** P(dynamics d) */
  dyn: number[];
  /** joint[d][colorIndex][roleIndex] = P(dynamics d AND color has role) */
  joint: number[][][];
}

export class CandidateSpace {
  readonly colors: Color[];
  readonly prior: number[];
  /** masks[d][ci] - allowed role bitmask */
  masks: number[][];
  alive: boolean[];
  /** step (1-based observation index) at which each dynamics died; 0 = alive */
  diedAt: number[];
  observations = 0;
  /** colors that no reachable experiment can ever reveal (declared only after an exhaustive search) */
  irreducible: Color[] = [];

  constructor(
    public readonly pub: PublicWorld,
    prior?: number[],
  ) {
    this.colors = COLORS.filter((c) => pub.colors.some((row) => row.includes(c)));
    this.prior = prior ?? occamPrior();
    this.masks = DYNAMICS.map(() => this.colors.map(() => ALL_MASK));
    this.alive = DYNAMICS.map(() => true);
    this.diedAt = DYNAMICS.map(() => 0);
  }

  colorIndex(c: Color) {
    return this.colors.indexOf(c);
  }

  /** Fold one observation into the constraints. Returns indices of dynamics newly eliminated. */
  observe(obs: Observation): number[] {
    this.observations++;
    const killed: number[] = [];
    DYNAMICS.forEach((d, i) => {
      if (!this.alive[i]) return;
      const t = applyDynamics(d, obs.before.pos, obs.action, this.pub.size);
      let ok = true;
      if (t === null) {
        ok = samePos(obs.after.pos, obs.before.pos) && obs.event === "none";
      } else {
        const m = allowedRoles(this.pub, obs, t);
        if (m === 0) ok = false;
        else {
          const ci = this.colorIndex(this.pub.colors[t.y][t.x]);
          const nm = this.masks[i][ci] & m;
          if (nm === 0) ok = false;
          else this.masks[i][ci] = nm;
        }
      }
      if (!ok) {
        this.alive[i] = false;
        this.diedAt[i] = this.observations;
        killed.push(i);
      }
    });
    return killed;
  }

  /** Number of consistent role assignments for dynamics i (0 if eliminated). */
  count(i: number): number {
    if (!this.alive[i]) return 0;
    return this.masks[i].reduce((p, m) => p * popcount(m), 1);
  }

  totalWorlds(): number {
    return DYNAMICS.reduce((s, _, i) => s + this.count(i), 0);
  }

  initialWorlds(): number {
    return DYNAMICS.length * Math.pow(5, this.colors.length);
  }

  /** Exact posterior mass over dynamics, normalised. */
  dynPosterior(): number[] {
    const w = DYNAMICS.map((_, i) => this.prior[i] * this.count(i));
    const z = w.reduce((a, b) => a + b, 0);
    return z > 0 ? w.map((x) => x / z) : w.map(() => 0);
  }

  /** Shannon entropy (bits) of the posterior over fully specified worlds. Prior over roles is uniform. */
  entropyBits(): number {
    const per = DYNAMICS.map((_, i) => ({ n: this.count(i), pi: this.prior[i] }));
    const z = per.reduce((s, x) => s + x.pi * x.n, 0);
    if (z <= 0) return 0;
    let h = 0;
    for (const { n, pi } of per) {
      if (n === 0) continue;
      const p = pi / z;
      h -= n * p * Math.log2(p);
    }
    return h;
  }

  /** Entropy of the NAIVE (Occam) prior. Knowledge is always measured against it, so a transfer prior shows a real head start. */
  priorEntropyBits(): number {
    const m = this.colors.length;
    let h = Math.log2(Math.pow(5, m));
    for (const pi of occamPrior()) h -= pi * Math.log2(pi);
    return h;
  }

  /** Fraction of the removable uncertainty (in bits) that observations have removed. Exactly 1 when nothing knowable is left. */
  knowledge(): number {
    const floor = this.irreducible.length * Math.log2(5);
    const span = this.priorEntropyBits() - floor;
    if (span <= 1e-9) return 1;
    const k = (this.priorEntropyBits() - this.entropyBits()) / span;
    return Math.max(0, Math.min(1, k));
  }

  /** Exact marginals of the posterior (used as the classical reference and as the fallback ranking). */
  marginals(): Marginals {
    const post = this.dynPosterior();
    const joint = DYNAMICS.map((_, i) =>
      this.colors.map((_, ci) => {
        const m = this.masks[i][ci];
        const pc = popcount(m);
        return TERRAINS.map((t) => (this.alive[i] && (m & BIT[t]) !== 0 ? post[i] / pc : 0));
      }),
    );
    return { dyn: post, joint };
  }

  aliveIndices(): number[] {
    return DYNAMICS.map((_, i) => i).filter((i) => this.alive[i]);
  }

  /** The single most probable world (ties broken by prior); null roles stay undetermined. */
  leading(): { dyn: Dynamics; dynIndex: number; roles: (Terrain | null)[] } | null {
    const post = this.dynPosterior();
    let bi = -1;
    for (let i = 0; i < post.length; i++) if (post[i] > 0 && (bi < 0 || post[i] > post[bi])) bi = i;
    if (bi < 0) return null;
    return { dyn: DYNAMICS[bi], dynIndex: bi, roles: this.masks[bi].map((m) => (popcount(m) === 1 ? rolesOf(m)[0] : null)) };
  }

  /** True when exactly one dynamics remains and every REACHABLE color has exactly one role. */
  identified(): boolean {
    const a = this.aliveIndices();
    return a.length === 1 && this.masks[a[0]].every((m, ci) => popcount(m) === 1 || this.irreducible.includes(this.colors[ci]));
  }

  /**
   * Called when no experiment anywhere reachable can still discriminate worlds. If exactly one movement rule survives,
   * the colors whose roles are still open are unreachable under it, so they cannot matter to play. Returns them.
   */
  declareExhausted(): Color[] | null {
    const a = this.aliveIndices();
    if (a.length !== 1) return null;
    const open = this.colors.filter((_, ci) => popcount(this.masks[a[0]][ci]) > 1);
    this.irreducible = open;
    return open;
  }

  dynamicsAlive(): Dynamics[] {
    return this.aliveIndices().map((i) => DYNAMICS[i]);
  }

  /** The identified world as an engine World, usable with stepWorld for imagination / planning. */
  asWorld(): World | null {
    const l = this.leading();
    if (!l) return null;
    return buildWorld(this.pub, l.dyn, this.colors, l.roles);
  }
}

/** Build a World with the given beliefs. Undetermined roles default to "free" (callers must check determinism). */
export function buildWorld(pub: PublicWorld, dyn: Dynamics, colors: Color[], roles: (Terrain | null)[]): World {
  const terrain = {} as Record<Color, Terrain>;
  for (const c of COLORS) terrain[c] = "free";
  colors.forEach((c, i) => (terrain[c] = roles[i] ?? "free"));
  return { pub, rules: { dynamics: dyn, terrain } };
}

export interface Outcome {
  pos: Pos;
  event: string;
  key: string;
}

/** Outcome of an action under a specific (dynamics, landing-color role), simulated with the real engine step. */
export function simulateOutcome(pub: PublicWorld, state: GameState, action: Action, dyn: Dynamics, colorOfTarget: Color | null, role: Terrain): Outcome {
  const terrain = {} as Record<Color, Terrain>;
  for (const c of COLORS) terrain[c] = "free";
  if (colorOfTarget) terrain[colorOfTarget] = role;
  const w: World = { pub, rules: { dynamics: dyn, terrain } };
  const r = stepWorld(w, state, action);
  return { pos: r.state.pos, event: r.event, key: `${r.state.pos.x},${r.state.pos.y}|${r.event}` };
}

export { dynamicsId };

/** Rival movement rules that differ from `d` in exactly one dimension. */
export function rivalDynamics(d: Dynamics, dim: "step" | "edge" | "mapping"): Dynamics[] {
  if (dim === "step") return ([1, 2, 3] as const).filter((k) => k !== d.k).map((k) => ({ ...d, k }));
  if (dim === "edge") return [{ ...d, edge: d.edge === "stop" ? "wrap" : "stop" }];
  return (["normal", "inverted", "swapped", "mirrorH"] as const).filter((m) => m !== d.mapping).map((m) => ({ ...d, mapping: m }));
}

/**
 * Cells the agent can deliberately walk INTO from the start without an accidental reset, according to a model world.
 * Used to decide how much replication a rule can physically receive (a reward cell can only be collected once).
 */
export function testableCells(model: World): Map<Color, Set<string>> {
  const out = new Map<Color, Set<string>>();
  const seen = new Set<string>([key(model.pub.start)]);
  const queue: GameState[] = [{ pos: { ...model.pub.start }, collected: [], score: 0, wins: 0, steps: 0 }];
  while (queue.length) {
    const s = queue.shift() as GameState;
    for (const a of ["up", "down", "left", "right"] as Action[]) {
      const t = applyDynamics(model.rules.dynamics, s.pos, a, model.pub.size);
      if (t) {
        const c = model.pub.colors[t.y][t.x];
        const set = out.get(c) ?? new Set<string>();
        set.add(key(t));
        out.set(c, set);
      }
      const r = stepWorld(model, s, a);
      if (r.event === "hazard" || r.event === "goal") continue;
      const k = key(r.state.pos);
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push(r.state);
    }
  }
  return out;
}

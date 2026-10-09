import { allDynamics, applyDynamics, describeDynamics, dynamicsId } from "./dynamics";
import { key, samePos, type Action, type Dynamics, type GameEvent, type Observation, type Pos, type PublicWorld, type Terrain } from "./types";

export type TerrainModel = "color" | "position";

export interface Hypothesis {
  id: string;
  dyn: Dynamics;
  /** "color": a cell's behaviour depends on its color. "position": each cell is its own case. */
  model: TerrainModel;
  /** Learned terrain, keyed by color or by "x,y" depending on model. */
  table: Record<string, Terrain>;
  alive: boolean;
}

export interface Rejection {
  hypothesisId: string;
  step: number;
  reason: string;
}

export interface Prediction {
  target: Pos | null;
  terrain: Terrain | "unknown";
}

const MODEL_PRIORITY: Record<TerrainModel, number> = { color: 0, position: 1 };
const MAPPING_PRIORITY = { normal: 0, mirrorH: 1, inverted: 2, swapped: 3 } as const;

function fmt(p: Pos | null) {
  return p ? `(${p.x},${p.y})` : "no movement";
}

/**
 * Learns hidden rules ONLY from observations. It enumerates a family of candidate rules
 * (movement dynamics x terrain model), and eliminates any candidate that a new observation contradicts.
 * Everything here is deterministic.
 */
export class Learner {
  hyps: Hypothesis[];
  observations: Observation[] = [];
  rejections: Rejection[] = [];

  constructor(public readonly world: PublicWorld) {
    this.hyps = [];
    for (const dyn of allDynamics())
      for (const model of ["color", "position"] as const)
        this.hyps.push({ id: `${dynamicsId(dyn)}|${model}`, dyn, model, table: {}, alive: true });
  }

  private terrainKey(h: Hypothesis, p: Pos): string {
    return h.model === "color" ? this.world.colors[p.y][p.x] : key(p);
  }

  /** Interpret an observation as evidence about the landing cell, given hypothesis h's target t. */
  private interpret(obs: Observation, t: Pos): Terrain | null {
    const to = obs.after.pos;
    const ev: GameEvent = obs.event;
    if ((ev === "hazard" || ev === "goal") && samePos(to, this.world.start)) return ev;
    if (samePos(to, t) && (ev === "none" || ev === "reward")) return ev === "reward" ? "reward" : "free";
    if (samePos(to, obs.before.pos) && ev === "none") return "solid";
    return null;
  }

  /** Returns null if consistent (and updates h), otherwise a human-readable rejection reason. */
  private check(h: Hypothesis, obs: Observation): string | null {
    const from = obs.before.pos;
    const t = applyDynamics(h.dyn, from, obs.action, this.world.size);

    if (t === null) {
      if (samePos(obs.after.pos, from) && obs.event === "none") return null;
      return `Predicted the piece to hit the board edge and stay, but it moved to ${fmt(obs.after.pos)}`;
    }
    if (samePos(t, from)) {
      return samePos(obs.after.pos, from) ? null : `Predicted no movement but observed ${fmt(obs.after.pos)}`;
    }

    const observed = this.interpret(obs, t);
    if (observed === null) {
      return `Predicted the move to reach ${fmt(t)} but observed ${fmt(obs.after.pos)}${obs.event !== "none" ? ` with event "${obs.event}"` : ""}`;
    }

    const k = this.terrainKey(h, t);
    const known = h.table[k];
    const wasCollected = obs.before.collected.includes(key(t));
    if (known === undefined) {
      h.table[k] = observed;
      return null;
    }
    if (known === observed) return null;
    if (known === "reward" && observed === "free" && wasCollected) return null; // reward already taken
    const what = h.model === "color" ? `${k} cells` : `cell ${k}`;
    return `${what} behaved as "${known}" before but as "${observed}" now`;
  }

  /** Feed one observation. Returns hypotheses rejected by it (each rejection is a "Hypothesis rejected" event). */
  observe(obs: Observation): Rejection[] {
    this.observations.push(obs);
    const step = this.observations.length;
    const rejected: Rejection[] = [];
    for (const h of this.hyps) {
      if (!h.alive) continue;
      const reason = this.check(h, obs);
      if (reason) {
        h.alive = false;
        const r = { hypothesisId: h.id, step, reason };
        rejected.push(r);
        this.rejections.push(r);
      }
    }
    return rejected;
  }

  alive(): Hypothesis[] {
    return this.hyps.filter((h) => h.alive);
  }

  aliveDynamics(): Dynamics[] {
    const seen = new Map<string, Dynamics>();
    for (const h of this.alive()) seen.set(dynamicsId(h.dyn), h.dyn);
    return [...seen.values()];
  }

  /** Occam preference: color model first, then smaller steps, walls before wrapping, normal controls first. */
  best(): Hypothesis | null {
    const a = this.alive();
    if (a.length === 0) return null;
    return [...a].sort(
      (x, y) =>
        MODEL_PRIORITY[x.model] - MODEL_PRIORITY[y.model] ||
        x.dyn.k - y.dyn.k ||
        (x.dyn.edge === y.dyn.edge ? 0 : x.dyn.edge === "stop" ? -1 : 1) ||
        MAPPING_PRIORITY[x.dyn.mapping] - MAPPING_PRIORITY[y.dyn.mapping],
    )[0];
  }

  predict(h: Hypothesis, from: Pos, action: Action): Prediction {
    const target = applyDynamics(h.dyn, from, action, this.world.size);
    if (!target || samePos(target, from)) return { target, terrain: "free" };
    return { target, terrain: h.table[this.terrainKey(h, target)] ?? "unknown" };
  }

  terrainBelief(h: Hypothesis, p: Pos): Terrain | "unknown" {
    return h.table[this.terrainKey(h, p)] ?? "unknown";
  }

  /** Plain-language description of what the best surviving hypothesis believes. */
  summary() {
    const best = this.best();
    if (!best) return null;
    const terrain: { label: string; terrain: Terrain }[] = Object.entries(best.table).map(([k, v]) => ({ label: k, terrain: v }));
    return {
      movement: describeDynamics(best.dyn),
      model: best.model,
      terrain,
      alive: this.alive().length,
      total: this.hyps.length,
      dynamicsAlive: this.aliveDynamics().length,
    };
  }
}

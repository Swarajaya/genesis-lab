import { describeDynamics } from "@/lib/engines/gamezero/dynamics";
import type { Hypothesis, Learner } from "@/lib/engines/gamezero/learner";
import type { Action, Color, GameEvent, Pos, Terrain } from "@/lib/engines/gamezero/types";

export const COLOR_HEX: Record<Color, string> = {
  teal: "#2dd4bf",
  amber: "#f2c260",
  violet: "#a78bfa",
  rose: "#fb7185",
  slate: "#7c8aa5",
};

export const COLOR_GLYPH: Record<Color, string> = { teal: "◐", amber: "◑", violet: "◒", rose: "◓", slate: "○" };

export const TERRAIN_WORDS: Record<Terrain, string> = {
  free: "walkable",
  solid: "blocks movement",
  reward: "gives a reward",
  hazard: "hazard: sends you back to the start",
  goal: "the goal",
};

export const TERRAIN_GLYPH: Record<Terrain, string> = { free: "", solid: "■", reward: "◆", hazard: "▲", goal: "★" };

export const EVENT_HEX: Record<Exclude<GameEvent, "none">, string> = { reward: "#f2c260", hazard: "#ff6b7a", goal: "#5fe3a1" };

export type LogKind = "demo" | "test" | "play" | "reject" | "info";
export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  step?: number;
}

export interface HypView {
  id: string;
  label: string;
  best: boolean;
}
export interface RejectedView {
  id: string;
  label: string;
  reason: string;
  step: number;
}
export interface Snapshot {
  alive: number;
  total: number;
  aliveList: HypView[];
  rejected: RejectedView[];
  movement: string | null;
  model: "color" | "position" | null;
  terrain: { label: string; terrain: Terrain }[];
  belief: (Terrain | "unknown")[][];
  dynamicsAlive: number;
}

const MAP_LABEL = { normal: "normal keys", inverted: "inverted keys", swapped: "swapped axes", mirrorH: "mirrored left/right" } as const;

export function hypLabel(h: Hypothesis): string {
  const step = h.dyn.k === 1 ? "1-cell steps" : `${h.dyn.k}-cell jumps`;
  return `${step}, ${MAP_LABEL[h.dyn.mapping]}, ${h.dyn.edge === "wrap" ? "wrapping edges" : "solid edges"}, terrain by ${h.model === "color" ? "color" : "cell"}`;
}

export function snapshot(learner: Learner): Snapshot {
  const best = learner.best();
  const byId = new Map(learner.hyps.map((h) => [h.id, h]));
  const alive = learner.alive();
  const aliveList = [...alive].sort((a, b) => (a === best ? -1 : b === best ? 1 : 0)).map((h) => ({ id: h.id, label: hypLabel(h), best: h === best }));
  const size = learner.world.size;
  const belief: (Terrain | "unknown")[][] = [];
  for (let y = 0; y < size; y++) {
    const row: (Terrain | "unknown")[] = [];
    for (let x = 0; x < size; x++) row.push(best ? learner.terrainBelief(best, { x, y }) : "unknown");
    belief.push(row);
  }
  return {
    alive: alive.length,
    total: learner.hyps.length,
    aliveList,
    rejected: learner.rejections.map((r) => {
      const h = byId.get(r.hypothesisId);
      return { id: r.hypothesisId, label: h ? hypLabel(h) : r.hypothesisId, reason: r.reason, step: r.step };
    }),
    movement: best ? describeDynamics(best.dyn) : null,
    model: best ? best.model : null,
    terrain: best ? Object.entries(best.table).map(([label, terrain]) => ({ label, terrain })) : [],
    belief,
    dynamicsAlive: learner.aliveDynamics().length,
  };
}

export const posText = (p: Pos) => `(${p.x},${p.y})`;
export const KEY_TO_ACTION: Record<string, Action> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  s: "down",
  S: "down",
  a: "left",
  A: "left",
  d: "right",
  D: "right",
};

export type Action = "up" | "down" | "left" | "right";
export const ACTIONS: Action[] = ["up", "down", "left", "right"];

export type Color = "teal" | "amber" | "violet" | "rose" | "slate";
export const COLORS: Color[] = ["teal", "amber", "violet", "rose", "slate"];

export type Terrain = "free" | "solid" | "reward" | "hazard" | "goal";
export type GameEvent = "none" | "reward" | "hazard" | "goal";

export interface Pos {
  x: number;
  y: number;
}

export interface GameState {
  pos: Pos;
  /** Reward cells already collected, "x,y". */
  collected: string[];
  score: number;
  wins: number;
  steps: number;
}

/** What anybody (including the learner) is allowed to see. Terrain meaning is NOT included. */
export interface PublicWorld {
  size: number;
  colors: Color[][];
  start: Pos;
}

export interface Observation {
  before: GameState;
  action: Action;
  after: GameState;
  event: GameEvent;
}

export type Mapping = "normal" | "inverted" | "swapped" | "mirrorH";
export type EdgeRule = "stop" | "wrap";

export interface Dynamics {
  k: 1 | 2 | 3;
  edge: EdgeRule;
  mapping: Mapping;
}

export interface Env {
  step(state: GameState, action: Action): Promise<{ state: GameState; event: GameEvent }>;
}

export const key = (p: Pos) => `${p.x},${p.y}`;
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

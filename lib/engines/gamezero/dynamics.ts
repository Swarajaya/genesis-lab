import type { Action, Dynamics, Mapping, Pos } from "./types";

const BASE: Record<Action, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const MAP: Record<Mapping, Record<Action, Action>> = {
  normal: { up: "up", down: "down", left: "left", right: "right" },
  inverted: { up: "down", down: "up", left: "right", right: "left" },
  swapped: { up: "left", down: "right", left: "up", right: "down" },
  mirrorH: { up: "up", down: "down", left: "right", right: "left" },
};

/**
 * Where does `action` take a piece at `pos` under hypothesis `dyn`?
 * Returns null when the move leaves the board under the "stop" edge rule (the piece stays put).
 */
export function applyDynamics(dyn: Dynamics, pos: Pos, action: Action, size: number): Pos | null {
  const d = BASE[MAP[dyn.mapping][action]];
  const x = pos.x + d.x * dyn.k;
  const y = pos.y + d.y * dyn.k;
  if (dyn.edge === "wrap") return { x: ((x % size) + size) % size, y: ((y % size) + size) % size };
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  return { x, y };
}

export function dynamicsId(d: Dynamics): string {
  return `k${d.k}-${d.edge}-${d.mapping}`;
}

export function describeDynamics(d: Dynamics): string {
  const step = d.k === 1 ? "moves 1 cell" : `jumps ${d.k} cells`;
  const map = {
    normal: "arrow keys behave normally",
    inverted: "controls are inverted (up goes down, left goes right)",
    swapped: "axes are swapped (up goes left, right goes down)",
    mirrorH: "left and right are mirrored",
  }[d.mapping];
  const edge = d.edge === "wrap" ? "the board wraps around its edges" : "the board edge is a wall";
  return `Each move ${step}; ${map}; ${edge}.`;
}

export function allDynamics(): Dynamics[] {
  const out: Dynamics[] = [];
  for (const k of [1, 2, 3] as const)
    for (const edge of ["stop", "wrap"] as const)
      for (const mapping of ["normal", "inverted", "swapped", "mirrorH"] as const) out.push({ k, edge, mapping });
  return out;
}

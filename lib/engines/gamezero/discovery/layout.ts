import { DYNAMICS } from "./space";
import { TERRAINS } from "./space";

/** Deterministic geometry shared by the 2D and 3D state-space views. Positions are fixed; only intensity changes. */
export interface P3 {
  x: number;
  y: number;
  z: number;
}

const MAPPING_SLOT = { normal: 0, mirrorH: 1, inverted: 2, swapped: 3 } as const;

export function dynPosition(index: number): P3 {
  const d = DYNAMICS[index];
  const ring = d.k - 1;
  const slot = (d.edge === "wrap" ? 4 : 0) + MAPPING_SLOT[d.mapping];
  const ang = (slot / 8) * Math.PI * 2 + ring * 0.2;
  const r = 0.42 + ring * 0.2;
  return { x: Math.cos(ang) * r, y: d.edge === "wrap" ? 0.18 : -0.18, z: Math.sin(ang) * r };
}

export function terrainPosition(colorIndex: number, roleIndex: number, colorCount: number): P3 {
  const ang = (colorIndex / Math.max(1, colorCount)) * Math.PI * 2 - Math.PI / 2 + (roleIndex - 2) * 0.1;
  const r = 1.12 + roleIndex * 0.035;
  return { x: Math.cos(ang) * r, y: (roleIndex - 2) * 0.07, z: Math.sin(ang) * r };
}

/** Pairs of dynamics that differ by exactly one rule dimension (single-edit neighbours). */
export function dynEdges(): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < DYNAMICS.length; i++)
    for (let j = i + 1; j < DYNAMICS.length; j++) {
      const a = DYNAMICS[i];
      const b = DYNAMICS[j];
      const diff = (a.k !== b.k ? 1 : 0) + (a.edge !== b.edge ? 1 : 0) + (a.mapping !== b.mapping ? 1 : 0);
      if (diff === 1) out.push([i, j]);
    }
  return out;
}

/** Stable pseudo-random scatter in [-1,1]^3 used for the "chaos" arrangement. */
export function chaos(i: number): P3 {
  const f = (n: number) => {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  return { x: f(i + 1) * 1.1, y: f(i + 101) * 0.8, z: f(i + 201) * 1.1 };
}

export const lerp3 = (a: P3, b: P3, t: number): P3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** Narrative label of where the search is, derived from real knowledge / verification state. */
export function searchStage(args: { observations: number; knowledge: number; identified: boolean; verified: boolean }): { id: number; label: string } {
  if (args.observations === 0) return { id: 0, label: "INITIAL STATE SPACE" };
  if (args.verified) return { id: 5, label: "OPTIMAL RULE MODEL" };
  if (args.identified) return { id: 4, label: "CONVERGENCE" };
  if (args.knowledge < 0.35) return { id: 1, label: "SEARCHING" };
  if (args.knowledge < 0.75) return { id: 2, label: "PRUNING" };
  return { id: 3, label: "SURVIVING STATES" };
}

/** Discovery progression for the 3D world: chaos -> observations -> patterns -> relationships -> rules -> world model. */
export const PROGRESSION = ["CHAOS", "OBSERVATIONS", "PATTERNS", "RELATIONSHIPS", "RULES", "WORLD MODEL"] as const;
export function progressionStage(args: { observations: number; knowledge: number; confirmed: number; total: number; verified: boolean }): number {
  if (args.observations === 0) return 0;
  if (args.verified) return 5;
  if (args.confirmed > 0) return 4;
  if (args.knowledge >= 0.6) return 3;
  if (args.knowledge >= 0.2) return 2;
  return 1;
}
void TERRAINS;

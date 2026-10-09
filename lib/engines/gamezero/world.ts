import { applyDynamics } from "./dynamics";
import {
  COLORS,
  key,
  samePos,
  type Action,
  type Color,
  type Dynamics,
  type GameEvent,
  type GameState,
  type Pos,
  type PublicWorld,
  type Terrain,
} from "./types";

/**
 * SERVER-SIDE ONLY. The hidden rules live here and are never sent to the learner or the client.
 * The learner only ever sees PublicWorld plus observations of what happened.
 */
export interface HiddenRules {
  dynamics: Dynamics;
  terrain: Record<Color, Terrain>;
}

export interface World {
  pub: PublicWorld;
  rules: HiddenRules;
}

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function makeRng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIZE = 7;

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function shuffle<T>(rng: () => number, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function terrainAt(world: World, p: Pos): Terrain {
  return world.rules.terrain[world.pub.colors[p.y][p.x]];
}

/** True reachability under the hidden rules; used only to guarantee the world is solvable. */
function solvable(world: World): boolean {
  const { pub, rules } = world;
  const seen = new Set<string>([key(pub.start)]);
  const queue: Pos[] = [pub.start];
  let goal = false;
  let rewards = 0;
  while (queue.length) {
    const cur = queue.shift() as Pos;
    for (const a of ["up", "down", "left", "right"] as Action[]) {
      const t = applyDynamics(rules.dynamics, cur, a, SIZE);
      if (!t) continue;
      const tt = terrainAt(world, t);
      if (tt === "solid" || tt === "hazard") continue;
      if (tt === "goal") {
        goal = true;
        continue;
      }
      if (tt === "reward") rewards++;
      if (!seen.has(key(t))) {
        seen.add(key(t));
        queue.push(t);
      }
    }
  }
  return goal && rewards >= 1;
}

export function generateWorld(seed: string): World {
  for (let attempt = 0; attempt < 300; attempt++) {
    const rng = makeRng(`${seed}#${attempt}`);
    const dynamics: Dynamics = {
      k: pick(rng, [1, 1, 1, 2] as const),
      edge: pick(rng, ["stop", "wrap"] as const),
      mapping: pick(rng, ["normal", "inverted", "swapped", "mirrorH"] as const),
    };
    const shuffled = shuffle(rng, [...COLORS]);
    const kinds: Terrain[] = ["solid", "reward", "hazard", "goal", "free"];
    const terrain = {} as Record<Color, Terrain>;
    shuffled.forEach((c, i) => (terrain[c] = kinds[i]));
    const colorOf = (t: Terrain) => COLORS.find((c) => terrain[c] === t) as Color;

    // weighted cell colors
    const weights: [Terrain, number][] = [["solid", 0.15], ["hazard", 0.1], ["reward", 0.12], ["goal", 0.05], ["free", 0.58]];
    const colors: Color[][] = [];
    for (let y = 0; y < SIZE; y++) {
      const row: Color[] = [];
      for (let x = 0; x < SIZE; x++) {
        let r = rng();
        let chosen: Terrain = "free";
        for (const [t, w] of weights) {
          if (r < w) {
            chosen = t;
            break;
          }
          r -= w;
        }
        row.push(colorOf(chosen));
      }
      colors.push(row);
    }
    const start: Pos = { x: Math.floor(rng() * SIZE), y: Math.floor(rng() * SIZE) };
    colors[start.y][start.x] = colorOf("free");

    const count = (t: Terrain) => colors.flat().filter((c) => terrain[c] === t).length;
    if (count("goal") < 1 || count("reward") < 2 || count("hazard") < 3 || count("solid") < 5) continue;

    const world: World = { pub: { size: SIZE, colors, start }, rules: { dynamics, terrain } };
    if (solvable(world)) return world;
  }
  throw new Error("world generation failed");
}

export function initialState(pub: PublicWorld): GameState {
  return { pos: { ...pub.start }, collected: [], score: 0, wins: 0, steps: 0 };
}

export function stepWorld(world: World, state: GameState, action: Action): { state: GameState; event: GameEvent } {
  const { pub, rules } = world;
  const next: GameState = { ...state, collected: [...state.collected], pos: { ...state.pos }, steps: state.steps + 1 };
  const t = applyDynamics(rules.dynamics, state.pos, action, pub.size);
  if (!t) return { state: next, event: "none" };
  const terrain = terrainAt(world, t);
  switch (terrain) {
    case "solid":
      return { state: next, event: "none" };
    case "hazard":
      next.pos = { ...pub.start };
      return { state: next, event: "hazard" };
    case "goal":
      next.pos = { ...pub.start };
      next.wins += 1;
      return { state: next, event: "goal" };
    case "reward": {
      next.pos = t;
      if (!next.collected.includes(key(t))) {
        next.collected.push(key(t));
        next.score += 1;
        return { state: next, event: "reward" };
      }
      return { state: next, event: "none" };
    }
    default:
      next.pos = t;
      return { state: next, event: "none" };
  }
}

export function localEnv(world: World) {
  return {
    async step(state: GameState, action: Action) {
      return stepWorld(world, state, action);
    },
  };
}

export { samePos };


/** Seeds ending in this suffix are "transfer worlds": same movement mechanics as the base world, new look and layout. */
export const TRANSFER_SUFFIX = "_tf";

/**
 * Game B for the transfer-learning demo. It REUSES the base world's movement rules (a reusable mechanic) but gets a new
 * colour-to-terrain assignment and a new layout, so it looks different. Which mechanics carry over is never sent to the
 * client; the agent has to test whether its prior knowledge still holds.
 */
export function generateTransferWorld(seed: string, base: World): World {
  for (let attempt = 0; attempt < 300; attempt++) {
    const rng = makeRng(`${seed}#transfer#${attempt}`);
    const dynamics: Dynamics = { ...base.rules.dynamics };
    const shuffled = shuffle(rng, [...COLORS]);
    const kinds: Terrain[] = ["solid", "reward", "hazard", "goal", "free"];
    const terrain = {} as Record<Color, Terrain>;
    shuffled.forEach((c, i) => (terrain[c] = kinds[i]));
    // different look: at least 3 colours must change role compared with the base world
    const changed = COLORS.filter((c) => terrain[c] !== base.rules.terrain[c]).length;
    if (changed < 3) continue;
    const colorOf = (t: Terrain) => COLORS.find((c) => terrain[c] === t) as Color;
    const weights: [Terrain, number][] = [["solid", 0.15], ["hazard", 0.1], ["reward", 0.12], ["goal", 0.05], ["free", 0.58]];
    const colors: Color[][] = [];
    for (let y = 0; y < SIZE; y++) {
      const row: Color[] = [];
      for (let x = 0; x < SIZE; x++) {
        let r = rng();
        let chosen: Terrain = "free";
        for (const [t, w] of weights) {
          if (r < w) {
            chosen = t;
            break;
          }
          r -= w;
        }
        row.push(colorOf(chosen));
      }
      colors.push(row);
    }
    const start: Pos = { x: Math.floor(rng() * SIZE), y: Math.floor(rng() * SIZE) };
    colors[start.y][start.x] = colorOf("free");
    const count = (t: Terrain) => colors.flat().filter((c) => terrain[c] === t).length;
    if (count("goal") < 1 || count("reward") < 2 || count("hazard") < 3 || count("solid") < 5) continue;
    const world: World = { pub: { size: SIZE, colors, start }, rules: { dynamics, terrain } };
    if (solvable(world)) return world;
  }
  throw new Error("transfer world generation failed");
}

/** Deterministic resolver: the same seed always yields the same world on any server instance. */
export function worldForSeed(seed: string): World {
  if (seed.endsWith(TRANSFER_SUFFIX) && seed.length > TRANSFER_SUFFIX.length) {
    const baseSeed = seed.slice(0, -TRANSFER_SUFFIX.length);
    return generateTransferWorld(seed, generateWorld(baseSeed));
  }
  return generateWorld(seed);
}

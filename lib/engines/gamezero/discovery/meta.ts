import { dynamicsId } from "../dynamics";
import type { Dynamics } from "../types";
import { modelAtoms, type Atom, type Category, type LoggedObs } from "./ledger";
import { CandidateSpace, DYNAMICS, occamPrior, type Marginals } from "./space";
import type { PublicWorld } from "../types";

/**
 * META-LEARNING / TRANSFER
 * After each completed game we store how many experiments each KIND of discovery cost, and the movement mechanics
 * that were found. In the next world those mechanics become a prior (a hypothesis to test, not an assumption):
 * if the world differs, the evidence overturns it and the extra cost shows up in the real experiment count.
 */

export const META_CATEGORIES: Category[] = ["MOVEMENT", "BOUNDARY", "COLLISION", "REWARD", "GOAL"];

export interface GameRecord {
  seed: string;
  completedAt: string;
  experiments: number;
  observations: number;
  dyn: Dynamics;
  dynId: string;
  /** experiments needed before each discovery category was identified (null: never identified) */
  categoryCost: Record<string, number | null>;
  transferred: boolean;
  priorMass: number;
}

export interface MetaLibrary {
  version: 1;
  games: GameRecord[];
}

export const emptyLibrary = (): MetaLibrary => ({ version: 1, games: [] });

/** Experiments (agent-chosen steps) completed when each category first became identified. */
export function categoryCosts(pub: PublicWorld, log: LoggedObs[], finalAtoms: Atom[], prior?: number[]): Record<string, number | null> {
  const sp = new CandidateSpace(pub, prior);
  const out: Record<string, number | null> = { MOVEMENT: null, BOUNDARY: null, COLLISION: null, REWARD: null, GOAL: null };
  const finalModel = modelAtoms(finalAtoms);
  let experiments = 0;
  const roleColors = (cat: Category) => finalModel.filter((a) => a.kind === "terrain" && a.confidence > 0.999 && catOf(a) === cat).map((a) => a.color as string);
  const catOf = (a: Atom): Category => (a.role === "solid" || a.role === "hazard" ? "COLLISION" : a.role === "reward" ? "REWARD" : a.role === "goal" ? "GOAL" : "TERRAIN");
  for (const l of log) {
    sp.observe(l.obs);
    if (l.source === "experiment" || l.source === "verify") experiments++;
    const m: Marginals = sp.marginals();
    const dimTop = (f: (d: Dynamics) => string | number) => {
      const mass = new Map<string | number, number>();
      DYNAMICS.forEach((d, i) => mass.set(f(d), (mass.get(f(d)) ?? 0) + m.dyn[i]));
      return Math.max(...mass.values());
    };
    if (out.MOVEMENT === null && dimTop((d) => d.k) > 0.999 && dimTop((d) => d.mapping) > 0.999) out.MOVEMENT = experiments;
    if (out.BOUNDARY === null && dimTop((d) => d.edge) > 0.999) out.BOUNDARY = experiments;
    for (const cat of ["COLLISION", "REWARD", "GOAL"] as Category[]) {
      if (out[cat] !== null) continue;
      const cols = roleColors(cat);
      if (cols.length === 0) continue;
      const done = cols.every((c) => {
        const ci = sp.colorIndex(c as never);
        let best = 0;
        for (let t = 0; t < 5; t++) best = Math.max(best, DYNAMICS.reduce((s, _, i) => s + m.joint[i][ci][t], 0));
        return best > 0.999;
      });
      if (done) out[cat] = experiments;
    }
  }
  return out;
}

export interface TransferPlan {
  prior: number[];
  /** the mechanic being carried over */
  from: GameRecord;
  /** prior mass placed on the carried-over movement rules before any observation */
  carriedMass: number;
}

export function transferPlan(lib: MetaLibrary, carry = 0.7): TransferPlan | null {
  const from = lib.games[lib.games.length - 1];
  if (!from) return null;
  const base = occamPrior();
  const idx = DYNAMICS.findIndex((d) => dynamicsId(d) === from.dynId);
  if (idx < 0) return null;
  const prior = base.map((p, i) => (i === idx ? carry + (1 - carry) * p : (1 - carry) * p));
  return { prior, from, carriedMass: prior[idx] };
}

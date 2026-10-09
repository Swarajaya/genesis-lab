import { applyDynamics } from "../dynamics";
import { makeRng } from "../world";
import type { Observation, PublicWorld } from "../types";
import { ALL_MASK, CandidateSpace, DYNAMICS, TERRAINS, allowedRoles, bitOf } from "./space";
import { samePos } from "../types";

/**
 * EVOLUTIONARY HYPOTHESIS SEARCH
 * A population of fully specified candidate worlds competes against the evidence. Each new observation is a
 * selection event: members that cannot reproduce it are rejected, survivors reproduce by MUTATION (change one
 * movement factor or one terrain role) and by COMBINATION (movement rule of one parent + terrain table of another).
 * Offspring are admitted only if they reproduce EVERY observation so far. A generation is recorded only when the
 * population actually changed, so generation counts are never padded.
 */

export interface Candidate {
  d: number;
  roles: number[];
}

export interface GenerationRecord {
  gen: number;
  /** population size evaluated by this selection event */
  candidates: number;
  survivors: number;
  rejected: number;
  mutated: number;
  combined: number;
  /** population size after breeding */
  next: number;
  atStep: number;
}

export interface EvolutionState {
  pop: Candidate[];
  history: GenerationRecord[];
  size: number;
}

export function explains(pub: PublicWorld, colors: string[], c: Candidate, o: Observation): boolean {
  const t = applyDynamics(DYNAMICS[c.d], o.before.pos, o.action, pub.size);
  if (t === null) return samePos(o.after.pos, o.before.pos) && o.event === "none";
  const m = allowedRoles(pub, o, t);
  const color = pub.colors[t.y][t.x];
  const ci = colors.indexOf(color);
  return (m & bitOf(TERRAINS[c.roles[ci]])) !== 0;
}

const sig = (c: Candidate) => `${c.d}:${c.roles.join("")}`;

export function initPopulation(space: CandidateSpace, seed: string, size = 48): EvolutionState {
  const rng = makeRng(`${seed}#evo`);
  const cum: number[] = [];
  space.prior.reduce((a, p, i) => ((cum[i] = a + p), a + p), 0);
  const pop: Candidate[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (pop.length < size && guard++ < 5000) {
    const r = rng();
    let d = cum.findIndex((x) => r <= x);
    if (d < 0) d = cum.length - 1;
    const c: Candidate = { d, roles: space.colors.map(() => Math.floor(rng() * 5)) };
    if (seen.has(sig(c))) continue;
    seen.add(sig(c));
    pop.push(c);
  }
  return { pop, history: [], size };
}

function neighbours(d: number): number[] {
  const a = DYNAMICS[d];
  return DYNAMICS.map((b, i) => ({ b, i })).filter(({ b }) => (a.k !== b.k ? 1 : 0) + (a.edge !== b.edge ? 1 : 0) + (a.mapping !== b.mapping ? 1 : 0) === 1).map(({ i }) => i);
}

export function evolve(ev: EvolutionState, space: CandidateSpace, log: Observation[], seed: string): EvolutionState {
  if (log.length === 0) return ev;
  const rng = makeRng(`${seed}#evo#${log.length}`);
  const pub = space.pub;
  const last = log[log.length - 1];
  const colors = space.colors as string[];
  const survivors = ev.pop.filter((c) => explains(pub, colors, c, last));
  const rejected = ev.pop.length - survivors.length;
  if (rejected === 0) return ev; // nothing changed: do not invent a generation
  const fitsAll = (c: Candidate) => log.every((o) => explains(pub, colors, c, o));
  const seen = new Set(survivors.map(sig));
  const next = [...survivors];
  let mutated = 0;
  let combined = 0;
  if (survivors.length > 0) {
    let tries = 0;
    while (next.length < ev.size && tries++ < 600) {
      const A = survivors[Math.floor(rng() * survivors.length)];
      const B = survivors[Math.floor(rng() * survivors.length)];
      let child: Candidate;
      let kind: "m" | "c";
      if (rng() < 0.55) {
        kind = "m";
        child = { d: A.d, roles: [...A.roles] };
        if (rng() < 0.4) {
          const nb = neighbours(A.d);
          child.d = nb[Math.floor(rng() * nb.length)];
        } else {
          child.roles[Math.floor(rng() * child.roles.length)] = Math.floor(rng() * 5);
        }
      } else {
        kind = "c";
        child = { d: A.d, roles: [...B.roles] };
      }
      const s = sig(child);
      if (seen.has(s) || !fitsAll(child)) continue;
      seen.add(s);
      next.push(child);
      if (kind === "m") mutated++;
      else combined++;
    }
  }
  const rec: GenerationRecord = { gen: ev.history.length + 2, candidates: ev.pop.length, survivors: survivors.length, rejected, mutated, combined, next: next.length, atStep: log.length };
  return { pop: next, history: [...ev.history, rec], size: ev.size };
}

void ALL_MASK;

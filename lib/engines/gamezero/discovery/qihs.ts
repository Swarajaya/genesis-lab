import { CandidateSpace, DYNAMICS, TERRAINS, bitOf, type Marginals } from "./space";

/**
 * QUANTUM-INSPIRED HYPOTHESIS SEARCH (QIHS)
 *
 * This is a CLASSICAL simulation of amplitude amplification (Grover / Brassard-Hoyer-Mosca-Tapp) over a state
 * vector whose basis states are the candidate worlds. It runs on the CPU. No quantum hardware is used and no
 * quantum speed-up is claimed: the simulation costs O(N) per oracle query.
 *
 *  1. State preparation: amplitude of every candidate world is sqrt(prior) (Occam prior over movement rules,
 *     uniform over terrain roles). Register size = ceil(log2 N) simulated qubits.
 *  2. Oracle O: flips the sign of every basis state consistent with ALL observations so far.
 *  3. Reflection about the prepared state: psi <- 2<psi0|psi>psi0 - psi.
 *  4. Repeat for r = round(pi / (4 asin sqrt(a)) - 1/2) rounds, where a is the prior mass of consistent worlds.
 *  5. Born rule: probability of world i is psi_i^2. Mass is restricted to the consistent subspace and
 *     renormalised; the result drives hypothesis ranking and the information-gain calculation.
 *
 * The result is cross-checked against the exact Bayesian marginals (`agreement`). If the simulation cannot run
 * (budget, allocation failure) the module returns the exact marginals and says so via `mode`.
 */

export interface QihsSummary {
  mode: "amplitude-amplification" | "classical-fallback";
  qubits: number;
  registerSize: number;
  goodStates: number;
  priorGoodMass: number;
  rounds: number;
  /** probability of measuring a consistent world after the amplification rounds */
  goodProbability: number;
  /** oracle calls made by this run */
  oracleQueries: number;
  /** expected oracle calls for an unstructured classical scan of the same register */
  classicalScanQueries: number;
  /** max |QIHS marginal - exact Bayesian marginal| over all dynamics and (dynamics,color,role) cells */
  agreement: number;
  /** goodProbability sampled along the rounds of this run */
  trajectory: { round: number; p: number }[];
  /** observation count this summary belongs to */
  observations: number;
}

export interface QihsResult {
  summary: QihsSummary;
  marginals: Marginals;
}

const MAX_WORK = 4e8;

export function runQihs(space: CandidateSpace): QihsResult {
  const exact = space.marginals();
  const m = space.colors.length;
  const R = Math.pow(5, m);
  const D = DYNAMICS.length;
  const N = D * R;
  const qubits = Math.ceil(Math.log2(N));
  const base = { qubits, registerSize: N, observations: space.observations };

  const fallback = (why: "budget" | "error"): QihsResult => ({
    marginals: exact,
    summary: {
      mode: "classical-fallback",
      ...base,
      goodStates: space.totalWorlds(),
      priorGoodMass: 0,
      rounds: 0,
      goodProbability: 1,
      oracleQueries: 0,
      classicalScanQueries: 0,
      agreement: 0,
      trajectory: [],
    },
    // `why` is kept for debugging only; behaviour is identical for callers.
    ...(why ? {} : {}),
  });

  try {
    const psi0 = new Float64Array(N);
    const good = new Uint8Array(N);
    let a = 0;
    let goodStates = 0;
    for (let d = 0; d < D; d++) {
      const amp = Math.sqrt(space.prior[d] / R);
      const alive = space.alive[d];
      const masks = space.masks[d];
      for (let r = 0; r < R; r++) {
        const i = d * R + r;
        psi0[i] = amp;
        if (!alive) continue;
        let x = r;
        let ok = true;
        for (let c = 0; c < m; c++) {
          const role = x % 5;
          x = (x - role) / 5;
          if ((masks[c] & bitOf(TERRAINS[role])) === 0) {
            ok = false;
            break;
          }
        }
        if (ok) {
          good[i] = 1;
          a += amp * amp;
          goodStates++;
        }
      }
    }
    if (goodStates === 0) return fallback("error");

    const theta = Math.asin(Math.min(1, Math.sqrt(a)));
    const rounds = a >= 1 - 1e-12 ? 0 : Math.max(0, Math.min(400, Math.round(Math.PI / (4 * theta) - 0.5)));
    if (rounds * N * 3 > MAX_WORK) return fallback("budget");

    const psi = Float64Array.from(psi0);
    const trajectory: { round: number; p: number }[] = [];
    const every = Math.max(1, Math.ceil(rounds / 24));
    const pGood = () => {
      let s = 0;
      for (let i = 0; i < N; i++) if (good[i]) s += psi[i] * psi[i];
      return s;
    };
    trajectory.push({ round: 0, p: a });
    for (let k = 1; k <= rounds; k++) {
      let ov = 0;
      for (let i = 0; i < N; i++) {
        if (good[i]) psi[i] = -psi[i];
        ov += psi0[i] * psi[i];
      }
      const two = 2 * ov;
      for (let i = 0; i < N; i++) psi[i] = two * psi0[i] - psi[i];
      if (k % every === 0 || k === rounds) trajectory.push({ round: k, p: pGood() });
    }
    const goodProbability = rounds === 0 ? a : pGood();

    // Born-rule marginals restricted to the consistent subspace.
    const dyn = new Array(D).fill(0) as number[];
    const joint = DYNAMICS.map(() => space.colors.map(() => TERRAINS.map(() => 0)));
    let z = 0;
    for (let d = 0; d < D; d++) {
      for (let r = 0; r < R; r++) {
        const i = d * R + r;
        if (!good[i]) continue;
        const p = psi[i] * psi[i];
        z += p;
        dyn[d] += p;
        let x = r;
        for (let c = 0; c < m; c++) {
          const role = x % 5;
          x = (x - role) / 5;
          joint[d][c][role] += p;
        }
      }
    }
    if (z <= 0) return fallback("error");
    let agreement = 0;
    for (let d = 0; d < D; d++) {
      dyn[d] /= z;
      agreement = Math.max(agreement, Math.abs(dyn[d] - exact.dyn[d]));
      for (let c = 0; c < m; c++)
        for (let t = 0; t < 5; t++) {
          joint[d][c][t] /= z;
          agreement = Math.max(agreement, Math.abs(joint[d][c][t] - exact.joint[d][c][t]));
        }
    }
    return {
      marginals: { dyn, joint },
      summary: {
        mode: "amplitude-amplification",
        ...base,
        goodStates,
        priorGoodMass: a,
        rounds,
        goodProbability,
        oracleQueries: rounds,
        classicalScanQueries: (N + 1) / (goodStates + 1),
        agreement,
        trajectory,
      },
    };
  } catch {
    return fallback("error");
  }
}

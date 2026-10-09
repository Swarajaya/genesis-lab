"use client";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { QuantumViz } from "@/components/3d/nutrition/LabViz";
import { WEIGHTS } from "@/lib/engines/quantum/objective";
import type { QCandidate, QuantumResult } from "@/lib/engines/quantum";
import { pct } from "./labModel";

export function quantumPhase(p: number, running: boolean, played: boolean): string {
  if (!played && !running) return "STATE SPACE READY";
  if (p < 0.1) return "INITIALIZING QUANTUM STATE SPACE";
  if (p < 0.5) return "EXPLORING CANDIDATE STATES";
  if (p < 0.85) return "OPTIMIZING";
  if (p < 1 || running) return "STATE CONVERGED";
  return "OPTIMAL MEAL FOUND";
}

function Metric({ label, v, hot }: { label: string; v: number; hot?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="wg-tag !text-white/50">{label}</span>
        <span className="wg-mono text-sm tabular-nums text-white/90">{v.toFixed(2)}</span>
      </div>
      <div className="wg-bar mt-1"><i style={{ width: `${Math.round(v * 100)}%`, background: hot ? "linear-gradient(90deg,#9be86a,#d9ff9f)" : undefined }} /></div>
    </div>
  );
}

function Convergence({ q, step }: { q: QuantumResult; step: number }) {
  const W = 300, H = 70;
  const pts = q.trace.map((t) => `${(t.step / q.steps) * W},${H - t.pOptimal * (H - 6) - 3}`).join(" ");
  const cur = q.trace[Math.min(step, q.trace.length - 1)];
  const cx = (cur.step / q.steps) * W, cy = H - cur.pOptimal * (H - 6) - 3;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" role="img" aria-label="Probability of the optimal state across evolution steps">
      <line x1="0" y1={H - 3} x2={W} y2={H - 3} stroke="#7be0d0" strokeOpacity="0.25" />
      <polyline points={pts} fill="none" stroke="#7be0d0" strokeOpacity="0.35" strokeWidth="1.2" />
      <polyline points={q.trace.slice(0, step + 1).map((t) => `${(t.step / q.steps) * W},${H - t.pOptimal * (H - 6) - 3}`).join(" ")} fill="none" stroke="#9be86a" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="3.5" fill="#9be86a" />
    </svg>
  );
}

function Landscape({ q }: { q: QuantumResult }) {
  const max = Math.max(...q.energyHistogram, 1);
  const w = 300 / q.energyHistogram.length;
  return (
    <svg viewBox="0 0 300 56" className="h-14 w-full" role="img" aria-label="Energy landscape: number of candidate states at each energy level">
      {q.energyHistogram.map((c, i) => {
        const h = (c / max) * 46;
        const opt = i === q.optimalBin;
        return <rect key={i} x={i * w + 1} y={52 - h} width={w - 2} height={Math.max(h, c ? 1.5 : 0)} fill={opt ? "#9be86a" : "#8f7bff"} fillOpacity={opt ? 1 : 0.55} />;
      })}
      <line x1="0" y1="52" x2="300" y2="52" stroke="#7be0d0" strokeOpacity="0.3" />
    </svg>
  );
}

export function QuantumCore({ quantum, progress, running, played, onReplay }: { quantum: QuantumResult | null; progress: number; running: boolean; played: boolean; onReplay: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  if (!quantum || quantum.qubits === 0) {
    return (
      <section aria-label="Quantum optimization core" className="wg-panel p-6">
        <p className="wg-tag">02 · Quantum optimization core</p>
        <h2 className="mt-2 text-3xl font-extralight uppercase tracking-[0.12em]">Quantum-inspired meal optimization</h2>
        <div className="relative mt-5 flex min-h-[14rem] items-center justify-center overflow-hidden border border-dashed border-[color:var(--wg-line)]">
          <div className="wg-scanline" aria-hidden />
          <p className="wg-mono px-6 text-center text-sm uppercase tracking-[0.2em] text-white/45">
            {quantum ? "Not enough ingredients to build a state space" : "Awaiting food matter · the state space is built from your ingredients and the designed meals"}
          </p>
        </div>
      </section>
    );
  }

  const step = Math.round(progress * quantum.steps);
  const cur = quantum.trace[step];
  const optimal = quantum.candidates.find((c) => c.optimal) ?? quantum.candidates[0];
  const shown: QCandidate = picked !== null ? quantum.candidates[picked] : optimal;
  const phase = quantumPhase(progress, running, played);
  const probOf = (c: QCandidate) => quantum.nodes.find((n) => n.bits === c.bits)?.probs[step] ?? c.probability;

  return (
    <section aria-label="Quantum optimization core" className="wg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="wg-tag">02 · Quantum optimization core</p>
          <h2 className="mt-2 text-3xl font-extralight uppercase tracking-[0.12em] sm:text-4xl">Quantum-inspired meal optimization</h2>
        </div>
        <button type="button" className="wg-btn-ghost" onClick={onReplay} disabled={running}>
          <RotateCcw className="h-3 w-3" aria-hidden /> Replay
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="relative overflow-hidden border border-[color:var(--wg-line)] bg-black/50">
          <div className="h-[24rem] w-full sm:h-[36rem]">
            <QuantumViz quantum={quantum} progress={progress} />
          </div>
          <div className="pointer-events-none absolute left-3 top-3" aria-live="polite">
            <p className="wg-tag">Quantum state space</p>
            <p className={`wg-mono mt-1 text-base tracking-[0.16em] ${phase === "OPTIMAL MEAL FOUND" ? "text-[color:var(--wg-green)]" : "text-white/90"}`}>{phase}</p>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2">
            <p className="wg-mono text-[0.78rem] uppercase tracking-[0.16em] text-white/45">
              Funnel height = energy · bars = state probability · edges = one-ingredient flips
            </p>
            <p className="wg-mono text-[0.88rem] tabular-nums tracking-[0.12em] text-white/80">
              STEP {String(step).padStart(2, "0")}/{quantum.steps} · CONVERGENCE <span className="text-[color:var(--wg-green)]">{pct(cur.pOptimal)}%</span>
            </p>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <p className="wg-tag">Candidate meal states</p>
            <ul className="mt-2 space-y-1.5" aria-label="Candidate states ranked by measurement probability">
              {quantum.candidates.map((c, i) => {
                const active = shown.bits === c.bits;
                return (
                  <li key={c.bits}>
                    <button type="button" onClick={() => setPicked(i)} aria-pressed={active} className={`w-full border px-3 py-2 text-left transition ${active ? "border-[color:var(--wg-cyan)] bg-[rgb(123_224_208/0.07)]" : "border-[color:var(--wg-line)] hover:border-white/25"}`}>
                      <div className="flex items-center gap-3">
                        <span className="wg-mono text-[0.88rem] tracking-[0.16em] text-white/80">STATE {String(c.rank).padStart(2, "0")}</span>
                        <span className="wg-mono text-[0.78rem] tracking-[0.1em] text-white/35">|{c.bits}⟩</span>
                        <span className={`wg-mono ml-auto text-base tabular-nums ${c.optimal ? "text-[color:var(--wg-green)]" : "text-white/85"}`}>{c.scores.overall.toFixed(2)}</span>
                        {c.optimal && <span className="wg-mono text-[0.78rem] tracking-[0.14em] text-[color:var(--wg-green)]">← OPTIMAL</span>}
                      </div>
                      <div className="wg-bar mt-1.5"><i style={{ width: `${Math.round(c.scores.overall * 100)}%`, background: c.optimal ? "linear-gradient(90deg,#9be86a,#d9ff9f)" : undefined }} /></div>
                      <p className="mt-1.5 truncate text-[0.88rem] text-white/45">
                        P {pct(probOf(c))}% · {c.ingredients.join(" + ") || "empty"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border border-[color:var(--wg-line)] p-3">
            <p className="wg-tag">Objective scores · state {String(shown.rank).padStart(2, "0")}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <Metric label="Nutrition score" v={shown.scores.nutrition} />
              <Metric label="Waste utilization" v={shown.scores.waste} />
              <Metric label="Ingredient coverage" v={shown.scores.coverage} />
              <Metric label="Serving fit" v={shown.scores.serving} />
              <Metric label="Meal compatibility" v={shown.scores.compatibility} />
              <Metric label="Missing penalty" v={shown.scores.penalty} />
            </div>
            <div className="mt-3"><Metric label="Overall score" v={shown.scores.overall} hot /></div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="border border-[color:var(--wg-line)] p-3">
          <div className="flex items-baseline justify-between">
            <p className="wg-tag">Convergence · P(optimal state)</p>
            <p className="wg-mono text-sm tabular-nums text-white/80">⟨H⟩ {cur.meanEnergy.toFixed(3)}</p>
          </div>
          <Convergence q={quantum} step={step} />
        </div>
        <div className="border border-[color:var(--wg-line)] p-3">
          <div className="flex items-baseline justify-between">
            <p className="wg-tag">Energy landscape · {quantum.stateCount} states</p>
            <p className="wg-mono text-sm tabular-nums text-white/80">H {quantum.energyMin.toFixed(2)} → {quantum.energyMax.toFixed(2)}</p>
          </div>
          <Landscape q={quantum} />
        </div>
      </div>

      <p className="wg-mono mt-4 text-[0.8rem] leading-relaxed tracking-[0.08em] text-white/45">
        OBJECTIVE FUNCTION J = {WEIGHTS.nutrition}·nutrition + {WEIGHTS.waste}·waste + {WEIGHTS.coverage}·coverage + {WEIGHTS.serving}·serving + {WEIGHTS.compatibility}·compatibility − {WEIGHTS.penalty}·missing · ENERGY H = 1 − J ·{" "}
        {quantum.qubits} qubits (one per ingredient) · {quantum.stateCount} basis states · {quantum.steps} annealing steps · {quantum.ms} ms ·{" "}
        {quantum.matchesExhaustive ? "converged state matches the exhaustive optimum" : "converged state differs from the exhaustive optimum"} · quantum-inspired state-vector simulation on a classical CPU, not quantum hardware.
        {quantum.overflow.length > 0 && ` ${quantum.overflow.length} smaller ingredient(s) were left outside the state space.`}
      </p>
    </section>
  );
}

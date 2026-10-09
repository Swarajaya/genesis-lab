"use client";
import { Play } from "lucide-react";
import { useMemo } from "react";
import { SynthesisViz } from "@/components/3d/nutrition/LabViz";
import { SYNTH_LABELS } from "@/components/3d/nutrition/labTypes";
import { synthItems, synthMeal } from "./labModel";
import type { NutritionResult } from "./types";

export function SynthesisPanel({ result, mealIdx, onMeal, armed, runId, phase, done, onPhase, onPlay }: { result: NutritionResult | null; mealIdx: number; onMeal: (i: number) => void; armed: boolean; runId: number; phase: number; done: boolean; onPhase: (p: number, d: boolean) => void; onPlay: () => void }) {
  const meal = result ? result.meals[Math.min(mealIdx, result.meals.length - 1)] : null;
  const items = useMemo(() => (result && meal ? synthItems(result, meal) : []), [result, meal]);
  const sm = useMemo(() => (meal ? synthMeal(meal) : null), [meal]);
  const score = result?.quantum?.meals.find((m) => m.mealIndex === mealIdx);
  const isBest = result?.quantum ? result.quantum.bestMealIndex === mealIdx : false;

  return (
    <section aria-label="Optimal state and meal materialization" className="wg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="wg-tag">03 · Optimal state → meal materialization</p>
          <h2 className="mt-2 text-3xl font-extralight uppercase tracking-[0.12em] sm:text-4xl">{meal && armed ? meal.name : "3D food synthesis"}</h2>
        </div>
        {meal && armed && (
          <button type="button" className="wg-btn-ghost" onClick={onPlay}>
            <Play className="h-3 w-3" aria-hidden /> Replay sequence
          </button>
        )}
      </div>

      {result && result.meals.length > 1 && (
        <div role="tablist" aria-label="Generated meals" className="mt-4 flex flex-wrap gap-2">
          {result.meals.map((m, i) => (
            <button
              key={`${m.name}-${i}`}
              id={`meal-tab-${i}`}
              role="tab"
              aria-selected={i === mealIdx}
              tabIndex={i === mealIdx ? 0 : -1}
              onClick={() => onMeal(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const n = (i + (e.key === "ArrowRight" ? 1 : result.meals.length - 1)) % result.meals.length;
                  onMeal(n);
                  document.getElementById(`meal-tab-${n}`)?.focus();
                }
              }}
              className={`wg-mono border px-3.5 py-2 text-[0.88rem] uppercase tracking-[0.16em] transition ${i === mealIdx ? "border-[color:var(--wg-green)] bg-[rgb(155_232_106/0.14)] text-white" : "border-[color:var(--wg-line)] text-white/55 hover:text-white"}`}
            >
              {m.name}
              {result.quantum && result.quantum.bestMealIndex === i && <span className="ml-2 text-[color:var(--wg-green)]">★</span>}
            </button>
          ))}
        </div>
      )}

      <div className="relative mt-4 overflow-hidden border border-[color:var(--wg-line)] bg-black/50">
        <div className="h-[24rem] w-full sm:h-[44rem]">
          {meal && sm && armed ? (
            <SynthesisViz items={items} meal={sm} runId={runId} onPhase={onPhase} />
          ) : (
            <div className="relative flex h-full flex-col items-center justify-center gap-4">
              <div className="wg-scanline" aria-hidden />
              <p className="wg-mono px-6 text-center text-sm uppercase tracking-[0.2em] text-white/40">{meal ? "Optimal state computed · synthesis armed" : "Awaiting optimal state"}</p>
              {meal && (
                <button type="button" className="wg-btn-ghost relative" onClick={onPlay}>
                  <Play className="h-3 w-3" aria-hidden /> Play sequence
                </button>
              )}
            </div>
          )}
        </div>
        {meal && armed && (
          <div className="pointer-events-none absolute left-3 top-3" aria-live="polite">
            <p className="wg-tag">Transformation {done ? "complete" : "running"}</p>
            <p className={`wg-mono mt-1 text-base tracking-[0.16em] ${done ? "text-[color:var(--wg-green)]" : "text-white/90"}`}>
              {String(Math.min(phase, 6) + 1).padStart(2, "0")} — {SYNTH_LABELS[Math.min(phase, 6)]}
            </p>
          </div>
        )}
      </div>

      <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Transformation sequence">
        {SYNTH_LABELS.map((l, i) => {
          const on = armed && (done || i <= phase);
          return (
            <li key={l} className="border-t border-[color:var(--wg-line)] pt-2">
              <span className="wg-mono text-[0.76rem] tracking-[0.18em]" style={{ color: on ? "#9be86a" : "rgb(255 255 255 / 0.3)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className={`wg-mono text-[0.78rem] uppercase leading-snug tracking-[0.1em] ${on ? "text-white/85" : "text-white/30"}`}>{l}</p>
            </li>
          );
        })}
      </ol>

      {meal && (
        <div className="mt-5 grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <p className="text-base font-light leading-relaxed text-white/70">{meal.description}</p>
          <dl className="wg-mono grid grid-cols-3 gap-3 text-[0.8rem] uppercase tracking-[0.14em]">
            <div><dt className="text-white/40">Objective</dt><dd className="mt-0.5 text-xl tabular-nums text-white">{score ? score.scores.overall.toFixed(2) : "–"}</dd></div>
            <div><dt className="text-white/40">Alignment</dt><dd className="mt-0.5 text-xl tabular-nums text-white">{score ? `${Math.round(score.alignment * 100)}%` : "–"}</dd></div>
            <div><dt className="text-white/40">Rank</dt><dd className="mt-0.5 text-xl text-[color:var(--wg-green)]">{result?.quantum ? (isBest ? "OPTIMAL" : "ALT") : "–"}</dd></div>
          </dl>
        </div>
      )}
    </section>
  );
}

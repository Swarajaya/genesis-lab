"use client";
import { Fragment, useMemo } from "react";
import { CO2E_PER_KG_FOOD_WASTE } from "@/lib/engines/nutrition/foods";
import { isStaple } from "@/lib/engines/quantum/objective";
import type { MealResult, NutritionResult } from "./types";

const Empty = ({ children }: { children: string }) => <p className="wg-mono py-6 text-center text-sm uppercase tracking-[0.2em] text-white/35">{children}</p>;

function Cell({ label, value, unit, hot }: { label: string; value: string | number; unit?: string; hot?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="wg-tag !text-white/45">{label}</p>
      <p className={`mt-1 text-4xl font-extralight tabular-nums sm:text-5xl ${hot ? "text-[color:var(--wg-green)]" : ""}`}>
        {value}
        {unit && <span className="wg-mono ml-1 text-sm text-white/45">{unit}</span>}
      </p>
    </div>
  );
}

export function RecoveryPanel({ result, meal }: { result: NutritionResult | null; meal: MealResult | null }) {
  const waste = result ? result.ingredients.reduce((s, i) => s + i.grams, 0) : 0;
  const rec = meal?.wasteDivertedG ?? 0;
  const co2 = Math.round((rec / 1000) * CO2E_PER_KG_FOOD_WASTE * 100) / 100;
  const share = waste > 0 ? Math.min(1, rec / waste) : 0;
  return (
    <section aria-label="Recovery" className="wg-panel p-5 sm:p-6">
      <p className="wg-tag">04 · Recovery</p>
      {result && meal ? (
        <>
          <div className="mt-4 grid grid-cols-2 items-start gap-5 md:grid-cols-4">
            <Cell label="Waste mass" value={waste} unit="g" />
            <Cell label="↓ Recovered food" value={rec} unit="g" hot />
            <Cell label="↓ Servings" value={meal.servings} />
            <Cell label="↓ CO₂e impact" value={`≈ ${co2}`} unit="kg avoided" hot />
          </div>
          <div className="wg-bar mt-5"><i style={{ width: `${Math.round(share * 100)}%` }} /></div>
          <p className="wg-mono mt-2 text-[0.78rem] tracking-[0.1em] text-white/35">
            {Math.round(share * 100)}% OF DETECTED MASS RECOVERED IN THIS MEAL · CO₂E USES AN INDICATIVE {CO2E_PER_KG_FOOD_WASTE} KG PER KG OF FOOD WASTE
          </p>
        </>
      ) : (
        <Empty>Awaiting optimal meal</Empty>
      )}
    </section>
  );
}

export function NutritionMatrix({ result, meal }: { result: NutritionResult | null; meal: MealResult | null }) {
  const split = useMemo(() => {
    if (!meal) return null;
    const p = meal.perServing.protein * 4, c = meal.perServing.carbs * 4, f = meal.perServing.fat * 9;
    const t = p + c + f;
    return t > 0 ? { p: p / t, c: c / t, f: f / t } : null;
  }, [meal]);
  return (
    <section aria-label="Nutrition matrix" className="wg-panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="wg-tag">05 · Nutrition matrix · per serving</p>
        {meal && <p className="wg-mono text-[0.76rem] tracking-[0.14em] text-white/30">EST.</p>}
      </div>
      {meal ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-5">
            <Cell label="Calories" value={meal.perServing.kcal} unit="kcal" />
            <Cell label="Protein" value={meal.perServing.protein} unit="g" />
            <Cell label="Carbs" value={meal.perServing.carbs} unit="g" />
            <Cell label="Fat" value={meal.perServing.fat} unit="g" />
            <Cell label="Fiber" value={meal.perServing.fiber} unit="g" />
          </div>
          {split && (
            <div className="mt-5" aria-label="Energy share of protein, carbs and fat">
              <div className="flex h-2 overflow-hidden">
                <i style={{ width: `${split.p * 100}%`, background: "#7be0d0" }} />
                <i style={{ width: `${split.c * 100}%`, background: "#8f7bff" }} />
                <i style={{ width: `${split.f * 100}%`, background: "#9be86a" }} />
              </div>
              <p className="wg-mono mt-1.5 text-[0.78rem] tracking-[0.12em] text-white/45">
                ENERGY SHARE · PROTEIN {Math.round(split.p * 100)}% · CARBS {Math.round(split.c * 100)}% · FAT {Math.round(split.f * 100)}%
              </p>
            </div>
          )}
          <dl className="mt-5 grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="wg-tag">Ingredient</dt>
            <dd className="wg-tag text-right">Grams</dd>
            <dd className="wg-tag">Source</dd>
            {meal.lines.map((l, i) => (
              <Fragment key={`${l.name}-${i}`}>
                <dt className="truncate text-white/65">{l.name}</dt>
                <dd className="wg-mono text-right tabular-nums">{l.grams}</dd>
                <dd className="wg-mono text-[0.78rem] tracking-[0.1em] text-white/40">{l.source === "reference-table" ? "REFERENCE" : "AI EST."}</dd>
              </Fragment>
            ))}
          </dl>
          <p className="mt-4 text-[0.78rem] leading-relaxed text-white/30">
            Estimated from approximate per-100 g reference values and estimated ingredient weights; not dietary advice. Whole recipe {meal.total.kcal} kcal over {meal.total.grams} g.
            {meal.unknownNutrition.length > 0 && ` No nutrition data for ${meal.unknownNutrition.join(", ")}; not counted.`}
            {result && result.notes.length > 2 && ` ${result.notes[2]}`}
          </p>
        </>
      ) : (
        <Empty>Awaiting optimal meal</Empty>
      )}
    </section>
  );
}

const same = (a: string, b: string) => {
  const x = a.toLowerCase(), y = b.toLowerCase();
  return x === y || x.includes(y) || y.includes(x);
};

export function ReasoningPanel({ result, meal, mealIdx }: { result: NutritionResult | null; meal: MealResult | null; mealIdx: number }) {
  if (!result || !meal)
    return (
      <section aria-label="AI reasoning" className="wg-panel p-5 sm:p-6">
        <p className="wg-tag">06 · AI reasoning · why this meal?</p>
        <Empty>Awaiting optimal meal</Empty>
      </section>
    );
  const q = result.quantum;
  const real = meal.lines.filter((l) => !isStaple(l.name));
  const usedDetected = result.ingredients.filter((i) => real.some((l) => same(l.name, i.name)));
  const usedG = usedDetected.reduce((s, i) => s + i.grams, 0);
  const totalG = result.ingredients.reduce((s, i) => s + i.grams, 0);
  const missing = real.filter((l) => !result.ingredients.some((i) => same(l.name, i.name))).map((l) => l.name);
  const score = q?.meals.find((m) => m.mealIndex === mealIdx);
  const rank = q ? [...q.meals].sort((a, b) => b.scores.overall - a.scores.overall).findIndex((m) => m.mealIndex === mealIdx) + 1 : 0;
  const optimal = q?.candidates.find((c) => c.optimal);
  const facts: string[] = [
    `Uses ${usedDetected.length} of ${result.ingredients.length} detected ingredients (${usedG} g of ${totalG} g).`,
    ...(score && q ? [`Objective score ${score.scores.overall.toFixed(2)}, ranked ${rank} of ${q.meals.length} designed meals; ${Math.round(score.alignment * 100)}% overlap with the optimizer's converged state.`] : []),
    ...(optimal ? [`Converged state: ${optimal.ingredients.join(" + ")} (score ${optimal.scores.overall.toFixed(2)}).`] : []),
    missing.length ? `Needs ${missing.join(", ")}, which was not in your input.` : "Needs nothing beyond the detected ingredients and pantry staples.",
  ];
  return (
    <section aria-label="AI reasoning" className="wg-panel p-5 sm:p-6">
      <p className="wg-tag">06 · AI reasoning · why this meal?</p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_1fr_1fr]">
        <div>
          <h3 className="text-2xl font-extralight tracking-wide">{meal.name}</h3>
          <p className="mt-2 text-base font-light leading-relaxed text-white/65">{meal.description}</p>
          <ul className="mt-4 space-y-2 text-base text-white/75">
            {facts.map((f) => (
              <li key={f} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 bg-[color:var(--wg-cyan)]" aria-hidden />{f}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="wg-tag">Steps · {meal.timeMinutes} min</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-base text-white/65 marker:text-white/30">
            {meal.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
        <div>
          <p className="wg-tag">Substitutions</p>
          {meal.substitutions.length ? (
            <ul className="mt-2 list-disc space-y-2 pl-5 text-base text-white/65 marker:text-white/30">
              {meal.substitutions.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-base text-white/35">No substitutions suggested for this meal.</p>
          )}
        </div>
      </div>
    </section>
  );
}

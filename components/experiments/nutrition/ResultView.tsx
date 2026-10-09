"use client";
import { motion, useReducedMotion } from "framer-motion";
import { Fragment, useMemo, useState } from "react";
import { FoodViz } from "@/components/3d/nutrition/FoodViz";
import { BLOB_COLORS } from "@/components/3d/nutrition/FoodScene";
import { Glass } from "@/components/ui/Glass";
import { Notice } from "@/components/ui/Badges";
import type { FoodBlob, MealResult, NutritionResult } from "./types";

const HUE = "#9be86a";

function Stage({ n, title, delay, children }: { n: number; title: string; delay: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: reduce ? 0 : delay }} className="glass min-w-0 rounded-2xl p-4">
      <span className="label" style={{ color: HUE }}>
        {String(n).padStart(2, "0")} · {title}
      </span>
      <div className="mt-2 text-sm">{children}</div>
    </motion.div>
  );
}

function Macro({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-2">
      <div className="label">{label}</div>
      <div className="mt-0.5 text-lg tabular-nums">
        {value}
        <span className="ml-0.5 text-xs text-dim">{unit}</span>
      </div>
    </div>
  );
}

export function ResultView({ result }: { result: NutritionResult }) {
  const [mealIdx, setMealIdx] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const meal: MealResult = result.meals[Math.min(mealIdx, result.meals.length - 1)];
  const blobs: FoodBlob[] = useMemo(() => meal.lines.map((l) => ({ name: l.name, grams: l.grams, source: l.source })), [meal]);
  const sel = selected !== null ? meal.lines[selected] : null;
  const reduce = useReducedMotion();
  const saved = typeof result.saved === "boolean" ? result.saved : null;

  function pickMeal(i: number) {
    setMealIdx(i);
    setSelected(null);
    setHovered(null);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Stage n={1} title="Waste" delay={0}>
          <p className="text-2xl tabular-nums">{result.ingredients.reduce((s, i) => s + i.grams, 0)} g</p>
          <p className="text-xs text-dim">of food in danger of being thrown away</p>
        </Stage>
        <Stage n={2} title="Ingredients" delay={0.12}>
          <ul className="space-y-1">
            {result.ingredients.map((i) => (
              <li key={`${i.name}-${i.source}`} className="flex items-baseline justify-between gap-2">
                <span className="truncate">{i.name}</span>
                <span className="shrink-0 tabular-nums text-dim">
                  {i.grams} g <span className="text-xs text-faint">{i.source === "image" ? "photo est." : "assumed"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Stage>
        <Stage n={3} title="Nutrition (estimate)" delay={0.24}>
          <p className="tabular-nums">
            {meal.perServing.kcal} <span className="text-dim">kcal / serving</span>
          </p>
          <p className="mt-1 text-xs text-dim">
            P {meal.perServing.protein} g · C {meal.perServing.carbs} g · F {meal.perServing.fat} g
          </p>
          <p className="mt-1 text-xs text-faint">Computed server-side from per-100 g values.</p>
        </Stage>
        <Stage n={4} title="Meal" delay={0.36}>
          <p>{meal.name}</p>
          <p className="mt-1 text-xs text-dim">
            {meal.servings} servings · {meal.timeMinutes} min
          </p>
        </Stage>
        <Stage n={5} title="Waste avoided" delay={0.48}>
          <p className="text-2xl tabular-nums" style={{ color: HUE }}>
            {result.wasteDivertedG} g
          </p>
          <p className="text-xs text-dim">≈ {result.co2eAvoidedKg} kg CO2e (indicative)</p>
        </Stage>
      </div>

      {result.meals.length > 1 && (
        <div role="tablist" aria-label="Generated meals" className="flex flex-wrap gap-2">
          {result.meals.map((m, i) => (
            <button
              key={`${m.name}-${i}`}
              id={`meal-tab-${i}`}
              role="tab"
              aria-selected={i === mealIdx}
              aria-controls="meal-panel"
              tabIndex={i === mealIdx ? 0 : -1}
              onClick={() => pickMeal(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  const n = (i + (e.key === "ArrowRight" ? 1 : result.meals.length - 1)) % result.meals.length;
                  pickMeal(n);
                  document.getElementById(`meal-tab-${n}`)?.focus();
                }
              }}
              className={`rounded-full border px-4 py-2 text-sm transition ${i === mealIdx ? "border-transparent text-[#04110e]" : "border-line text-dim hover:text-text"}`}
              style={i === mealIdx ? { background: HUE } : undefined}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      <motion.div key={mealIdx} id="meal-panel" role="tabpanel" aria-labelledby={result.meals.length > 1 ? `meal-tab-${mealIdx}` : undefined} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Glass className="overflow-hidden p-4">
          <span className="label">Meal composition · sized by grams</span>
          <FoodViz blobs={blobs} hovered={hovered} selected={selected} onHover={setHovered} onSelect={(i) => setSelected((c) => (c === i ? null : i))} />
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Ingredients in this meal">
            {meal.lines.map((l, i) => (
              <li key={`${l.name}-${i}`}>
                <button type="button" aria-pressed={selected === i} onClick={() => setSelected((c) => (c === i ? null : i))} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${selected === i ? "border-white/40 text-text" : "border-line text-dim hover:text-text"}`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: BLOB_COLORS[i % BLOB_COLORS.length] }} aria-hidden />
                  {l.name} · {l.grams} g
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 min-h-[3.25rem] rounded-xl border border-line bg-white/[0.02] p-3 text-xs text-dim" aria-live="polite">
            {sel ? (
              <>
                <span className="text-text">{sel.name}</span>, {sel.grams} g: {Math.round((sel.nutrition.kcal * sel.grams) / 100)} kcal, {Math.round(((sel.nutrition.protein * sel.grams) / 100) * 10) / 10} g protein. Source:{" "}
                {sel.source === "reference-table" ? "reference table (approximate per-100 g values)" : "AI estimate (lower confidence)"}.
              </>
            ) : (
              "Select an ingredient to see its contribution."
            )}
          </div>
        </Glass>

        <Glass className="p-5">
          <h3 className="text-xl font-light">{meal.name}</h3>
          <p className="mt-1 text-sm text-dim">{meal.description}</p>
          <div className="mt-4 flex items-center gap-2">
            <span className="label">Per serving</span>
            <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-warn">Estimate</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Macro label="Energy" value={meal.perServing.kcal} unit="kcal" />
            <Macro label="Protein" value={meal.perServing.protein} unit="g" />
            <Macro label="Carbs" value={meal.perServing.carbs} unit="g" />
            <Macro label="Fat" value={meal.perServing.fat} unit="g" />
            <Macro label="Fiber" value={meal.perServing.fiber} unit="g" />
          </div>
          <p className="mt-2 text-xs text-faint">
            Whole recipe: {meal.total.kcal} kcal over {meal.total.grams} g. Meal uses {meal.wasteDivertedG} g of your would-be waste.
          </p>
          {meal.unknownNutrition.length > 0 && <p className="mt-2 text-xs text-warn">No nutrition data for: {meal.unknownNutrition.join(", ")}. These are not counted in the totals.</p>}
          <dl className="mt-3 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs">
            <dt className="label">Ingredient</dt>
            <dd className="label text-right">Grams</dd>
            <dd className="label">Source</dd>
            {meal.lines.map((l, i) => (
              <Fragment key={`${l.name}-${i}`}>
                <dt className="truncate text-dim">{l.name}</dt>
                <dd className="text-right tabular-nums">{l.grams}</dd>
                <dd className={l.source === "reference-table" ? "text-ok" : "text-warn"}>{l.source === "reference-table" ? "reference" : "AI estimate"}</dd>
              </Fragment>
            ))}
          </dl>
        </Glass>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-2">
        <Glass className="p-5">
          <span className="label">Steps</span>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-dim marker:text-faint">
            {meal.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </Glass>
        <Glass className="p-5">
          <span className="label">Substitutions</span>
          {meal.substitutions.length ? (
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-dim marker:text-faint">
              {meal.substitutions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-faint">No substitutions suggested for this meal.</p>
          )}
        </Glass>
      </div>

      <div className="space-y-2">
        {result.notes.map((n, i) => (
          <Notice key={i}>{n}</Notice>
        ))}
        <p className="text-xs text-faint">
          {result.provider ? `Meals designed by ${result.provider}. ` : ""}
          {saved === null ? "" : saved ? "This run was saved to Supabase." : "This run was not saved (storage unavailable)."}
        </p>
      </div>
    </div>
  );
}

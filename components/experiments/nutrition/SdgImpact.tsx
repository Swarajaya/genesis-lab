"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { CO2E_PER_KG_FOOD_WASTE } from "@/lib/engines/nutrition/foods";
import type { ExperimentMeta } from "@/lib/experiments";
import { SDGS } from "@/lib/sdgs";
import type { MealResult, NutritionResult } from "./types";

function Tile({ id, big, active, onActivate }: { id: number; big: boolean; active: boolean; onActivate: () => void }) {
  const sdg = SDGS[id];
  return (
    <motion.button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      aria-label={`SDG ${id}: ${sdg.title}`}
      whileHover={{ y: -6 }}
      animate={{ scale: active ? 1.04 : 1 }}
      transition={{ duration: 0.3 }}
      className={`relative flex flex-col justify-between overflow-hidden p-4 text-left ${big ? "h-44 w-44 sm:h-52 sm:w-52 xl:h-60 xl:w-60" : "h-36 w-36 sm:h-40 sm:w-40 xl:h-44 xl:w-44"}`}
      style={{ background: `linear-gradient(160deg, ${sdg.color}, ${sdg.color}aa)`, boxShadow: active ? `0 0 0 2px #fff, 0 28px 70px -24px ${sdg.color}` : `0 18px 50px -30px ${sdg.color}` }}
    >
      <span className={`font-semibold leading-none text-white ${big ? "text-7xl xl:text-8xl" : "text-5xl xl:text-6xl"}`}>{id}</span>
      <span className={`font-semibold uppercase leading-tight tracking-wide text-white ${big ? "text-base xl:text-lg" : "text-sm"}`}>{sdg.title}</span>
    </motion.button>
  );
}

/** What this experiment does for each goal. Numbers are filled from the current run when one exists. */
function story(id: number, r: NutritionResult | null, meal: MealResult | null): { how: string; stat: string | null } {
  const waste = r ? r.ingredients.reduce((s, i) => s + i.grams, 0) : 0;
  const rec = meal?.wasteDivertedG ?? 0;
  const co2 = Math.round((rec / 1000) * CO2E_PER_KG_FOOD_WASTE * 100) / 100;
  const share = waste > 0 ? Math.round((Math.min(rec, waste) / waste) * 100) : 0;
  switch (id) {
    case 2:
      return {
        how: "Food that is already bought or cooked is still nutrition. The lab reads what is about to be thrown away and designs complete, portioned meals from it, so the same groceries feed more people for longer. It is a small tool for the hunger side of the goal: making full use of the food a household already has.",
        stat: meal ? `This run: ${meal.servings} serving${meal.servings === 1 ? "" : "s"} from ${rec} g of food that would have been discarded.` : null,
      };
    case 12:
      return {
        how: "SDG 12.3 aims to halve per-capita food waste at retail and consumer level by 2030. Here, waste is the input, not the by-product: the optimizer scores every candidate meal on how much of the discarded mass it actually uses, and prefers recipes that leave less behind.",
        stat: meal ? `This run: ${share}% of the ${waste} g detected is recovered in the selected meal.` : null,
      };
    case 3:
      return {
        how: "Using up leftovers should not mean eating worse. Each meal is checked for calories, protein, fibre and macro balance per serving, so the zero-waste option is also a reasonably balanced one. Values are estimates from approximate reference data, not dietary advice.",
        stat: meal ? `This run: about ${meal.perServing.kcal} kcal, ${meal.perServing.protein} g protein and ${meal.perServing.fiber} g fibre per serving (estimate).` : null,
      };
    case 13:
      return {
        how: "Food that ends up in landfill decomposes and releases methane, and all the energy that went into growing and moving it is wasted too. The lab estimates the emissions avoided when that food is eaten instead, using an indicative factor, so the figure shows the direction and scale rather than a precise audit.",
        stat: meal ? `This run: roughly ${co2} kg CO₂e avoided, using an indicative ${CO2E_PER_KG_FOOD_WASTE} kg CO₂e per kg of food waste.` : null,
      };
    default:
      return { how: "", stat: null };
  }
}

export function SdgImpact({ meta, result, meal }: { meta: ExperimentMeta; result: NutritionResult | null; meal: MealResult | null }) {
  const [active, setActive] = useState<number>(meta.primarySdgs[0]);
  const rel = meta.primarySdgs.includes(active) ? "Primary goal" : "Supporting goal";
  const s = story(active, result, meal);
  return (
    <section aria-label="SDG impact" className="wg-panel p-6 sm:p-8 xl:p-10">
      <p className="wg-tag">07 · SDG impact</p>
      <p className="mt-3 max-w-5xl text-xl font-light leading-relaxed text-white/85 xl:text-2xl">{meta.impact}</p>
      <div className="mt-8 grid gap-10 xl:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="wg-tag">Primary goals</p>
          <div className="mt-4 flex flex-wrap gap-5">
            {meta.primarySdgs.map((id) => (
              <Tile key={id} id={id} big active={active === id} onActivate={() => setActive(id)} />
            ))}
          </div>
          <p className="wg-tag mt-8">Supporting goals</p>
          <div className="mt-4 flex flex-wrap gap-4">
            {meta.secondarySdgs.map((id) => (
              <Tile key={id} id={id} big={false} active={active === id} onActivate={() => setActive(id)} />
            ))}
          </div>
        </div>
        <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} aria-live="polite" className="flex flex-col gap-5 border-l-2 pl-6" style={{ borderColor: SDGS[active].color }}>
          <div>
            <p className="wg-tag" style={{ color: SDGS[active].color }}>
              {rel} · SDG {active}
            </p>
            <h3 className="mt-2 text-3xl font-light xl:text-4xl">{SDGS[active].title}</h3>
          </div>
          <p className="text-lg font-light leading-relaxed text-white/90">{meta.sdgReason[active]}</p>
          <p className="text-base leading-relaxed text-white/65">{s.how}</p>
          {s.stat && <p className="wg-mono border border-[color:var(--wg-line)] bg-[rgb(123_224_208/0.06)] p-4 text-sm leading-relaxed tracking-wide text-[color:var(--wg-green)]">{s.stat}</p>}
          <div>
            <p className="wg-tag">Why it matters</p>
            <p className="mt-2 text-base leading-relaxed text-white/65">{meta.why}</p>
          </div>
          <p className="text-xs leading-relaxed text-white/30">
            {result?.provider ? `Meals designed by ${result.provider}. ` : ""}
            {typeof result?.saved === "boolean" ? (result.saved ? "This run was saved to Supabase. " : "This run was not saved (storage unavailable). ") : ""}
            Figures are estimates for demonstration.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

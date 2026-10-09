"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { SDGS } from "@/lib/sdgs";
import type { ExperimentMeta } from "@/lib/experiments";
import { Glass } from "./Glass";

function Tile({ id, size, active, onActivate, hue, xl = false }: { id: number; size: "lg" | "sm"; active: boolean; onActivate: () => void; hue: string; xl?: boolean }) {
  const sdg = SDGS[id];
  const dim = xl ? (size === "lg" ? "h-40 w-40 sm:h-48 sm:w-48" : "h-28 w-28 sm:h-32 sm:w-32") : size === "lg" ? "h-24 w-24 sm:h-28 sm:w-28" : "h-16 w-16 sm:h-20 sm:w-20";
  return (
    <motion.button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      aria-label={`SDG ${id}: ${sdg.title}`}
      whileHover={{ y: -4 }}
      animate={{ scale: active ? 1.06 : 1 }}
      transition={{ duration: 0.3 }}
      className={`relative flex ${dim} flex-col justify-between overflow-hidden rounded-2xl p-2.5 text-left`}
      style={{ background: `linear-gradient(160deg, ${sdg.color}, ${sdg.color}99)`, boxShadow: active ? `0 0 0 2px ${hue}, 0 20px 50px -20px ${sdg.color}` : "none" }}
    >
      <span className={`font-semibold leading-none text-white ${xl ? (size === "lg" ? "!text-6xl" : "!text-4xl") : size === "lg" ? "text-3xl" : "text-xl"}`}>{id}</span>
      <span className={`font-medium leading-tight text-white/95 ${xl ? (size === "lg" ? "!text-base" : "!text-xs") : size === "lg" ? "text-[0.65rem]" : "text-[0.55rem]"}`}>{sdg.title}</span>
    </motion.button>
  );
}

export function SdgPanel({ meta, large = false, story }: { meta: ExperimentMeta; large?: boolean; story?: string[] }) {
  const [active, setActive] = useState<number>(meta.primarySdgs[0]);
  const rel = meta.primarySdgs.includes(active) ? "Primary" : "Secondary";
  if (large) return <SdgPanelXl meta={meta} story={story} active={active} setActive={setActive} />;
  return (
    <Glass className="p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <span className="label">Primary SDGs</span>
          <div className="mt-3 flex flex-wrap gap-3">
            {meta.primarySdgs.map((id) => (
              <Tile key={id} id={id} size="lg" active={active === id} onActivate={() => setActive(id)} hue={meta.hue} />
            ))}
          </div>
          <span className="label mt-6 block">Secondary SDGs</span>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {meta.secondarySdgs.map((id) => (
              <Tile key={id} id={id} size="sm" active={active === id} onActivate={() => setActive(id)} hue={meta.hue} />
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-5">
          <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} aria-live="polite">
            <span className="label" style={{ color: SDGS[active].color }}>
              {rel} · SDG {active}
            </span>
            <p className="mt-1 text-lg font-light">{SDGS[active].title}</p>
            <p className="mt-2 text-sm leading-relaxed text-dim">{meta.sdgReason[active]}</p>
          </motion.div>
          <div>
            <span className="label">Why it matters</span>
            <p className="mt-1 text-sm leading-relaxed text-dim">{meta.why}</p>
          </div>
        </div>
      </div>
    </Glass>
  );
}

/** Large, interactive layout: a row of selectable goal tiles, one big detail card that follows the selection. */
function SdgPanelXl({ meta, story, active, setActive }: { meta: ExperimentMeta; story?: string[]; active: number; setActive: (n: number) => void }) {
  const ids = [...meta.primarySdgs, ...meta.secondarySdgs];
  const sdg = SDGS[active];
  const isPrimary = meta.primarySdgs.includes(active);
  const onKey = (e: React.KeyboardEvent) => {
    const i = ids.indexOf(active);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setActive(ids[(i + 1) % ids.length]); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setActive(ids[(i - 1 + ids.length) % ids.length]); }
  };
  return (
    <Glass className="p-6 sm:p-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label">Sustainable Development Goals</span>
          <h2 className="mt-1 text-3xl font-light sm:text-4xl">Tap a goal to see how this experiment serves it</h2>
        </div>
        <span className="font-mono text-sm text-dim">{meta.primarySdgs.length} primary · {meta.secondarySdgs.length} supporting</span>
      </div>

      <div role="tablist" aria-label="Goals" onKeyDown={onKey} className="mt-8 grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))" }}>
        {ids.map((id) => {
          const g = SDGS[id];
          const on = id === active;
          const prim = meta.primarySdgs.includes(id);
          return (
            <motion.button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(id)}
              onMouseEnter={() => setActive(id)}
              onFocus={() => setActive(id)}
              whileHover={{ y: -6 }}
              whileTap={{ scale: 0.98 }}
              animate={{ scale: on ? 1.03 : 1, opacity: on ? 1 : 0.72 }}
              transition={{ duration: 0.25 }}
              className="relative flex min-h-[11rem] flex-col justify-between overflow-hidden rounded-3xl p-6 text-left"
              style={{ background: `linear-gradient(155deg, ${g.color}, ${g.color}aa)`, boxShadow: on ? `0 0 0 3px ${meta.hue}, 0 28px 60px -24px ${g.color}` : "none" }}
            >
              <span className="flex items-start justify-between">
                <span className="!text-7xl font-semibold leading-none text-white">{id}</span>
                <span className="rounded-full bg-black/25 px-3 py-1 font-mono !text-xs tracking-widest text-white">{prim ? "PRIMARY" : "SUPPORTING"}</span>
              </span>
              <span className="mt-6 !text-lg font-medium leading-snug text-white">{g.title}</span>
            </motion.button>
          );
        })}
      </div>

      <motion.div
        key={active}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        aria-live="polite"
        className="mt-8 grid gap-8 rounded-3xl border p-6 sm:p-9 lg:grid-cols-[1.2fr_1fr]"
        style={{ borderColor: `${sdg.color}66`, background: `linear-gradient(135deg, ${sdg.color}22, transparent 60%)` }}
      >
        <div>
          <span className="label" style={{ color: sdg.color }}>{isPrimary ? "Primary goal" : "Supporting goal"} · SDG {active}</span>
          <h3 className="mt-2 text-4xl font-light leading-tight sm:text-5xl">{sdg.title}</h3>
          <p className="mt-4 max-w-3xl text-xl leading-relaxed text-text">{meta.sdgReason[active]}</p>
        </div>
        <div className="border-white/10 lg:border-l lg:pl-8">
          <span className="label">Why it matters</span>
          <p className="mt-2 text-lg leading-relaxed text-dim">{meta.why}</p>
        </div>
      </motion.div>

      {story && story.length > 0 && (
        <div className="mt-10 max-w-6xl space-y-4">
          <span className="label">How this experiment serves the goals</span>
          {story.map((para, i) => (
            <p key={i} className={i === 0 ? "text-2xl font-light leading-relaxed text-text" : "text-lg leading-relaxed text-dim"}>
              {para}
            </p>
          ))}
        </div>
      )}
    </Glass>
  );
}

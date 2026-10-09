"use client";
import { useState } from "react";
import { Glass } from "@/components/ui/Glass";
import type { ExperimentMeta } from "@/lib/experiments";
import { SDGS } from "@/lib/sdgs";

function Tile({ id, big, active, onActivate }: { id: number; big: boolean; active: boolean; onActivate: () => void }) {
  const sdg = SDGS[id];
  return (
    <button
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onActivate}
      aria-pressed={active}
      aria-label={`SDG ${id}: ${sdg.title}`}
      className={`flex flex-col justify-between rounded-2xl p-4 text-left transition ${big ? "h-44 w-44 sm:h-52 sm:w-52" : "h-36 w-36 sm:h-40 sm:w-40"}`}
      style={{ background: `linear-gradient(160deg, ${sdg.color}, ${sdg.color}99)`, boxShadow: active ? `0 0 0 3px #7be0d0` : "none" }}
    >
      <span className={`font-semibold leading-none text-white ${big ? "text-6xl" : "text-5xl"}`}>{id}</span>
      <span className={`font-semibold leading-tight text-white ${big ? "text-xl" : "text-lg"}`}>{sdg.title}</span>
    </button>
  );
}

/** Larger SDG mapping used by GameZero (the shared SdgPanel is left untouched for the other experiments). */
export function SdgBlock({ meta }: { meta: ExperimentMeta }) {
  const [active, setActive] = useState<number>(meta.primarySdgs[0]);
  const rel = meta.primarySdgs.includes(active) ? "Primary" : "Secondary";
  return (
    <Glass className="p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-xl font-medium text-text">Primary SDGs</p>
          <div className="mt-3 flex flex-wrap gap-4">
            {meta.primarySdgs.map((id) => (
              <Tile key={id} id={id} big active={active === id} onActivate={() => setActive(id)} />
            ))}
          </div>
          <p className="mt-6 text-xl font-medium text-text">Secondary SDGs</p>
          <div className="mt-3 flex flex-wrap gap-4">
            {meta.secondarySdgs.map((id) => (
              <Tile key={id} id={id} big={false} active={active === id} onActivate={() => setActive(id)} />
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-6">
          <div aria-live="polite">
            <p className="text-lg font-semibold" style={{ color: SDGS[active].color }}>
              {rel} · SDG {active}
            </p>
            <p className="mt-1 text-3xl font-light">{SDGS[active].title}</p>
            <p className="mt-3 text-xl leading-relaxed text-dim">{meta.sdgReason[active]}</p>
          </div>
          <div>
            <p className="text-lg font-semibold text-text">Why it matters</p>
            <p className="mt-1 text-xl leading-relaxed text-dim">{meta.why}</p>
          </div>
        </div>
      </div>
    </Glass>
  );
}

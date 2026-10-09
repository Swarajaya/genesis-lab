"use client";
import { useMemo, useState } from "react";
import { MatterViz } from "@/components/3d/nutrition/LabViz";
import { KIND_COLOR } from "@/components/3d/nutrition/foodKinds";
import { matterItems } from "./labModel";
import type { NutritionResult } from "./types";

export function MatterPanel({ result }: { result: NutritionResult | null }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const items = useMemo(() => (result ? matterItems(result) : []), [result]);
  const active = hovered ?? selected;
  const shown = active !== null ? items[active] : null;
  const total = items.reduce((s, i) => s + i.grams, 0);

  return (
    <section aria-label="Detected food matter" className="wg-panel p-5 sm:p-6">
      <p className="wg-tag">01 · Detected food matter</p>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden border border-[color:var(--wg-line)] bg-black/50">
          {result ? (
            <>
              <div className="h-[22rem] w-full sm:h-[32rem]">
                <MatterViz items={items} hovered={hovered} selected={selected} onHover={setHovered} onSelect={(i) => setSelected((c) => (c === i ? null : i))} />
              </div>
              <div className="pointer-events-none absolute left-3 top-3" aria-live="polite">
                <p className="wg-mono text-base tracking-[0.14em] text-white/90">{shown ? shown.name.toUpperCase() : `${items.length} FOOD MATTER OBJECTS`}</p>
                <p className="wg-mono mt-0.5 text-[0.82rem] tracking-[0.14em] text-white/45">{shown ? `${shown.grams} G · ${shown.source === "image" ? "PHOTO ESTIMATE" : "ASSUMED WEIGHT"}` : "HOVER OR CLICK TO INSPECT"}</p>
              </div>
            </>
          ) : (
            <div className="relative flex h-80 items-center justify-center sm:h-[32rem]">
              <div className="wg-scanline" aria-hidden />
              <p className="wg-mono px-6 text-center text-sm uppercase tracking-[0.2em] text-white/40">Awaiting food matter</p>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="wg-tag">Matter inventory</p>
          {result ? (
            <>
              <p className="mt-2 text-4xl font-extralight tabular-nums">
                {total} <span className="wg-mono text-base text-white/45">g discarded</span>
              </p>
              <ul className="mt-3 divide-y divide-[color:var(--wg-line)]" aria-label="Detected ingredients">
                {items.map((it, i) => (
                  <li key={`${it.name}-${i}`}>
                    <button type="button" aria-pressed={selected === i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(i)} onBlur={() => setHovered(null)} onClick={() => setSelected((c) => (c === i ? null : i))} className={`flex w-full items-center gap-3 px-1 py-2 text-left transition ${selected === i ? "bg-[rgb(123_224_208/0.07)]" : "hover:bg-white/[0.03]"}`}>
                      <span className="h-2 w-2 shrink-0" style={{ background: KIND_COLOR[it.kind] }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-base">{it.name}</span>
                      <span className="wg-mono text-sm tabular-nums text-white/80">{it.grams} g</span>
                      <span className="wg-mono w-14 text-right text-[0.74rem] tracking-[0.1em] text-white/35">{it.source === "image" ? "PHOTO" : "ASSUMED"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-base text-white/40">Ingredients appear here once vision and extraction finish.</p>
          )}
        </div>
      </div>
    </section>
  );
}

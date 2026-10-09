"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, MousePointer2, Move3d } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { LiveBadge } from "@/components/ui/Badges";
import { LinkButton } from "@/components/ui/Button";
import { useCapabilities } from "@/hooks/useCapabilities";
import { EXPERIMENTS, bySlug, type ExperimentSlug } from "@/lib/experiments";
import { SDGS } from "@/lib/sdgs";

const SceneFrame = dynamic(() => import("@/components/3d/SceneFrame"), { ssr: false });
const LabScene = dynamic(() => import("@/components/3d/LabScene"), { ssr: false });

function Fallback({ selected, onSelect }: { selected: ExperimentSlug | null; onSelect: (s: ExperimentSlug | null) => void }) {
  return (
    <div className="grid h-full w-full grid-cols-2 content-center gap-3 p-6 pt-24 sm:grid-cols-3 lg:pr-[26rem]">
      {EXPERIMENTS.map((e) => (
        <button key={e.slug} type="button" aria-pressed={selected === e.slug} onClick={() => onSelect(selected === e.slug ? null : e.slug)} className="flex aspect-square flex-col items-center justify-center rounded-full border text-xs transition hover:scale-105" style={{ borderColor: e.hue, color: e.hue, background: selected === e.slug ? `${e.hue}26` : "transparent", boxShadow: `0 0 30px -10px ${e.hue}` }}>
          {e.shortDomain}
        </button>
      ))}
    </div>
  );
}

function spotlight(e: MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

const STATS = [
  ["6", "live experiments"],
  ["11", "UN SDGs mapped"],
  ["2", "AI providers with failover"],
  ["0", "secrets in the browser"],
] as const;

export default function LabClient() {
  const caps = useCapabilities();
  const [selected, setSelected] = useState<ExperimentSlug | null>(null);
  const [hovered, setHovered] = useState<ExperimentSlug | null>(null);
  const meta = bySlug(selected ?? hovered ?? "") ?? null;

  return (
    <main id="main" className="lab-xl relative">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] scan opacity-60" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-80 w-[60rem] max-w-full -translate-x-1/2 rounded-full bg-signal/10 blur-3xl" />

      <div className="mx-auto w-full max-w-[120rem] px-4 pb-10 pt-10 sm:px-6 2xl:px-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="lab-hero flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-ok/25 bg-ok/[0.07] px-3 py-1">
              <span className="live-dot" aria-hidden />
              <span className="label !text-ok">Laboratory online</span>
            </span>
            <h1 className="lab-title display mt-5 text-5xl sm:text-7xl lg:text-[5.5rem]">
              Six portals.
              <br />
              <span className="gradient-text">One living lab.</span>
            </h1>
            <p className="lab-sub mt-5 max-w-xl text-base font-light leading-relaxed text-dim sm:text-lg">Step through a portal and test a real experiment yourself: drag the ring to rotate, click a gate to inspect it, then launch the live demo.</p>
          </div>
          <dl className="lab-stats grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:w-[26rem]">
            {STATS.map(([n, l]) => (
              <div key={l} className="bg-void/80 px-3 py-4 text-center backdrop-blur">
                <dt className="sr-only">{l}</dt>
                <dd>
                  <span className="lab-stat-n display block text-3xl text-text">{n}</span>
                  <span className="lab-stat-l mt-1 block text-[0.62rem] leading-tight text-faint">{l}</span>
                </dd>
              </div>
            ))}
          </dl>
        </motion.div>

        {/* ------------------------------------------------ stage */}
        <motion.section aria-label="Experiment portals" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }} className="relative mt-10 overflow-hidden rounded-[1.75rem] border border-line bg-[#05080d] shadow-[0_50px_120px_-50px_rgba(123,224,208,0.35)]">
          <div className="relative h-[420px] sm:h-[560px] lg:h-[660px]">
            <SceneFrame caps={caps} className="absolute inset-0" label="Interactive 3D ring of six experiment portals around a glowing core. Drag to rotate, click a portal to select it." camera={{ position: [0, 2.6, 10.2], fov: 46 }} fallback={<Fallback selected={selected} onSelect={setSelected} />}>
              <LabScene selected={selected} onSelect={setSelected} hovered={hovered} onHover={setHovered} lowPower={caps.lowPower} reduced={caps.reducedMotion} />
            </SceneFrame>
            <div aria-hidden className="stage-vignette pointer-events-none absolute inset-0" />
            <span className="bracket tl" aria-hidden />
            <span className="bracket tr" aria-hidden />
            <span className="bracket bl" aria-hidden />
            <span className="bracket br" aria-hidden />

            {/* portal selector (keyboard accessible) */}
            <nav aria-label="Select a portal" className="absolute left-4 top-4 z-10 flex max-w-[calc(100%-2rem)] gap-1.5 overflow-x-auto pb-1 lg:left-6 lg:top-6 lg:flex-col lg:overflow-visible">
              <span className="label mb-1 hidden lg:block">Portal select</span>
              {EXPERIMENTS.map((e) => {
                const on = selected === e.slug;
                return (
                  <button key={e.slug} type="button" aria-pressed={on} onClick={() => setSelected(on ? null : e.slug)} onMouseEnter={() => setHovered(e.slug)} onMouseLeave={() => setHovered(null)} className="group flex shrink-0 items-center gap-2.5 rounded-full border px-3 py-1.5 text-left text-xs transition duration-300" style={{ borderColor: on ? e.hue : "rgb(255 255 255 / 0.1)", background: on ? `${e.hue}30` : "rgb(6 10 16 / 0.88)", color: on ? "#fff" : "#9aa5b8" }}>
                    <span className="font-mono text-[0.62rem]" style={{ color: e.hue }}>
                      {String(e.index).padStart(2, "0")}
                    </span>
                    <span className="whitespace-nowrap">{e.short}</span>
                  </button>
                );
              })}
            </nav>

            <div className="lab-hint pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-4 rounded-full border border-line bg-[#05080d]/90 px-4 py-2 text-[0.7rem] text-faint sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <Move3d className="h-3.5 w-3.5" aria-hidden /> Drag to rotate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MousePointer2 className="h-3.5 w-3.5" aria-hidden /> Click a gate to inspect
              </span>
            </div>

            {/* info panel overlay on large screens */}
            <div className="lab-info-wrap pointer-events-none absolute inset-y-0 right-0 hidden w-[24rem] items-center p-6 lg:flex">
              <InfoPanel meta={meta} selected={!!selected} />
            </div>
          </div>
          <div className="border-t border-line p-4 lg:hidden">
            <InfoPanel meta={meta} selected={!!selected} />
          </div>
        </motion.section>

        {/* ------------------------------------------------ cards */}
        <div className="mt-14 flex items-end justify-between gap-4">
          <div>
            <span className="label">All experiments</span>
            <h2 className="lab-h2 display mt-2 text-3xl sm:text-4xl">Pick one and try it live</h2>
          </div>
        </div>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="All experiments">
          {EXPERIMENTS.map((e, i) => (
            <motion.li key={e.slug} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.55, delay: (i % 3) * 0.08 }}>
              <Link
                href={e.href}
                onMouseEnter={() => setHovered(e.slug)}
                onMouseLeave={() => setHovered(null)}
                onMouseMove={spotlight}
                className="spot glass group relative block h-full rounded-2xl p-6 transition duration-500 hover:-translate-y-1.5 hover:border-white/20"
                style={{ ["--spot" as string]: `${e.hue}30` }}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-px opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${e.hue}, transparent)` }} />
                <span aria-hidden className="display pointer-events-none absolute -right-2 -top-4 select-none text-[7rem] leading-none opacity-[0.06] transition duration-500 group-hover:opacity-[0.12]" style={{ color: e.hue }}>
                  {e.index}
                </span>
                <div className="flex items-center justify-between">
                  <span className="label" style={{ color: e.hue }}>
                    {e.shortDomain}
                  </span>
                  <LiveBadge />
                </div>
                <h3 className="mt-5 text-xl font-light tracking-tight">{e.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-dim">{e.tagline}</p>
                <div className="mt-5 flex flex-wrap gap-1.5" aria-label="SDGs">
                  {[...e.primarySdgs, ...e.secondarySdgs].map((id) => (
                    <span key={id} className="rounded-md px-1.5 py-0.5 text-[0.6rem] font-medium text-white/95" style={{ background: SDGS[id].color }}>
                      SDG {id}
                    </span>
                  ))}
                </div>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm" style={{ color: e.hue }}>
                  Launch experiment <ArrowRight className="h-4 w-4 transition duration-300 group-hover:translate-x-1.5" aria-hidden />
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function InfoPanel({ meta, selected }: { meta: ReturnType<typeof bySlug> | null; selected: boolean }) {
  return (
    <div className="lab-info pointer-events-auto w-full rounded-2xl border border-white/10 bg-[#070b12]/92 p-5 shadow-2xl" aria-live="polite">
      <AnimatePresence mode="wait">
        {meta ? (
          <motion.div key={meta.slug} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }}>
            <div className="flex items-center justify-between gap-3">
              <span className="label" style={{ color: meta.hue }}>
                {String(meta.index).padStart(2, "0")} · {meta.shortDomain}
              </span>
              <LiveBadge />
            </div>
            <h2 className="mt-3 text-xl font-light leading-snug">{meta.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-dim">{meta.objective}</p>
            <ol className="mt-4 space-y-1.5 border-l border-line pl-4">
              {meta.flow.map((f, i) => (
                <li key={f} className="relative text-xs text-dim">
                  <span aria-hidden className="absolute -left-[1.3rem] top-1 h-1.5 w-1.5 rounded-full" style={{ background: meta.hue, opacity: 0.35 + i * 0.16 }} />
                  {f}
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Sustainable Development Goals">
              {[...meta.primarySdgs, ...meta.secondarySdgs].map((id) => (
                <span key={id} className="rounded-md px-2 py-1 text-[0.62rem] font-medium text-white" style={{ background: SDGS[id].color }}>
                  SDG {id}
                </span>
              ))}
            </div>
            <div className="mt-5">
              <LinkButton href={meta.href} className="w-full">
                Launch live demo <ArrowRight className="h-4 w-4" aria-hidden />
              </LinkButton>
            </div>
            {!selected && <p className="mt-2 text-center text-[0.65rem] text-faint">Click the gate to lock the camera on it</p>}
          </motion.div>
        ) : (
          <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="label">Awaiting selection</span>
            <p className="mt-2 text-sm leading-relaxed text-dim">Hover or click a portal to see what the experiment does, its five-stage flow and the SDGs it supports.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

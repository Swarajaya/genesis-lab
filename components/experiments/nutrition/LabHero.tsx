"use client";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { EngineRow } from "./labModel";

const FLOW = ["Waste", "AI vision", "Quantum optimization", "3D food synthesis", "Impact"];

export function EngineDot({ state }: { state: EngineRow["state"] }) {
  return <span className="wg-dot" data-s={state} aria-hidden />;
}

export function LabHero({ rows }: { rows: EngineRow[] }) {
  const reduce = useReducedMotion();
  const pick = (k: string) => rows.find((r) => r.key === k)!;
  const chips = [pick("vision"), pick("quantum"), pick("nutrition"), pick("synth"), pick("impact")];
  return (
    <header className="relative pb-2 pt-6">
      <div className="flex items-center justify-between">
        <Link href="/lab" className="wg-tag inline-flex items-center gap-2 transition hover:text-white">
          <ArrowLeft className="h-3 w-3" aria-hidden /> Back to the lab
        </Link>
        <span className="wg-tag">Experiment 02</span>
      </div>
      <motion.div initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="mt-10">
        <p className="wg-tag">Waste // Genesis</p>
        <h1 className="wg-title mt-3 text-[clamp(3rem,8.2vw,9rem)] uppercase">
          Quantum food
          <br />
          optimization lab
        </h1>
        <p className="wg-mono mt-5 text-base uppercase tracking-[0.3em] text-[color:var(--wg-green)]">AI nutrition from waste</p>
        <p className="mt-3 max-w-2xl text-lg font-light leading-relaxed text-white/70">
          Turn discarded food into optimized meals. AI vision reads the waste, a quantum-inspired optimizer searches every candidate meal state, and the winning meal is synthesized in 3D.
        </p>
      </motion.div>
      <ol className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Pipeline">
        {FLOW.map((f, i) => (
          <li key={f} className="flex items-center gap-2">
            <span className={`wg-mono border px-2.5 py-1 text-[0.82rem] uppercase tracking-[0.2em] ${f === "Quantum optimization" ? "border-[color:var(--wg-violet)] bg-[rgb(143_123_255/0.12)] text-white" : "border-[color:var(--wg-line)] text-white/70"}`}>{f}</span>
            {i < FLOW.length - 1 && <span className="text-[color:var(--wg-cyan)]/60" aria-hidden>→</span>}
          </li>
        ))}
      </ol>
      <ul className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="System status">
        {chips.map((r) => (
          <li key={r.key} className="flex items-center gap-2.5 border-t border-[color:var(--wg-line)] pt-2.5">
            <EngineDot state={r.state} />
            <span className="wg-mono text-[0.84rem] uppercase tracking-[0.18em] text-white/85">{r.label}</span>
            <span className="wg-mono ml-auto text-[0.76rem] tracking-[0.14em] text-white/40">{r.text}</span>
          </li>
        ))}
      </ul>
    </header>
  );
}

"use client";
import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { Analysis } from "@/lib/engines/gamezero/discovery/session";
import { KnowledgeRing, RuleDna } from "./Viz";
import { Readout, pct } from "./ui";

export function FinalScreen({ a, play, narration, transfer, onClose, onTransfer, onNew, canTransfer, judge }: { a: Analysis; play: { solved: boolean; steps: number } | null; narration: { text: string; source: "ai" | "deterministic" } | null; transfer: { fromExperiments: number | null; gameB: number | null; validated: boolean | null } | null; onClose: () => void; onTransfer: () => void; onNew: () => void; canTransfer: boolean; judge: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  const m = a.metrics;
  const unreachable = a.atoms.filter((x) => x.unreachable).map((x) => x.color).filter((c, i, arr) => arr.indexOf(c) === i);
  return (
    <motion.div role="dialog" aria-modal="true" aria-label="Discovery complete" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }} className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-void/90 p-4 backdrop-blur-md">
      <div className="gz-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, duration: 0.8 }} className="gz-panel relative my-auto w-full max-w-4xl p-6 sm:p-9">
        <p className="label text-center !text-[1.15rem] !text-signal" style={{ letterSpacing: "0.34em" }}>
          GAMEZERO
        </p>
        <h2 className="gz-readout mt-2 text-center text-3xl font-light tracking-[0.16em] sm:text-5xl">DISCOVERY COMPLETE</h2>
        <div className="mt-7 grid items-center gap-6 md:grid-cols-[10rem_1fr_11rem]">
          <KnowledgeRing value={a.knowledge} className="mx-auto h-40 w-40" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <Readout label="RULES DISCOVERED" value={`${m.rulesConfirmed}/${m.rulesTotal}`} tone="green" />
            <Readout label="HYPOTHESES TESTED" value={m.hypothesesTested} />
            <Readout label="EXPERIMENTS RUN" value={m.experiments} tone="cyan" />
            <Readout label="CONTRADICTIONS" value={m.contradictions} tone="red" />
            <Readout label="COUNTERFACTUALS" value={m.counterfactuals} tone="violet" />
            <Readout label="MODEL CONFIDENCE" value={pct(m.modelConfidence)} tone="violet" />
            <div className="col-span-2 sm:col-span-3">
              <Readout label="AUTONOMOUS PLAY" value={play ? (play.solved ? `✓ goal in ${play.steps} moves` : "✗ goal not reached") : "…"} tone={play?.solved ? "green" : "text"} />
            </div>
          </div>
          <RuleDna dna={a.dna} className="mx-auto h-44 w-44" />
        </div>
        <p className="gz-readout mt-6 text-center text-[1rem] text-dim">
          {a.compression.rawObservations} RAW OBSERVATIONS → {a.compression.patterns} PATTERNS → {a.compression.coreRules} CORE RULES → WORLD MODEL {a.compression.complete ? "COMPLETE" : "PARTIAL"}
        </p>
        {unreachable.length > 0 && <p className="mt-2 text-center text-[1.15rem] text-faint">{unreachable.join(", ")} terrain is unreachable under the discovered movement rules, so it cannot affect play and is excluded from the rule count.</p>}
        {transfer && transfer.gameB !== null && transfer.fromExperiments !== null && (
          <p className="gz-readout mt-3 text-center text-[1rem] text-text">
            TRANSFER · GAME A {transfer.fromExperiments} experiments → GAME B {transfer.gameB} experiments · prior {transfer.validated ? "confirmed" : "overturned"} by evidence
          </p>
        )}
        {narration && <p className="mx-auto mt-5 max-w-2xl text-center text-[1.1rem] leading-relaxed text-dim">{narration.text}</p>}
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          {canTransfer && (
            <button type="button" onClick={onTransfer} className="label rounded-[4px] border border-[#a78bfa]/50 bg-[#a78bfa]/10 px-4 py-2.5 !text-[1.12rem] !text-[#a78bfa] transition hover:bg-[#a78bfa]/20">
              Transfer to a new world
            </button>
          )}
          <button type="button" onClick={onNew} className="label rounded-[4px] border border-white/15 px-4 py-2.5 !text-[1.12rem] transition hover:!text-text">
            Discover another world
          </button>
          <button ref={closeRef} type="button" onClick={onClose} className="label rounded-[4px] border border-signal/50 bg-signal/10 px-4 py-2.5 !text-[1.12rem] !text-signal transition hover:bg-signal/20">
            {judge ? "Back to the lab" : "Close"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

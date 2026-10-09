"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { Glass } from "@/components/ui/Glass";
import { COLORS, type Color } from "@/lib/engines/gamezero/types";
import { COLOR_HEX, TERRAIN_WORDS, type LogEntry, type LogKind, type Snapshot } from "./helpers";

export const STAGE_NAMES = ["Observe", "Hypothesize", "Test", "Learn", "Play"] as const;

export function StageRail({ active, done }: { active: number; done: boolean }) {
  return (
    <ol aria-label="Agent pipeline" className="flex flex-wrap gap-2">
      {STAGE_NAMES.map((s, i) => {
        const on = i === active && !done;
        const past = i < active || (done && i <= active);
        return (
          <li
            key={s}
            aria-current={on ? "step" : undefined}
            className={`label flex items-center gap-2 rounded-full border px-3 py-1.5 transition duration-500 ${on ? "border-signal/60 bg-signal/10 !text-signal" : past ? "border-white/15 !text-text" : "border-line"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${on ? "animate-pulse bg-signal" : past ? "bg-ok" : "bg-white/20"}`} aria-hidden />
            {s}
          </li>
        );
      })}
    </ol>
  );
}

export function HypothesisPanel({ snap }: { snap: Snapshot }) {
  const pct = snap.total ? (snap.alive / snap.total) * 100 : 0;
  const shown = snap.aliveList.slice(0, 6);
  const recent = snap.rejected.slice(-5).reverse();
  return (
    <Glass className="p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="label">Surviving hypotheses</span>
          <div className="mt-1 flex items-baseline gap-2" aria-live="polite">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={snap.alive} initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.35 }} className="display text-4xl text-signal">
                {snap.alive}
              </motion.span>
            </AnimatePresence>
            <span className="text-sm text-dim">of {snap.total} candidate rule sets</span>
          </div>
        </div>
        <span className="label text-right">{snap.dynamicsAlive} movement model{snap.dynamicsAlive === 1 ? "" : "s"} left</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" role="presentation">
        <motion.div className="h-full rounded-full bg-signal" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} />
      </div>

      <ul className="mt-4 space-y-1.5">
        {shown.map((h) => (
          <li key={h.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-snug ${h.best ? "border-signal/40 bg-signal/[0.06] text-text" : "border-line text-dim"}`}>
            {h.best && <span className="label shrink-0 !text-signal">Leading</span>}
            <span>{h.label}</span>
          </li>
        ))}
        {snap.aliveList.length > shown.length && <li className="px-1 text-xs text-faint">+ {snap.aliveList.length - shown.length} more still consistent with every observation</li>}
      </ul>

      {recent.length > 0 && (
        <div className="mt-4">
          <span className="label">Recently rejected</span>
          <ul className="mt-2 space-y-1.5">
            <AnimatePresence initial={false}>
              {recent.map((r) => (
                <motion.li key={`${r.id}-${r.step}`} layout initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }} className="rounded-lg border border-bad/25 bg-bad/[0.05] px-3 py-2 text-xs leading-snug text-dim">
                  <Struck>{r.label}</Struck>
                  <span className="mt-0.5 block text-faint">
                    step {r.step}: {r.reason}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </Glass>
  );
}

function Struck({ children }: { children: string }) {
  return (
    <span className="relative inline">
      <span className="text-dim">{children}</span>
      <motion.span aria-hidden className="absolute left-0 top-1/2 h-px w-full origin-left bg-bad" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.7, delay: 0.15 }} />
      <span className="sr-only"> (rejected)</span>
    </span>
  );
}

const KIND_STYLE: Record<LogKind, string> = { demo: "text-text", test: "text-dim", play: "text-ok", reject: "text-bad", info: "text-signal" };
const KIND_TAG: Record<LogKind, string> = { demo: "DEMO", test: "TEST", play: "PLAY", reject: "REJECTED", info: "INFO" };

export function LogPanel({ log }: { log: LogEntry[] }) {
  const items = [...log].reverse().slice(0, 80);
  return (
    <Glass className="p-5">
      <span className="label">Experiment log</span>
      <div role="log" aria-live="polite" aria-label="Experiment log" className="mt-3 max-h-72 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="text-sm text-faint">Nothing yet. Make a move on the board.</p>
        ) : (
          <ul className="space-y-1.5">
            <AnimatePresence initial={false}>
              {items.map((e) => (
                <motion.li key={e.id} layout="position" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex gap-2 text-xs leading-snug">
                  <span className={`label shrink-0 ${KIND_STYLE[e.kind]}`}>{e.kind === "reject" ? "Hypothesis rejected" : KIND_TAG[e.kind]}</span>
                  <span className="min-w-0 break-words text-dim">
                    {e.kind === "reject" ? <Struck>{e.text.split("\u0000")[0]}</Struck> : e.text}
                    {e.kind === "reject" && <span className="block text-faint">{`step ${e.step ?? "?"}: ${e.text.split("\u0000")[1] ?? ""}`}</span>}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </Glass>
  );
}

export interface Narration {
  text: string;
  source: "ai" | "deterministic";
}

export function LearnedPanel({ snap, colorsInGrid, narration, narrating, saved }: { snap: Snapshot; colorsInGrid: Color[]; narration: Narration | null; narrating: boolean; saved: boolean }) {
  const byColor = new Map(snap.terrain.map((t) => [t.label, t.terrain]));
  return (
    <Glass className="p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="label">Learned rules</span>
        {saved && (
          <span className="label inline-flex items-center gap-1.5 !text-ok">
            <Check className="h-3 w-3" aria-hidden /> Session saved
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text">{snap.movement}</p>
      {snap.model === "color" ? (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {COLORS.filter((c) => colorsInGrid.includes(c)).map((c) => {
            const t = byColor.get(c);
            return (
              <li key={c} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-xs">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLOR_HEX[c], boxShadow: `0 0 10px ${COLOR_HEX[c]}` }} aria-hidden />
                <span className="capitalize text-text">{c}</span>
                <span className="text-dim">{t ? TERRAIN_WORDS[t] : "not observed yet"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-dim">Cells behaved inconsistently within a color, so the agent tracks {snap.terrain.length} cells individually.</p>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <div className="flex items-center gap-2">
          <span className="label">Summary</span>
          {narration && <span className={`label rounded-full border px-2 py-0.5 ${narration.source === "ai" ? "border-signal/40 !text-signal" : "border-line"}`}>{narration.source === "ai" ? "AI-phrased" : "Deterministic"}</span>}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-dim" aria-live="polite">
          {narration ? narration.text : narrating ? "Writing the summary…" : "Summary unavailable."}
        </p>
      </div>
    </Glass>
  );
}

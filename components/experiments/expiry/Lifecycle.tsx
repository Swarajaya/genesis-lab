"use client";
import { motion } from "framer-motion";
import { type Lifecycle, rupees } from "@/lib/engines/money/engine";
import { LIFECYCLE_COLOR, formatDuration } from "./types";

const STAGES: { id: Lifecycle; hint: string }[] = [
  { id: "ACTIVE", hint: "Spendable under the rules" },
  { id: "EXPIRING", hint: "Last 25% of the window" },
  { id: "EXPIRED", hint: "Unspent funds lapse" },
  { id: "SPENT", hint: "Fully used before expiry" },
];

/** Animated countdown ring plus the ACTIVE -> EXPIRING -> EXPIRED / SPENT timeline. */
export function LifecycleView({ state, remainingMs, totalMs, balancePaise, reduced }: { state: Lifecycle; remainingMs: number; totalMs: number; balancePaise: number; reduced: boolean }) {
  const frac = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const color = LIFECYCLE_COLOR[state];
  const R = 52;
  const C = 2 * Math.PI * R;
  const dur = reduced ? 0 : 0.7;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={false}
            animate={{ strokeDashoffset: C * (1 - frac), stroke: color }}
            transition={{ duration: dur }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="label !text-[0.6rem]">{state === "EXPIRED" ? "Expired" : state === "SPENT" ? "Spent" : "Expires in"}</span>
          <span className="mt-1 font-mono text-sm tabular-nums" style={{ color }}>
            {state === "EXPIRED" ? "00m 00s" : state === "SPENT" ? "—" : formatDuration(remainingMs)}
          </span>
        </div>
      </div>
      <ol className="grid w-full min-w-0 flex-1 grid-cols-2 gap-2" aria-label="Money lifecycle">
        {STAGES.map((s) => {
          const on = s.id === state;
          const c = LIFECYCLE_COLOR[s.id];
          return (
            <motion.li
              key={s.id}
              initial={false}
              animate={{ opacity: on ? 1 : 0.4, scale: on && !reduced ? 1.02 : 1 }}
              transition={{ duration: dur * 0.6 }}
              aria-current={on ? "step" : undefined}
              className="rounded-xl border px-3 py-2"
              style={{ borderColor: on ? c : "rgba(255,255,255,0.09)", background: on ? `${c}14` : "transparent" }}
            >
              <span className="label !text-[0.62rem]" style={{ color: on ? c : undefined }}>
                {s.id}
              </span>
              <p className="mt-0.5 text-[0.7rem] leading-snug text-dim">{s.hint}</p>
            </motion.li>
          );
        })}
        <li className="col-span-2 text-xs text-dim">
          {state === "EXPIRED" && balancePaise > 0 ? `${rupees(balancePaise)} has lapsed and can no longer be spent.` : state === "SPENT" ? "Balance fully spent." : `${rupees(balancePaise)} remains spendable until expiry.`}
        </li>
      </ol>
    </div>
  );
}

"use client";
import { motion } from "framer-motion";

export const STAGES = ["analyzing", "understanding", "generating", "validating", "complete"] as const;
export type Stage = (typeof STAGES)[number];

/** Shows real server-reported stages. No percentages: progress is only what the server has actually reached. */
export function AiProgress({ stage, hue }: { stage: Stage | null; hue: string }) {
  const idx = stage ? STAGES.indexOf(stage) : -1;
  return (
    <div role="status" aria-live="polite" className="glass rounded-2xl p-5">
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {STAGES.map((s, i) => {
          const done = i < idx || stage === "complete";
          const on = i === idx && stage !== "complete";
          return (
            <li key={s} className="flex items-center gap-2">
              <motion.span
                className="h-2 w-2 rounded-full"
                style={{ background: done || on ? hue : "rgb(255 255 255 / 0.15)" }}
                animate={on ? { opacity: [1, 0.3, 1], scale: [1, 1.5, 1] } : { opacity: 1, scale: 1 }}
                transition={on ? { duration: 1.2, repeat: Infinity } : { duration: 0.3 }}
              />
              <span className={`label ${done || on ? "!text-text" : ""}`}>{s}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

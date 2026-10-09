"use client";
import { motion } from "framer-motion";

/** The five-stage INPUT > INTELLIGENCE > TRANSFORMATION > RESULT > IMPACT strip. `active` is 0-based; -1 means idle. */
export function FlowStrip({ steps, active, hue }: { steps: readonly string[]; active: number; hue: string }) {
  return (
    <ol className="flex items-stretch gap-2 overflow-x-auto pb-1" aria-label="Experiment flow">
      {steps.map((s, i) => {
        const done = i < active;
        const on = i === active;
        return (
          <li key={s} className="relative min-w-[8.5rem] flex-1">
            <div className="h-px w-full bg-line" />
            <motion.div
              className="absolute left-0 top-0 h-px"
              style={{ background: hue }}
              initial={false}
              animate={{ width: done || on ? "100%" : "0%" }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
            <div className="pt-2">
              <span className="label !text-[0.6rem]" style={{ color: on || done ? hue : undefined }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className={`text-xs leading-snug ${on ? "text-text" : done ? "text-dim" : "text-faint"}`}>{s}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

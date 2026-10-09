"use client";
import { Play, RefreshCw } from "lucide-react";

const STAGES = [
  { id: "perceive", label: "Perceive" },
  { id: "identify", label: "Identify" },
  { id: "verify", label: "Verify" },
  { id: "model", label: "Model" },
  { id: "play", label: "Play" },
];

type Props = {
  active?: string | number | null;
  running: boolean;
  busy: boolean;
  canStart: boolean;
  started: boolean;
  onDiscover: () => void;
  onNew: () => void;
  phaseNote: string;
};

export function Hero({ active, running, busy, canStart, started, onDiscover, onNew, phaseNote }: Props) {
  const activeIndex = typeof active === "number" ? active : STAGES.findIndex((s) => s.id === active);

  return (
    <section aria-label="GameZero" className="mx-auto mt-4 max-w-none px-3 sm:px-4">
      <div className="gz-panel flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="label">Experiment</span>
          <h1 className="mt-1 text-[1.8rem] font-light leading-tight sm:text-[2.2rem]">GameZero</h1>
          <p className="mt-1 text-[1.05rem] text-dim" aria-live="polite">
            {phaseNote}
          </p>
        </div>

        <ol className="flex flex-wrap items-center gap-2" aria-label="Discovery stages">
          {STAGES.map((s, i) => {
            const isActive = i === activeIndex;
            const isDone = activeIndex > i;
            return (
              <li
                key={s.id}
                aria-current={isActive ? "step" : undefined}
                className={`rounded-full border px-3 py-1 text-[0.95rem] transition ${
                  isActive ? "border-signal text-signal" : isDone ? "border-white/20 text-text" : "border-white/10 text-faint"
                } ${isActive && running ? "animate-pulse" : ""}`}
              >
                {s.label}
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscover}
            disabled={!canStart || busy}
            className="inline-flex items-center gap-2 rounded-full border border-signal px-5 py-2 text-[1rem] text-signal transition hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {running ? "Discovering…" : started ? "Continue" : "Discover"}
          </button>
          <button
            type="button"
            onClick={onNew}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[1rem] text-dim transition hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            New world
          </button>
        </div>
      </div>
    </section>
  );
}

"use client";
import type { ReactNode } from "react";

export const CYAN = "#7be0d0";
export const VIOLET = "#a78bfa";
export const GREEN = "#5fe3a1";
export const RED = "#ff6b7a";

export function Panel({ title, aside, className = "", children }: { title?: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`gz-panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <h2 className="label !text-[1.06rem] !text-dim">{title}</h2>
          {aside && <div className="label !text-[1.06rem]">{aside}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Readout({ label, value, tone = "text" }: { label: string; value: ReactNode; tone?: "text" | "cyan" | "violet" | "green" | "red" }) {
  const c = { text: "text-text", cyan: "text-signal", violet: "text-[#a78bfa]", green: "text-ok", red: "text-bad" }[tone];
  return (
    <div className="min-w-0">
      <div className="label !text-[1.01rem] truncate">{label}</div>
      <div className={`gz-readout mt-0.5 text-[1.35rem] leading-none sm:text-[1.5rem] ${c}`}>{value}</div>
    </div>
  );
}

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
export const bits = (x: number) => x.toFixed(2);

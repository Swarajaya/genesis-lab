"use client";
import type { ReactNode } from "react";

export const hhmmss = (t: number) => new Date(t).toISOString().slice(11, 19);
export const TONE = { ok: "#5fe3a1", bad: "#ff6b7a", warn: "#f2c260", info: "#7be0d0", violet: "#b48bff", dim: "#6b768a" } as const;
export type Tone = keyof typeof TONE;

/** Deep glass panel with fine corner ticks. */
export function Panel({ title, kicker, accent = "#7be0d0", right, children, className = "" }: { title: string; kicker?: string; accent?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`relative rounded-md border border-line bg-[rgb(8_11_18/0.72)] backdrop-blur-md ${className}`} style={{ boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.04), 0 30px 60px -40px ${accent}55` }}>
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2.5 w-2.5 border-l border-t" style={{ borderColor: accent }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r" style={{ borderColor: accent }} />
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          {kicker && <span className="label block !text-[0.74rem]" style={{ color: accent }}>{kicker}</span>}
          <h2 className="truncate font-mono text-[1.02rem] uppercase tracking-[0.14em] text-text">{title}</h2>
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Pill({ tone = "dim", children }: { tone?: Tone; children: ReactNode }) {
  const c = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[0.82rem] uppercase tracking-wider" style={{ color: c, borderColor: `${c}55`, background: `${c}12` }}>
      {children}
    </span>
  );
}

export function Stat({ label, value, tone = "dim", sub }: { label: string; value: ReactNode; tone?: Tone; sub?: string }) {
  return (
    <div className="border-l border-line pl-3">
      <span className="label block !text-[0.74rem]">{label}</span>
      <span className="block font-mono text-2xl leading-tight tabular-nums" style={{ color: tone === "dim" ? "#e8edf5" : TONE[tone] }}>{value}</span>
      {sub && <span className="block text-[0.82rem] text-faint">{sub}</span>}
    </div>
  );
}

export function Btn({ children, onClick, disabled, tone = "info", ghost, title }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: Tone; ghost?: boolean; title?: string }) {
  const c = TONE[tone];
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className="rounded-sm border px-4 py-2 font-mono text-[0.9rem] uppercase tracking-wider transition hover:brightness-125 disabled:pointer-events-none disabled:opacity-35" style={ghost ? { color: c, borderColor: `${c}44`, background: "transparent" } : { color: "#04110e", borderColor: c, background: c }}>
      {children}
    </button>
  );
}

/** Public proof elements are shown as masked blocks; click to reveal the (public, non-secret) hex. */
export function Masked({ value, label }: { value: string; label: string }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 font-mono text-[0.9rem]">
        <span className="uppercase tracking-wider text-faint">{label}</span>
        <span className="text-dim group-open:hidden">████████ <span className="text-faint">{value.length / 2}B</span></span>
        <span className="hidden text-signal group-open:inline">{value.slice(0, 14)}…{value.slice(-6)}</span>
      </summary>
    </details>
  );
}

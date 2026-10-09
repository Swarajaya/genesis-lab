"use client";
import type { ReactNode } from "react";
import type { HealthLabel } from "@/lib/ai/healthTypes";

export const LABELS: Record<HealthLabel, { text: string; tone: "ok" | "bad" | "warn" | "mute" }> = {
  connected: { text: "Connected", tone: "ok" },
  failed: { text: "Failed", tone: "bad" },
  rate_limited: { text: "Rate limited", tone: "warn" },
  not_configured: { text: "Not configured", tone: "mute" },
  not_checked: { text: "Not checked", tone: "mute" },
};

export const TONE: Record<"ok" | "bad" | "warn" | "mute" | "info", string> = {
  ok: "border-ok/35 bg-ok/10 text-ok",
  bad: "border-bad/35 bg-bad/10 text-bad",
  warn: "border-warn/35 bg-warn/10 text-warn",
  mute: "border-white/12 bg-white/[0.04] text-dim",
  info: "border-signal/35 bg-signal/10 text-signal",
};

export const DOT: Record<"ok" | "bad" | "warn" | "mute" | "info", string> = {
  ok: "bg-ok",
  bad: "bg-bad",
  warn: "bg-warn",
  mute: "bg-faint",
  info: "bg-signal",
};

export function Pill({ tone, children, className = "" }: { tone: keyof typeof TONE; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${TONE[tone]} ${className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

/** Date formatting happens in the browser's time zone, so server and client text can differ; hydration warning is expected and harmless. */
export function When({ iso, empty = "Not checked" }: { iso: string | null | undefined; empty?: string }) {
  if (!iso) return <>{empty}</>;
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" })}
    </time>
  );
}

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.055] to-white/[0.015] shadow-[0_1px_0_rgb(255_255_255/0.05)_inset,0_30px_80px_-50px_rgb(0_0_0/0.9)] ${className}`}>{children}</div>
  );
}

export function SectionHead({ id, eyebrow, title, lead }: { id: string; eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="mb-4 max-w-5xl">
      <span className="label !text-signal">{eyebrow}</span>
      <h2 id={id} className="arch-h2 mt-1 font-light tracking-tight">{title}</h2>
      {lead ? <p className="mt-1.5 text-base leading-relaxed text-dim">{lead}</p> : null}
    </header>
  );
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/[0.08] bg-white/[0.02] open:bg-white/[0.04]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base text-text marker:hidden [&::-webkit-details-marker]:hidden">
        {summary}
        <span aria-hidden className="text-faint transition group-open:rotate-90">›</span>
      </summary>
      <div className="px-4 pb-3 text-base leading-relaxed text-dim">{children}</div>
    </details>
  );
}

export function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`;
  if (ms >= 1000) return `${Math.round(ms / 1000)} s`;
  return `${ms} ms`;
}

"use client";
import type { ReactNode } from "react";

/** Thin-bordered technical panel with a mono title bar. */
export function Panel({ title, right, children, className = "", id }: { title: string; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-label={title} className={`relative border border-white/[0.09] bg-[#060a11]/85 ${className}`}>
      <span aria-hidden className="absolute -left-px -top-px h-2 w-2 border-l border-t border-signal/70" />
      <span aria-hidden className="absolute -bottom-px -right-px h-2 w-2 border-b border-r border-signal/70" />
      <header className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-1.5">
        <h2 className="font-mono text-[0.8rem] uppercase tracking-[0.2em] text-faint">{title}</h2>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Kv({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] py-1.5 last:border-0">
      <dt className="font-mono text-[0.78rem] uppercase tracking-[0.16em] text-faint">{k}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-sm tabular-nums" style={{ color: tone }}>
        {v}
      </dd>
    </div>
  );
}

export function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[0.78rem] uppercase tracking-[0.14em]" style={{ borderColor: `${color}66`, color, background: `${color}12` }}>
      {children}
    </span>
  );
}

export const XP_CSS = `
.xp-grid{background-image:linear-gradient(rgba(123,224,208,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(123,224,208,.035) 1px,transparent 1px);background-size:40px 40px;mask-image:linear-gradient(#000 40%,transparent 100%)}
@keyframes xp-spin{to{transform:rotate(360deg)}}
@keyframes xp-flow{to{stroke-dashoffset:-24}}
@keyframes xp-pop{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}
@keyframes xp-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
@keyframes xp-blink{50%{opacity:.25}}
.xp-spin{transform-origin:50% 50%;animation:xp-spin 40s linear infinite}
.xp-flow{stroke-dasharray:6 6;animation:xp-flow 700ms linear infinite}
.xp-pop{animation:xp-pop .35s ease-out both}
.xp-shake{animation:xp-shake .3s ease-in-out 1}
.xp-blink{animation:xp-blink 1.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.xp-spin,.xp-flow,.xp-pop,.xp-shake,.xp-blink{animation:none!important}}
`;

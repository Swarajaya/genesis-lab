"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PROV_COLOR, PROVENANCE_LABEL, type Provenance } from "./model";

export function Panel({ title, tag, right, children, className = "", bodyClassName = "p-4", id }: { title?: string; tag?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <section id={id} className={`x5-panel ${className}`} aria-label={title}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2.5" style={{ borderColor: "var(--x5-line)" }}>
          <div className="flex items-center gap-2.5">
            {title && <h2 className="x5-label !text-[0.85rem] !text-[var(--x5-dim)]">{title}</h2>}
            {tag}
          </div>
          {right}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function ProvTag({ prov }: { prov: Provenance }) {
  return (
    <span className="x5-mono inline-flex items-center gap-1 whitespace-nowrap border px-1.5 py-[1px] text-[0.8rem] leading-4 tracking-[0.1em]" style={{ borderColor: `${PROV_COLOR[prov]}55`, color: PROV_COLOR[prov] }} title={PROVENANCE_LABEL[prov]}>
      <span className="inline-block h-1 w-1 rounded-full" style={{ background: PROV_COLOR[prov] }} aria-hidden />
      {PROVENANCE_LABEL[prov]}
    </span>
  );
}

export function usePrefersReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(q.matches);
    const f = () => setR(q.matches);
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return r;
}

/** Interpolates toward a target number so changes read as data transitions, not jumps. */
export function useTicker(target: number, ms = 650): number {
  const reduced = usePrefersReducedMotion();
  const [v, setV] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reduced) {
      cur.current = target;
      setV(target);
      return;
    }
    const start = performance.now();
    from.current = cur.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (target - from.current) * e;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return v;
}

export function Ticker({ value, digits = 1, className = "" }: { value: number; digits?: number; className?: string }) {
  const v = useTicker(value);
  return <span className={`x5-mono tabular-nums ${className}`}>{v.toFixed(digits)}</span>;
}

export function Bar({ value, max = 1, color = "var(--x5-cyan)", label }: { value: number; max?: number; color?: string; label?: string }) {
  const w = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="x5-bar" role="img" aria-label={label ?? `${Math.round(w)} percent`}>
      <i style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export interface Explain {
  what: string;
  source: string;
  assumptions: string[];
}

/** A metric whose provenance can be inspected: click to see what it is, where it came from and what was assumed. */
export function Metric({ label, value, prov, explain, bar, barColor, className = "" }: { label: string; value: ReactNode; prov: Provenance; explain: Explain; bar?: number; barColor?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="group block w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="x5-label group-hover:!text-[var(--x5-dim)]">{label}</span>
          <ProvTag prov={prov} />
        </div>
        <div className="mt-1 flex items-baseline gap-2 text-[var(--x5-text)]">{value}</div>
        {bar !== undefined && (
          <div className="mt-1.5">
            <Bar value={bar} color={barColor} label={label} />
          </div>
        )}
      </button>
      {open && (
        <div id={id} className="x5-rise mt-2 space-y-2 border-l-2 pl-3 text-[0.95rem] leading-relaxed text-[var(--x5-dim)]" style={{ borderColor: PROV_COLOR[prov] }}>
          <p>
            <span className="x5-label block">What it is</span>
            {explain.what}
          </p>
          <p>
            <span className="x5-label block">Where it came from</span>
            {explain.source}
          </p>
          {explain.assumptions.length > 0 && (
            <div>
              <span className="x5-label block">Assumptions</span>
              <ul className="list-disc pl-4">
                {explain.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

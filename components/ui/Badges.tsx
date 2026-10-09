export function LiveBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-ok/30 bg-ok/10 px-2.5 py-1 ${className}`} aria-label="Module is live and operational">
      <span className="live-dot" aria-hidden />
      <span className="label !text-ok">Live</span>
    </span>
  );
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const c = tone === "warn" ? "border-warn/30 bg-warn/[0.07] text-warn" : "border-white/10 bg-white/[0.03] text-dim";
  return (
    <p role="note" className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${c}`}>
      {children}
    </p>
  );
}

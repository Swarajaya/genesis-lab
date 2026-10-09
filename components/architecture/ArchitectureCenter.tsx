"use client";
import { useCallback, useState } from "react";
import type { ArchitectureSnapshot, DiagnosticsReport } from "@/lib/ai/healthTypes";
import { Diagnostics } from "./Diagnostics";
import { Glossary } from "./Glossary";
import { HealthSection, Overview } from "./HealthSection";
import { Registry } from "./Registry";
import { RoutingFlow } from "./RoutingFlow";
import { SystemDiagram } from "./SystemDiagram";

type Provider = "gemini" | "grok";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const json = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message: string } } | null;
  if (!json?.ok || !json.data) throw new Error(json?.error?.message ?? `The server answered with HTTP ${res.status}.`);
  return json.data;
}

/**
 * Larger type for this page only. Scoped to <main class="arch-xl">, so no other route is affected
 * and globals.css is untouched (same opt-in approach the /lab page uses).
 */
const TYPE_SCALE = `
.arch-xl .arch-h1 { font-size: clamp(2.6rem, 1.6vw + 1.9rem, 3rem); }
.arch-xl .arch-h2 { font-size: clamp(1.65rem, 1vw + 1.2rem, 2rem); }
.arch-xl .arch-h3 { font-size: clamp(1.25rem, 0.4vw + 1.1rem, 1.4rem); }
@media (min-width: 640px) {
  .arch-xl .text-xs { font-size: 0.9375rem; line-height: 1.5; }
  .arch-xl .text-sm { font-size: 1.0625rem; line-height: 1.6; }
  .arch-xl .text-base { font-size: 1.125rem; line-height: 1.65; }
  .arch-xl .text-lg { font-size: 1.25rem; line-height: 1.6; }
  .arch-xl .text-xl { font-size: 1.5rem; line-height: 1.3; }
  .arch-xl .text-2xl { font-size: 1.75rem; line-height: 1.25; }
  .arch-xl .label { font-size: 0.875rem; letter-spacing: 0.14em; }
}
@media (max-width: 639px) {
  .arch-xl .text-xs { font-size: 0.875rem; }
  .arch-xl .label { font-size: 0.75rem; }
}
`;

const NAV = [
  ["health", "Health"],
  ["diagram", "System map"],
  ["routing", "Routing"],
  ["registry", "Providers & keys"],
  ["diagnostics", "Diagnostics"],
  ["plain", "Plain English"],
] as const;

export default function ArchitectureCenter({ initial }: { initial: ArchitectureSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  const test = useCallback(async (p: Provider) => {
    setBusy((b) => ({ ...b, [p]: true }));
    setErrors((e) => ({ ...e, [p]: null }));
    try {
      setSnap(await call<ArchitectureSnapshot>("/api/ai/health", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p }) }));
    } catch (err) {
      setErrors((e) => ({ ...e, [p]: err instanceof Error ? err.message : "The test could not be started." }));
    } finally {
      setBusy((b) => ({ ...b, [p]: false }));
    }
  }, []);

  const runDiagnostics = useCallback(async () => {
    setDiagBusy(true);
    setDiagError(null);
    try {
      const data = await call<{ report: DiagnosticsReport; snapshot: ArchitectureSnapshot }>("/api/ai/diagnostics", { method: "POST" });
      setReport(data.report);
      setSnap(data.snapshot);
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : "Diagnostics could not run.");
    } finally {
      setDiagBusy(false);
    }
  }, []);

  return (
    <main id="main" className="arch-xl relative mx-auto w-[95%] max-w-none pb-6 pt-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[30rem] scan opacity-50" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[64rem] max-w-full -translate-x-1/2 rounded-full bg-signal/10 blur-3xl" />

      <style>{TYPE_SCALE}</style>
      <header>
        <p className="label !text-signal">Genesis Lab — AI Infrastructure Center</p>
        <h1 className="arch-h1 display mt-2">How Genesis Lab works</h1>
        <p className="mt-2 max-w-5xl text-lg leading-relaxed text-dim">
          A live view of the AI behind the six experiments: which providers are set up, whether they really respond, and what happens when one fails.
        </p>
      </header>

      <div className="mt-5"><Overview snap={snap} /></div>

      <nav aria-label="On this page" className="sticky top-14 z-30 mt-4 overflow-x-auto rounded-xl border border-white/[0.07] bg-void/80 px-2 py-1.5 backdrop-blur-xl">
        <ul className="flex gap-1.5">
          {NAV.map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="block whitespace-nowrap rounded-full px-4 py-1.5 text-base text-dim transition hover:bg-white/10 hover:text-text">{label}</a></li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 space-y-12">
        <HealthSection snap={snap} busy={busy} errors={errors} onTest={test} />
        <SystemDiagram snap={snap} />
        <RoutingFlow snap={snap} />
        <Registry snap={snap} />
        <Diagnostics report={report} busy={diagBusy} error={diagError} onRun={runDiagnostics} />
        <Glossary />
      </div>
      <p className="mt-8 text-xs text-faint">Simulation prototypes for demonstration. Not medical, financial or security advice.</p>
    </main>
  );
}

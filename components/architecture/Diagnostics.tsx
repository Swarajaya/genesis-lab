"use client";
import { Loader2, Stethoscope } from "lucide-react";
import type { CheckStatus, DiagnosticsReport } from "@/lib/ai/healthTypes";
import { Panel, Pill, SectionHead, When } from "./shared";

const TONES: Record<CheckStatus, { tone: "ok" | "bad" | "warn" | "mute"; text: string }> = {
  pass: { tone: "ok", text: "Pass" },
  fail: { tone: "bad", text: "Fail" },
  warn: { tone: "warn", text: "Attention" },
  skipped: { tone: "mute", text: "Skipped" },
};

export function Diagnostics({ report, busy, error, onRun }: { report: DiagnosticsReport | null; busy: boolean; error: string | null; onRun: () => void }) {
  const groups = report ? (["Providers", "Database", "Application"] as const).map((g) => [g, report.checks.filter((c) => c.group === g)] as const) : [];
  return (
    <section aria-labelledby="diagnostics" className="scroll-mt-24">
      <SectionHead id="diagnostics" eyebrow="Diagnostics" title="Run a full check" lead="Runs on the server with time limits. It tests what can really be tested and marks everything else “Skipped”, never as a pass." />
      <Panel className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={onRun} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-signal px-5 py-2.5 text-sm font-medium text-[#04110e] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Stethoscope className="h-4 w-4" aria-hidden />}
            {busy ? "Running checks…" : "Run System Diagnostics"}
          </button>
          {report ? <p className="text-sm text-dim">Finished <When iso={report.finishedAt} /></p> : <p className="text-sm text-faint">Not run yet.</p>}
          {error ? <p className="text-sm text-bad">{error}</p> : null}
        </div>
        {report ? (
          <div className="mt-4 grid items-start gap-4 lg:grid-cols-3">
            {groups.map(([g, checks]) => (
              <div key={g}>
                <p className="label mb-2">{g}</p>
                <ul className="space-y-2">
                  {checks.map((c) => (
                    <li key={c.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
                      <div className="flex items-start justify-between gap-3"><p className="text-base font-medium">{c.label}</p><Pill tone={TONES[c.status].tone}>{TONES[c.status].text}</Pill></div>
                      <p className="mt-1 text-base leading-relaxed text-dim">{c.detail}</p>
                      <p className="mt-1 text-xs text-faint">{c.latencyMs !== undefined ? `${c.latencyMs} ms · ` : ""}<When iso={c.checkedAt} /></p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </section>
  );
}

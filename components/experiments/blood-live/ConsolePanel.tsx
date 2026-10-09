"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Glass } from "@/components/ui/Glass";
import { postJson, toUiError } from "@/lib/client";
import type { LiveEvent } from "@/lib/engines/blood/live";

export interface ConsoleItem {
  id: string;
  label: string;
  hint: string;
  danger?: boolean;
}

export const CONSOLE_ITEMS: ConsoleItem[] = [
  { id: "donor_cancels", label: "Donor cancels", hint: "Selected donor goes offline, allocations recalculate", danger: true },
  { id: "unit_expires", label: "Blood unit expires", hint: "Selected (or soonest-expiring) unit is removed", danger: true },
  { id: "new_donor", label: "New donor arrives", hint: "A walk-in donor joins the inventory" },
  { id: "emergency_worsens", label: "Emergency worsens", hint: "Selected patient gets more urgent or needs more units", danger: true },
  { id: "hospital_request", label: "Hospital request", hint: "A new patient request arrives" },
  { id: "donor_returns", label: "Donor returns", hint: "An offline donor comes back" },
  { id: "escalate", label: "Escalate patient", hint: "Selected patient becomes CRITICAL", danger: true },
];

interface Explained {
  question: string;
  facts: string[];
  explanation: { summary: string; points: string[] } | null;
  aiNote: string | null;
  provider: string | null;
}

export function ConsolePanel({
  sessionId, token, phase, busy, stressRunning, onAction, onStress, feed, selectedDonor, focusPatient, donorAssigned,
}: {
  sessionId: string;
  token: string;
  phase: string;
  busy: boolean;
  stressRunning: boolean;
  onAction: (id: string) => void;
  onStress: () => void;
  feed: LiveEvent[];
  selectedDonor: string | null;
  focusPatient: string | null;
  donorAssigned: boolean;
}) {
  const [ex, setEx] = useState<Explained | null>(null);
  const [exBusy, setExBusy] = useState(false);
  const [exErr, setExErr] = useState<string | null>(null);
  const idle = phase === "idle";

  const explain = async (kind: "donor_selected" | "donor_rejected" | "allocation_changed" | "priority" | "what_changed") => {
    setExBusy(true);
    setExErr(null);
    try {
      setEx(await postJson<Explained>(`/api/blood/live/${sessionId}/explain`, { token, kind, patientId: focusPatient ?? undefined, donorCode: selectedDonor ?? undefined }));
    } catch (e) {
      setExErr(toUiError(e).message);
    } finally {
      setExBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Glass className="p-4">
        <h3 className="label mb-3">Event console</h3>
        <div className="grid grid-cols-2 gap-2">
          {CONSOLE_ITEMS.map((i) => (
            <button
              key={i.id}
              type="button"
              title={i.hint}
              disabled={busy || stressRunning || idle}
              onClick={() => onAction(i.id)}
              className={`rounded-xl border px-3 py-2.5 text-left text-xs font-medium tracking-wide transition disabled:pointer-events-none disabled:opacity-35 ${i.danger ? "border-bad/25 bg-bad/[0.05] text-text hover:bg-bad/10" : "border-white/10 bg-white/[0.03] text-text hover:bg-white/[0.07]"}`}
            >
              {i.label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || stressRunning}
            onClick={onStress}
            className="col-span-2 rounded-xl border border-warn/40 bg-warn/[0.07] px-3 py-3 text-sm font-semibold tracking-[0.12em] text-warn transition hover:bg-warn/15 disabled:pointer-events-none disabled:opacity-40"
          >
            {stressRunning ? "SYSTEM UNDER STRESS…" : "⚡ STRESS TEST"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-faint">Select a donor or patient first to target it. Otherwise a deterministic default is used.</p>
      </Glass>

      <Glass className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="label">Why? (AI explanation)</h3>
          {ex?.provider && <span className="font-mono text-[10px] text-faint">via {ex.provider}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" disabled={exBusy || idle || !selectedDonor} onClick={() => explain(donorAssigned ? "donor_selected" : "donor_rejected")}>
            This donor
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" disabled={exBusy || idle || !focusPatient} onClick={() => explain("priority")}>
            This priority
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" disabled={exBusy || idle} onClick={() => explain("allocation_changed")}>
            Allocation change
          </Button>
          <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" disabled={exBusy || idle} onClick={() => explain("what_changed")}>
            What changed
          </Button>
        </div>
        <div className="mt-3 min-h-[3rem] text-sm" aria-live="polite">
          {exBusy && <p className="text-dim">Asking the explainer…</p>}
          {exErr && <p className="text-bad">{exErr}</p>}
          {!exBusy && ex && (
            <div className="space-y-2">
              <p className="text-xs text-faint">{ex.question}</p>
              {ex.explanation ? (
                <>
                  <p className="text-text">{ex.explanation.summary}</p>
                  <ul className="list-disc space-y-1 pl-4 text-dim">{ex.explanation.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </>
              ) : (
                ex.aiNote && <p className="text-xs text-warn">{ex.aiNote}</p>
              )}
              <details className="text-xs text-dim">
                <summary className="cursor-pointer text-faint">Engine facts</summary>
                <ul className="mt-1 list-disc space-y-1 pl-4">{ex.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </details>
            </div>
          )}
          {!exBusy && !ex && !exErr && <p className="text-xs text-faint">The engine decides. AI only explains.</p>}
        </div>
      </Glass>

      <Glass className="p-4">
        <h3 className="label mb-3">Live feed</h3>
        <ol className="max-h-64 space-y-1.5 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed" aria-live="off">
          {[...feed].reverse().map((e) => (
            <li key={e.seq} className="flex gap-2 text-dim">
              <span className="shrink-0 text-faint">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
              <span className="text-text/90">{e.message}</span>
            </li>
          ))}
        </ol>
      </Glass>
    </div>
  );
}

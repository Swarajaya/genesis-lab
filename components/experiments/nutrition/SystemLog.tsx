"use client";
import type { QuantumResult } from "@/lib/engines/quantum";
import { EngineDot } from "./LabHero";
import { pct, type EngineRow } from "./labModel";

/** Live system log. Every row maps to a real server stage or finished computation; convergence is read from the optimizer trace. */
export function SystemLog({ rows, quantum, replayStep, visible }: { rows: EngineRow[]; quantum: QuantumResult | undefined; replayStep: number | null; visible: boolean }) {
  if (!visible) return null;
  const conv = quantum && quantum.qubits > 0 && replayStep !== null ? `${pct(quantum.trace[Math.min(replayStep, quantum.trace.length - 1)].pOptimal)}%` : "—";
  const list: { key: string; label: string; state: EngineRow["state"]; text: string }[] = [
    ...rows.filter((r) => r.key !== "impact" && r.key !== "synth" && r.key !== "quantum"),
    rows.find((r) => r.key === "quantum")!,
    { key: "conv", label: "State convergence", state: replayStep !== null && quantum ? (replayStep >= quantum.steps ? "done" : "active") : "standby", text: conv },
    rows.find((r) => r.key === "synth")!,
  ];
  return (
    <ul role="status" aria-live="polite" className="wg-mono space-y-1.5 border border-[color:var(--wg-line)] bg-black/40 p-4 text-[0.84rem] uppercase tracking-[0.14em]" aria-label="System log">
      {list.map((r) => (
        <li key={r.key} className="flex items-center gap-2.5">
          <EngineDot state={r.state} />
          <span className="text-white/75">{r.label}</span>
          <span className="min-w-4 flex-1 translate-y-[3px] border-b border-dotted border-white/15" aria-hidden />
          <span className={r.state === "done" ? "text-[color:var(--wg-green)]" : r.state === "active" ? "text-[color:var(--wg-cyan)]" : "text-white/40"}>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

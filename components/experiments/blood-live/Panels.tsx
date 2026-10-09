"use client";
import { motion } from "framer-motion";
import { Glass } from "@/components/ui/Glass";
import type { Metrics, Snapshot } from "@/lib/engines/blood/live";
import { Chip, DONOR_STATUS_COLOR, PATIENT_STATUS_COLOR } from "./ui";

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#070b12]/85 px-3 py-2.5">
      <div className="label !text-[9px]">{label}</div>
      <motion.div key={value} initial={{ opacity: 0.2, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="mt-0.5 font-mono text-xl tabular-nums" style={{ color: tone ?? "#e8edf5" }}>
        {value}
      </motion.div>
    </div>
  );
}

export function MetricsBar({ m }: { m: Metrics }) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Live metrics">
      <Tile label="Patients" value={m.patients} />
      <Tile label="Units required" value={m.unitsRequired} />
      <Tile label="Units available" value={m.unitsAvailable} />
      <Tile label="Critical shortage" value={m.criticalShortage} tone={m.criticalShortage > 0 ? "#ff6b7a" : "#5fe3a1"} />
      <Tile label="Live donors" value={m.liveDonors} tone="#b48bff" />
      <Tile label="Matches" value={m.matches} />
      <Tile label="Allocated" value={m.allocated} tone="#5fe3a1" />
      <Tile label="Pending" value={m.pending} tone={m.pending > 0 ? "#f2c260" : undefined} />
    </div>
  );
}

export function PatientsPanel({ snap, focus, onFocus, onEscalate, busy }: { snap: Snapshot; focus: string | null; onFocus: (id: string) => void; onEscalate: (id: string) => void; busy: boolean }) {
  const rank = { critical: 0, urgent: 1, routine: 2 } as const;
  const list = [...snap.patients].sort((a, b) => Number(a.status === "RESOLVED") - Number(b.status === "RESOLVED") || rank[a.urgency] - rank[b.urgency] || a.no - b.no);
  return (
    <Glass className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="label">Patients</h3>
        <span className="font-mono text-[11px] text-faint">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-dim">No emergency yet. Press START EMERGENCY.</p>
      ) : (
        <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
          {list.map((p) => {
            const pct = (n: number) => `${Math.min(100, (n / p.unitsNeeded) * 100)}%`;
            const active = (focus ?? snap.focusPatient) === p.id;
            return (
              <li key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onFocus(p.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onFocus(p.id)}
                  className={`cursor-pointer rounded-xl border px-3 py-2 transition ${active ? "border-signal/50 bg-signal/[0.06]" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text">{p.id}</span>
                      <span className="font-mono text-sm text-text">{p.abo}{p.rh}</span>
                      {p.component === "PLASMA" && <span className="label !text-[9px]">plasma</span>}
                      {p.antibodies.length > 0 && <span className="label !text-[9px]">{p.antibodies.join(" ")}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-dim">{p.unitsNeeded}u</span>
                      <Chip color={PATIENT_STATUS_COLOR[p.status]}>{p.status}</Chip>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-[#f2c260]/70 transition-all duration-500" style={{ width: pct(p.covered + p.pending) }} />
                      <div className="absolute inset-y-0 left-0 rounded-full bg-ok transition-all duration-500" style={{ width: pct(p.covered) }} />
                    </div>
                    {p.urgency !== "critical" && p.status !== "RESOLVED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEscalate(p.id);
                        }}
                        className="rounded-full border border-bad/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-bad transition hover:bg-bad/10 disabled:opacity-40"
                      >
                        escalate
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Glass>
  );
}

export function InventoryPanel({ snap, selected, onSelect }: { snap: Snapshot; selected: string | null; onSelect: (code: string | null) => void }) {
  const list = [...snap.donors].sort((a, b) => Number(b.source === "live") - Number(a.source === "live") || a.code.localeCompare(b.code));
  return (
    <Glass className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="label">Live inventory</h3>
        <span className="font-mono text-[11px] text-faint">{snap.metrics.unitsAvailable} units online</span>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-dim">Inventory appears when the emergency starts, or when a phone joins as a donor.</p>
      ) : (
        <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1">
          {list.map((d) => (
            <motion.li key={d.code} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(selected === d.code ? null : d.code)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(selected === d.code ? null : d.code)}
                className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 transition ${selected === d.code ? "border-signal/50 bg-signal/[0.06]" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"} ${d.status === "OFFLINE" || d.status === "EXPIRED" ? "opacity-55" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-xs ${d.source === "live" ? "text-[#d9c6ff]" : "text-text"}`}>{d.code}</span>
                  <span className="font-mono text-sm text-text">{d.abo}{d.rh}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-dim">{d.units}u</span>
                  <Chip color={DONOR_STATUS_COLOR[d.status]}>{d.status}</Chip>
                </div>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </Glass>
  );
}

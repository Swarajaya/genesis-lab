"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { allDonorsFromSnapshot } from "@/lib/blood-live/snapshotDonors";
import { evaluateFor, type Snapshot } from "@/lib/engines/blood/live";
import LiveNetworkSvg from "./LiveNetworkSvg";
import { NODE_COLOR, NODE_LABEL, nodeState, type LiveNetworkProps, type LiveNode } from "./liveLayout";

const LiveScene = dynamic(() => import("./LiveScene"), { ssr: false, loading: () => <div className="h-full w-full" aria-hidden /> });

interface Props {
  snap: Snapshot;
  focusPatientId: string | null;
  selected: string | null;
  hovered: string | null;
  onSelect: (code: string | null) => void;
  onHover: (code: string | null) => void;
  highlight: string[];
  burst: LiveNetworkProps["burst"];
}

/** Maps the authoritative snapshot to nodes (colour = verdict against the focused patient) and renders 3D or 2D. */
export default function LiveNetwork({ snap, focusPatientId, selected, hovered, onSelect, onHover, highlight, burst }: Props) {
  const caps = useCapabilities();
  const focus = snap.patients.find((p) => p.id === focusPatientId) ?? snap.patients.find((p) => p.id === snap.focusPatient) ?? null;

  const { nodes, verdicts } = useMemo(() => {
    const donors = allDonorsFromSnapshot(snap);
    const verdicts = new Map<string, ReturnType<typeof evaluateFor>>();
    const nodes: LiveNode[] = snap.donors.map((d) => {
      let v: "MATCH" | "PARTIAL" | "INCOMPATIBLE" | null = null;
      const eng = donors.find((x) => x.code === d.code);
      if (focus && eng) {
        const res = evaluateFor({ ...focus, resolved: false, source: "scenario" }, { ...eng, status: "online" }, focus.unitsNeeded);
        verdicts.set(d.code, res);
        v = res.verdict;
      }
      return { code: d.code, group: `${d.abo}${d.rh}`, units: d.units, state: nodeState(d, v), source: d.source, committed: d.committed, distanceKm: d.distanceKm, status: d.status };
    });
    return { nodes, verdicts };
  }, [snap, focus]);

  const severity = Math.min(1, snap.phase === "idle" ? 0 : snap.metrics.criticalShortage / 6 + snap.metrics.shortage / 30 + (snap.phase === "stress" ? 0.15 : 0));
  const shown = hovered ?? selected;
  const node = shown ? nodes.find((n) => n.code === shown) : null;
  const res = shown ? verdicts.get(shown) : null;
  const donor = shown ? snap.donors.find((d) => d.code === shown) : null;
  const assigned = shown ? snap.assignments.filter((a) => a.donorCode === shown) : [];

  const sceneProps: LiveNetworkProps = { nodes, selected, hovered, onSelect, onHover, highlight, burst, severity };

  return (
    <div className="relative h-full w-full">
      {caps.ready && !caps.webgl ? <LiveNetworkSvg {...sceneProps} /> : <LiveScene {...sceneProps} caps={caps} />}

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3 gap-y-1">
        {(["match", "partial", "incompatible", "transit", "live", "offline"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: NODE_COLOR[s] }} />
            {NODE_LABEL[s]}
          </span>
        ))}
      </div>

      {node && donor && (
        <div className="pointer-events-none absolute right-3 top-3 w-64 rounded-2xl border border-white/10 bg-[#070b12]/90 p-3.5 text-xs shadow-2xl" role="status">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-text">{donor.code}</span>
            <span className="label !text-[10px]" style={{ color: NODE_COLOR[node.state] }}>{NODE_LABEL[node.state]}</span>
          </div>
          <p className="mt-1 text-dim">
            {donor.abo}
            {donor.rh} · {donor.units} unit{donor.units === 1 ? "" : "s"} · {donor.distanceKm} km · {donor.status}
          </p>
          {focus && res && (
            <p className="mt-2 text-dim">
              vs <span className="text-text">{focus.id}</span>: <span style={{ color: res.verdict === "MATCH" ? "#5fe3a1" : res.verdict === "PARTIAL" ? "#f2c260" : "#ff6b7a" }}>{res.verdict}</span> · score {res.score}
            </p>
          )}
          {assigned.length > 0 && <p className="mt-1 text-dim">Allocated: {assigned.map((a) => `${a.units}u → ${a.patientId}${a.kind === "offer" ? " (offer)" : ""}`).join(", ")}</p>}
          {selected === shown && res && (
            <ul className="mt-2 space-y-1 border-t border-white/10 pt-2">
              {res.factors.map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span className={f.status === "pass" ? "text-ok" : f.status === "warn" ? "text-warn" : "text-bad"}>●</span>
                  <span className="text-dim">{f.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

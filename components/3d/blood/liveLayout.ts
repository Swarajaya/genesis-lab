import type { DonorView } from "@/lib/engines/blood/live";

export type NodeState = "match" | "partial" | "incompatible" | "transit" | "live" | "offline";

export const NODE_COLOR: Record<NodeState, string> = {
  match: "#5fe3a1",
  partial: "#f2c260",
  incompatible: "#ff6b7a",
  transit: "#5b9dff",
  live: "#b48bff",
  offline: "#8d96a6",
};

export const NODE_LABEL: Record<NodeState, string> = {
  match: "Compatible",
  partial: "Partial",
  incompatible: "Incompatible",
  transit: "In transit",
  live: "Live donor",
  offline: "Offline / expired",
};

export interface LiveNode {
  code: string;
  group: string;
  units: number;
  state: NodeState;
  source: DonorView["source"];
  committed: number;
  distanceKm: number;
  status: DonorView["status"];
}

export interface LiveNetworkProps {
  nodes: LiveNode[];
  selected: string | null;
  hovered: string | null;
  onSelect: (code: string | null) => void;
  onHover: (code: string | null) => void;
  /** Donor codes to pulse (new match found). */
  highlight: string[];
  /** Accepted donation: animates donor, blood unit, patient. */
  burst: { key: number; code: string } | null;
  /** 0 calm .. 1 severe. Drives hub colour and pulse speed. */
  severity: number;
}

const GOLDEN = 2.399963;
const MAX_KM = 14;

/** Stable position per slot (golden-angle spiral), so nodes never jump when others join or leave. */
export function slotPosition(slot: number, distanceKm: number): { x: number; y: number; z: number; angle: number } {
  const angle = slot * GOLDEN;
  const r = 1.55 + 1.7 * Math.sqrt(Math.min(distanceKm, MAX_KM) / MAX_KM);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, y: Math.sin(slot * 1.7) * 0.32, angle };
}

export function nodeState(d: DonorView, verdict: "MATCH" | "PARTIAL" | "INCOMPATIBLE" | null): NodeState {
  if (d.status === "OFFLINE" || d.status === "EXPIRED") return "offline";
  if (d.source === "live") return "live";
  if (d.committed > 0) return "transit";
  if (verdict === "MATCH") return "match";
  if (verdict === "PARTIAL") return "partial";
  return "incompatible";
}

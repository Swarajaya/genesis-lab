import type { DonorView, PatientView } from "@/lib/engines/blood/live";

export const URGENCY_COLOR = { critical: "#ff6b7a", urgent: "#f2c260", routine: "#7aa2ff" } as const;

export const PATIENT_STATUS_COLOR: Record<PatientView["status"], string> = {
  CRITICAL: "#ff6b7a", URGENT: "#f2c260", ROUTINE: "#7aa2ff", ALLOCATED: "#5fe3a1", WAITING: "#f2c260", RESOLVED: "#8d96a6",
};

export const DONOR_STATUS_COLOR: Record<DonorView["status"], string> = {
  AVAILABLE: "#5fe3a1", ONLINE: "#b48bff", "IN TRANSIT": "#5b9dff", EXPIRING: "#f2c260", OFFLINE: "#8d96a6", EXPIRED: "#8d96a6",
};

export function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ borderColor: `${color}55`, color, background: `${color}14` }}>
      {children}
    </span>
  );
}

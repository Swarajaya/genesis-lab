"use client";
import { AnimatePresence, motion } from "framer-motion";
import type { LiveEvent } from "@/lib/engines/blood/live";

export interface Banner {
  key: number;
  title: string;
  sub: string;
  tone: "match" | "ok" | "warn" | "bad" | "info";
}

const TONE: Record<Banner["tone"], string> = { match: "#b48bff", ok: "#5fe3a1", warn: "#f2c260", bad: "#ff6b7a", info: "#7be0d0" };

/** Turns a feed event into a cinematic banner, or null for events that need no announcement. */
export function bannerFor(e: LiveEvent): Banner | null {
  const d = e.data;
  const key = e.seq;
  switch (e.type) {
    case "DEVICE_CONNECTED": return { key, title: "DEVICE CONNECTED", sub: e.message.replace("DEVICE CONNECTED ", ""), tone: "ok" };
    case "DEVICE_DISCONNECTED": return { key, title: "DEVICE DISCONNECTED", sub: e.message.replace("DEVICE DISCONNECTED ", ""), tone: "info" };
    case "DONOR_JOINED": return { key, title: "NEW LIVE DONOR", sub: e.message.replace("NEW LIVE DONOR ", ""), tone: "match" };
    case "MATCH_FOUND": return { key, title: "LIVE MATCH FOUND", sub: `${d.donorCode} → ${d.patientId} · ${d.units} UNITS`, tone: "match" };
    case "MATCH_ACCEPTED": return { key, title: "LIVE DONOR ACCEPTED", sub: `${d.donorCode} ↓ ${d.units} UNITS ↓ ${d.patientId}`, tone: "ok" };
    case "MATCH_DECLINED": return { key, title: "LIVE DONOR DECLINED", sub: `${d.donorCode} · finding next candidate`, tone: "warn" };
    case "PRIORITY_UPDATED": return { key, title: "PRIORITY UPDATED", sub: e.message.replace("PRIORITY UPDATED: ", ""), tone: "warn" };
    case "EMERGENCY_STARTED": return { key, title: "NEW EMERGENCY", sub: e.message.replace("NEW EMERGENCY: ", ""), tone: "bad" };
    case "EMERGENCY_WORSENED": return { key, title: "EMERGENCY WORSENS", sub: e.message.replace("EMERGENCY WORSENS ", ""), tone: "bad" };
    case "STRESS_STARTED": return { key, title: "SYSTEM UNDER STRESS", sub: "Deterministic stress sequence running", tone: "bad" };
    case "STRESS_STEP": return { key, title: "SYSTEM UNDER STRESS", sub: e.message.replace(/^STRESS \d\/\d: /, ""), tone: "bad" };
    case "EMERGENCY_RESOLVED": return { key, title: "EMERGENCY RESOLUTION", sub: "Allocation engine settled", tone: "ok" };
    case "DONOR_OFFLINE": return { key, title: "DONOR OFFLINE", sub: e.message, tone: "warn" };
    case "UNIT_EXPIRED": return { key, title: "UNIT EXPIRED", sub: e.message, tone: "warn" };
    default: return null;
  }
}

export function BannerStack({ banners }: { banners: Banner[] }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex w-[min(30rem,92%)] -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {banners.map((b) => (
          <motion.div
            key={b.key}
            layout
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="w-full rounded-2xl border bg-[#070b12] px-4 py-2.5 text-center shadow-2xl"
            style={{ borderColor: `${TONE[b.tone]}66`, boxShadow: `0 0 40px -14px ${TONE[b.tone]}` }}
          >
            <div className="font-mono text-[11px] font-semibold tracking-[0.2em]" style={{ color: TONE[b.tone] }}>{b.title}</div>
            <div className="mt-0.5 truncate text-sm text-text">{b.sub}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

import { useSyncExternalStore } from "react";
import type { Lifecycle } from "@/lib/engines/money/engine";
import type { LedgerEvent, MoneyState, Verification, Wallet } from "@/lib/engines/money/policy";

export interface ServerOut {
  wallet: Wallet;
  token: string;
  serverTime: number;
  events: LedgerEvent[];
  persisted: { events: boolean; policy: boolean | null };
  verification?: Verification;
}

export const STATE_COLOR: Record<MoneyState, string> = {
  ISSUED: "#7be0d0",
  ACTIVE: "#5fe3a1",
  PARTIALLY_SPENT: "#67d4f0",
  DEPLETED: "#9aa5b8",
  SUSPENDED: "#f2c260",
  REVOKED: "#ff6b7a",
  EXPIRED: "#ff9f43",
};

/** Colour for each countdown stage. Must be 6-digit hex, because components append an alpha suffix (e.g. `${color}14`). */
export const LIFECYCLE_COLOR: Record<Lifecycle, string> = {
  ACTIVE: "#7be0d0",
  EXPIRING: "#f2c260",
  EXPIRED: "#ff6b7a",
  SPENT: "#6b768a",
};

/** Human countdown: "04m 05s", "03h 04m 05s" or "2d 03h 04m". Never negative. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${p(h)}h ${p(m)}m`;
  if (h > 0) return `${p(h)}h ${p(m)}m ${p(s)}s`;
  return `${p(m)}m ${p(s)}s`;
}

export const DURATIONS = [
  { label: "30 seconds", s: 30 },
  { label: "1 minute", s: 60 },
  { label: "5 minutes", s: 300 },
  { label: "10 minutes", s: 600 },
  { label: "1 hour", s: 3600 },
  { label: "24 hours", s: 86_400 },
  { label: "72 hours", s: 259_200 },
] as const;

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = String(Math.floor((s % 86_400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return d > 0 ? `${d}d ${h}:${m}:${sec}` : `${h}:${m}:${sec}`;
}

export const parseRupees = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

// One shared 1 s ticker for every component that shows live time (instead of one interval per component).
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let tickValue = 0;
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      tickValue = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
};

/** Server-aligned "now" in ms, updated once per second. skew = serverTime - clientTime at last response. */
export function useNow(skew: number): number {
  const t = useSyncExternalStore(subscribe, () => tickValue || (tickValue = Date.now()), () => 0);
  return t + skew;
}

export interface Explanation {
  text: string | null;
  note: string | null;
  provider?: string;
  loading?: boolean;
}

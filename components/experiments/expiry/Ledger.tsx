"use client";
import { useEffect, useState } from "react";
import { eventPayload, inr, type LedgerEvent } from "@/lib/engines/money/policy";
import { sha256Hex } from "./types";
import { Chip } from "./ui";

export type ChainStatus = "verifying" | "valid" | "invalid" | "unavailable";

/** Recomputes every SHA-256 link in the browser. Only reports VALID when that check actually passed. */
export function useChainStatus(events: LedgerEvent[]): { status: ChainStatus; brokenAt?: number } {
  const [res, setRes] = useState<{ for: LedgerEvent[]; status: ChainStatus; brokenAt?: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const done = (r: { status: ChainStatus; brokenAt?: number }) => !cancelled && setRes({ for: events, ...r });
    (async () => {
      if (typeof crypto === "undefined" || !crypto.subtle) return done({ status: "unavailable" });
      let prev: string | null = null;
      for (let i = 0; i < events.length; i++) {
        const { hash, ...rest } = events[i];
        if (rest.prevHash !== prev || (await sha256Hex(eventPayload(rest))) !== hash) return done({ status: "invalid", brokenAt: i });
        prev = hash;
      }
      done({ status: "valid" });
    })().catch(() => done({ status: "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [events]);
  // A result only counts for the exact event list it was computed from.
  return res && res.for === events ? res : { status: "verifying" };
}

export function IntegrityChip({ s }: { s: { status: ChainStatus; brokenAt?: number } }) {
  const m = {
    valid: ["VALID", "#5fe3a1"],
    invalid: [`INVALID @ #${(s.brokenAt ?? 0) + 1}`, "#ff6b7a"],
    verifying: ["VERIFYING", "#9aa5b8"],
    unavailable: ["UNAVAILABLE", "#f2c260"],
  }[s.status];
  return (
    <span role="status">
      <Chip color={m[1]}>{m[0]}</Chip>
    </span>
  );
}

export function LedgerTable({ events, selected, onSelect }: { events: LedgerEvent[]; selected: number | null; onSelect: (seq: number) => void }) {
  const [onlyTx, setOnlyTx] = useState(false);
  const rows = (onlyTx ? events.filter((e) => e.type === "SPEND") : events).slice().reverse();
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 font-mono text-[0.82rem] uppercase tracking-[0.14em] text-dim">
        <input type="checkbox" checked={onlyTx} onChange={(e) => setOnlyTx(e.target.checked)} /> Transactions only
      </label>
      <div className="max-h-[360px] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-left font-mono text-[0.84rem]">
          <caption className="sr-only">Tamper-evident event ledger, newest first. Select a row to open its verification trace.</caption>
          <thead className="sticky top-0 bg-[#060a11]">
            <tr>
              {["Event", "Time", "Type", "Amount", "Purpose", "Result", "Reason", "Balance after", "Policy", "Hash ← prev"].map((h) => (
                <th key={h} scope="col" className="border-b border-white/10 px-2 py-1.5 text-[0.74rem] font-normal uppercase tracking-[0.16em] text-faint">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.seq} className={`border-b border-white/[0.05] align-top ${selected === e.seq ? "bg-white/[0.05]" : ""}`}>
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => onSelect(e.seq)} className="text-signal underline-offset-2 hover:underline" aria-label={`Open trace for ${e.eventId}`}>
                    {e.eventId}
                  </button>
                </td>
                <td className="px-2 py-1.5 text-dim">{new Date(e.ts).toLocaleTimeString([], { hour12: false })}</td>
                <td className="px-2 py-1.5 text-text">{e.type}</td>
                <td className="px-2 py-1.5 tabular-nums">{e.amountPaise ? inr(e.amountPaise) : "—"}</td>
                <td className="px-2 py-1.5 text-dim">{e.purpose ?? "—"}</td>
                <td className={`px-2 py-1.5 ${e.result === "REJECTED" ? "text-bad" : e.result === "APPROVED" ? "text-ok" : "text-dim"}`}>{e.result}</td>
                <td className="px-2 py-1.5 text-dim">{e.reason ?? "—"}</td>
                <td className="px-2 py-1.5 tabular-nums">{inr(e.balanceAfterPaise)}</td>
                <td className="px-2 py-1.5 text-dim">v{e.policyVersion}</td>
                <td className="px-2 py-1.5 text-faint" title={e.hash}>
                  {e.hash.slice(0, 10)}
                  <span className="block text-[0.74rem]">← {e.prevHash ? e.prevHash.slice(0, 6) : "genesis"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

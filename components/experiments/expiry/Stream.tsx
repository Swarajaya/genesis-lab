"use client";
import { memo } from "react";
import { inr, type LedgerEvent } from "@/lib/engines/money/policy";

const hhmmss = (ts: string) => new Date(ts).toLocaleTimeString([], { hour12: false });

export const EventStream = memo(function EventStream({ events, selected, onSelect, focus }: { events: LedgerEvent[]; selected: number | null; onSelect: (seq: number) => void; focus: string | null }) {
  const list = [...events].reverse();
  return (
    <div className="max-h-[320px] overflow-y-auto bg-black/40 p-2 font-mono text-[0.86rem]" role="log" aria-label="Live transaction stream">
      {list.length === 0 && <p className="p-2 text-faint">awaiting events…</p>}
      {list.map((e, i) => {
        const bad = e.result === "REJECTED";
        const good = e.result === "APPROVED";
        const hit = focus && e.trace?.checks.find((c) => c.rule === focus);
        const dim = focus && !hit;
        const col = bad ? "#ff6b7a" : good ? "#5fe3a1" : e.type === "EXPIRE" ? "#ff9f43" : "#7be0d0";
        return (
          <button
            key={e.seq}
            type="button"
            onClick={() => onSelect(e.seq)}
            aria-current={selected === e.seq}
            className={`block w-full border-l-2 px-2 py-1 text-left transition hover:bg-white/[0.04] ${i === 0 ? "xp-pop" : ""} ${selected === e.seq ? "bg-white/[0.06]" : ""}`}
            style={{ borderColor: hit ? (hit.ok ? "#7be0d0" : "#ff6b7a") : selected === e.seq ? col : "transparent", opacity: dim ? 0.35 : 1 }}
          >
            <span className="text-faint">{e.eventId}</span> <span className="text-dim">{hhmmss(e.ts)}</span> <span className="text-text">{e.type.padEnd(7)}</span>
            {e.amountPaise > 0 && <span className="text-text"> {inr(e.amountPaise)}</span>} {e.purpose && <span className="text-dim">{e.purpose}</span>}
            <span className="block pl-[4.5ch]" style={{ color: col }}>
              {e.result === "SUCCESS" ? `${e.stateBefore ?? "·"} → ${e.stateAfter}` : e.result}
              {e.reason && <span className="text-bad/90"> {e.reason}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
});

/** Value flowing through the policy boundary. Approved paths pass; rejected paths stop at the boundary. */
export const MoneyFlow = memo(function MoneyFlow({ events, issued, remaining }: { events: LedgerEvent[]; issued: number; remaining: number }) {
  const spends = events.filter((e) => e.type === "SPEND").slice(-6);
  const y0 = 112;
  const H = y0 + Math.max(1, spends.length) * 30 + 8;
  return (
    <svg viewBox={`0 0 440 ${H}`} className="w-full" role="img" aria-label="Live money flow">
      <rect x="10" y="6" width="96" height="24" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.2)" />
      <text x="58" y="21" textAnchor="middle" fontSize="10.4" letterSpacing="1.6" className="font-mono" fill="#9aa5b8">
        ISSUER
      </text>
      <line x1="58" y1="30" x2="58" y2="56" stroke="#7be0d0" strokeWidth="1.2" />
      <text x="66" y="46" fontSize="10.4" className="font-mono" fill="#7be0d0">
        {inr(issued)}
      </text>
      <rect x="10" y="56" width="96" height="30" fill="rgba(123,224,208,.08)" stroke="#7be0d0" />
      <text x="58" y="68" textAnchor="middle" fontSize="9.2" letterSpacing="1.2" className="font-mono" fill="#9aa5b8">
        MONEY OBJECT
      </text>
      <text x="58" y="80" textAnchor="middle" fontSize="11.0" className="font-mono" fill="#e8edf5">
        {inr(remaining)}
      </text>
      <line x1="58" y1="86" x2="58" y2={y0 + spends.length * 30 - 18} stroke="rgba(255,255,255,.25)" />
      <line x1="210" y1="92" x2="210" y2={H - 4} stroke="#f2c260" strokeDasharray="3 4" strokeWidth="1" />
      <text x="210" y="102" textAnchor="middle" fontSize="9.2" letterSpacing="1.4" className="font-mono" fill="#f2c260">
        POLICY BOUNDARY
      </text>
      {spends.length === 0 && (
        <text x="120" y={y0 + 14} fontSize="11.0" className="font-mono" fill="#6b768a">
          no transactions yet
        </text>
      )}
      {spends.map((e, i) => {
        const y = y0 + i * 30 + 8;
        const ok = e.result === "APPROVED";
        const latest = i === spends.length - 1;
        return (
          <g key={e.seq}>
            <text x="68" y={y - 5} fontSize="10.4" className="font-mono" fill="#e8edf5">
              {inr(e.amountPaise)}
            </text>
            <line x1="58" y1={y} x2={ok ? 340 : 204} y2={y} stroke={ok ? "#5fe3a1" : "#ff6b7a"} strokeWidth="1.4" className={ok && latest ? "xp-flow" : undefined} />
            {ok ? (
              <>
                <rect x="340" y={y - 10} width="90" height="20" fill="rgba(95,227,161,.08)" stroke="#5fe3a1" />
                <text x="385" y={y + 3} textAnchor="middle" fontSize="10.4" className="font-mono" fill="#5fe3a1">
                  {e.purpose} ✓
                </text>
              </>
            ) : (
              <>
                <text x="210" y={y + 3.5} textAnchor="middle" fontSize="13.4" className="font-mono" fill="#ff6b7a" style={{ paintOrder: "stroke" }} stroke="#060a11" strokeWidth="4">
                  ✕
                </text>
                <text x="222" y={y + 3} fontSize="9.8" className="font-mono" fill="#ff6b7a">
                  {e.reason}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
});

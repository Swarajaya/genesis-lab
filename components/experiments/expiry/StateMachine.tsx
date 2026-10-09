"use client";
import { memo, useMemo } from "react";
import { STATE_EDGES, displayState, type LedgerEvent, type MoneyState, type Wallet } from "@/lib/engines/money/policy";
import { STATE_COLOR, useNow } from "./types";

const POS: Record<MoneyState, [number, number]> = {
  ISSUED: [58, 42],
  ACTIVE: [182, 42],
  PARTIALLY_SPENT: [316, 42],
  DEPLETED: [442, 42],
  SUSPENDED: [182, 138],
  EXPIRED: [316, 138],
  REVOKED: [442, 138],
};
const W = 110;
const H = 32;

/** Lifecycle graph. Cyan edges are transitions that actually happened in this money object's ledger. */
export const StateMachine = memo(function StateMachine({ wallet, events, skew }: { wallet: Wallet; events: LedgerEvent[]; skew: number }) {
  const now = useNow(skew);
  const state = displayState(wallet.status, wallet.policy.expiresAt, now);
  const taken = useMemo(() => new Set(events.filter((e) => e.stateBefore && e.stateBefore !== e.stateAfter).map((e) => `${e.stateBefore}>${e.stateAfter}`)), [events]);
  const edgeD = (a: MoneyState, b: MoneyState, i: number) => {
    const [ax, ay] = POS[a];
    const [bx, by] = POS[b];
    if (ay === by) return Math.abs(bx - ax) > 140 ? `M${ax},${ay - H / 2} Q${(ax + bx) / 2},${ay - 34} ${bx},${by - H / 2}` : `M${ax + W / 2},${ay} L${bx - W / 2},${by}`;
    return `M${ax + (i % 2 ? 14 : -14)},${ay + (ay < by ? H / 2 : -H / 2)} L${bx + (i % 2 ? -14 : 14)},${by + (ay < by ? -H / 2 : H / 2)}`;
  };
  return (
    <svg viewBox="0 0 500 180" className="w-full" role="img" aria-label={`Lifecycle state machine, current state ${state}`}>
      <defs>
        <marker id="xp-arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 z" fill="currentColor" />
        </marker>
      </defs>
      {STATE_EDGES.map((e, i) => {
        const hit = taken.has(`${e.from}>${e.to}`);
        return <path key={`${e.from}${e.to}${e.via}`} d={edgeD(e.from, e.to, i)} fill="none" stroke={hit ? "#7be0d0" : "rgba(255,255,255,.14)"} strokeWidth={hit ? 1.4 : 0.8} color={hit ? "#7be0d0" : "rgba(255,255,255,.3)"} markerEnd="url(#xp-arr)" />;
      })}
      {(Object.keys(POS) as MoneyState[]).map((s) => {
        const [x, y] = POS[s];
        const on = s === state;
        const c = STATE_COLOR[s];
        return (
          <g key={s} transform={`translate(${x - W / 2},${y - H / 2})`} aria-current={on ? "step" : undefined}>
            <rect width={W} height={H} fill={on ? `${c}26` : "rgba(6,10,17,.9)"} stroke={on ? c : "rgba(255,255,255,.16)"} strokeWidth={on ? 1.6 : 1} />
            <text x={W / 2} y={20} textAnchor="middle" fontSize="9.5" letterSpacing="0.8" className="font-mono" fill={on ? c : "#9aa5b8"}>
              {s.replace("_", " ")}
            </text>
            {on && <circle cx={7} cy={H / 2} r="2.2" fill={c} className="xp-blink" />}
          </g>
        );
      })}
    </svg>
  );
});

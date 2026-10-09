"use client";
import { memo } from "react";
import { displayState, inr, type Wallet } from "@/lib/engines/money/policy";
import { STATE_COLOR, fmtClock, useNow } from "./types";
import { Chip } from "./ui";

const R_TIME = 132;
const R_BAL = 112;
const C_TIME = 2 * Math.PI * R_TIME;
const C_BAL = 2 * Math.PI * R_BAL;

/** Central money object. Ring = real remaining lifetime; inner arc = remaining value. */
export const MoneyObject = memo(function MoneyObject({ wallet, skew, flash }: { wallet: Wallet; skew: number; flash: "approved" | "rejected" | null }) {
  const now = useNow(skew);
  const p = wallet.policy;
  const exp = Date.parse(p.expiresAt);
  const start = Date.parse(wallet.policies[0].createdAt);
  const state = displayState(wallet.status, p.expiresAt, now);
  const live = state === "ACTIVE" || state === "PARTIALLY_SPENT" || state === "ISSUED";
  const total = Math.max(1, exp - start);
  const remaining = Math.max(0, exp - now);
  const frac = live || state === "SUSPENDED" ? Math.min(1, remaining / total) : 0;
  const expiring = (live || state === "SUSPENDED") && frac < 0.25;
  const ringColor = state === "EXPIRED" ? STATE_COLOR.EXPIRED : expiring ? "#f2c260" : STATE_COLOR[state];
  const balFrac = wallet.initialPaise ? wallet.balancePaise / wallet.initialPaise : 0;
  const tickMarks = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="flex flex-col items-center">
      <div className={`relative aspect-square w-full max-w-[460px] ${flash === "rejected" ? "xp-shake" : ""}`} aria-label={`Money object, ${inr(wallet.balancePaise)} remaining, state ${state}`} role="img">
        <svg viewBox="0 0 320 320" className="h-full w-full">
          <g opacity={state === "EXPIRED" || state === "REVOKED" ? 0.45 : 1}>
            <g className={live ? "xp-spin" : undefined} opacity="0.55">
              <circle cx="160" cy="160" r="148" fill="none" stroke={ringColor} strokeWidth="0.8" strokeDasharray="2 7" />
            </g>
            {tickMarks.map((i) => {
              const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
              const major = i % 5 === 0;
              return <line key={i} x1={160 + Math.cos(a) * (R_TIME + 10)} y1={160 + Math.sin(a) * (R_TIME + 10)} x2={160 + Math.cos(a) * (R_TIME + (major ? 4 : 7))} y2={160 + Math.sin(a) * (R_TIME + (major ? 4 : 7))} stroke="rgba(255,255,255,.18)" strokeWidth={major ? 1 : 0.6} />;
            })}
            <circle cx="160" cy="160" r={R_TIME} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="5" />
            <circle cx="160" cy="160" r={R_TIME} fill="none" stroke={ringColor} strokeWidth="5" strokeLinecap="butt" strokeDasharray={C_TIME} strokeDashoffset={C_TIME * (1 - frac)} transform="rotate(-90 160 160)" style={{ transition: "stroke-dashoffset 1s linear, stroke .6s" }} />
            <circle cx="160" cy="160" r={R_BAL} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="2" />
            <circle cx="160" cy="160" r={R_BAL} fill="none" stroke="#7be0d0" strokeWidth="2" strokeDasharray={C_BAL} strokeDashoffset={C_BAL * (1 - balFrac)} transform="rotate(-90 160 160)" style={{ transition: "stroke-dashoffset .8s ease" }} />
            <circle cx="160" cy="160" r="98" fill="rgba(6,10,17,.9)" stroke="rgba(255,255,255,.08)" />
          </g>
          {flash === "approved" && <circle cx="160" cy="160" r="98" fill="none" stroke="#5fe3a1" strokeWidth="2" className="xp-pop" />}
          {flash === "rejected" && <circle cx="160" cy="160" r="98" fill="none" stroke="#ff6b7a" strokeWidth="2" className="xp-pop" />}
          <text x="160" y="104" textAnchor="middle" className="fill-[#6b768a] font-mono" fontSize="10.4" letterSpacing="2.4">
            EXPIRY MONEY OBJECT
          </text>
          <text x="160" y="152" textAnchor="middle" className="fill-[#e8edf5]" fontSize="41.5" fontWeight="300" style={{ fontVariantNumeric: "tabular-nums" }}>
            {inr(wallet.balancePaise)}
          </text>
          <text x="160" y="170" textAnchor="middle" className="fill-[#6b768a] font-mono" fontSize="10.4" letterSpacing="1.5">
            OF {inr(wallet.initialPaise)} ISSUED
          </text>
          <text x="160" y="204" textAnchor="middle" fill={ringColor} className="font-mono" fontSize="20.7" style={{ fontVariantNumeric: "tabular-nums" }}>
            {state === "EXPIRED" ? "EXPIRED" : state === "REVOKED" ? "REVOKED" : state === "DEPLETED" ? "DEPLETED" : fmtClock(remaining)}
          </text>
          <text x="160" y="220" textAnchor="middle" className="fill-[#6b768a] font-mono" fontSize="9.2" letterSpacing="2">
            {live || state === "SUSPENDED" ? "TIME REMAINING" : "NO LONGER SPENDABLE"}
          </text>
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Chip color={STATE_COLOR[state]}>{state.replace("_", " ")}</Chip>
        {expiring && live && <Chip color="#f2c260">EXPIRING</Chip>}
      </div>
    </div>
  );
});

"use client";
import Link from "next/link";

export function Hero() {
  return (
    <header className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/lab" className="font-mono text-[0.84rem] uppercase tracking-[0.2em] text-faint transition hover:text-text">
          ← Genesis Lab
        </Link>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[0.8rem] uppercase tracking-[0.18em] text-dim" aria-label="System status">
          <span className="inline-flex items-center gap-2 text-ok">
            <span className="live-dot" aria-hidden /> System online
          </span>
          <span>Policy engine active</span>
          <span>Ledger active</span>
        </p>
      </div>
      <p className="mt-8 font-mono text-[0.86rem] uppercase tracking-[0.28em] text-signal">Genesis Lab / Experiment 06</p>
      <h1 className="mt-2 text-6xl font-light tracking-[-0.04em] sm:text-8xl">EXPIRY</h1>
      <p className="mt-2 font-mono text-sm uppercase tracking-[0.34em] text-dim sm:text-sm">Programmable Money Engine</p>
      <p className="mt-5 max-w-xl text-xl font-light leading-snug text-text sm:text-xl">
        Money is no longer just an amount.
        <br />
        <span className="text-dim">It is a set of executable rules.</span>
      </p>
      <p className="mt-4 inline-flex gap-3 font-mono text-[0.74rem] uppercase tracking-[0.2em] text-faint">
        <span>Prototype</span>
        <span aria-hidden>·</span>
        <span>No bank connection</span>
      </p>
    </header>
  );
}

const STAGES = ["POLICY", "MONEY", "TRANSACTION", "VERIFICATION", "STATE"];

export function EmptyPipeline() {
  return (
    <div className="border border-white/[0.09] bg-[#060a11]/80 p-4">
      <p className="font-mono text-[0.8rem] uppercase tracking-[0.24em] text-signal">Programmable money</p>
      <p className="mt-2 text-base leading-relaxed text-dim">
        Define the rules.
        <br />
        Issue the money.
        <br />
        Watch the rules enforce themselves.
      </p>
      <svg viewBox="0 0 300 330" className="mt-4 w-full" role="img" aria-label="Pipeline: policy, money, transaction, verification, state">
        {STAGES.map((s, i) => {
          const y = 8 + i * 64;
          return (
            <g key={s}>
              {i > 0 && <line x1="150" y1={y - 22} x2="150" y2={y} stroke="#7be0d0" strokeWidth="1.2" className="xp-flow" />}
              <rect x="70" y={y} width="160" height="34" fill={i === 1 ? "rgba(123,224,208,.1)" : "rgba(255,255,255,.025)"} stroke={i === 1 ? "#7be0d0" : "rgba(255,255,255,.2)"} />
              <text x="150" y={y + 21} textAnchor="middle" fontSize="12.2" letterSpacing="3" className="font-mono" fill={i === 1 ? "#7be0d0" : "#e8edf5"}>
                {s}
              </text>
              {i < STAGES.length - 1 && <polygon points={`145,${y + 40} 155,${y + 40} 150,${y + 46}`} fill="#7be0d0" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

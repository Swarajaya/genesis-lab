"use client";
import { memo, useEffect, useState } from "react";
import { PURPOSES, activeRules, canonicalPolicy, displayState, fmtSpan, inr, nextState, policySummary, type Command, type Policy, type Wallet } from "@/lib/engines/money/policy";
import { SDGS } from "@/lib/sdgs";
import { STATE_COLOR, fmtClock, sha256Hex, useNow } from "./types";
import { IntegrityChip, type ChainStatus } from "./Ledger";
import { Chip, Kv } from "./ui";

export const MetricsBar = memo(function MetricsBar({ wallet, skew }: { wallet: Wallet; skew: number }) {
  const now = useNow(skew);
  const state = displayState(wallet.status, wallet.policy.expiresAt, now);
  const left = Math.max(0, Date.parse(wallet.policy.expiresAt) - now);
  const live = !["EXPIRED", "REVOKED", "DEPLETED"].includes(state);
  const cells: [string, string, string?][] = [
    ["Issued", inr(wallet.initialPaise)],
    ["Spent", inr(wallet.initialPaise - wallet.balancePaise), "#5fe3a1"],
    ["Remaining", inr(wallet.balancePaise), "#7be0d0"],
    ["Rejected", String(wallet.rejected), wallet.rejected ? "#ff6b7a" : undefined],
    ["Active rules", String(activeRules(wallet.policy).length)],
    ["Time left", live ? fmtClock(left) : state === "EXPIRED" ? "EXPIRED" : "—", state === "EXPIRED" ? "#ff9f43" : left < 15_000 && live ? "#f2c260" : undefined],
  ];
  return (
    <dl className="grid grid-cols-2 border border-white/[0.09] bg-[#060a11]/85 sm:grid-cols-3 lg:grid-cols-6">
      {cells.map(([k, v, c]) => (
        <div key={k} className="border-b border-r border-white/[0.06] px-3 py-2.5 last:border-r-0">
          <dt className="font-mono text-[0.74rem] uppercase tracking-[0.2em] text-faint">{k}</dt>
          <dd className="mt-0.5 font-mono text-xl tabular-nums" style={{ color: c ?? "#e8edf5" }}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
});

export const MoneyDna = memo(function MoneyDna({ wallet, skew }: { wallet: Wallet; skew: number }) {
  const now = useNow(skew);
  const p = wallet.policy;
  const yn = (b: boolean) => (b ? "YES" : "NO");
  const state = displayState(wallet.status, p.expiresAt, now);
  return (
    <dl>
      <Kv k="Value" v={inr(wallet.initialPaise)} />
      <Kv k="Purpose bound" v={yn(p.allowedPurposes.length < PURPOSES.length)} tone="#7be0d0" />
      <Kv k="Recipient bound" v={yn(p.recipient.id !== "*")} tone={p.recipient.id !== "*" ? "#7be0d0" : undefined} />
      <Kv k="Time bound" v="YES" tone="#7be0d0" />
      <Kv k="Transaction bound" v={yn(p.maxTransactionPaise < p.amountPaise)} tone={p.maxTransactionPaise < p.amountPaise ? "#7be0d0" : undefined} />
      <Kv k="Allocation bound" v={yn(Object.keys(p.allocations).length > 0)} />
      <Kv k="Merchant bound" v={yn(p.merchantConstraints.length > 0)} />
      <Kv k="State" v={state.replace("_", " ")} tone={STATE_COLOR[state]} />
      <Kv k="Rule count" v={activeRules(p).length} />
    </dl>
  );
});

/** Re-hashes each sealed policy version in the browser; only says VALID if the recomputed hash matches. */
function usePolicyIntegrity(policies: Policy[]): "valid" | "invalid" | "verifying" | "unavailable" {
  const [res, setRes] = useState<{ for: Policy[]; s: "valid" | "invalid" | "unavailable" } | null>(null);
  useEffect(() => {
    let off = false;
    const done = (s: "valid" | "invalid" | "unavailable") => !off && setRes({ for: policies, s });
    (async () => {
      if (typeof crypto === "undefined" || !crypto.subtle) return done("unavailable");
      for (const p of policies) {
        const { hash, ...rest } = p;
        if ((await sha256Hex(canonicalPolicy(rest))) !== hash) return done("invalid");
      }
      done("valid");
    })().catch(() => done("unavailable"));
    return () => {
      off = true;
    };
  }, [policies]);
  return res && res.for === policies ? res.s : "verifying";
}

export const SecurityPanel = memo(function SecurityPanel({ wallet, chain, persisted }: { wallet: Wallet; chain: { status: ChainStatus; brokenAt?: number }; persisted: boolean | null }) {
  const pol = usePolicyIntegrity(wallet.policies);
  const m = { valid: ["VALID", "#5fe3a1"], invalid: ["INVALID", "#ff6b7a"], verifying: ["VERIFYING", "#9aa5b8"], unavailable: ["UNAVAILABLE", "#f2c260"] }[pol];
  return (
    <div className="space-y-3 font-mono text-sm">
      <div>
        <p className="text-[0.76rem] uppercase tracking-[0.18em] text-faint">Policy integrity</p>
        <dl className="mt-1">
          <Kv k="Policy ID" v={wallet.policy.policyId} />
          <Kv k="Version" v={`v${wallet.policy.policyVersion}`} />
          <Kv k="SHA-256" v={wallet.policy.hash.slice(0, 20) + "…"} />
          <Kv k="Hash check" v={<Chip color={m[1]}>{m[0]}</Chip>} />
        </dl>
      </div>
      <div>
        <p className="text-[0.76rem] uppercase tracking-[0.18em] text-faint">Ledger integrity</p>
        <dl className="mt-1">
          <Kv k="Hash chain" v={<IntegrityChip s={chain} />} />
          <Kv k="Checked" v="SHA-256, in this browser" />
        </dl>
      </div>
      <div>
        <p className="text-[0.76rem] uppercase tracking-[0.18em] text-faint">Engines</p>
        <dl className="mt-1">
          <Kv k="Rule engine" v="ACTIVE" tone="#5fe3a1" />
          <Kv k="Tx verification" v="ACTIVE" tone="#5fe3a1" />
          <Kv k="Persistence" v={persisted === null ? "—" : persisted ? "SUPABASE OK" : "NOT SAVED"} tone={persisted === false ? "#f2c260" : undefined} />
        </dl>
      </div>
      <p className="text-[0.78rem] leading-relaxed text-faint">Hash chains make edits detectable; they do not prevent them. This is a tamper-evident log, not a blockchain.</p>
    </div>
  );
});

const CONTROLS: { cmd: "SUSPEND" | "RESUME" | "REVOKE"; label: string }[] = [
  { cmd: "SUSPEND", label: "Suspend" },
  { cmd: "RESUME", label: "Resume" },
  { cmd: "REVOKE", label: "Revoke" },
];

export const Controls = memo(function Controls({ wallet, skew, busy, onCommand }: { wallet: Wallet; skew: number; busy: boolean; onCommand: (c: "SUSPEND" | "RESUME" | "REVOKE") => void }) {
  const now = useNow(skew);
  const state = displayState(wallet.status, wallet.policy.expiresAt, now);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Lifecycle controls">
      {CONTROLS.map((c) => {
        const allowed = state === wallet.status && nextState(wallet.status, c.cmd as Command, wallet) !== null;
        return (
          <button key={c.cmd} type="button" disabled={busy || !allowed} onClick={() => onCommand(c.cmd)} className={`border px-3 py-1.5 font-mono text-[0.82rem] uppercase tracking-[0.16em] transition disabled:cursor-not-allowed disabled:opacity-30 ${c.cmd === "REVOKE" ? "border-bad/50 text-bad hover:bg-bad/10" : "border-white/20 text-text hover:bg-white/[0.06]"}`}>
            {c.label}
          </button>
        );
      })}
    </div>
  );
});

export const Versions = memo(function Versions({ policies }: { policies: Policy[] }) {
  return (
    <ol className="space-y-2 font-mono text-sm">
      {[...policies].reverse().map((p) => (
        <li key={p.policyVersion} className="border border-white/[0.07] p-2">
          <div className="flex items-center justify-between">
            <span className="text-signal">POLICY v{p.policyVersion}</span>
            <span className="text-[0.76rem] text-faint">{new Date(p.createdAt).toLocaleTimeString([], { hour12: false })}</span>
          </div>
          <p className="mt-1 text-dim">{policySummary(p)}</p>
          <p className="mt-0.5 truncate text-[0.76rem] text-faint">sha256 {p.hash.slice(0, 24)}…</p>
        </li>
      ))}
    </ol>
  );
});

const USE_CASES: [string, string][] = [
  ["Student aid", "Purpose-bound food and transport support, bound to one recipient ID."],
  ["Disaster relief", "Emergency funds with per-transaction caps and a hard expiry."],
  ["Scholarships", "Education-only money, with allocations per category."],
  ["NGO distribution", "Assistance that can only move to approved purposes and merchants."],
  ["Corporate allowances", "Travel and food budgets that lapse at the end of the period."],
  ["Government benefits", "Funds restricted to intended categories, with an auditable event log."],
];

export function UseCases() {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {USE_CASES.map(([k, v]) => (
        <div key={k} className="border-l border-signal/40 pl-3">
          <dt className="font-mono text-[0.8rem] uppercase tracking-[0.16em] text-text">{k}</dt>
          <dd className="mt-0.5 text-sm leading-relaxed text-dim">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const SDG_ROWS: { id: number; rel: string; why: string }[] = [
  { id: 8, rel: "Primary", why: "Wages, grants and allowances can be issued as money that only moves where it was meant to. Employers, institutions and public programmes can pay for work and services with less leakage and less need for manual oversight, which supports trustworthy economic participation." },
  { id: 1, rel: "Secondary", why: "Assistance is bound to food, transport, health or education and to a named recipient, so support reaches the need it was intended for and unspent funds lapse back instead of being diverted." },
  { id: 10, rel: "Secondary", why: "The same rules run identically for every recipient and every decision is written to an auditable ledger, which makes distribution transparent and consistent rather than discretionary." },
];

export function SdgCompact() {
  return (
    <ul className="grid gap-3 lg:grid-cols-3" aria-label="Sustainable Development Goals">
      {SDG_ROWS.map(({ id, rel, why }) => (
        <li key={id} className="flex gap-4 border border-white/[0.09] bg-white/[0.015] p-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center font-mono text-3xl font-semibold text-white" style={{ background: SDGS[id].color }} aria-hidden>
            {id}
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[0.8rem] uppercase tracking-[0.18em] text-faint">
              {rel} · SDG {id}
            </span>
            <span className="mt-0.5 block text-lg font-medium leading-snug text-text">{SDGS[id].title}</span>
            <span className="mt-1.5 block text-[0.95rem] leading-relaxed text-dim">{why}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export { fmtSpan };

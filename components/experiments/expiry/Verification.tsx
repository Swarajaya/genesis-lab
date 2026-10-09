"use client";
import { memo, useId, useState } from "react";
import { PURPOSES, inr, type LedgerEvent, type Purpose, type TxnRequest, type Wallet } from "@/lib/engines/money/policy";
import { parseRupees, type Explanation } from "./types";
import { Chip } from "./ui";

export const SpendForm = memo(function SpendForm({ wallet, busy, onSubmit }: { wallet: Wallet; busy: boolean; onSubmit: (r: TxnRequest) => void }) {
  const id = useId();
  const [amount, setAmount] = useState("300");
  const [purpose, setPurpose] = useState<Purpose>(wallet.policy.allowedPurposes[0] ?? "FOOD");
  const [recipient, setRecipient] = useState(wallet.policy.recipient.id === "*" ? "" : wallet.policy.recipient.id);
  const [merchant, setMerchant] = useState("Campus canteen");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const paise = parseRupees(amount);
        if (paise === null || paise < 1) return setErr("Enter an amount of at least ₹0.01.");
        if (!recipient.trim()) return setErr("Enter the spender's recipient ID.");
        setErr(null);
        onSubmit({ amountPaise: paise, purpose, recipient: recipient.trim(), merchant: merchant.trim() });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-a`} className="font-mono text-[0.76rem] uppercase tracking-[0.16em] text-faint">
            Amount ₹
          </label>
          <input id={`${id}-a`} className="mt-1 !rounded-none" type="number" inputMode="decimal" min={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-p`} className="font-mono text-[0.76rem] uppercase tracking-[0.16em] text-faint">
            Purpose
          </label>
          <select id={`${id}-p`} className="mt-1 !rounded-none" value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)}>
            {PURPOSES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-r`} className="font-mono text-[0.76rem] uppercase tracking-[0.16em] text-faint">
            Spender ID
          </label>
          <input id={`${id}-r`} className="mt-1 !rounded-none font-mono" value={recipient} maxLength={40} onChange={(e) => setRecipient(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${id}-m`} className="font-mono text-[0.76rem] uppercase tracking-[0.16em] text-faint">
            Merchant
          </label>
          <input id={`${id}-m`} className="mt-1 !rounded-none" value={merchant} maxLength={60} onChange={(e) => setMerchant(e.target.value)} />
        </div>
      </div>
      {err && (
        <p role="alert" className="font-mono text-[0.84rem] text-bad">
          {err}
        </p>
      )}
      <button type="submit" disabled={busy} className="w-full border border-signal/60 bg-signal/10 px-3 py-2 font-mono text-[0.86rem] uppercase tracking-[0.2em] text-signal transition hover:bg-signal/20 disabled:opacity-40">
        {busy ? "Verifying…" : "Run verification"}
      </button>
    </form>
  );
});

/** Deterministic verification trace for one ledger event. */
export const TracePanel = memo(function TracePanel({ event, explanation, onExplain }: { event: LedgerEvent | null; explanation?: Explanation; onExplain: (e: LedgerEvent) => void }) {
  if (!event) return <p className="font-mono text-sm text-faint">No transaction yet. Submit a request to see every rule evaluated.</p>;
  const t = event.trace;
  const approved = event.result === "APPROVED";
  const rejected = event.result === "REJECTED";
  const color = rejected ? "#ff6b7a" : "#5fe3a1";
  const failed = t?.checks.find((c) => c.rule === t.failedRule);
  return (
    <div className="xp-pop font-mono text-sm" key={event.seq} aria-live="polite">
      <p className="text-[0.8rem] uppercase tracking-[0.18em] text-faint">
        {event.type === "SPEND" ? "Transaction" : "Event"} {event.eventId} · policy v{event.policyVersion}
      </p>
      {t?.request ? (
        <>
          <p className="mt-2 text-[0.76rem] uppercase tracking-[0.18em] text-faint">Request</p>
          <p className="text-base text-text">
            {inr(t.request.amountPaise)} · {t.request.purpose}
          </p>
          <p className="text-faint">
            {t.request.recipient}
            {t.request.merchant ? ` · ${t.request.merchant}` : ""}
          </p>
          <p className="mt-3 text-[0.76rem] uppercase tracking-[0.18em] text-faint">Policy check</p>
          <ul className="mt-1">
            {t.checks.map((c) => (
              <li key={c.rule} className="border-b border-white/[0.05] py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dim">{c.label}</span>
                  <span className={c.ok ? "text-ok" : "text-bad"} aria-label={c.ok ? "passed" : "failed"}>
                    {c.ok ? "✓" : "✕"}
                  </span>
                </div>
                {!c.ok && <p className="mt-0.5 text-[0.84rem] leading-snug text-bad/90">{c.detail}</p>}
              </li>
            ))}
          </ul>
          {failed && (
            <div className="mt-3 border border-bad/40 bg-bad/[0.06] p-2">
              <p className="text-[0.76rem] uppercase tracking-[0.18em] text-bad">Failed rule</p>
              <p className="text-text">{failed.rule}</p>
              <p className="mt-1.5 text-[0.76rem] uppercase tracking-[0.16em] text-faint">Configured / Allowed</p>
              <p className="text-text">{failed.configured}</p>
              <p className="mt-1.5 text-[0.76rem] uppercase tracking-[0.16em] text-faint">Requested / Received</p>
              <p className="text-text">{failed.requested}</p>
              <p className="mt-1.5 text-[0.76rem] uppercase tracking-[0.16em] text-faint">Reason code</p>
              <p className="text-bad">{event.reason}</p>
            </div>
          )}
        </>
      ) : (
        <div className="mt-2 space-y-1 text-dim">
          <p>
            {event.stateBefore ?? "—"} → <span className="text-text">{event.stateAfter}</span>
          </p>
          {t?.note && <p className="text-faint">{t.note}</p>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip color={color}>RESULT · {event.result === "SUCCESS" ? "RECORDED" : event.result}</Chip>
        <span className="text-faint">balance after {inr(event.balanceAfterPaise)}</span>
      </div>
      {event.type === "SPEND" && (approved || rejected) && (
        <div className="mt-3">
          <button type="button" onClick={() => onExplain(event)} disabled={explanation?.loading} className="text-[0.82rem] uppercase tracking-[0.14em] text-signal underline-offset-2 hover:underline disabled:opacity-50">
            {explanation?.loading ? "Explaining…" : "Explain with AI"}
          </button>
          {explanation && !explanation.loading && (
            <p className="mt-1.5 leading-relaxed text-dim">
              {explanation.text ?? explanation.note}
              {explanation.text && <span className="block text-[0.76rem] text-faint">Explanation by {explanation.provider ?? "AI"}. The decision above came from the deterministic engine.</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

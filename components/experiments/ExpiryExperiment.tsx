"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { postJson, toUiError } from "@/lib/client";
import { TERMINAL, type LedgerEvent, type PolicyDraft, type TxnRequest, type Wallet } from "@/lib/engines/money/policy";
import { Composer, policyToForm, type CompileOut } from "./expiry/Composer";
import { EmptyPipeline, Hero } from "./expiry/Hero";
import { LedgerTable, IntegrityChip, useChainStatus } from "./expiry/Ledger";
import { MoneyObject } from "./expiry/MoneyObject";
import { Controls, MetricsBar, MoneyDna, SdgCompact, SecurityPanel, UseCases, Versions } from "./expiry/Panels";
import { PolicyGraph } from "./expiry/PolicyGraph";
import { StateMachine } from "./expiry/StateMachine";
import { EventStream, MoneyFlow } from "./expiry/Stream";
import { type Explanation, type ServerOut } from "./expiry/types";
import { Panel, XP_CSS } from "./expiry/ui";
import { SpendForm, TracePanel } from "./expiry/Verification";

const API = "/api/expiry";

export default function ExpiryExperiment() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [skew, setSkew] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [flash, setFlash] = useState<"approved" | "rejected" | null>(null);
  const [expl, setExpl] = useState<Record<number, Explanation>>({});
  const [editing, setEditing] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = useCallback((out: ServerOut, replace = false) => {
    tokenRef.current = out.token;
    setWallet(out.wallet);
    setSkew(out.serverTime - Date.now());
    setSaved(out.persisted.events && out.persisted.policy !== false);
    if (out.events.length) {
      setEvents((prev) => (replace ? out.events : [...prev, ...out.events]));
      setSelected(out.events[out.events.length - 1].seq);
    }
    const spend = out.events.find((e) => e.type === "SPEND");
    if (spend) {
      setFlash(spend.result === "APPROVED" ? "approved" : "rejected");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1000);
    }
  }, []);

  /** Calls are serialised so a signed token is never used twice concurrently. */
  const run = useCallback(
    (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      const next = queue.current.then(fn).catch((e) => setError(toUiError(e).message));
      queue.current = next.finally(() => setBusy(false));
      return next;
    },
    [],
  );

  const issue = useCallback((draft: PolicyDraft) => run(async () => apply(await postJson<ServerOut>(API, { action: "issue", draft }), true)), [apply, run]);
  /** Authenticated call using the latest signed state token. */
  const withToken = useCallback(
    async (body: Record<string, unknown>) => {
      if (tokenRef.current) apply(await postJson<ServerOut>(API, { ...body, token: tokenRef.current }));
    },
    [apply],
  );
  const spend = useCallback((request: TxnRequest) => run(() => withToken({ action: "spend", request })), [run, withToken]);
  const command = useCallback((c: "SUSPEND" | "RESUME" | "REVOKE") => run(() => withToken({ action: "control", command: c })), [run, withToken]);
  const updatePolicy = useCallback(
    (draft: PolicyDraft, keepExpiry: boolean) =>
      run(async () => {
        await withToken({ action: "update_policy", draft, keepExpiry });
        setEditing(false);
      }),
    [run, withToken],
  );
  const sync = useCallback(() => run(() => withToken({ action: "sync" })), [run, withToken]);

  const compile = useCallback(async (text: string): Promise<CompileOut> => {
    try {
      return await postJson<CompileOut>(API, { action: "compile", text });
    } catch (e) {
      throw new Error(toUiError(e).message);
    }
  }, []);

  const explainFacts = useCallback(async (headline: string, lines: string[]): Promise<Explanation> => {
    try {
      const r = await postJson<{ explanation: string | null; provider?: string; note: string | null }>(API, { action: "explain", kind: headline.startsWith("POLICY") ? "conflict" : "trace", facts: { headline: headline.slice(0, 190), lines: lines.slice(0, 14).map((l) => l.slice(0, 230)) } });
      return { text: r.explanation, note: r.note, provider: r.provider };
    } catch (e) {
      return { text: null, note: `${toUiError(e).message} The engine result is unaffected.` };
    }
  }, []);

  const explainEvent = useCallback(
    async (e: LedgerEvent) => {
      setExpl((m) => ({ ...m, [e.seq]: { text: null, note: null, loading: true } }));
      const t = e.trace;
      const lines = [
        t?.request ? `Request: ${t.request.amountPaise / 100} rupees, purpose ${t.request.purpose}, spender ${t.request.recipient}` : "",
        ...(t?.checks.map((c) => `${c.label}: ${c.ok ? "PASS" : "FAIL"}. ${c.detail}`) ?? []),
        `Balance after: ${e.balanceAfterPaise / 100} rupees. State: ${e.stateAfter}.`,
      ].filter(Boolean);
      const r = await explainFacts(`${e.eventId} ${e.result}${e.reason ? ` ${e.reason}` : ""}`, lines);
      setExpl((m) => ({ ...m, [e.seq]: r }));
    },
    [explainFacts],
  );

  // Real expiry: sync once when the configured timestamp is reached so the EXPIRE transition is recorded.
  const expiresAt = wallet?.policy.expiresAt;
  const status = wallet?.status;
  useEffect(() => {
    if (!expiresAt || !status || TERMINAL.includes(status)) return;
    const delay = Date.parse(expiresAt) - (Date.now() + skew) + 400;
    if (delay > 2_000_000_000) return;
    const t = setTimeout(() => void sync(), Math.max(400, delay));
    return () => clearTimeout(t);
  }, [expiresAt, status, skew, sync]);

  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);

  const chain = useChainStatus(events);
  const selectedEvent = useMemo(() => events.find((e) => e.seq === selected) ?? [...events].reverse().find((e) => e.type === "SPEND") ?? events[events.length - 1] ?? null, [events, selected]);
  const editInitial = useMemo(() => (wallet && editing ? policyToForm(wallet.policy) : undefined), [wallet, editing]);

  const reset = () => {
    setWallet(null);
    setEvents([]);
    setSelected(null);
    setFocus(null);
    setSaved(null);
    setExpl({});
    setEditing(false);
    setError(null);
    tokenRef.current = null;
  };

  return (
    <main id="main" className="relative mx-auto max-w-none px-3 pb-20 pt-6 sm:px-6 lg:px-8 2xl:px-12">
      <style>{XP_CSS}</style>
      <div aria-hidden className="xp-grid pointer-events-none absolute inset-x-0 top-0 h-[760px]" />
      <div className="relative z-10 space-y-5">
        <Hero />

        {!wallet ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Panel title="Policy definition · compile & issue">
              <Composer mode="issue" busy={busy} onSubmit={(d) => void issue(d)} onCompile={compile} onExplain={explainFacts} error={error} />
            </Panel>
            <EmptyPipeline />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[0.82rem] uppercase tracking-[0.22em] text-faint">
                Financial control center · {wallet.policy.policyId} · v{wallet.policy.policyVersion}
              </p>
              <div className="flex items-center gap-3">
                {saved === false && (
                  <span role="status" className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-warn">
                    Persistence error · not saved to Supabase · local verification continues
                  </span>
                )}
                <button type="button" onClick={reset} className="border border-white/20 px-3 py-1 font-mono text-[0.8rem] uppercase tracking-[0.16em] text-dim transition hover:text-text">
                  Issue new money
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="border border-bad/40 bg-bad/[0.06] px-3 py-2 font-mono text-sm text-bad">
                {error}
              </p>
            )}

            <MetricsBar wallet={wallet} skew={skew} />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <Panel title="Policy graph">
                  <PolicyGraph policy={wallet.policy} focus={focus} onFocus={setFocus} events={events} />
                </Panel>
                <Panel title="Money DNA">
                  <MoneyDna wallet={wallet} skew={skew} />
                </Panel>
              </div>
              <div className="space-y-3">
                <Panel title="Money object · time ring">
                  <MoneyObject wallet={wallet} skew={skew} flash={flash} />
                  <div className="mt-3 border-t border-white/[0.07] pt-3">
                    <Controls wallet={wallet} skew={skew} busy={busy} onCommand={(c) => void command(c)} />
                  </div>
                </Panel>
                <Panel title="Transaction request">
                  <SpendForm wallet={wallet} busy={busy} onSubmit={(r) => void spend(r)} />
                </Panel>
              </div>
              <Panel title="Verification trace" right={selectedEvent && <span className="font-mono text-[0.76rem] text-faint">{selectedEvent.eventId}</span>}>
                <TracePanel event={selectedEvent} explanation={selectedEvent ? expl[selectedEvent.seq] : undefined} onExplain={(e) => void explainEvent(e)} />
              </Panel>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <Panel title="Live transaction stream" right={<span className="font-mono text-[0.76rem] text-faint">{events.length} events</span>}>
                <EventStream events={events} selected={selectedEvent?.seq ?? null} onSelect={setSelected} focus={focus} />
              </Panel>
              <Panel title="Live money flow">
                <MoneyFlow events={events} issued={wallet.initialPaise} remaining={wallet.balancePaise} />
              </Panel>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <Panel title="Money state machine">
                <StateMachine wallet={wallet} events={events} skew={skew} />
              </Panel>
              <Panel
                title="Policy versions"
                right={
                  <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing} className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-signal hover:underline">
                    {editing ? "Cancel" : "Edit → new version"}
                  </button>
                }
              >
                {editing && editInitial ? <Composer key={wallet.policy.policyVersion} mode="update" initial={editInitial} busy={busy} spent={wallet.spentByPurpose} onSubmit={(d, keep) => void updatePolicy(d, keep)} onExplain={explainFacts} error={error} /> : <Versions policies={wallet.policies} />}
              </Panel>
              <Panel title="Security & integrity">
                <SecurityPanel wallet={wallet} chain={chain} persisted={saved} />
              </Panel>
            </div>

            <Panel id="ledger" title="Tamper-evident event ledger" right={<IntegrityChip s={chain} />}>
              <LedgerTable events={events} selected={selectedEvent?.seq ?? null} onSelect={setSelected} />
            </Panel>
          </div>
        )}

        <Panel title="Where programmable money applies">
          <UseCases />
        </Panel>
        <Panel title="UN Sustainable Development Goals">
          <SdgCompact />
        </Panel>
      </div>
    </main>
  );
}

"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { storageGet, storageSet, useLiveSession } from "@/hooks/useLiveSession";
import { toUiError } from "@/lib/client";
import type { Abo, Rh } from "@/lib/engines/blood/engine";
import type { LiveEvent, Role, Zone } from "@/lib/engines/blood/liveTypes";

interface Stored {
  token: string;
  participantId: string;
}
type Toast = { key: number; title: string; sub?: string; tone: "match" | "ok" | "warn" | "bad" | "info" };
const TONE = { match: "#b48bff", ok: "#5fe3a1", warn: "#f2c260", bad: "#ff6b7a", info: "#7be0d0" } as const;

/** Which feed events a phone announces. Match events only concern the device they were sent to. */
function toastFor(e: LiveEvent, me: string | null): Toast | null {
  const d = e.data;
  const mine = !!me && d.participantId === me;
  const key = e.seq;
  switch (e.type) {
    case "EMERGENCY_STARTED": return { key, title: "NEW EMERGENCY", sub: e.message.replace("NEW EMERGENCY: ", ""), tone: "bad" };
    case "MATCH_FOUND": return mine ? { key, title: "POTENTIAL MATCH FOUND", sub: `${d.patientId} needs ${d.units} units`, tone: "match" } : null;
    case "MATCH_ACCEPTED": return mine ? { key, title: "MATCH ACCEPTED", sub: `${d.units} units → ${d.patientId}`, tone: "ok" } : null;
    case "MATCH_CANCELLED": return mine ? { key, title: "MATCH CANCELLED", sub: `${d.patientId} is covered or changed`, tone: "warn" } : null;
    case "PRIORITY_UPDATED": return { key, title: "EMERGENCY ESCALATED", sub: e.message.replace("PRIORITY UPDATED: ", ""), tone: "warn" };
    case "EMERGENCY_WORSENED": return { key, title: "EMERGENCY ESCALATED", sub: e.message.replace("EMERGENCY WORSENS ", ""), tone: "bad" };
    case "DONOR_OFFLINE": case "DONOR_ONLINE": return mine ? { key, title: "DONOR STATUS CHANGED", sub: e.message, tone: "info" } : null;
    case "EMERGENCY_RESOLVED": return { key, title: "EMERGENCY RESOLVED", sub: "The network settled", tone: "ok" };
    case "STRESS_STARTED": return { key, title: "SYSTEM UNDER STRESS", tone: "bad" };
    case "SESSION_ENDED": return { key, title: "SESSION ENDED", tone: "info" };
    default: return null;
  }
}

const Big = ({ on, children, onClick, accent = "#7be0d0", disabled }: { on?: boolean; children: React.ReactNode; onClick: () => void; accent?: string; disabled?: boolean }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-pressed={on}
    className="h-14 flex-1 rounded-2xl border text-lg font-medium transition active:scale-[0.97] disabled:opacity-40"
    style={{ borderColor: on ? accent : "rgba(255,255,255,0.1)", background: on ? `${accent}22` : "rgba(255,255,255,0.03)", color: on ? "#fff" : "#9aa5b8", boxShadow: on ? `0 0 30px -10px ${accent}` : undefined }}
  >
    {children}
  </button>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="label mb-2">{label}</div>
    <div className="flex gap-2">{children}</div>
  </div>
);

function Shell({ code, status, children }: { code: string; status: string; children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-[0.28em] text-faint">GENESIS LAB</p>
          <h1 className="mt-1 text-lg font-light tracking-tight text-text">LIVE BLOOD NETWORK</h1>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] text-faint">{code}</p>
          <p className="mt-1 flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ok">
            <span className="live-dot" aria-hidden />
            {status}
          </p>
        </div>
      </header>
      <div className="mt-6 flex flex-1 flex-col gap-5">{children}</div>
    </main>
  );
}

export default function ParticipantClient({ sessionId }: { sessionId: string }) {
  const storeKey = `bl-p-${sessionId}`;
  const [stored, setStored] = useState<Stored | null>(null);
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    try {
      const raw = storageGet(storeKey, true);
      if (raw) setStored(JSON.parse(raw) as Stored);
    } catch {
      /* ignore */
    }
    setBooted(true);
  }, [storeKey]);

  const { snap, snapToken, error, link, act } = useLiveSession(sessionId, stored?.token ?? null, { leaveOnHide: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [declined, setDeclined] = useState(false);
  const lastSeq = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // form state
  const [role, setRole] = useState<Role | null>(null);
  const [abo, setAbo] = useState<Abo>("A");
  const [rh, setRh] = useState<Rh>("+");
  const [units, setUnits] = useState(2);
  const [zone, setZone] = useState<Zone>("A");
  const [hAbo, setHAbo] = useState<Abo>("O");
  const [hRh, setHRh] = useState<Rh>("-");
  const [hUnits, setHUnits] = useState(2);
  const [hUrg, setHUrg] = useState<"routine" | "urgent" | "critical">("urgent");

  const me = snap?.me ?? null;
  // A stored token the server no longer recognises must not leave the phone stuck.
  useEffect(() => {
    if (booted && stored && snap && !snap.me && snapToken === stored.token) {
      try {
        localStorage.removeItem(storeKey);
      } catch {
        /* ignore */
      }
      setStored(null);
    }
  }, [booted, stored, snap, snapToken, storeKey]);

  useEffect(() => {
    if (!snap) return;
    const newest = snap.feed.length ? snap.feed[snap.feed.length - 1].seq : 0;
    if (lastSeq.current === null) {
      lastSeq.current = newest;
      return;
    }
    const fresh = snap.feed.filter((e) => e.seq > (lastSeq.current ?? 0));
    lastSeq.current = Math.max(lastSeq.current, newest);
    const ts = fresh.map((e) => toastFor(e, stored?.participantId ?? null)).filter((t): t is Toast => !!t);
    if (!ts.length) return;
    if (fresh.some((e) => e.type === "MATCH_FOUND" && e.data.participantId === stored?.participantId)) {
      try {
        navigator.vibrate?.([120, 60, 120]);
      } catch {
        /* unsupported */
      }
    }
    setToasts((cur) => [...cur, ...ts].slice(-3));
    ts.forEach((t) => setTimeout(() => alive.current && setToasts((cur) => cur.filter((x) => x.key !== t.key)), 4200));
  }, [snap, stored?.participantId]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setErr(null);
      try {
        await fn();
      } catch (e) {
        setErr(toUiError(e).message);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const join = (r: Role) =>
    run(async () => {
      const res = await act(r === "donor" ? { type: "join", role: r, abo, rh, units, zone } : { type: "join", role: r }, null);
      if (res.participantToken && res.participantId) {
        const s = { token: res.participantToken, participantId: res.participantId };
        storageSet(storeKey, JSON.stringify(s), true);
        setStored(s);
      }
    });

  const code = snap?.session.code ?? "····";
  const linkLabel = link === "live" ? "connected" : link === "ended" ? "ended" : "reconnecting";

  if (!booted || (!snap && !error)) {
    return <Shell code={code} status="connecting"><p className="text-sm text-dim">Connecting to the network…</p></Shell>;
  }
  if (!snap) {
    return <Shell code={code} status="offline"><p className="rounded-2xl border border-bad/30 bg-bad/[0.07] p-4 text-sm text-bad" role="alert">{error ?? "Session not found."}</p></Shell>;
  }
  if (snap.session.status !== "active") {
    return (
      <Shell code={code} status="ended">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
          <p className="text-xl font-light text-text">{snap.session.status === "expired" ? "SESSION EXPIRED" : "SESSION ENDED"}</p>
          <p className="mt-2 text-sm text-dim">Thanks for taking part. This session can no longer change.</p>
        </div>
      </Shell>
    );
  }

  const toastLayer = (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex w-[min(26rem,94%)] flex-col gap-2" aria-live="assertive">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.key} layout initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-2xl border bg-[#070b12] px-4 py-3 text-center shadow-2xl" style={{ borderColor: `${TONE[t.tone]}77` }}>
            <div className="font-mono text-[11px] font-semibold tracking-[0.2em]" style={{ color: TONE[t.tone] }}>{t.title}</div>
            {t.sub && <div className="mt-0.5 text-sm text-text">{t.sub}</div>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  // ---------------------------------------------------------------- not joined yet
  if (!me) {
    return (
      <Shell code={code} status={linkLabel}>
        {toastLayer}
        {!role ? (
          <>
            <div>
              <p className="text-3xl font-light leading-tight tracking-tight text-text">You’re in the network.</p>
              <p className="mt-2 text-sm text-dim">Choose how you want to take part.</p>
            </div>
            <div className="space-y-3">
              {([
                ["donor", "DONOR", "Become a live simulated donor. Get matched to a patient in real time.", "#b48bff"],
                ["hospital", "HOSPITAL", "Send emergency blood requests to the network.", "#f2c260"],
                ["observer", "OBSERVER", "Watch the network react, read-only.", "#7be0d0"],
              ] as const).map(([r, t, d, c]) => (
                <button key={r} type="button" disabled={busy} onClick={() => (r === "donor" ? setRole("donor") : r === "hospital" ? setRole("hospital") : join("observer"))} className="w-full rounded-2xl border bg-white/[0.03] p-5 text-left transition active:scale-[0.98]" style={{ borderColor: `${c}${r === "donor" ? "88" : "33"}`, boxShadow: r === "donor" ? `0 0 40px -16px ${c}` : undefined }}>
                  <div className="font-mono text-sm tracking-[0.2em]" style={{ color: c }}>{t}</div>
                  <div className="mt-1 text-sm text-dim">{d}</div>
                </button>
              ))}
            </div>
          </>
        ) : role === "donor" ? (
          <>
            <p className="text-2xl font-light tracking-tight text-text">Become a donor</p>
            <Field label="Blood group">{(["O", "A", "B", "AB"] as const).map((g) => <Big key={g} on={abo === g} onClick={() => setAbo(g)} accent="#b48bff">{g}</Big>)}</Field>
            <Field label="Rh">{(["+", "-"] as const).map((g) => <Big key={g} on={rh === g} onClick={() => setRh(g)} accent="#b48bff">{g === "-" ? "−" : "+"}</Big>)}</Field>
            <Field label="Units">{[1, 2, 3, 4].map((n) => <Big key={n} on={units === n} onClick={() => setUnits(n)} accent="#b48bff">{n}</Big>)}</Field>
            <Field label="Location">{(["A", "B", "C"] as const).map((z) => <Big key={z} on={zone === z} onClick={() => setZone(z)} accent="#b48bff">Zone {z}</Big>)}</Field>
            <div className="mt-auto space-y-3 pt-2">
              {err && <p className="text-sm text-bad" role="alert">{err}</p>}
              <button type="button" disabled={busy} onClick={() => join("donor")} className="h-16 w-full rounded-2xl bg-[#b48bff] text-base font-semibold tracking-[0.16em] text-[#12081f] shadow-[0_0_40px_-8px_rgba(180,139,255,0.8)] transition active:scale-[0.98] disabled:opacity-50">
                {busy ? "JOINING…" : "BECOME AVAILABLE"}
              </button>
              <button type="button" onClick={() => setRole(null)} className="w-full py-2 text-sm text-faint">Back</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-2xl font-light tracking-tight text-text">Hospital desk</p>
            <p className="text-sm text-dim">Join, then send requests once the emergency is running.</p>
            <div className="mt-auto space-y-3">
              {err && <p className="text-sm text-bad" role="alert">{err}</p>}
              <button type="button" disabled={busy} onClick={() => join("hospital")} className="h-16 w-full rounded-2xl bg-[#f2c260] text-base font-semibold tracking-[0.16em] text-[#241a05] transition active:scale-[0.98] disabled:opacity-50">{busy ? "JOINING…" : "JOIN AS HOSPITAL"}</button>
              <button type="button" onClick={() => setRole(null)} className="w-full py-2 text-sm text-faint">Back</button>
            </div>
          </>
        )}
      </Shell>
    );
  }

  // ---------------------------------------------------------------- joined
  const p = me.participant;
  const offer = me.offers[0] ?? null;
  const confirmed = me.confirmed;

  const respond = (accept: boolean) =>
    run(async () => {
      if (!offer) return;
      setDeclined(!accept);
      await act({ type: "respond", allocationId: offer.id, accept });
    });

  return (
    <Shell code={code} status={linkLabel}>
      {toastLayer}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="label">{p.role === "donor" ? "Donor ID" : p.role === "hospital" ? "Hospital ID" : "Observer ID"}</p>
            <p className="mt-1 font-mono text-2xl text-text">{p.code}</p>
          </div>
          {p.role === "donor" && (
            <div className="text-right">
              <p className="label">Status</p>
              <p className={`mt-1 font-mono text-sm tracking-[0.16em] ${p.online ? "text-ok" : "text-dim"}`}>{p.online ? "ONLINE" : "OFFLINE"}</p>
            </div>
          )}
        </div>
        {p.role === "donor" && <p className="mt-2 text-sm text-dim">{p.abo}{p.rh} · {p.units} unit{p.units === 1 ? "" : "s"} · Zone {p.zone}</p>}
      </div>

      {p.role === "donor" && (
        <>
          <AnimatePresence mode="wait">
            {offer ? (
              <motion.section key={offer.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-3xl border border-[#b48bff]/60 bg-[#b48bff]/[0.08] p-5 shadow-[0_0_60px_-14px_rgba(180,139,255,0.7)]" aria-live="assertive">
                <p className="font-mono text-xs font-semibold tracking-[0.22em] text-[#d9c6ff]">URGENT MATCH FOUND</p>
                <p className="mt-3 text-sm text-dim">Your simulated donation can help:</p>
                <p className="mt-1 text-3xl font-light text-text">{offer.patient ? `PATIENT #${String(offer.patient.no).padStart(2, "0")}` : offer.patientId}</p>
                {offer.patient && <p className="mt-1 font-mono text-sm tracking-[0.14em]" style={{ color: offer.patient.urgency === "critical" ? "#ff6b7a" : "#f2c260" }}>{offer.patient.urgency.toUpperCase()} · {offer.patient.abo}{offer.patient.rh}</p>}
                <p className="mt-3 text-lg text-text">{offer.units} UNIT{offer.units === 1 ? "" : "S"} REQUIRED</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button type="button" disabled={busy} onClick={() => respond(true)} className="h-16 rounded-2xl bg-ok text-base font-semibold tracking-[0.16em] text-[#04110a] shadow-[0_0_36px_-8px_rgba(95,227,161,0.8)] transition active:scale-[0.97] disabled:opacity-50">ACCEPT</button>
                  <button type="button" disabled={busy} onClick={() => respond(false)} className="h-16 rounded-2xl border border-white/15 bg-white/[0.04] text-base font-semibold tracking-[0.16em] text-dim transition active:scale-[0.97] disabled:opacity-50">DECLINE</button>
                </div>
              </motion.section>
            ) : confirmed.length > 0 ? (
              <motion.section key="confirmed" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-ok/50 bg-ok/[0.07] p-5">
                <p className="font-mono text-xs font-semibold tracking-[0.22em] text-ok">ALLOCATION CONFIRMED</p>
                {confirmed.map((c) => (
                  <p key={c.id} className="mt-3 text-lg text-text">{c.units} UNIT{c.units === 1 ? "" : "S"} ↓ <span className="font-medium">{c.patient ? `PATIENT #${String(c.patient.no).padStart(2, "0")}` : c.patientId}</span></p>
                ))}
                <p className="mt-2 text-sm text-dim">The command center shows your donation moving to the patient.</p>
              </motion.section>
            ) : declined ? (
              <motion.section key="declined" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <p className="font-mono text-xs font-semibold tracking-[0.22em] text-warn">DONATION DECLINED</p>
                <p className="mt-2 text-sm text-dim">The network is finding the next candidate.</p>
              </motion.section>
            ) : (
              <motion.section key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-3xl border border-[#b48bff]/40 bg-[#b48bff]/[0.05] p-6 text-center">
                <motion.div className="mx-auto h-3 w-3 rounded-full bg-[#b48bff]" animate={{ scale: [1, 1.9, 1], opacity: [1, 0.35, 1] }} transition={{ duration: 1.8, repeat: Infinity }} aria-hidden />
                <p className="mt-4 text-2xl font-light tracking-tight text-text">{p.online ? "YOU ARE LIVE" : "YOU ARE OFFLINE"}</p>
                <p className="mt-2 text-sm text-dim">{p.online ? (snap.phase === "idle" ? "Waiting for an emergency. Keep this screen open." : "The network is matching patients. You’ll be notified here instantly.") : "Your units are removed from the active pool."}</p>
              </motion.section>
            )}
          </AnimatePresence>
          {err && <p className="text-sm text-bad" role="alert">{err}</p>}
          <button type="button" disabled={busy} onClick={() => run(() => act({ type: "set_online", online: !p.online }))} className="h-14 w-full rounded-2xl border border-white/12 bg-white/[0.03] text-sm font-medium tracking-[0.14em] text-dim transition active:scale-[0.98] disabled:opacity-50">
            {p.online ? "CANCEL MY DONATION" : "RETURN ONLINE"}
          </button>
        </>
      )}

      {p.role === "hospital" && (
        <>
          <p className="text-sm text-dim">{snap.phase === "idle" ? "Waiting for the emergency to start." : "Send a blood request to the network."}</p>
          <Field label="Patient group">{(["O", "A", "B", "AB"] as const).map((g) => <Big key={g} on={hAbo === g} onClick={() => setHAbo(g)} accent="#f2c260">{g}</Big>)}</Field>
          <Field label="Rh">{(["+", "-"] as const).map((g) => <Big key={g} on={hRh === g} onClick={() => setHRh(g)} accent="#f2c260">{g === "-" ? "−" : "+"}</Big>)}</Field>
          <Field label="Units">{[1, 2, 3, 4].map((n) => <Big key={n} on={hUnits === n} onClick={() => setHUnits(n)} accent="#f2c260">{n}</Big>)}</Field>
          <Field label="Urgency">{(["routine", "urgent", "critical"] as const).map((u) => <Big key={u} on={hUrg === u} onClick={() => setHUrg(u)} accent="#f2c260"><span className="text-sm capitalize">{u}</span></Big>)}</Field>
          {err && <p className="text-sm text-bad" role="alert">{err}</p>}
          <button type="button" disabled={busy || snap.phase === "idle" || p.hospitalRequests >= 3} onClick={() => run(() => act({ type: "hospital_submit", abo: hAbo, rh: hRh, units: hUnits, urgency: hUrg }))} className="h-16 w-full rounded-2xl bg-[#f2c260] text-base font-semibold tracking-[0.16em] text-[#241a05] transition active:scale-[0.98] disabled:opacity-40">
            SEND REQUEST ({p.hospitalRequests}/3)
          </button>
        </>
      )}

      <div className="grid grid-cols-3 gap-2">
        {([["Patients", snap.metrics.patients], ["Allocated", snap.metrics.allocated], ["Shortage", snap.metrics.shortage]] as const).map(([l, v]) => (
          <div key={l} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-center">
            <div className="label !text-[9px]">{l}</div>
            <div className="font-mono text-xl text-text">{v}</div>
          </div>
        ))}
      </div>

      {p.role === "observer" && (
        <ol className="space-y-1.5 font-mono text-[11px] leading-relaxed text-dim">
          {[...snap.feed].reverse().slice(0, 12).map((e) => <li key={e.seq}>{e.message}</li>)}
        </ol>
      )}
    </Shell>
  );
}

"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LiveNetwork from "@/components/3d/blood/LiveNetwork";
import { ErrorState, type UiError } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { Glass } from "@/components/ui/Glass";
import { storageGet, storageSet, useLiveSession } from "@/hooks/useLiveSession";
import { postJson, toUiError } from "@/lib/client";
import { STRESS_STEPS } from "@/lib/blood-live/stress";
import { bannerFor, BannerStack, type Banner } from "./Banners";
import { ConsolePanel } from "./ConsolePanel";
import { InventoryPanel, MetricsBar, PatientsPanel } from "./Panels";
import { QrPanel } from "./QrPanel";

interface Created {
  sessionId: string;
  hostToken: string;
  code: string;
  lan?: string[];
  port?: string;
  protocol?: string;
}
const KEY = "bl-host-session";

export default function LiveBloodMode() {
  const [session, setSession] = useState<Created | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  useEffect(() => {
    try {
      const raw = storageGet(KEY);
      if (raw) setSession(JSON.parse(raw) as Created);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await postJson<Created>("/api/blood/live", {});
      storageSet(KEY, JSON.stringify(s));
      setSession(s);
    } catch (e) {
      setError(toUiError(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setSession(null);
  };

  if (!ready) return <Glass className="h-40" aria-hidden />;
  if (!session)
    return (
      <Glass className="relative overflow-hidden p-8 text-center sm:p-12">
        <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-56 w-2/3 rounded-full bg-[#b48bff]/10 blur-3xl" aria-hidden />
        <p className="label">Blood · live mode</p>
        <h2 className="display mt-3 text-3xl text-text sm:text-4xl">Turn a phone into a donor.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-dim">Open a live session, scan the QR code with any phone, and watch it join the network in real time. This screen is the command center.</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={start} disabled={busy}>{busy ? "Opening session…" : "Open live session"}</Button>
        </div>
        {error && <div className="mx-auto mt-5 max-w-md text-left"><ErrorState error={error} onRetry={start} /></div>}
      </Glass>
    );
  return <Command key={session.sessionId} session={session} onLeave={leave} />;
}

function Command({ session, onLeave }: { session: Created; onLeave: () => void }) {
  const { snap, error, link, transport, act } = useLiveSession(session.sessionId, session.hostToken);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [selectedDonor, setSelectedDonor] = useState<string | null>(null);
  const [hoveredDonor, setHoveredDonor] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [burst, setBurst] = useState<{ key: number; code: string } | null>(null);
  const [device, setDevice] = useState<{ code: string; up: boolean; key: number } | null>(null);
  const [stressing, setStressing] = useState(false);
  const lastSeq = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Turn NEW feed events into banners, highlights, the donation burst and the device toast.
  useEffect(() => {
    if (!snap) return;
    const newest = snap.feed.length ? snap.feed[snap.feed.length - 1].seq : 0;
    if (lastSeq.current === null) {
      lastSeq.current = newest;
      return;
    }
    const fresh = snap.feed.filter((e) => e.seq > (lastSeq.current ?? 0));
    lastSeq.current = Math.max(lastSeq.current, newest);
    if (!fresh.length) return;
    const bs = fresh.map(bannerFor).filter((b): b is Banner => !!b);
    if (bs.length) {
      setBanners((cur) => [...cur, ...bs].slice(-2));
      bs.forEach((b) => setTimeout(() => alive.current && setBanners((cur) => cur.filter((x) => x.key !== b.key)), 3600));
    }
    for (const e of fresh) {
      if (e.type === "MATCH_FOUND" && e.data.donorCode) {
        const c = e.data.donorCode;
        setHighlight((h) => [...h, c]);
        setTimeout(() => alive.current && setHighlight((h) => h.filter((x) => x !== c)), 5000);
      }
      if (e.type === "MATCH_ACCEPTED" && e.data.donorCode) setBurst({ key: e.seq, code: e.data.donorCode });
      if ((e.type === "DEVICE_CONNECTED" || e.type === "DEVICE_DISCONNECTED") && e.data.participantId) {
        const code = snap.participants.find((p) => p.id === e.data.participantId)?.code ?? "";
        setDevice({ code, up: e.type === "DEVICE_CONNECTED", key: e.seq });
      }
    }
  }, [snap]);

  const run = useCallback(
    async (action: Parameters<typeof act>[0]) => {
      setBusy(true);
      setActErr(null);
      try {
        await act(action);
      } catch (e) {
        setActErr(toUiError(e).message);
      } finally {
        setBusy(false);
      }
    },
    [act],
  );

  const onConsole = (id: string) => {
    const donor = snap?.donors.find((d) => d.code === selectedDonor);
    const target = (ok: boolean) => (ok && selectedDonor ? { target: selectedDonor } : {});
    switch (id) {
      case "donor_cancels": return run({ type: "donor_cancels", ...target(!!donor && donor.status !== "OFFLINE" && donor.status !== "EXPIRED") });
      case "unit_expires": return run({ type: "unit_expires", ...target(!!donor && donor.source === "bank" && donor.status !== "OFFLINE" && donor.status !== "EXPIRED") });
      case "donor_returns": return run({ type: "donor_returns", ...target(!!donor && donor.status === "OFFLINE") });
      case "emergency_worsens": return run({ type: "emergency_worsens", ...(focus ? { target: focus } : {}) });
      case "escalate": return run({ type: "escalate", ...(focus ? { target: focus } : {}) });
      case "new_donor": return run({ type: "new_donor" });
      case "hospital_request": return run({ type: "hospital_request" });
    }
  };

  const stress = async () => {
    setStressing(true);
    setActErr(null);
    try {
      await act({ type: "stress_step", step: 0 });
      for (let i = 1; i <= STRESS_STEPS; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        if (!alive.current) return;
        await act({ type: "stress_step", step: i });
      }
    } catch (e) {
      setActErr(toUiError(e).message);
    } finally {
      if (alive.current) setStressing(false);
    }
  };

  const end = async () => {
    await run({ type: "end" });
  };

  const ended = link === "ended" || (snap && snap.session.status !== "active");
  const empty = useMemo(() => !snap || (snap.donors.length === 0 && snap.patients.length === 0), [snap]);
  const selDonorView = snap?.donors.find((d) => d.code === selectedDonor);
  const assigned = !!snap?.assignments.some((a) => a.donorCode === selectedDonor && a.patientId === (focus ?? snap.focusPatient));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="live-dot" aria-hidden />
          <span className="font-mono text-xs tracking-[0.18em] text-text">LIVE BLOOD NETWORK · {session.code}</span>
          <span className="label !text-[10px]">
            {ended ? "session ended" : link === "live" ? (transport === "supabase" ? "realtime connected" : "realtime (local stream)") : link === "reconnecting" ? "reconnecting…" : "connecting…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!ended && snap?.phase === "idle" && (
            <Button onClick={() => run({ type: "start_emergency" })} disabled={busy}>START EMERGENCY</Button>
          )}
          {!ended && snap && snap.phase !== "idle" && (
            <Button variant="ghost" onClick={() => run({ type: "start_emergency" })} disabled={busy || stressing}>Restart emergency</Button>
          )}
          {ended ? <Button variant="ghost" onClick={onLeave}>New session</Button> : <Button variant="danger" onClick={end} disabled={busy || stressing}>End session</Button>}
        </div>
      </div>

      {(error || actErr) && <p className="rounded-xl border border-bad/30 bg-bad/[0.07] px-3.5 py-2.5 text-xs text-bad" role="alert">{actErr ?? error}</p>}
      {ended && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-dim">This session has ended. Phones that joined can no longer change anything.</p>}

      {snap && <MetricsBar m={snap.metrics} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-4">
          <div className="relative h-[26rem] overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(ellipse_at_50%_40%,#0c1420,#04060a_75%)] sm:h-[32rem]">
            {snap && (
              <LiveNetwork snap={snap} focusPatientId={focus} selected={selectedDonor} hovered={hoveredDonor} onSelect={setSelectedDonor} onHover={setHoveredDonor} highlight={highlight} burst={burst} />
            )}
            <BannerStack banners={banners} />
            {snap && empty && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
                <p className="max-w-xs text-sm text-dim">Waiting for donors. Scan the QR code, or press START EMERGENCY to load the scenario.</p>
              </div>
            )}
          </div>

          <AnimatePresence>
            {snap?.phase === "resolved" && snap.resolution && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Glass className="p-5">
                  <p className="label !text-ok">Emergency resolution</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["Patients served", `${snap.resolution.patientsServed}/${snap.resolution.patientsTotal}`],
                      ["Units allocated", String(snap.resolution.unitsAllocated)],
                      ["Critical shortage", String(snap.resolution.criticalShortage)],
                      ["Pending", String(snap.resolution.pending)],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div className="label !text-[9px]">{l}</div>
                        <div className="font-mono text-2xl text-text">{v}</div>
                      </div>
                    ))}
                  </div>
                </Glass>
              </motion.div>
            )}
          </AnimatePresence>

          {snap && (
            <div className="grid gap-4 md:grid-cols-2">
              <PatientsPanel snap={snap} focus={focus} onFocus={(id) => setFocus((f) => (f === id ? null : id))} onEscalate={(id) => run({ type: "escalate", target: id })} busy={busy || stressing || !!ended} />
              <InventoryPanel snap={snap} selected={selectedDonor} onSelect={setSelectedDonor} />
            </div>
          )}
        </div>

        <div className="space-y-4">
          <QrPanel lan={session.lan} port={session.port} protocol={session.protocol} sessionId={session.sessionId} code={session.code} connected={snap?.metrics.devices ?? 0} participants={snap?.participants.length ?? 0} lastDevice={device} />
          <ConsolePanel
            sessionId={session.sessionId}
            token={session.hostToken}
            phase={snap?.phase ?? "idle"}
            busy={busy || !!ended}
            stressRunning={stressing}
            onAction={onConsole}
            onStress={stress}
            feed={snap?.feed ?? []}
            selectedDonor={selDonorView ? selectedDonor : null}
            focusPatient={focus ?? snap?.focusPatient ?? null}
            donorAssigned={assigned}
          />
        </div>
      </div>
    </div>
  );
}

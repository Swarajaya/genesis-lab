"use client";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import { ErrorState, type UiError } from "@/components/ui/ErrorState";
import { ExperimentShell } from "@/components/ui/ExperimentShell";
import { Glass } from "@/components/ui/Glass";
import { postJson, toUiError } from "@/lib/client";
import { DEMO_DONORS } from "@/lib/engines/blood/engine";
import { bySlug } from "@/lib/experiments";
import { BloodForm, EMERGENCY_EXAMPLE, INITIAL_FORM, type FormState } from "./BloodForm";
import { BloodResults, type BloodResponse } from "./BloodResults";

const LiveBloodMode = dynamic(() => import("./blood-live/LiveBloodMode"), { ssr: false, loading: () => <Glass className="h-40" aria-hidden /> });

const SDG_STORY = [
  "A transfusion decision is a race against the clock, and a blood group is only one of the things that decide it. Antibodies, antigens, distance, shelf life and urgency all matter. This experiment shows the whole picture at once, so the right unit reaches the right patient faster, and fewer units expire unused on a shelf.",
  "SDG 3, Good Health and Well-being: faster, better-informed matching in an emergency supports safer transfusions and better outcomes. Live Mode shows it under pressure: twelve patients compete for a limited supply, and the network re-ranks everything the moment a donor cancels, a unit expires or a patient gets worse.",
  "SDG 9, Industry, Innovation and Infrastructure: the blood supply is treated as infrastructure, with live inventory, multi-patient allocation and real-time coordination between donors, hospitals and a command center. A donor who scans a QR code and joins from a phone shows how a connected network can scale beyond a single hospital.",
];

const DEMO_CODES = DEMO_DONORS.map((d) => d.code);
const HUE = bySlug("blood")?.hue ?? "#ff6b7a";

export default function BloodExperiment() {
  const [mode, setMode] = useState<"normal" | "live">("normal");
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [data, setData] = useState<BloodResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const reqId = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);

  const update = (f: FormState) => {
    setForm(f);
    setTouched(true);
  };

  const run = useCallback(async () => {
    const id = ++reqId.current;
    setBusy(true);
    setError(null);
    setSelected(null);
    setHovered(null);
    try {
      const res = await postJson<BloodResponse>("/api/blood", {
        recipient: form.recipient,
        constraints: form.constraints,
        extraDonors: form.extraDonors,
        explain: true,
      });
      if (id !== reqId.current) return;
      setData(res);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    } catch (e) {
      if (id === reqId.current) setError(toUiError(e));
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, [form]);

  const reset = () => {
    reqId.current++;
    setForm(INITIAL_FORM);
    setData(null);
    setError(null);
    setSelected(null);
    setHovered(null);
    setBusy(false);
    setTouched(false);
  };

  const flow = busy ? 1 : data ? (selected ? 4 : 3) : touched ? 0 : -1;

  return (
    <ExperimentShell slug="blood" flowActive={flow} large sdgStory={SDG_STORY}>
      <div className="space-y-5">
        <div role="tablist" aria-label="Blood experiment mode" className="inline-flex rounded-full border border-line bg-white/[0.03] p-1">
          {([["normal", "NORMAL MODE"], ["live", "LIVE MODE"]] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 font-mono text-[11px] tracking-[0.16em] transition ${mode === m ? (m === "live" ? "bg-[#b48bff] text-[#12081f] shadow-[0_0_28px_-6px_rgba(180,139,255,0.9)]" : "bg-white/10 text-text") : "text-dim hover:text-text"}`}
            >
              {m === "live" && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" aria-hidden />}
              {label}
            </button>
          ))}
        </div>
        {mode === "live" ? <LiveBloodMode /> : (<>
        <BloodForm form={form} onChange={update} onSubmit={run} onExample={() => update(EMERGENCY_EXAMPLE)} onReset={reset} busy={busy} takenCodes={DEMO_CODES} />

        <div ref={resultRef} aria-live="polite">
          {busy && (
            <Glass role="status" className="flex items-center gap-3 p-5">
              <motion.span className="h-2.5 w-2.5 rounded-full" style={{ background: HUE }} animate={{ opacity: [1, 0.3, 1], scale: [1, 1.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
              <span className="text-sm text-dim">Evaluating every donor unit against the recipient and constraints…</span>
            </Glass>
          )}
          {!busy && error && <ErrorState error={error} onRetry={run} />}
          {!busy && !error && !data && (
            <Glass className="p-8 text-center">
              <p className="text-sm text-dim">No matching run yet. Describe the recipient above, or load the emergency example, then press Run matching to see the donor network.</p>
            </Glass>
          )}
          {!busy && data && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <BloodResults data={data} selected={selected} hovered={hovered} onSelect={setSelected} onHover={setHovered} />
            </motion.div>
          )}
        </div>
        </>)}
      </div>
    </ExperimentShell>
  );
}

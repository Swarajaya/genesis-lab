"use client";
import { useReducedMotion } from "framer-motion";
import { RotateCcw, Zap } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Stage } from "@/components/ui/AiProgress";
import { ErrorState, type UiError } from "@/components/ui/ErrorState";
import { postStream, toUiError } from "@/lib/client";
import { bySlug } from "@/lib/experiments";
import { IngredientInput, MAX_CHIPS } from "./nutrition/IngredientInput";
import { engineRows } from "./nutrition/labModel";
import { LabHero } from "./nutrition/LabHero";
import { MatterPanel } from "./nutrition/MatterPanel";
import { QuantumCore } from "./nutrition/QuantumCore";
import { NutritionMatrix, ReasoningPanel, RecoveryPanel } from "./nutrition/ResultPanels";
import { SdgImpact } from "./nutrition/SdgImpact";
import { ScannerPanel } from "./nutrition/ScannerPanel";
import { SynthesisPanel } from "./nutrition/SynthesisPanel";
import { SystemLog } from "./nutrition/SystemLog";
import type { NutritionResult } from "./nutrition/types";
import { useReplay } from "./nutrition/useReplay";
import "./nutrition/waste-genesis.css";

export function NutritionExperiment() {
  const servingsId = useId();
  const reduced = Boolean(useReducedMotion());
  const [chips, setChips] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [servings, setServings] = useState("2");
  const [image, setImage] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [result, setResult] = useState<NutritionResult | null>(null);
  const runRef = useRef(0);

  // Cinematic sequence state: quantum replay first, then the 3D synthesis chamber.
  const [mealIdx, setMealIdx] = useState(0);
  const [played, setPlayed] = useState(false);
  const [armed, setArmed] = useState(false);
  const [synthRun, setSynthRun] = useState(0);
  const [phase, setPhase] = useState(0);
  const [synthDone, setSynthDone] = useState(false);
  const replay = useReplay(4200, reduced);
  const quantumRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<HTMLDivElement>(null);
  const interacted = useRef(false);

  // Auto-scroll through the sequence only until the person scrolls or types themselves.
  useEffect(() => {
    const stop = () => {
      interacted.current = true;
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, []);

  const goTo = useCallback(
    (el: HTMLDivElement | null) => {
      if (interacted.current || !el) return;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    },
    [reduced],
  );

  const playSynth = useCallback(() => {
    setArmed(true);
    setSynthDone(false);
    setPhase(0);
    setSynthRun((r) => r + 1);
  }, []);

  const beginSequence = useCallback(
    (data: NutritionResult) => {
      interacted.current = false;
      setMealIdx(Math.min(data.quantum?.bestMealIndex ?? 0, data.meals.length - 1));
      setArmed(false);
      setSynthDone(false);
      setPhase(0);
      if (data.quantum && data.quantum.qubits > 0) {
        setPlayed(true);
        setTimeout(() => goTo(quantumRef.current), 60);
        replay.start(() => {
          goTo(synthRef.current);
          playSynth();
        });
      } else {
        setPlayed(false);
        replay.reset();
        setTimeout(() => goTo(synthRef.current), 60);
        playSynth();
      }
    },
    [goTo, playSynth, replay],
  );

  const add = useCallback((v: string) => {
    const t = v.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!t) return;
    setInvalid(null);
    setChips((c) => (c.length >= MAX_CHIPS || c.some((x) => x.toLowerCase() === t.toLowerCase()) ? c : [...c, t]));
    setDraft("");
  }, []);

  async function generate() {
    const all = draft.trim() ? [...chips.filter((c) => c.toLowerCase() !== draft.trim().toLowerCase()), draft.trim()].slice(0, MAX_CHIPS) : chips;
    const n = Number(servings);
    if (all.length === 0 && !image) return setInvalid("Add at least one ingredient or scan a photo.");
    if (!Number.isInteger(n) || n < 1 || n > 12) return setInvalid("Servings must be a whole number from 1 to 12.");
    setChips(all);
    setDraft("");
    setInvalid(null);
    setError(null);
    setResult(null);
    replay.reset();
    setPlayed(false);
    setArmed(false);
    setStage("analyzing");
    setLoading(true);
    const run = ++runRef.current;
    const form = new FormData();
    form.set("ingredients", all.join(","));
    form.set("servings", String(n));
    if (image) form.set("image", image);
    try {
      const data = await postStream<NutritionResult>("/api/nutrition", form, (s) => run === runRef.current && setStage(s));
      if (run !== runRef.current) return;
      if (!data.meals?.length) throw new Error("empty");
      setResult(data);
      beginSequence(data);
    } catch (e) {
      if (run !== runRef.current) return;
      setError(e instanceof Error && e.message === "empty" ? { code: "ai_malformed_output", message: "No meals came back. Try different ingredients." } : toUiError(e));
      setStage(null);
    } finally {
      if (run === runRef.current) setLoading(false);
    }
  }

  function reset() {
    runRef.current++;
    replay.reset();
    setChips([]);
    setDraft("");
    setImage(null);
    setServings("2");
    setStage(null);
    setLoading(false);
    setError(null);
    setInvalid(null);
    setResult(null);
    setPlayed(false);
    setArmed(false);
    setSynthDone(false);
    setPhase(0);
    setMealIdx(0);
  }

  const onPhase = useCallback((p: number, done: boolean) => {
    setPhase(p);
    if (done) setSynthDone(true);
  }, []);

  function pickMeal(i: number) {
    setMealIdx(i);
    if (armed) playSynth();
  }

  const meal = result ? result.meals[Math.min(mealIdx, result.meals.length - 1)] : null;
  const synthRunning = armed && !synthDone;
  const rows = useMemo(() => engineRows({ stage, loading, hasImage: Boolean(image), result, synthDone, synthRunning }), [stage, loading, image, result, synthDone, synthRunning]);
  const touched = chips.length > 0 || draft || image || result || error;
  const meta = bySlug("nutrition");
  const replayStep = result?.quantum && played ? Math.round(replay.p * result.quantum.steps) : null;

  return (
    <main id="main" className="wg-root mx-auto max-w-[1840px] px-5 pb-16 sm:px-8 lg:px-14">
      <LabHero rows={rows} />

      <div className="mt-8 space-y-6">
        <section aria-label="Waste scanner and food matter input" className="wg-panel p-5 sm:p-6">
          <p className="wg-tag">00 · Waste scanner · food matter input</p>
          <form
            className="mt-4 grid gap-6 lg:grid-cols-[1fr_1fr]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!loading) void generate();
            }}
          >
            <div className="space-y-5">
              <IngredientInput chips={chips} draft={draft} onDraft={setDraft} onAdd={add} onRemove={(c) => setChips((x) => x.filter((y) => y !== c))} disabled={loading} />
              <div className="max-w-[12rem]">
                <label htmlFor={servingsId} className="wg-tag mb-2 block">
                  Servings · 1 to 12
                </label>
                <input id={servingsId} type="number" inputMode="numeric" min={1} max={12} step={1} value={servings} disabled={loading} onChange={(e) => setServings(e.target.value)} aria-invalid={invalid?.startsWith("Servings") || undefined} />
              </div>
            </div>
            <ScannerPanel file={image} onFile={setImage} stage={stage} loading={loading} result={result} disabled={loading} />
            <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
              <button type="submit" className="wg-btn" disabled={loading}>
                <Zap className="h-4 w-4" aria-hidden /> {loading ? "Running genesis" : "Run genesis"}
              </button>
              <span className="wg-mono text-[0.78rem] uppercase tracking-[0.18em] text-white/35">Initialize optimization</span>
              {touched && (
                <button type="button" className="wg-btn-ghost" onClick={reset}>
                  <RotateCcw className="h-3 w-3" aria-hidden /> Reset
                </button>
              )}
              {invalid && (
                <p role="alert" className="text-base text-bad">
                  {invalid}
                </p>
              )}
            </div>
            <div className="lg:col-span-2">
              <SystemLog rows={rows} quantum={result?.quantum} replayStep={replayStep} visible={loading || Boolean(result)} />
            </div>
          </form>
        </section>

        {error && <ErrorState error={error} onRetry={() => void generate()} />}

        <MatterPanel result={result} />
        <div ref={quantumRef} className="scroll-mt-20">
          <QuantumCore quantum={result?.quantum ?? null} progress={played ? replay.p : 0} running={replay.running} played={played} onReplay={() => replay.start()} />
        </div>
        <div ref={synthRef} className="scroll-mt-20">
          <SynthesisPanel result={result} mealIdx={mealIdx} onMeal={pickMeal} armed={armed} runId={synthRun} phase={phase} done={synthDone} onPhase={onPhase} onPlay={playSynth} />
        </div>
        <RecoveryPanel result={result} meal={meal} />
        <NutritionMatrix result={result} meal={meal} />
        <ReasoningPanel result={result} meal={meal} mealIdx={mealIdx} />

        {meta && <SdgImpact meta={meta} result={result} meal={meal} />}
      </div>
    </main>
  );
}

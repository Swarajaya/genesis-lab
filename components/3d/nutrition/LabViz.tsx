"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { QuantumResult } from "@/lib/engines/quantum";
import type { FoodBlob } from "@/components/experiments/nutrition/types";
import { FoodViz } from "./FoodViz";
import { SYNTH_PHASES, type MatterItem, type SynthItem, type SynthMeal } from "./labTypes";

const SceneFrame = dynamic(() => import("@/components/3d/SceneFrame"), { ssr: false });
const FoodMatterScene = dynamic(() => import("./FoodMatterScene"), { ssr: false });
const QuantumStateScene = dynamic(() => import("./QuantumStateScene"), { ssr: false });
const SynthesisScene = dynamic(() => import("./SynthesisScene"), { ssr: false });

const noop = () => {};

/** Existing 2D/3D composition view, reused as the graceful fallback when the lab scenes cannot render. */
function Legacy({ blobs }: { blobs: FoodBlob[] }) {
  return <FoodViz blobs={blobs} hovered={null} selected={null} onHover={noop} onSelect={noop} />;
}

export function MatterViz({ items, hovered, selected, onHover, onSelect }: { items: MatterItem[]; hovered: number | null; selected: number | null; onHover: (i: number | null) => void; onSelect: (i: number) => void }) {
  const caps = useCapabilities();
  const blobs: FoodBlob[] = items.map((i) => ({ name: i.name, grams: i.grams, source: i.source === "image" ? "ai-estimate" : "reference-table" }));
  return (
    <SceneFrame caps={caps} className="h-full w-full cursor-grab" label={`3D view of ${items.length} detected food items`} camera={{ position: [0, 3.4, 6.8], fov: 45 }} fallback={<FoodViz blobs={blobs} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} />}>
      <FoodMatterScene items={items} hovered={hovered} selected={selected} onHover={onHover} onSelect={onSelect} reducedMotion={caps.reducedMotion} />
    </SceneFrame>
  );
}

function QuantumFallback({ quantum, progress }: { quantum: QuantumResult; progress: number }) {
  const f = Math.round(progress * quantum.steps);
  const max = Math.max(...quantum.nodes.flatMap((n) => n.probs), 1e-6);
  const nodes = [...quantum.nodes].sort((a, b) => a.energy - b.energy);
  const w = 200 / Math.max(nodes.length, 1);
  return (
    <svg viewBox="0 0 200 110" className="h-full w-full" role="img" aria-label="Probability of each candidate state">
      {nodes.map((n, i) => {
        const h = (n.probs[Math.min(f, n.probs.length - 1)] / max) * 90;
        const opt = n.bits === quantum.optimalBits;
        return <rect key={n.bits} x={i * w + 1} y={100 - h} width={Math.max(2, w - 2)} height={h} fill={opt ? "#9be86a" : "#7be0d0"} fillOpacity={opt ? 0.95 : 0.55} />;
      })}
      <line x1="0" y1="100" x2="200" y2="100" stroke="#7be0d0" strokeOpacity="0.4" />
    </svg>
  );
}

export function QuantumViz({ quantum, progress }: { quantum: QuantumResult; progress: number }) {
  const caps = useCapabilities();
  return (
    <SceneFrame caps={caps} className="h-full w-full cursor-grab" label="Quantum state space: candidate meal states, their probabilities and the converged optimum" camera={{ position: [0, 2.6, 6.4], fov: 45 }} fallback={<QuantumFallback quantum={quantum} progress={progress} />}>
      <QuantumStateScene quantum={quantum} progress={progress} reducedMotion={caps.reducedMotion} />
    </SceneFrame>
  );
}

export function SynthesisViz({ items, meal, runId, onPhase }: { items: SynthItem[]; meal: SynthMeal; runId: number; onPhase: (phase: number, done: boolean) => void }) {
  const caps = useCapabilities();
  const reported = useRef(false);
  const handle = useCallback(
    (p: number, done: boolean) => {
      reported.current = true;
      onPhase(p, done);
    },
    [onPhase],
  );
  // If the 3D scene never reports (no WebGL, or it failed), step through the same phases on a plain timer.
  useEffect(() => {
    reported.current = false;
    if (!caps.ready) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const guard = setTimeout(() => {
      if (reported.current) return;
      SYNTH_PHASES.slice(0, -1).forEach((s, i) => timers.push(setTimeout(() => onPhase(i, false), s * 1000)));
      timers.push(setTimeout(() => onPhase(6, true), SYNTH_PHASES[SYNTH_PHASES.length - 1] * 1000));
    }, caps.webgl ? 2500 : 0);
    return () => {
      clearTimeout(guard);
      timers.forEach(clearTimeout);
    };
  }, [runId, caps.ready, caps.webgl, onPhase]);
  const blobs: FoodBlob[] = meal.lines.map((l) => ({ name: l.name, grams: l.grams, source: "reference-table" }));
  return (
    <SceneFrame caps={caps} className="h-full w-full cursor-grab" label={`3D transformation of detected ingredients into ${meal.name}`} camera={{ position: [0, 3.3, 6.6], fov: 45 }} fallback={<Legacy blobs={blobs} />}>
      <SynthesisScene items={items} meal={meal} runId={runId} onPhase={handle} reducedMotion={caps.reducedMotion} />
    </SceneFrame>
  );
}

"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCapabilities } from "@/hooks/useCapabilities";
import { ClientError, toUiError } from "@/lib/client";
import type { UiError } from "@/components/ui/ErrorState";
import { buildComparison, phasesFor, ruleExplanation } from "@/lib/engines/object/scoring";
import { ComparePanel, WhatIfPanel } from "./object/Compare";
import { Ingestion } from "./object/Ingestion";
import { Landing } from "./object/Landing";
import { LifeTreeSvg } from "./object/LifeTreeSvg";
import { StageSvg } from "./object/StageSvg";
import {
  CATEGORY_META, CATEGORIES, bestBy, computeLayout, num3, type BaselineFuture, type Category, type EngineEvent, type ObjectAnalysis, type Pathway,
} from "./object/model";
import { BaselinePanel, CircularityPanel, ComponentList, EventStream, MaterialDnaPanel, MetricsStrip, PathwayDetail, PipelineProgress, ProvenanceLegend, SdgStrip, type ExplainState } from "./object/Panels";
import { postExplain, postObject, type ExplainPayload } from "./object/stream";
import { Panel } from "./object/ui";
import type { ObjectRunResult } from "@/lib/engines/object/types";
import "./object/lab.css";

const Blank = () => <div className="h-full w-full" aria-hidden />;
const LifeTreeCanvas = dynamic(() => import("@/components/3d/lifetree/LifeTreeCanvas"), { ssr: false, loading: Blank });
const ObjectStageCanvas = dynamic(() => import("@/components/3d/lifetree/ObjectStageCanvas"), { ssr: false, loading: Blank });

type Phase = "idle" | "running" | "done";
type StageMode = "tree" | "future" | "components";
type SideTab = "pathway" | "whatif" | "compare" | "data";

interface GroupExplain {
  key: string;
  summary: string;
  points: string[];
  from: "model" | "rules";
  loading: boolean;
  provider: string | null;
}

const toPayload = (p: Pathway): ExplainPayload["pathways"][number] => {
  const top = [...p.score.contributors].sort((a, b) => b.points - a.points)[0];
  const pen = [...p.score.penalties].sort((a, b) => a.points - b.points)[0];
  const m = p.score.metrics;
  return {
    num: p.num, title: p.title, category: p.category, ci: p.score.circularityIndex, feasibility: p.score.practicality, retained: Math.round(m.materialRetained * 1000) / 10, wasteKg: m.wasteDivertedKg, emissionsKg: m.emissionsKg,
    processing: Math.round(m.processingBurden * 100), inputs: Math.round(m.additionalInputs * 100), economic: p.score.economicDim, topContributor: top.label, topPenalty: pen && pen.points < 0 ? pen.label : "", rank: p.rank,
  };
};

/** Deterministic trade-off summary for a set of pathways: which one wins which dimension, read straight from the scoring model. */
function groupRule(base: BaselineFuture, list: Pathway[]): { summary: string; points: string[] } {
  const rows = buildComparison([base.score, ...list.map((p) => p.score)]);
  const points: string[] = [];
  for (const r of rows) {
    if (r.best <= 0) continue;
    const p = list[r.best - 1];
    points.push(`#${num3(p.num)} leads on ${r.dim.label.toLowerCase()} (${r.values[r.best]} ${r.dim.unit}).`);
  }
  const top = [...list].sort((a, b) => b.score.circularityIndex - a.score.circularityIndex)[0];
  return { summary: `Against disposal (circularity ${base.score.circularityIndex.toFixed(1)}), #${num3(top.num)} has the highest circularity index at ${top.score.circularityIndex.toFixed(1)}. The other pathways trade some of it for other strengths below.`, points: points.slice(0, 5) };
}

export default function ObjectExperiment() {
  const caps = useCapabilities();
  const [name, setName] = useState("");
  const [mass, setMass] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [clientEvents, setClientEvents] = useState<EngineEvent[]>([]);
  const [partial, setPartial] = useState<{ analysis: ObjectAnalysis; baseline: BaselineFuture } | null>(null);
  const [result, setResult] = useState<ObjectRunResult | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  const [stageMode, setStageMode] = useState<StageMode>("components");
  const [sideTab, setSideTab] = useState<SideTab>("pathway");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<Category | null>(null);
  const [activeComp, setActiveComp] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [explain, setExplain] = useState<ExplainState | null>(null);
  const [group, setGroup] = useState<GroupExplain | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const explainCache = useRef(new Map<string, { summary: string; points: string[]; provider: string | null }>());

  const addClient = useCallback((code: string, label: string, detail?: string) => setClientEvents((c) => [...c, { at: Date.now(), code, label, detail }]), []);
  useEffect(() => () => abortRef.current?.abort(), []);

  const analysis = result?.analysis ?? partial?.analysis ?? null;
  const baseline = result?.baseline ?? partial?.baseline ?? null;
  const pathways = useMemo(() => result?.pathways ?? [], [result]);
  const layout = useMemo(() => computeLayout(pathways), [pathways]);
  const byId = useMemo(() => new Map(pathways.map((p) => [p.id, p])), [pathways]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const shown = selected ?? pathways[0] ?? null;
  const visible = useMemo(() => new Set(pathways.filter((p) => !activeCat || p.category === activeCat).map((p) => p.id)), [pathways, activeCat]);
  const allEvents = useMemo(() => [...events, ...clientEvents].sort((a, b) => a.at - b.at), [events, clientEvents]);

  const componentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pathways) if (p.target.kind === "component") m.set(p.target.componentId, (m.get(p.target.componentId) ?? 0) + 1);
    return m;
  }, [pathways]);

  /* ---------- run ---------- */
  async function analyze() {
    const typed = name.trim();
    const massNum = mass.trim() === "" ? null : Number(mass);
    if (!typed && !image) return setInvalid("Enter an object or add a photo.");
    if (massNum !== null && (!Number.isFinite(massNum) || massNum <= 0 || massNum > 500)) return setInvalid("Mass must be between 0.001 and 500 kg, or left empty.");
    setInvalid(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("running");
    setError(null);
    setEvents([]);
    setClientEvents([]);
    setPartial(null);
    setResult(null);
    setSelectedId(null);
    setCompareIds([]);
    setActiveCat(null);
    setGroup(null);
    setExplain(null);
    setStageMode("components");
    setSideTab("pathway");
    setExploded(false);
    setStep(0);
    const fd = new FormData();
    if (typed) fd.set("objectName", typed);
    if (massNum !== null) fd.set("massKg", String(massNum));
    if (image) fd.set("image", image);
    try {
      const r = await postObject(
        fd,
        {
          onEvent: (e) => setEvents((x) => [...x, e]),
          onAnalysis: (a) => {
            setPartial(a);
            setTimeout(() => setExploded(true), 700);
          },
        },
        ac.signal,
      );
      setResult(r);
      setPhase("done");
      setStageMode("tree");
      setExploded(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof ClientError ? e.ui : toUiError(e));
      setPhase("idle");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setPhase("idle");
    setResult(null);
    setPartial(null);
    setEvents([]);
    setClientEvents([]);
    setError(null);
    setSelectedId(null);
    setCompareIds([]);
  }

  useEffect(() => {
    if (phase === "done" && caps.ready) addClient("RENDERER", caps.webgl ? "RENDERER: WEBGL ACTIVE" : "RENDERER: 2D FALLBACK", caps.webgl ? undefined : "WebGL is unavailable on this device");
  }, [phase, caps.ready, caps.webgl, addClient]);

  /* ---------- selection and explanations ---------- */
  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) {
        setSideTab("pathway");
        const p = byId.get(id);
        if (p) addClient("SELECT", `PATHWAY #${num3(p.num)} SELECTED`, p.title);
      }
    },
    [byId, addClient],
  );

  useEffect(() => {
    if (!selected || !result || !baseline) {
      setExplain(null);
      return;
    }
    const rule = ruleExplanation(result.analysis.profile, baseline, selected, pathways.length);
    const cached = explainCache.current.get(selected.id);
    if (cached) {
      setExplain({ loading: false, summary: cached.summary, points: cached.points, from: "model", provider: cached.provider });
      return;
    }
    setExplain({ loading: true, summary: rule.summary, points: rule.points, from: "rules", provider: null });
    const ac = new AbortController();
    const t = setTimeout(async () => {
      const r = await postExplain({ runId: result.runId, mode: "single", objectName: result.analysis.profile.name, baseline: { ci: baseline.score.circularityIndex, retained: Math.round(baseline.score.metrics.materialRetained * 100) }, pathways: [toPayload(selected)] }, ac.signal);
      if (ac.signal.aborted) return;
      if (r.explanation) {
        explainCache.current.set(selected.id, { ...r.explanation, provider: r.provider });
        setExplain({ loading: false, summary: r.explanation.summary, points: r.explanation.points, from: "model", provider: r.provider });
      } else setExplain((s) => (s ? { ...s, loading: false } : s));
    }, 450);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [selected, result, baseline, pathways.length]);

  const explainGroup = useCallback(
    async (ids: string[]) => {
      if (!result || !baseline) return;
      const list = ids.map((i) => byId.get(i)).filter((p): p is Pathway => Boolean(p));
      if (list.length === 0) return;
      const key = ids.join(",");
      const rule = groupRule(baseline, list);
      setGroup({ key, ...rule, from: "rules", loading: true, provider: null });
      const r = await postExplain({ runId: result.runId, mode: "compare", objectName: result.analysis.profile.name, baseline: { ci: baseline.score.circularityIndex, retained: Math.round(baseline.score.metrics.materialRetained * 100) }, pathways: list.map(toPayload) });
      setGroup((g) => (g && g.key === key ? (r.explanation ? { ...g, ...r.explanation, from: "model", loading: false, provider: r.provider } : { ...g, loading: false }) : g));
    },
    [result, baseline, byId],
  );

  const toggleCompare = useCallback((id: string) => setCompareIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id])), []);

  /* ---------- future simulator ---------- */
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setStep((s) => (s >= 4 ? (setPlaying(false), 4) : s + 1)), 1900);
    return () => clearInterval(t);
  }, [playing]);
  function startFuture() {
    setStageMode("future");
    setStep(0);
    setPlaying(!caps.reducedMotion);
  }
  const phases = shown ? phasesFor(shown) : null;

  const running = phase === "running";
  const done = phase === "done" && result !== null;
  const stagePath = stageMode === "future" ? shown : null;

  const treeFallback = shown && done ? <LifeTreeSvg pathways={pathways} layout={layout} visible={visible} selectedId={selectedId} hoverId={hoverId} compareIds={compareIds} onSelect={select} onHover={setHoverId} objectName={result!.analysis.profile.name} /> : null;
  const stageFallback = analysis ? <StageSvg components={analysis.profile.components} exploded={exploded} step={stageMode === "future" ? step : -1} pathway={stagePath} activeComp={activeComp} /> : null;

  return (
    <div className="x5-root pb-24">
    <div className="x5-shell space-y-6 pt-6">
      {/* ---------- hero ---------- */}
      <header className="text-center">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/lab" className="x5-pill">
            ← Genesis Lab <span aria-hidden>/</span> Experiment 05
          </Link>
          <p className="flex flex-wrap items-center justify-center gap-2" role="status">
            <span className="x5-pill !text-[var(--x5-green)]">
              <span className={`h-2 w-2 rounded-full bg-current ${running ? "x5-blink" : ""}`} aria-hidden />
              {running ? "Analysis running" : "System online"}
            </span>
            <span className="x5-pill hidden sm:inline-flex">Material reasoning active</span>
            <span className="x5-pill hidden md:inline-flex">{done ? "Pathway search complete" : running ? "Pathway search running" : "Pathway search ready"}</span>
          </p>
        </div>
        <h1 className="mx-auto mt-12 max-w-5xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          ONE OBJECT <span className="x5-gradient">{"//"} 100 LIVES</span>
        </h1>
        <p className="x5-label mt-6 !text-[0.95rem] !tracking-[0.3em] !text-[var(--x5-cyan)]">COMPUTATIONAL CIRCULARITY ENGINE</p>
        <p className="mx-auto mt-5 max-w-2xl text-xl leading-relaxed text-[var(--x5-dim)]">
          Every object is more than waste.
          <br />
          It is a branching possibility space.
        </p>
      </header>

      <Ingestion name={name} setName={setName} mass={mass} setMass={setMass} image={image} setImage={setImage} loading={running} invalid={invalid} canReset={phase !== "idle"} onAnalyze={analyze} onReset={reset} />

      {error && (
        <div role="alert" className="x5-panel flex flex-wrap items-center gap-3 border-l-2 px-4 py-3" style={{ borderLeftColor: "var(--x5-bad)" }}>
          <p className="x5-label !text-[var(--x5-bad)]">{error.code.replace(/_/g, " ")}</p>
          <p className="min-w-0 flex-1 text-lg text-[var(--x5-dim)]">{error.message}</p>
          <button type="button" className="x5-chip" onClick={analyze}>Retry</button>
        </div>
      )}
      {result?.notices.map((n) => (
        <p key={n.code} role="status" className="x5-mono border-l-2 px-3 py-1.5 text-[0.95rem] leading-relaxed text-[var(--x5-dim)]" style={{ borderColor: "var(--x5-warn)" }}>
          <span className="text-[var(--x5-warn)]">NOTICE · {n.code.replace(/_/g, " ").toUpperCase()}</span> — {n.message}
        </p>
      ))}

      {phase === "idle" && !error && <Landing />}
      {phase === "idle" && error && <Landing />}

      {(running || done) && analysis && baseline && (
        <>
          {/* ---------- stage + side ---------- */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
            <Panel
              title={stageMode === "tree" ? "Future tree" : stageMode === "future" ? "Future simulation" : "Component map"}
              bodyClassName="p-0"
              right={
                done ? (
                  <div role="tablist" aria-label="Stage view" className="flex">
                    {([["tree", "TREE"], ["future", "FUTURE"], ["components", "PARTS"]] as const).map(([k, l]) => (
                      <button key={k} role="tab" type="button" aria-selected={stageMode === k} className="x5-tab !py-1" onClick={() => (k === "future" ? startFuture() : setStageMode(k))}>
                        {l}
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="x5-label x5-blink">decomposing</span>
                )
              }
            >
              <div className="relative h-[28rem] sm:h-[34rem]">
                {done && stageMode === "tree" && <LifeTreeCanvas pathways={pathways} layout={layout} visible={visible} selectedId={selectedId} hoverId={hoverId} compareIds={compareIds} onSelect={select} onHover={setHoverId} caps={caps} fallback={treeFallback} className="h-full w-full" label={`Life tree of ${pathways.length} second-life pathways for ${result!.analysis.profile.name}`} />}
                {(running || stageMode !== "tree") && (
                  <ObjectStageCanvas components={analysis.profile.components} form={analysis.profile.form} exploded={exploded || stageMode === "future"} step={stageMode === "future" ? step : -1} pathway={stagePath} activeComp={activeComp} caps={caps} fallback={stageFallback} className="h-full w-full" label={`Components of ${analysis.profile.name}`} />
                )}

                {/* overlays */}
                {done && stageMode === "tree" && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
                    <div className="pointer-events-auto flex max-w-[70%] flex-wrap gap-1" role="group" aria-label="Filter by category">
                      <button type="button" className="x5-chip !px-2 !py-0.5 !text-[0.85rem]" aria-pressed={activeCat === null} onClick={() => setActiveCat(null)}>ALL {pathways.length}</button>
                      {CATEGORIES.filter((c) => layout.hubs.some((h) => h.category === c)).map((c) => (
                        <button key={c} type="button" className="x5-chip !px-2 !py-0.5 !text-[0.85rem]" aria-pressed={activeCat === c} onClick={() => setActiveCat(activeCat === c ? null : c)} style={{ borderColor: activeCat === c ? CATEGORY_META[c].color : undefined }}>
                          <span style={{ color: CATEGORY_META[c].color }}>■</span> {CATEGORY_META[c].label}
                        </button>
                      ))}
                    </div>
                    {selected && (
                      <div className="pointer-events-auto flex gap-2">
                        <button type="button" className="x5-btn !py-2" onClick={startFuture}>Simulate future</button>
                        <button type="button" className="x5-btn ghost !py-2" onClick={() => setSelectedId(null)}>Zoom out</button>
                      </div>
                    )}
                  </div>
                )}
                {done && stageMode === "future" && shown && phases && (
                  <div className="absolute inset-x-0 bottom-0 space-y-2 p-3" style={{ background: "linear-gradient(0deg, rgb(3 7 10 / 0.9), transparent)" }}>
                    <p className="x5-mono truncate text-base text-[var(--x5-text)]">#{num3(shown.num)} · {shown.title}</p>
                    <ol className="grid grid-cols-5 gap-1" aria-label="Transformation stages">
                      {phases.map((l, i) => (
                        <li key={l}>
                          <button type="button" onClick={() => { setPlaying(false); setStep(i); }} aria-current={step === i ? "step" : undefined} className="block w-full border-t-2 pt-1 text-left" style={{ borderColor: i <= step ? CATEGORY_META[shown.category].color : "rgb(255 255 255 / 0.12)" }}>
                            <span className="x5-mono block text-[0.8rem] tracking-[0.14em]" style={{ color: i <= step ? "#f4f5f8" : "#6b7385" }}>{i + 1} · {l}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div className="flex gap-2">
                      <button type="button" className="x5-chip" onClick={() => { if (step >= 4) setStep(0); setPlaying((p) => !p); }}>{playing ? "Pause" : step >= 4 ? "Replay" : "Play"}</button>
                      <button type="button" className="x5-chip" onClick={() => setStageMode("tree")}>Back to tree</button>
                      {!shown.target || shown.target.kind === "whole" ? null : <span className="x5-mono self-center text-[0.85rem] text-[var(--x5-faint)]">other parts follow disposal in the model</span>}
                    </div>
                  </div>
                )}
                {done && stageMode === "components" && (
                  <div className="absolute bottom-3 left-3 flex gap-2">
                    <button type="button" className="x5-chip" onClick={() => setExploded((e) => !e)} aria-pressed={exploded}>{exploded ? "Reassemble" : "Separate parts"}</button>
                    <span className="x5-mono self-center text-[0.85rem] text-[var(--x5-faint)]">procedural blocks · sized by mass share · not a 3D reconstruction</span>
                  </div>
                )}
                {running && <p className="x5-mono absolute bottom-3 left-3 text-[0.85rem] text-[var(--x5-faint)]">procedural blocks · sized by mass share · not a 3D reconstruction</p>}
              </div>
            </Panel>

            <div className="space-y-6">
              {running && <PipelineProgress events={events} running />}
              {done && (
                <Panel bodyClassName="p-0" title={undefined}>
                  <div role="tablist" aria-label="Analysis panels" className="flex border-b" style={{ borderColor: "var(--x5-line)" }}>
                    {([["pathway", "PATHWAY"], ["whatif", "WHAT IF"], ["compare", `COMPARE${compareIds.length ? ` ${compareIds.length}` : ""}`], ["data", "DATA"]] as const).map(([k, l]) => (
                      <button key={k} role="tab" type="button" aria-selected={sideTab === k} className="x5-tab" onClick={() => setSideTab(k)}>{l}</button>
                    ))}
                  </div>
                  <div className="x5-scroll max-h-[34rem] overflow-y-auto p-4" role="tabpanel">
                    {sideTab === "pathway" &&
                      (selected ? (
                        <PathwayDetail p={selected} base={baseline} objectName={analysis.profile.name} total={pathways.length} explain={explain} inCompare={compareIds.includes(selected.id)} onToggleCompare={() => toggleCompare(selected.id)} compareFull={compareIds.length >= 4} />
                      ) : (
                        <div className="space-y-3 text-lg text-[var(--x5-dim)]">
                          <p className="x5-label !text-[var(--x5-cyan)]">{pathways.length} futures discovered</p>
                          <p>Click any node in the tree, or choose from the pathway index below, to inspect its reasoning, steps, assumptions and score breakdown.</p>
                          {bestBy(pathways, (p) => p.score.composite) && (
                            <button type="button" className="x5-chip" onClick={() => select(pathways[0].id)}>Open top-ranked pathway #{num3(pathways[0].num)}</button>
                          )}
                        </div>
                      ))}
                    {sideTab === "whatif" && <GroupBlock group={group}><WhatIfPanel baseline={baseline} pathways={pathways} onSelect={(id) => { setStageMode("tree"); select(id); }} onExplain={explainGroup} /></GroupBlock>}
                    {sideTab === "compare" && <GroupBlock group={group}><ComparePanel baseline={baseline} pathways={pathways} ids={compareIds} onRemove={toggleCompare} onSelect={(id) => { setStageMode("tree"); select(id); }} onExplain={explainGroup} /></GroupBlock>}
                    {sideTab === "data" && <ProvenanceLegend analysis={analysis} />}
                  </div>
                </Panel>
              )}
            </div>
          </div>

          {done && result && <MetricsStrip result={result} />}

          {/* ---------- secondary panels ---------- */}
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <MaterialDnaPanel analysis={analysis} />
            {done ? <CircularityPanel pathway={shown} baseline={baseline} spaceIndex={result?.spaceIndex ?? null} /> : <ProvenanceLegend analysis={analysis} />}
            {done ? <BaselinePanel baseline={baseline} pathway={shown} /> : <ConstraintsPanel analysis={analysis} />}
            {done ? <SdgStrip pathway={shown} /> : <div />}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <ComponentList analysis={analysis} active={activeComp} onActive={setActiveComp} counts={done ? componentCounts : undefined} />
              {done && <ConstraintsPanel analysis={analysis} />}
            </div>
            <div className="space-y-4">
              <EventStream events={allEvents} />
              {done && (
                <Panel title={`Pathway index · ${visible.size}`} bodyClassName="p-0">
                  <ul className="x5-scroll max-h-[22rem] divide-y overflow-y-auto" style={{ borderColor: "var(--x5-line)" }}>
                    {pathways.filter((p) => visible.has(p.id)).map((p) => (
                      <li key={p.id} className={`flex items-center gap-2 px-3 py-1.5 ${p.id === selectedId ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"}`} style={{ borderColor: "var(--x5-line)" }}>
                        <input type="checkbox" className="h-3.5 w-3.5 accent-[#b6f26b]" checked={compareIds.includes(p.id)} disabled={!compareIds.includes(p.id) && compareIds.length >= 4} onChange={() => toggleCompare(p.id)} aria-label={`Compare pathway ${p.num}`} />
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => { setStageMode("tree"); select(p.id); }} onMouseEnter={() => setHoverId(p.id)} onMouseLeave={() => setHoverId(null)}>
                          <span className="x5-mono w-9 shrink-0 text-[0.9rem] text-[var(--x5-faint)]">#{num3(p.num)}</span>
                          <span className="h-2 w-2 shrink-0" style={{ background: CATEGORY_META[p.category].color }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-base text-[var(--x5-text)]">{p.title}</span>
                          <span className="x5-mono text-[0.9rem] tabular-nums text-[var(--x5-cyan)]">{p.score.circularityIndex.toFixed(1)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}

function GroupBlock({ group, children }: { group: GroupExplain | null; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {children}
      {group && (
        <div className="border-l-2 pl-3" style={{ borderColor: group.from === "model" ? "var(--x5-warn)" : "var(--x5-line-strong)" }}>
          <p className="x5-label">Trade-offs · {group.from === "model" ? `model explanation${group.provider ? ` · ${group.provider}` : ""}` : "rule-based summary"}{group.loading ? " · refining" : ""}</p>
          <p className="mt-1 text-lg leading-relaxed text-[var(--x5-text)]">{group.summary}</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-base text-[var(--x5-dim)]">
            {group.points.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ConstraintsPanel({ analysis }: { analysis: ObjectAnalysis }) {
  return (
    <Panel title="Constraints extracted">
      <ul className="space-y-2.5">
        {analysis.constraints.map((c) => (
          <li key={c.id} className="text-base leading-relaxed">
            <p className="text-[var(--x5-text)]">{c.label}</p>
            <p className="text-[var(--x5-dim)]">{c.effect}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

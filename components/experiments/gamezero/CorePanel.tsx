"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { Capabilities } from "@/hooks/useCapabilities";
import { searchStage } from "@/lib/engines/gamezero/discovery/layout";
import type { MetaLibrary } from "@/lib/engines/gamezero/discovery/meta";
import type { Analysis, DiscoverySession } from "@/lib/engines/gamezero/discovery/session";
import { CounterfactualPanel, ExperimentPanel, HypothesisSpace, MetaPanel, SearchPanel } from "./Lab";
import { GraphSvg, StateSpaceSvg } from "./Viz";
import type { LastUpdate, PlanView, TransferInfo } from "./useDiscovery";
import { Panel, pct } from "./ui";

const DiscoveryCore3D = dynamic(() => import("@/components/3d/gamezero/DiscoveryCore3D"), { ssr: false });

const SEARCH_STEPS = ["INITIAL STATE SPACE", "SEARCHING", "PRUNING", "SURVIVING STATES", "CONVERGENCE", "OPTIMAL RULE MODEL"];

export function StateSpace({ a, plan, caps, className = "" }: { a: Analysis; plan: PlanView | null; caps: Capabilities; className?: string }) {
  const [flat, setFlat] = useState(false);
  const stage = searchStage({ observations: a.qihsHistory.length, knowledge: a.knowledge, identified: a.identified, verified: a.verified });
  const target = plan?.question.match(/What does (\w+) terrain do/)?.[1] ?? null;
  const svg = <StateSpaceSvg a={a} targetColor={target} className="h-full w-full" />;
  return (
    <div className={`relative ${className}`}>
      <div className="absolute left-3 top-3 z-10 max-w-[70%]">
        <p className="gz-readout text-[1.15rem] tracking-[0.2em] text-signal">{stage.label}</p>
        <ol className="mt-1 hidden gap-x-2 sm:flex sm:flex-wrap" aria-label="Search progression">
          {SEARCH_STEPS.map((s, i) => (
            <li key={s} className={`label !text-[1.01rem] ${i === stage.id ? "!text-signal" : i < stage.id ? "!text-dim" : "!text-faint/60"}`}>
              {i < stage.id ? "●" : i === stage.id ? "◉" : "○"}
            </li>
          ))}
        </ol>
      </div>
      <button type="button" onClick={() => setFlat((v) => !v)} className="label absolute right-3 top-3 z-10 !text-[1.01rem] transition hover:!text-signal" aria-pressed={flat}>
        {flat ? "2D · show 3D" : "3D · show 2D"}
      </button>
      <div className="absolute bottom-3 left-3 z-10 gz-readout text-[1.06rem] leading-relaxed text-faint">
        <div>
          {a.worldsLeft.toLocaleString("en-US")} candidate worlds · {a.metrics.hypothesesAlive}/{a.metrics.hypothesesTotal} hypotheses alive
        </div>
        <div>
          {a.qihs.mode === "amplitude-amplification" ? `amplitude amplification · ${a.qihs.rounds} rounds · P(consistent) ${pct(a.qihs.goodProbability, 1)}` : "classical fallback search"}
        </div>
      </div>
      <div className="aspect-square max-h-[36rem] w-full">
        {flat ? svg : <DiscoveryCore3D a={a} targetColor={target} caps={caps} fallback={svg} className="h-full w-full" label="AI Discovery Core: hypothesis nodes, search paths and convergence in three dimensions" />}
      </div>
    </div>
  );
}

type Tab = "space" | "graph" | "hypotheses" | "experiment" | "search" | "meta";
const TABS: { id: Tab; label: string }[] = [
  { id: "space", label: "Discovery core" },
  { id: "graph", label: "Knowledge graph" },
  { id: "hypotheses", label: "Hypotheses" },
  { id: "experiment", label: "Experiment" },
  { id: "search", label: "Search" },
  { id: "meta", label: "Meta" },
];

export function CorePanel({ a, plan, last, caps, session, lib, transfer, gameAExperiments }: { a: Analysis; plan: PlanView | null; last: LastUpdate | null; caps: Capabilities; session: DiscoverySession | null; lib: MetaLibrary | null; transfer: TransferInfo; gameAExperiments: number | null }) {
  const [tab, setTab] = useState<Tab>("space");
  return (
    <section className="gz-panel" aria-label="AI discovery core">
      <div role="tablist" aria-label="Discovery views" className="flex overflow-x-auto border-b border-white/[0.06] px-2">
        {TABS.map((t) => (
          <button key={t.id} role="tab" type="button" id={`gz-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="gz-tabpanel" className="gz-tab shrink-0" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="gz-tabpanel" role="tabpanel" aria-labelledby={`gz-tab-${tab}`} className="p-3">
        {tab === "space" && <StateSpace a={a} plan={plan} caps={caps} />}
        {tab === "graph" && (
          <div>
            <GraphSvg nodes={a.graph.nodes} edges={a.graph.edges} className="mx-auto w-full max-w-2xl" />
            <p className="gz-readout mt-1 text-center text-[1.06rem] text-faint">faint dashed = unknown · violet = testing · cyan = supported · green = causally confirmed</p>
          </div>
        )}
        {tab === "hypotheses" && <HypothesisSpace atoms={a.atoms} />}
        {tab === "experiment" && (
          <div className="space-y-3">
            <ExperimentPanel plan={plan} last={last} a={a} />
            <CounterfactualPanel reports={session?.counterfactuals ?? []} a={a} />
          </div>
        )}
        {tab === "search" && <SearchPanel a={a} />}
        {tab === "meta" && <MetaPanel lib={lib} transfer={transfer} a={a} gameAExperiments={gameAExperiments} />}
      </div>
    </section>
  );
}

export { Panel };

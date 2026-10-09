"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LiveBadge, Notice } from "@/components/ui/Badges";
import { ErrorState } from "@/components/ui/ErrorState";
import { Glass } from "@/components/ui/Glass";
import { useCapabilities } from "@/hooks/useCapabilities";
import { bySlug } from "@/lib/experiments";
import type { Action } from "@/lib/engines/gamezero/types";
import { CorePanel } from "./gamezero/CorePanel";
import { FinalScreen } from "./gamezero/FinalScreen";
import { Hero } from "./gamezero/Hero";
import { SdgBlock } from "./gamezero/SdgBlock";
import { EventStream, MetricsStrip, ModelPanel, PerceptionPanel, Timeline } from "./gamezero/Lab";
import { pct } from "./gamezero/ui";
import { useDiscovery, type Mode, type UiPhase } from "./gamezero/useDiscovery";
import { WorldPanel } from "./gamezero/WorldPanel";

const PHASE_NOTE: Record<UiPhase, string> = {
  idle: "world unknown · awaiting discovery",
  perceive: "perceiving the world",
  identify: "hypothesis → search → experiment → update",
  verify: "causal verification by intervention",
  model: "compressing observations into a world model",
  play: "autonomous play from the learned model only",
  done: "discovery complete",
  stalled: "discovery ended early",
};

export default function GameZeroExperiment() {
  const caps = useCapabilities();
  const mode: Mode = "lab";
  const d = useDiscovery(mode, caps.reducedMotion);
  const [showFinal, setShowFinal] = useState(false);
  const meta = bySlug("gamezero");
  const a = d.analysis;
  const started = d.phase !== "idle";
  const running = d.busy && d.phase !== "idle" && d.phase !== "done";

  useEffect(() => {
    if (d.complete) setShowFinal(true);
  }, [d.complete]);
  useEffect(() => {
    if (d.phase === "idle") setShowFinal(false);
  }, [d.phase]);

  // Replay: the board follows the recorded frames.
  const replayFrame = useMemo(() => {
    const s = d.session;
    if (!s || d.replayIndex === null) return null;
    return [...s.frames].reverse().find((f) => f.eventCount <= (d.replayIndex as number) + 1) ?? null;
  }, [d.session, d.replayIndex, a]);

  const pos = replayFrame?.pos ?? d.state?.pos ?? d.world?.start ?? { x: 0, y: 0 };
  const onMove = (act: Action) => void d.demonstrate(act);
  const interactive = !d.busy && d.phase !== "done";

  const caption = (
    <div className="gz-panel px-4 py-3" aria-live="polite">
      {d.plan ? (
        <p className="text-[1.1rem] text-text sm:text-[1.2rem]">
          <span className="label mr-2 !text-signal">{d.plan.kind === "intervention" ? "Causal test" : "Next experiment"}</span>
          {d.plan.question} <span className="text-dim">{d.plan.actionText}</span>
          {d.plan.gain !== null && d.plan.gain > 0 && <span className="gz-readout ml-2 text-signal">{d.plan.gain.toFixed(2)} bits</span>}
        </p>
      ) : d.last ? (
        <p className="text-[1.1rem] text-text sm:text-[1.2rem]">
          <span className="label mr-2 !text-signal">Result</span>
          {d.last.label} <span className="text-dim">· knowledge {pct(d.last.knowledgeAfter)}</span>
        </p>
      ) : (
        <p className="text-[1.1rem] text-dim sm:text-[1.2rem]">
          <span className="label mr-2 !text-signal">Unknown world</span>
          The agent has been told nothing. Knowledge: {a ? pct(a.knowledge) : "0%"}.
        </p>
      )}
    </div>
  );

  return (
    <main id="main" className="gz-root relative pb-12">
      <div className="mx-auto flex max-w-none items-center justify-between gap-3 px-4 pt-6 sm:px-6">
        <Link href="/lab" className="inline-flex items-center gap-2 text-[1rem] text-dim transition hover:text-text">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the lab
        </Link>
        <LiveBadge />
      </div>
      <Hero active={d.stage} running={running} busy={d.busy} canStart={!!d.world && !!d.session && d.phase !== "done"} started={started} onDiscover={() => void d.discover()} onNew={() => void d.newWorld()} phaseNote={PHASE_NOTE[d.phase]} />

      <div className="mx-auto mt-4 max-w-none space-y-4 px-3 sm:px-4">
        {<Notice>The rules of this world stay hidden on the server. The AI never sees them. It learns them only by watching and testing. AI language models only put the proven results into words.</Notice>}
        {d.error && <ErrorState error={d.error} onRetry={d.world ? undefined : () => void d.newWorld()} />}

        {d.world && a ? (
          (
            <>
              <MetricsStrip a={a} />
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)_minmax(0,0.85fr)]">
                <div className="space-y-4">
                  <WorldPanel world={d.world} pos={pos} trail={d.trail} visited={d.visited} a={a} flash={d.flash} caps={caps} interactive={interactive} phase={d.phase} last={d.last} onMove={onMove} showPad />
                  <PerceptionPanel a={a} world={d.world} />
                </div>
                <CorePanel a={a} plan={d.plan} last={d.last} caps={caps} session={d.session} lib={d.metaLib} transfer={d.transfer} gameAExperiments={d.gameAExperiments} />
                <ModelPanel a={a} narration={d.narration} saved={d.saved} />
              </div>
              {caption}
              <div className="grid gap-4 lg:grid-cols-2">
                <EventStream events={d.session?.events ?? []} upTo={d.replayIndex} />
                <Timeline events={d.session?.events ?? []} frames={d.session?.frames ?? []} replayIndex={d.replayIndex} setReplayIndex={d.setReplayIndex} />
              </div>
              <p className="text-[1rem] text-faint">Optional: make a few moves yourself (arrow keys, WASD or the pad) before pressing Discover. Your moves are only observations. They never confirm a rule.</p>
            </>
          )
        ) : (
          !d.error && (
            <Glass className="p-8 text-center" role="status">
              <p className="text-[1.1rem] text-dim">Generating an unknown world…</p>
            </Glass>
          )
        )}

        {meta && (
          <section aria-label="Impact" className="pt-8">
            <span className="label">Impact</span>
            <div className="mt-2 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <Glass className="p-6">
                <p className="text-[1.2rem] font-light leading-relaxed">{meta.impact}</p>
                <p className="mt-4 text-[1rem] leading-relaxed text-faint">Quantum-inspired means a normal computer simulates a quantum search method. No quantum hardware is used and no quantum advantage is claimed.</p>
              </Glass>
              <SdgBlock meta={meta} />
            </div>
          </section>
        )}
      </div>

      {showFinal && a && (
        <FinalScreen
          a={a}
          play={d.playResult}
          narration={d.narration}
          transfer={d.transfer.active ? { fromExperiments: d.transfer.fromExperiments, gameB: d.transfer.gameBExperiments, validated: d.transfer.validated } : null}
          onClose={() => setShowFinal(false)}
          onNew={() => {
            setShowFinal(false);
            void d.newWorld();
          }}
          onTransfer={() => {
            setShowFinal(false);
            void d.startTransfer();
          }}
          canTransfer={!!d.session && d.complete}
          judge={false}
        />
      )}
    </main>
  );
}

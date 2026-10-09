"use client";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { Capabilities } from "@/hooks/useCapabilities";
import { PROGRESSION, progressionStage } from "@/lib/engines/gamezero/discovery/layout";
import type { Analysis } from "@/lib/engines/gamezero/discovery/session";
import { COLORS, type Action, type Pos, type PublicWorld, type Terrain } from "@/lib/engines/gamezero/types";
import { Board } from "./Board";
import { COLOR_HEX, KEY_TO_ACTION } from "./helpers";
import type { Flash, LastUpdate, UiPhase } from "./useDiscovery";
import { Panel, pct } from "./ui";

const World3D = dynamic(() => import("@/components/3d/gamezero/World3D"), { ssr: false });

const PAD: { a: Action; Icon: typeof ArrowUp; label: string; cls: string }[] = [
  { a: "up", Icon: ArrowUp, label: "Demonstrate move up", cls: "col-start-2 row-start-1" },
  { a: "left", Icon: ArrowLeft, label: "Demonstrate move left", cls: "col-start-1 row-start-2" },
  { a: "down", Icon: ArrowDown, label: "Demonstrate move down", cls: "col-start-2 row-start-2" },
  { a: "right", Icon: ArrowRight, label: "Demonstrate move right", cls: "col-start-3 row-start-2" },
];

export function rolesFrom(a: Analysis): Record<string, Terrain | null> {
  const out: Record<string, Terrain | null> = {};
  for (const x of a.modelAtoms) if (x.kind === "terrain") out[x.color as string] = x.confidence >= 0.999 ? (x.role as Terrain) : null;
  return out;
}

export function WorldPanel(props: {
  world: PublicWorld;
  pos: Pos;
  trail: Pos[];
  visited: Set<string>;
  a: Analysis;
  flash: Flash | null;
  caps: Capabilities;
  interactive: boolean;
  phase: UiPhase;
  last: LastUpdate | null;
  onMove: (a: Action) => void;
  showPad: boolean;
  compact?: boolean;
}) {
  const { world, pos, trail, visited, a, flash, caps, interactive, phase, last, onMove, showPad } = props;
  const [view, setView] = useState<"3d" | "2d">("3d");
  const roles = useMemo(() => rolesFrom(a), [a]);
  const belief = useMemo(() => world.colors.map((row) => row.map((c) => roles[c] ?? ("unknown" as const))), [world, roles]);
  const stage = progressionStage({ observations: a.qihsHistory.length, knowledge: a.knowledge, confirmed: a.metrics.rulesConfirmed, total: a.metrics.rulesTotal, verified: a.verified });
  const headline = a.qihsHistory.length === 0 ? "UNKNOWN WORLD" : a.verified ? "WORLD MODEL COMPLETE" : a.identified ? "WORLD IDENTIFIED · VERIFYING" : "WORLD MODEL FORMING";
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const act = KEY_TO_ACTION[e.key];
    if (!act || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (interactive && showPad) onMove(act);
  };
  const fallback2d = (
    <Board world={world} pos={pos} visited={visited} belief={belief} flash={flash} tilt={false} reduced={caps.reducedMotion} interactive={interactive && showPad} status={headline} onMove={onMove} />
  );
  return (
    <Panel
      title="Unknown world"
      aside={
        <button type="button" className="transition hover:!text-signal" onClick={() => setView((v) => (v === "3d" ? "2d" : "3d"))} aria-pressed={view === "3d"}>
          {view === "3d" ? "3D · switch to 2D" : "2D · switch to 3D"}
        </button>
      }
    >
      <div className="px-3 pb-3 pt-2.5">
        <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
          <span className="gz-readout text-[1rem] tracking-[0.2em] text-text">{headline}</span>
          <span className="gz-readout text-[1rem] text-signal">KNOWLEDGE {pct(a.knowledge)}</span>
        </div>
        {view === "3d" ? (
          <div tabIndex={0} role="group" aria-label={`3D world, ${world.size} by ${world.size}. ${showPad ? "Arrow keys or WASD demonstrate a move." : ""} Player at ${pos.x}, ${pos.y}.`} onKeyDown={onKey} className="relative mx-auto aspect-square w-full max-w-[44rem] rounded-[4px] outline-none focus-visible:ring-1 focus-visible:ring-signal/70">
            <World3D world={world} pos={pos} trail={trail} visited={visited} roles={roles} order={a.knowledge} flash={flash} caps={caps} fallback={fallback2d} className="absolute inset-0" label="Three-dimensional view of the unknown world with the player and its trail" />
          </div>
        ) : (
          fallback2d
        )}
        {view === "3d" && showPad && (
          <div role="group" aria-label="Demonstration controls" className="mx-auto mt-2 grid w-fit grid-cols-3 grid-rows-2 gap-1.5">
            {PAD.map(({ a: act, Icon, label, cls }) => (
              <button key={act} type="button" aria-label={label} disabled={!interactive} onClick={() => onMove(act)} className={`${cls} flex h-10 w-10 items-center justify-center rounded-[4px] border border-line bg-white/[0.04] text-text transition hover:border-signal/50 disabled:pointer-events-none disabled:opacity-35`}>
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 px-1 text-[1.12rem] sm:grid-cols-4">
          <Fact k="PLAYER" v={`(${pos.x},${pos.y})`} />
          <Fact k="ACTION" v={last ? last.label.split(":")[1]?.split("→")[0]?.trim() ?? "—" : "—"} />
          <Fact k="RESULT" v={last ? (last.label.split("→")[1] ?? "").trim() || "—" : "—"} />
          <Fact k="PHASE" v={phase} />
        </div>
        <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1" aria-label="Discovery progression">
          {PROGRESSION.map((p, i) => (
            <li key={p} className={`label !text-[1.01rem] ${i === stage ? "!text-signal" : i < stage ? "!text-dim" : ""}`} aria-current={i === stage ? "step" : undefined}>
              {i < stage ? "●" : i === stage ? "◉" : "○"} {p}
            </li>
          ))}
        </ol>
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1" aria-label="Terrain legend">
          {COLORS.filter((c) => world.colors.flat().includes(c)).map((c) => (
            <li key={c} className="flex items-center gap-1.5 text-[1.06rem] text-dim">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR_HEX[c] }} aria-hidden />
              <span className="capitalize">{c}</span>
              <span className="gz-readout uppercase text-faint">{roles[c] ?? "?"}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <span className="label !text-[1.01rem]">{k} </span>
      <span className="gz-readout truncate text-text">{v || "—"}</span>
    </div>
  );
}

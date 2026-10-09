"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { Action, GameEvent, Pos, PublicWorld, Terrain } from "@/lib/engines/gamezero/types";
import { COLOR_GLYPH, COLOR_HEX, EVENT_HEX, KEY_TO_ACTION, TERRAIN_GLYPH, posText } from "./helpers";

export interface Flash {
  n: number;
  pos: Pos;
  event: Exclude<GameEvent, "none">;
}

interface Props {
  world: PublicWorld;
  pos: Pos;
  visited: Set<string>;
  belief: (Terrain | "unknown")[][] | null;
  flash: Flash | null;
  tilt: boolean;
  reduced: boolean;
  interactive: boolean;
  status: string;
  onMove: (a: Action) => void;
}

const PAD: { a: Action; Icon: typeof ArrowUp; label: string; cls: string }[] = [
  { a: "up", Icon: ArrowUp, label: "Move up", cls: "col-start-2 row-start-1" },
  { a: "left", Icon: ArrowLeft, label: "Move left", cls: "col-start-1 row-start-2" },
  { a: "down", Icon: ArrowDown, label: "Move down", cls: "col-start-2 row-start-2" },
  { a: "right", Icon: ArrowRight, label: "Move right", cls: "col-start-3 row-start-2" },
];

export function Board({ world, pos, visited, belief, flash, tilt, reduced, interactive, status, onMove }: Props) {
  const n = world.size;
  const cell = 100 / n;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const a = KEY_TO_ACTION[e.key];
    if (!a || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (interactive) onMove(a);
  };
  const dur = reduced ? 0.01 : 0.38;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-full max-w-[520px] overflow-hidden px-1 py-3" style={{ perspective: "1100px" }}>
        <div
          tabIndex={0}
          role="group"
          aria-label={`Game board, ${n} by ${n}. Use arrow keys or W A S D to demonstrate a move. ${status}`}
          onKeyDown={onKey}
          className="relative mx-auto aspect-square w-full rounded-2xl border border-line bg-black/40 p-1.5 outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-signal/70"
          style={{
            transform: tilt && !reduced ? "rotateX(24deg) scale(0.94)" : "rotateX(0deg)",
            transitionDuration: "700ms",
            transformOrigin: "50% 70%",
            boxShadow: "0 40px 80px -30px rgba(123,224,208,0.25)",
          }}
        >
          <div className="relative h-full w-full">
            <div className="grid h-full w-full gap-[3px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}>
              {world.colors.flatMap((row, y) =>
                row.map((c, x) => {
                  const hex = COLOR_HEX[c];
                  const k = `${x},${y}`;
                  const b = belief?.[y]?.[x];
                  const isStart = x === world.start.x && y === world.start.y;
                  return (
                    <div
                      key={k}
                      title={`${posText({ x, y })} ${c}`}
                      className="relative flex items-center justify-center rounded-md text-[1.06rem] leading-none sm:text-[1rem]"
                      style={{
                        background: `linear-gradient(145deg, ${hex}33, ${hex}14)`,
                        border: `1px solid ${hex}55`,
                        boxShadow: `inset 0 0 14px ${hex}26, 0 0 10px -4px ${hex}66`,
                        color: hex,
                      }}
                    >
                      <span aria-hidden className="absolute left-0.5 top-0.5 opacity-40" style={{ fontSize: 8 }}>
                        {COLOR_GLYPH[c]}
                      </span>
                      {isStart && <span aria-hidden className="absolute inset-0.5 rounded border border-dashed border-white/30" />}
                      {visited.has(k) && <span aria-hidden className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-white/60" />}
                      {b && b !== "unknown" && b !== "free" && (
                        <motion.span aria-hidden initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 0.95, scale: 1 }} transition={{ duration: 0.5 }} className="font-semibold text-white">
                          {TERRAIN_GLYPH[b]}
                        </motion.span>
                      )}
                    </div>
                  );
                }),
              )}
            </div>
            <AnimatePresence>
              {flash && (
                <motion.div
                  key={flash.n}
                  aria-hidden
                  className="pointer-events-none absolute rounded-md"
                  style={{ width: `${cell}%`, height: `${cell}%`, left: `${flash.pos.x * cell}%`, top: `${flash.pos.y * cell}%`, border: `2px solid ${EVENT_HEX[flash.event]}`, boxShadow: `0 0 24px ${EVENT_HEX[flash.event]}` }}
                  initial={{ opacity: 1, scale: 1 }}
                  animate={{ opacity: 0, scale: reduced ? 1 : 1.9 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.4 : 0.8 }}
                />
              )}
            </AnimatePresence>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute flex items-center justify-center"
              style={{ width: `${cell}%`, height: `${cell}%` }}
              initial={false}
              animate={{ left: `${pos.x * cell}%`, top: `${pos.y * cell}%` }}
              transition={{ duration: dur, ease: "easeOut" }}
            >
              <span className="block h-[58%] w-[58%] rounded-full bg-white" style={{ boxShadow: "0 0 18px 4px rgba(255,255,255,0.55), 0 0 40px 8px rgba(123,224,208,0.35)" }} />
            </motion.div>
          </div>
        </div>
      </div>

      <div role="group" aria-label="Move controls" className="grid grid-cols-3 grid-rows-2 gap-2">
        {PAD.map(({ a, Icon, label, cls }) => (
          <button
            key={a}
            type="button"
            aria-label={label}
            disabled={!interactive}
            onClick={() => onMove(a)}
            className={`${cls} flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-text transition duration-300 hover:border-white/25 hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-signal/70 disabled:pointer-events-none disabled:opacity-35`}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

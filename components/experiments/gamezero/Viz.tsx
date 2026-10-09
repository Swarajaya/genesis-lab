"use client";
import { motion } from "framer-motion";
import { chaos, dynEdges, dynPosition, lerp3, searchStage, terrainPosition } from "@/lib/engines/gamezero/discovery/layout";
import type { Analysis } from "@/lib/engines/gamezero/discovery/session";
import { DNA_CATEGORIES, type DnaSegment, type GEdge, type GNode } from "@/lib/engines/gamezero/discovery/model";
import { TERRAINS } from "@/lib/engines/gamezero/discovery/space";
import type { Category } from "@/lib/engines/gamezero/discovery/ledger";
import { COLORS } from "@/lib/engines/gamezero/types";
import { COLOR_HEX } from "./helpers";
import { CYAN, GREEN, RED, VIOLET } from "./ui";

const EDGES = dynEdges();

/** 2D rendering of the quantum-inspired hypothesis state space. Every size/opacity comes from the optimizer state. */
export function StateSpaceSvg({ a, targetColor, className = "" }: { a: Analysis; targetColor?: string | null; className?: string }) {
  const order = a.knowledge;
  const colorList = COLORS.filter((c) => a.atoms.some((x) => x.color === c));
  const pos = (i: number) => lerp3(chaos(i), dynPosition(i), 0.25 + 0.75 * order);
  const stage = searchStage({ observations: a.qihsHistory.length, knowledge: a.knowledge, identified: a.identified, verified: a.verified });
  const lead = a.leadHistory.filter((x, i, arr) => x >= 0 && (i === 0 || arr[i - 1] !== x));
  return (
    <svg viewBox="-1.45 -1.45 2.9 2.9" className={className} role="img" aria-label={`Quantum-inspired hypothesis state space: ${stage.label}. ${a.worldsLeft.toLocaleString("en-US")} candidate worlds remain.`}>
      <defs>
        <radialGradient id="gz-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={CYAN} stopOpacity="0.9" />
          <stop offset="100%" stopColor={CYAN} stopOpacity="0" />
        </radialGradient>
      </defs>
      {[0.42, 0.62, 0.82, 1.15].map((r) => (
        <circle key={r} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.004" strokeDasharray="0.02 0.03" />
      ))}
      {EDGES.map(([i, j]) => {
        const p = pos(i);
        const q = pos(j);
        const both = a.dynNodes[i].alive && a.dynNodes[j].alive;
        const w = both ? Math.min(1, Math.sqrt(a.dynNodes[i].mass * a.dynNodes[j].mass) * 4) : 0;
        return <line key={`${i}-${j}`} x1={p.x} y1={p.z} x2={q.x} y2={q.z} stroke={both ? VIOLET : RED} strokeOpacity={both ? 0.1 + 0.55 * w : 0.035} strokeWidth={0.004 + 0.008 * w} />;
      })}
      {a.dynNodes.map((n) => {
        const p = pos(n.index);
        return <line key={`s${n.index}`} x1={0} y1={0} x2={p.x} y2={p.z} stroke={CYAN} strokeOpacity={n.alive ? 0.04 + 0.6 * Math.sqrt(n.mass) : 0} strokeWidth={0.003 + 0.01 * n.mass} />;
      })}
      {lead.length > 1 && (
        <polyline className="gz-dash" fill="none" stroke={GREEN} strokeWidth="0.012" strokeOpacity="0.9" points={lead.map((i) => `${pos(i).x},${pos(i).z}`).join(" ")} />
      )}
      {a.dynNodes.map((n) => {
        const p = pos(n.index);
        const strong = n.alive && n.mass > 0.5;
        return (
          <motion.circle
            key={n.index}
            initial={false}
            animate={{ cx: p.x, cy: p.z, r: n.alive ? 0.03 + 0.1 * Math.sqrt(n.mass) : 0.016, opacity: n.alive ? 0.55 + 0.45 * Math.min(1, n.mass * 3) : 0.16 }}
            transition={{ duration: 0.7 }}
            fill={n.alive ? (strong ? GREEN : VIOLET) : RED}
            stroke={n.alive ? "rgba(255,255,255,0.7)" : "none"}
            strokeWidth="0.004"
          >
            <title>{`${n.label} · P=${(n.mass * 100).toFixed(1)}%${n.alive ? "" : ` · rejected at step ${n.diedAt}`}`}</title>
          </motion.circle>
        );
      })}
      {colorList.flatMap((c, ci) =>
        TERRAINS.map((t, ri) => {
          const atom = a.atoms.find((x) => x.color === c && x.role === t);
          if (!atom) return null;
          const p = lerp3(chaos(100 + ci * 5 + ri), terrainPosition(ci, ri, colorList.length), 0.25 + 0.75 * order);
          const dead = atom.status === "REJECTED";
          const hl = targetColor === c;
          return (
            <motion.circle
              key={atom.id}
              initial={false}
              animate={{ cx: p.x, cy: p.z, r: dead ? 0.012 : 0.016 + 0.04 * atom.confidence, opacity: dead ? 0.12 : 0.35 + 0.65 * atom.confidence }}
              transition={{ duration: 0.7 }}
              fill={COLOR_HEX[c]}
              stroke={atom.status === "CONFIRMED" ? "#fff" : hl ? CYAN : "none"}
              strokeWidth="0.006"
            >
              <title>{`${atom.id} ${atom.statement} · ${(atom.confidence * 100).toFixed(0)}% · ${atom.status}`}</title>
            </motion.circle>
          );
        }),
      )}
      <circle r={0.1 + 0.12 * order} fill="url(#gz-core)" opacity={0.25 + 0.75 * order} />
      <circle r={0.045} fill="#fff" opacity="0.9" />
    </svg>
  );
}

const STATE_COLOR = { unknown: "rgba(255,255,255,0.28)", testing: VIOLET, supported: CYAN, confirmed: GREEN } as const;

const GRAPH_POS: Record<string, { x: number; y: number }> = {
  player: { x: 86, y: 36 },
  movement: { x: 86, y: 8 },
  boundary: { x: 60, y: 8 },
  "role:collision": { x: 50, y: 18 },
  "role:hazard": { x: 50, y: 30 },
  "role:reward": { x: 50, y: 42 },
  "role:goal": { x: 50, y: 54 },
  "role:safe": { x: 50, y: 66 },
  "role:unknown": { x: 22, y: 74 },
};

/** Knowledge graph. Unknown relations are faint and dashed; confirmed relations are solid and strong. */
export function GraphSvg({ nodes, edges, className = "" }: { nodes: GNode[]; edges: GEdge[]; className?: string }) {
  const colors = nodes.filter((n) => n.type === "color");
  const pos = (n: GNode) => {
    if (n.type === "color") {
      const i = colors.findIndex((c) => c.id === n.id);
      return { x: 12, y: 12 + i * (56 / Math.max(1, colors.length - 1)) };
    }
    return GRAPH_POS[n.id] ?? { x: 50, y: 40 };
  };
  const at = new Map(nodes.map((n) => [n.id, pos(n)]));
  return (
    <svg viewBox="0 0 100 80" className={className} role="img" aria-label="Live knowledge graph of the learned world model">
      <defs>
        <marker id="gz-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 L6 3 L0 6 z" fill="rgba(255,255,255,0.5)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const p = at.get(e.from);
        const q = at.get(e.to);
        if (!p || !q) return null;
        const col = STATE_COLOR[e.state];
        const s = e.strength;
        return (
          <g key={i}>
            <motion.line initial={false} animate={{ x1: p.x, y1: p.y, x2: q.x, y2: q.y, opacity: e.state === "unknown" ? 0.28 : 0.35 + 0.65 * s, strokeWidth: 0.25 + 1.1 * s }} stroke={col} className={e.state === "testing" ? "gz-dash" : ""} strokeDasharray={e.state === "unknown" ? "1.2 1.6" : undefined} markerEnd="url(#gz-arrow)" />
            {s > 0.55 && (
              <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 1} fontSize="4" textAnchor="middle" fill="rgba(232,237,245,0.85)" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
                {e.label.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = at.get(n.id) as { x: number; y: number };
        const hex = n.color ? COLOR_HEX[n.color] : n.type === "player" ? "#fff" : n.type === "mechanic" ? VIOLET : CYAN;
        const o = n.id === "role:unknown" ? 0.4 : 0.35 + 0.65 * Math.max(n.strength, n.type === "player" ? 1 : 0);
        return (
          <g key={n.id} opacity={o}>
            <circle cx={p.x} cy={p.y} r={2.2 + 1.8 * n.strength} fill={hex} fillOpacity="0.25" stroke={hex} strokeWidth="0.35" />
            <text x={p.x} y={p.y + 6} fontSize="4" textAnchor="middle" fill="rgba(232,237,245,0.9)" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
              {n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const CAT_HUE: Record<Category, string> = { MOVEMENT: CYAN, TERRAIN: "#7c8aa5", COLLISION: RED, REWARD: "#f2c260", GOAL: GREEN, BOUNDARY: VIOLET };

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

/** Rule DNA: one sector per rule category; every arc is a rule the model actually holds. */
export function RuleDna({ dna, className = "" }: { dna: DnaSegment[]; className?: string }) {
  const sector = (Math.PI * 2) / DNA_CATEGORIES.length;
  const confirmed = dna.filter((d) => d.status === "CONFIRMED").length;
  return (
    <svg viewBox="-60 -60 120 120" className={className} role="img" aria-label={`Rule DNA: ${confirmed} of ${dna.length} rules confirmed`}>
      {DNA_CATEGORIES.map((cat, ci) => {
        const a0 = ci * sector - Math.PI / 2 + 0.06;
        const a1 = (ci + 1) * sector - Math.PI / 2 - 0.06;
        const segs = dna.filter((d) => d.category === cat);
        const mid = (a0 + a1) / 2;
        return (
          <g key={cat}>
            {segs.length === 0 && <path d={arc(0, 0, 38, a0, a1)} stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" strokeDasharray="1 2.5" />}
            {segs.map((s, i) => {
              const w = (a1 - a0) / segs.length;
              const s0 = a0 + i * w + 0.015;
              const s1 = a0 + (i + 1) * w - 0.015;
              const conf = s.status === "CONFIRMED";
              return (
                <g key={s.atomId}>
                  <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.1 * i }} d={arc(0, 0, 38, s0, s1)} stroke={CAT_HUE[cat]} strokeOpacity={conf ? 1 : 0.25 + 0.5 * s.confidence} strokeWidth={conf ? 5 : 3} fill="none" strokeLinecap="round" />
                  <path d={arc(0, 0, 31, s0, s1)} stroke={s.color ? COLOR_HEX[s.color] : CAT_HUE[cat]} strokeOpacity={0.7} strokeWidth="1.4" fill="none" strokeLinecap="round" />
                  <title>{`${cat} · ${s.label} · ${(s.confidence * 100).toFixed(0)}% · ${s.status}`}</title>
                </g>
              );
            })}
            <text x={Math.cos(mid) * 50} y={Math.sin(mid) * 50 + 1} fontSize="6" textAnchor="middle" fill={segs.length ? "rgba(232,237,245,0.85)" : "rgba(255,255,255,0.3)"} style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}>
              {cat}
            </text>
          </g>
        );
      })}
      <text y="-2" fontSize="14" textAnchor="middle" fill="#e8edf5" style={{ fontFamily: "var(--font-mono)" }}>
        {confirmed}/{dna.length}
      </text>
      <text y="7" fontSize="6" textAnchor="middle" fill="rgba(154,165,184,0.9)" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}>
        RULES CONFIRMED
      </text>
    </svg>
  );
}

export function KnowledgeRing({ value, label = "KNOWLEDGE", className = "" }: { value: number; label?: string; className?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="-55 -55 110 110" className={className} role="img" aria-label={`${label} ${Math.round(value * 100)} percent`}>
      <circle r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <motion.circle r={r} fill="none" stroke={value >= 0.999 ? GREEN : CYAN} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - value) }} transition={{ duration: 0.8 }} transform="rotate(-90)" />
      <text y="6" fontSize="22" textAnchor="middle" fill="#e8edf5" style={{ fontFamily: "var(--font-mono)" }}>
        {String(Math.round(value * 100)).padStart(2, "0")}%
      </text>
      <text y="19" fontSize="5" textAnchor="middle" fill="rgba(154,165,184,0.9)" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}>
        {label}
      </text>
    </svg>
  );
}

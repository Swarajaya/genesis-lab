"use client";
import { CATEGORY_META, num3, type Pathway, type TreeLayout } from "./model";

interface Props {
  pathways: Pathway[];
  layout: TreeLayout;
  visible: Set<string>;
  selectedId: string | null;
  hoverId: string | null;
  compareIds: string[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  objectName: string;
}

const VB = 6.2;

/** 2D fallback of the life tree (used without WebGL). Same layout, same interaction, keyboard focusable. */
export function LifeTreeSvg({ pathways, layout, visible, selectedId, hoverId, compareIds, onSelect, onHover, objectName }: Props) {
  const byId = new Map(pathways.map((p) => [p.id, p]));
  const tip = hoverId ? layout.leaves.find((l) => l.id === hoverId) : null;
  const tp = tip ? byId.get(tip.id) : null;
  return (
    <svg viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`} role="group" aria-label={`Life tree of ${pathways.length} pathways for ${objectName}. Each node is a pathway.`} className="h-full w-full">
      <defs>
        <radialGradient id="x5-lt-core">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.35" stopColor="#b6f26b" stopOpacity="0.6" />
          <stop offset="1" stopColor="#b6f26b" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[2, 3.4, 4.8, 5.8].map((r) => (
        <circle key={r} r={r} fill="none" stroke="rgb(182 242 107 / 0.07)" strokeDasharray="2 5" strokeWidth={0.02} />
      ))}
      {layout.hubs.map((h) => (
        <line key={h.category} x1={0} y1={0} x2={h.x} y2={h.z} stroke={CATEGORY_META[h.category].color} strokeOpacity={0.6} strokeWidth={0.05} />
      ))}
      {layout.leaves.map((l) => {
        const hub = layout.hubs[l.hub];
        const on = visible.has(l.id);
        const hot = l.id === selectedId || l.id === hoverId;
        return <line key={`e${l.id}`} x1={hub.x} y1={hub.z} x2={l.x} y2={l.z} stroke={CATEGORY_META[l.category].color} strokeOpacity={hot ? 0.95 : on ? 0.2 : 0.04} strokeWidth={hot ? 0.05 : 0.02} />;
      })}
      {layout.hubs.map((h) => (
        <g key={`h${h.category}`} pointerEvents="none">
          <circle cx={h.x} cy={h.z} r={0.14} fill={CATEGORY_META[h.category].color} />
          <text x={h.x * 1.32} y={h.z * 1.32} textAnchor="middle" dominantBaseline="middle" fontSize={0.24} fill="#9aa3b2" style={{ fontFamily: "var(--font-sans)", letterSpacing: "0.08em" }}>
            {CATEGORY_META[h.category].label}
          </text>
        </g>
      ))}
      {layout.leaves.map((l) => {
        const p = byId.get(l.id);
        if (!p) return null;
        const on = visible.has(l.id);
        const sel = l.id === selectedId;
        const cmp = compareIds.includes(l.id);
        const m = CATEGORY_META[l.category];
        const r = l.size * 1.7;
        return (
          <g
            key={l.id}
            role="button"
            tabIndex={on ? 0 : -1}
            aria-label={`Pathway ${p.num}: ${p.title}. ${m.label}. Circularity ${p.score.circularityIndex.toFixed(1)}.`}
            aria-pressed={sel}
            aria-hidden={on ? undefined : true}
            style={{ cursor: on ? "pointer" : "default", outline: "none", opacity: on ? 1 : 0.12 }}
            onPointerEnter={() => on && onHover(l.id)}
            onPointerLeave={() => onHover(null)}
            onFocus={() => on && onHover(l.id)}
            onBlur={() => onHover(null)}
            onClick={() => on && onSelect(l.id)}
            onKeyDown={(e) => {
              if (on && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(l.id);
              }
            }}
          >
            <circle cx={l.x} cy={l.z} r={r * 2.8} fill="transparent" />
            <circle cx={l.x} cy={l.z} r={r * 1.9} fill={m.color} opacity={0.12 * l.glow} />
            <circle cx={l.x} cy={l.z} r={r} fill={m.color} opacity={l.glow} stroke={sel ? "#fff" : cmp ? "#b6f26b" : "none"} strokeWidth={0.06} />
          </g>
        );
      })}
      <circle r={1.1} fill="url(#x5-lt-core)" pointerEvents="none" />
      <circle r={0.26} fill="#fff" pointerEvents="none" />
      {tip && tp && (
        <g pointerEvents="none" transform={`translate(${Math.max(-VB + 2.7, Math.min(VB - 2.7, tip.x))} ${tip.z < 0 ? tip.z + 0.6 : tip.z - 1})`}>
          <rect x={-2.6} y={-0.34} width={5.2} height={0.86} fill="#04090c" stroke="rgb(182 242 107 / 0.4)" strokeWidth={0.02} />
          <text textAnchor="middle" y={0.02} fontSize={0.25} fill="#f4f5f8">
            {tp.title.length > 40 ? `${tp.title.slice(0, 39)}…` : tp.title}
          </text>
          <text textAnchor="middle" y={0.36} fontSize={0.2} fill="#9aa3b2" style={{ fontFamily: "var(--font-sans)" }}>
            {`#${num3(tp.num)} · CI ${tp.score.circularityIndex.toFixed(1)} · ${CATEGORY_META[tp.category].label}`}
          </text>
        </g>
      )}
    </svg>
  );
}

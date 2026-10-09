"use client";
import { MATERIAL_COLOR, CATEGORY_META, fatesFor, reassembles, type ComponentSpec, type Pathway } from "./model";

/** 2D fallback for the object stage: components as blocks whose layout follows the simulator step. */
export function StageSvg({ components, exploded, step, pathway, activeComp }: { components: ComponentSpec[]; exploded: boolean; step: number; pathway: Pathway | null; activeComp: string | null }) {
  const fates = fatesFor(components, pathway);
  const color = pathway ? CATEGORY_META[pathway.category].color : "#b6f26b";
  const n = components.length;
  const cols = Math.min(n, 5);
  return (
    <svg viewBox="0 0 600 340" className="h-full w-full" role="img" aria-label="Components of the object">
      {components.map((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const side = 22 + Math.sqrt(c.massFraction) * 70;
        const collapsed = !exploded && step < 0;
        const gx = collapsed ? 300 + (col - (cols - 1) / 2) * 16 : 300 + (col - (cols - 1) / 2) * 105;
        const gy = collapsed ? 150 + row * 14 : 90 + row * 100;
        const fate = fates.get(c.id) ?? "transform";
        const dropped = step >= 1 && fate === "discard";
        const final = step >= 4 && fate === "transform";
        const y = dropped ? gy + 70 : final && reassembles(pathway) ? 150 + row * 14 : gy;
        const x = final && reassembles(pathway) ? 300 + (col - (cols - 1) / 2) * 16 : gx;
        const fill = step >= 3 && fate === "transform" ? color : MATERIAL_COLOR[c.material];
        return (
          <g key={c.id} style={{ transition: "transform 0.8s ease, opacity 0.8s ease", transform: `translate(${x}px, ${y}px)`, opacity: dropped ? 0.3 : 1 }}>
            <rect x={-side / 2} y={-side / 2} width={side} height={side} fill={fill} fillOpacity={activeComp === c.id ? 0.9 : 0.55} stroke={activeComp === c.id ? "#fff" : fill} strokeWidth={1.2} />
            {!collapsed && (
              <text y={side / 2 + 14} textAnchor="middle" fontSize="17" fill="#9aa3b2" style={{ fontFamily: "var(--font-sans)" }}>
                {c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

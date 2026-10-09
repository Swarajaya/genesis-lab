"use client";
import { NODE_COLOR, slotPosition, type LiveNetworkProps } from "./liveLayout";

/** 2D fallback with the same layout, colours and selection behaviour as the 3D scene. */
export default function LiveNetworkSvg({ nodes, selected, hovered, onSelect, onHover, highlight, severity }: LiveNetworkProps) {
  const hub = severity > 0.66 ? "#ff6b7a" : severity > 0.33 ? "#f2c260" : "#7be0d0";
  return (
    <svg viewBox="-5 -3.4 10 6.8" className="h-full w-full" role="img" aria-label="Live blood network, 2D view">
      {[1.6, 2.7, 3.8].map((r) => (
        <ellipse key={r} cx={0} cy={0} rx={r} ry={r * 0.55} fill="none" stroke="#7be0d0" strokeOpacity={0.12} />
      ))}
      {nodes.map((n, i) => {
        const p = slotPosition(i, n.distanceKm);
        const x = p.x, y = p.z * 0.55;
        const off = n.state === "offline";
        return (
          <g key={n.code} opacity={off ? 0.4 : 1}>
            <line x1={0} y1={0} x2={x} y2={y} stroke={NODE_COLOR[n.state]} strokeOpacity={n.committed > 0 ? 0.6 : 0.18} strokeWidth={n.committed > 0 ? 0.03 : 0.015} />
            <circle
              cx={x}
              cy={y}
              r={0.14 + Math.min(0.1, n.units * 0.02) + (selected === n.code || hovered === n.code || highlight.includes(n.code) ? 0.05 : 0)}
              fill={NODE_COLOR[n.state]}
              style={{ cursor: "pointer" }}
              tabIndex={0}
              role="button"
              aria-label={`${n.code} ${n.group} ${n.units} units`}
              onClick={() => onSelect(selected === n.code ? null : n.code)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(selected === n.code ? null : n.code)}
              onMouseEnter={() => onHover(n.code)}
              onMouseLeave={() => onHover(null)}
            />
            {(n.state === "live" || selected === n.code || hovered === n.code) && (
              <text x={x} y={y - 0.28} textAnchor="middle" fontSize={0.2} fill="#e8edf5" fontFamily="ui-monospace, monospace">
                {n.code}
              </text>
            )}
          </g>
        );
      })}
      <circle cx={0} cy={0} r={0.5} fill={hub} fillOpacity={0.85} />
      <circle cx={0} cy={0} r={0.85} fill="none" stroke={hub} strokeOpacity={0.4} />
    </svg>
  );
}

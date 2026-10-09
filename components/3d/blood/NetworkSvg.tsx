"use client";
import { motion, useReducedMotion } from "framer-motion";
import { computeLayout, RECIPIENT_COLOR, VERDICT_COLOR, type NetworkProps } from "./layout";

const S = 230; // svg half-extent scale

/** 2D version of the living network with identical data and interaction. Nodes are keyboard-focusable. */
export default function NetworkSvg({ ranking, selected, hovered, onSelect, onHover }: NetworkProps) {
  const reduce = useReducedMotion();
  const nodes = computeLayout(ranking);
  return (
    <svg viewBox="-260 -260 520 520" className="h-full w-full" role="group" aria-label="Donor compatibility network. Each node is a donor unit; use Tab and Enter to select.">
      <defs>
        <radialGradient id="blood-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={RECIPIENT_COLOR} stopOpacity="0.55" />
          <stop offset="100%" stopColor={RECIPIENT_COLOR} stopOpacity="0" />
        </radialGradient>
      </defs>
      {[0.5, 0.75, 1].map((r) => (
        <circle key={r} r={r * S} fill="none" stroke="rgb(255 255 255 / 0.05)" strokeDasharray="2 6" />
      ))}
      {nodes.map((n) => {
        const active = n.code === selected || n.code === hovered;
        const c = VERDICT_COLOR[n.verdict];
        const dim = n.verdict === "INCOMPATIBLE";
        return (
          <motion.line
            key={`e-${n.code}`}
            x1={0}
            y1={0}
            x2={n.x * S}
            y2={-n.y * S}
            stroke={c}
            strokeLinecap="round"
            strokeWidth={dim ? 0.8 : 0.8 + (n.score / 100) * 4}
            initial={{ opacity: 0 }}
            animate={{ opacity: active ? 0.95 : dim ? 0.18 : [0.3, 0.6, 0.3] }}
            transition={active || dim || reduce ? { duration: 0.4 } : { duration: 2.4 + (n.phase % 1.5), repeat: Infinity, ease: "easeInOut" }}
          />
        );
      })}
      <circle r={70} fill="url(#blood-core)" />
      <motion.circle
        r={18}
        fill={RECIPIENT_COLOR}
        animate={reduce ? { scale: 1 } : { scale: [1, 1.12, 1] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <text y={38} textAnchor="middle" fill="#9aa5b8" fontSize="11" fontFamily="ui-monospace, monospace" letterSpacing="2">
        RECIPIENT
      </text>
      {nodes.map((n, i) => {
        const active = n.code === selected || n.code === hovered;
        const c = VERDICT_COLOR[n.verdict];
        const r = 6 + n.size * 120;
        const cx = n.x * S;
        const cy = -n.y * S;
        return (
          <motion.g
            key={n.code}
            role="button"
            tabIndex={0}
            aria-label={`${n.code}, ${n.verdict.toLowerCase()}, score ${n.score}, ${n.units} units`}
            aria-pressed={n.code === selected}
            style={{ cursor: "pointer", transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: active ? 1.25 : 1, x: reduce ? 0 : [0, 3, -2, 0], y: reduce ? 0 : [0, -3, 2, 0] }}
            transition={{ opacity: { duration: 0.5, delay: i * 0.04 }, scale: { duration: 0.3 }, x: { duration: 7 + (i % 4), repeat: Infinity, ease: "easeInOut" }, y: { duration: 8 + (i % 3), repeat: Infinity, ease: "easeInOut" } }}
            onClick={() => onSelect(n.code)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(n.code);
              }
            }}
            onMouseEnter={() => onHover(n.code)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(n.code)}
            onBlur={() => onHover(null)}
          >
            <circle cx={cx} cy={cy} r={r * 2.1} fill={c} opacity={n.verdict === "INCOMPATIBLE" ? 0.06 : 0.14} />
            <circle cx={cx} cy={cy} r={r} fill={c} fillOpacity={n.verdict === "INCOMPATIBLE" ? 0.55 : 0.9} stroke={n.code === selected ? "#fff" : "none"} strokeWidth={2} />
            <text x={cx} y={cy - r - 7} textAnchor="middle" fill={active ? "#e8edf5" : "#6b768a"} fontSize="10" fontFamily="ui-monospace, monospace">
              {n.code}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

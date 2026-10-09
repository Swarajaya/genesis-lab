"use client";
import { memo, useMemo } from "react";
import { inr, type LedgerEvent, type Policy } from "@/lib/engines/money/policy";
import { fmtSpan } from "@/lib/engines/money/policy";

interface N {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  rule?: string;
  kind: "root" | "rule" | "leaf";
}

const ROW = 34;

function build(p: Policy) {
  const groups: { rule: string; label: string; leaves: { label: string; sub?: string }[] }[] = [
    { rule: "RECIPIENT", label: "RECIPIENT", leaves: [{ label: p.recipient.id === "*" ? `ANY ${p.recipient.type}` : p.recipient.id }] },
    { rule: "PURPOSE", label: "PURPOSE", leaves: p.allowedPurposes.map((x) => ({ label: x, sub: p.allocations[x] !== undefined ? inr(p.allocations[x] as number) : undefined })) },
  ];
  if (p.merchantConstraints.length) groups.push({ rule: "MERCHANT", label: "MERCHANT", leaves: p.merchantConstraints.map((m) => ({ label: m })) });
  groups.push({ rule: "MAX_TRANSACTION", label: "LIMIT", leaves: [{ label: `${inr(p.maxTransactionPaise)} / txn` }] });
  groups.push({ rule: "EXPIRY", label: "EXPIRY", leaves: [{ label: fmtSpan(Math.round((Date.parse(p.expiresAt) - Date.parse(p.createdAt)) / 1000)), sub: "from policy creation" }] });
  const nodes: N[] = [];
  const edges: { from: string; to: string; rule: string }[] = [];
  let y = 18;
  const rows: number[] = [];
  groups.forEach((g) => {
    const startY = y;
    g.leaves.forEach((l, i) => {
      nodes.push({ id: `${g.rule}:${i}`, label: l.label, sub: l.sub, x: 330, y: y + i * ROW, rule: g.rule, kind: "leaf" });
      edges.push({ from: `r:${g.rule}`, to: `${g.rule}:${i}`, rule: g.rule });
    });
    const mid = startY + ((g.leaves.length - 1) * ROW) / 2;
    nodes.push({ id: `r:${g.rule}`, label: g.label, x: 178, y: mid, rule: g.rule, kind: "rule" });
    rows.push(mid);
    y += g.leaves.length * ROW + 10;
  });
  const rootY = (rows[0] + rows[rows.length - 1]) / 2;
  nodes.push({ id: "root", label: "MONEY", sub: inr(p.amountPaise), x: 52, y: rootY, kind: "root" });
  groups.forEach((g) => edges.push({ from: "root", to: `r:${g.rule}`, rule: g.rule }));
  return { nodes, edges, height: y + 4 };
}

/** Interactive policy graph. Selecting a rule highlights the transactions it controls in the stream. */
export const PolicyGraph = memo(function PolicyGraph({ policy, focus, onFocus, events }: { policy: Policy; focus: string | null; onFocus: (r: string | null) => void; events: LedgerEvent[] }) {
  const g = useMemo(() => build(policy), [policy]);
  const byId = useMemo(() => new Map(g.nodes.map((n) => [n.id, n])), [g]);
  const spends = events.filter((e) => e.type === "SPEND" && e.trace);
  const controlled = focus ? spends.filter((e) => e.trace?.checks.some((c) => c.rule === focus)).length : 0;
  const blocked = focus ? spends.filter((e) => e.trace?.checks.some((c) => c.rule === focus && !c.ok)).length : 0;

  return (
    <div>
      <svg viewBox={`0 0 420 ${g.height}`} className="w-full" role="group" aria-label="Policy graph">
        {g.edges.map((e) => {
          const a = byId.get(e.from) as N;
          const b = byId.get(e.to) as N;
          const on = focus === e.rule;
          const ax = a.x + (a.kind === "root" ? 40 : 46);
          const bx = b.x - (b.kind === "leaf" ? 62 : 46);
          const mx = (ax + bx) / 2;
          return <path key={`${e.from}-${e.to}`} d={`M${ax},${a.y} C${mx},${a.y} ${mx},${b.y} ${bx},${b.y}`} fill="none" stroke={on ? "#7be0d0" : "rgba(255,255,255,.16)"} strokeWidth={on ? 1.6 : 1} className={on ? "xp-flow" : undefined} />;
        })}
        {g.nodes.map((n) => {
          const on = n.rule !== undefined && focus === n.rule;
          const w = n.kind === "leaf" ? 124 : n.kind === "root" ? 80 : 92;
          const clickable = n.kind !== "root";
          return (
            <g
              key={n.id}
              transform={`translate(${n.x - w / 2},${n.y - 14})`}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-pressed={clickable ? on : undefined}
              aria-label={clickable ? `${n.label} rule ${n.sub ?? ""}` : undefined}
              onClick={clickable ? () => onFocus(on ? null : (n.rule as string)) : undefined}
              onKeyDown={clickable ? (ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onFocus(on ? null : (n.rule as string))) : undefined}
              style={{ cursor: clickable ? "pointer" : "default" }}
            >
              <rect width={w} height={n.sub && n.kind !== "leaf" ? 32 : 28} fill={on ? "rgba(123,224,208,.14)" : n.kind === "root" ? "rgba(123,224,208,.08)" : "rgba(255,255,255,.025)"} stroke={on || n.kind === "root" ? "#7be0d0" : "rgba(255,255,255,.18)"} />
              <text x={w / 2} y={n.sub ? 12 : 18} textAnchor="middle" fontSize={n.kind === "leaf" ? 10.4 : 9.8} letterSpacing={n.kind === "leaf" ? 0.3 : 1.6} className="font-mono" fill={n.kind === "leaf" ? "#e8edf5" : "#9aa5b8"}>
                {n.label.length > 17 ? `${n.label.slice(0, 16)}…` : n.label}
              </text>
              {n.sub && (
                <text x={w / 2} y={n.kind === "leaf" ? 23 : 25} textAnchor="middle" fontSize="9.2" className="font-mono" fill="#6b768a">
                  {n.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-1 min-h-[2.4em] font-mono text-[0.8rem] leading-relaxed text-faint" aria-live="polite">
        {focus ? (
          <>
            <span className="text-signal">{focus}</span> evaluated on {controlled} transaction{controlled === 1 ? "" : "s"}, blocked {blocked}. Matching rows are highlighted in the stream.
          </>
        ) : (
          "Select a rule to highlight the transactions it controls."
        )}
      </p>
    </div>
  );
});

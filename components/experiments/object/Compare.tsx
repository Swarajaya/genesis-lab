"use client";
import { useMemo, useState } from "react";
import { buildComparison, type CompareRow } from "@/lib/engines/object/scoring";
import { CATEGORY_META, LENSES, bestBy, num3, type BaselineFuture, type Pathway } from "./model";
import { ProvTag } from "./ui";

interface Column {
  key: string;
  title: string;
  sub: string;
  color: string;
  card: Pathway["score"];
}

const baseColumn = (b: BaselineFuture): Column => ({ key: "base", title: "BASELINE", sub: "Disposal", color: "#ff6b81", card: b.score });
const pathColumn = (p: Pathway, tag?: string): Column => ({ key: p.id, title: tag ?? `#${num3(p.num)}`, sub: p.title, color: CATEGORY_META[p.category].color, card: p.score });

function fmt(row: CompareRow, v: number): string {
  const u = row.dim.unit;
  if (u === "kg" || u === "kg CO₂e") return v < 0.01 && v > 0 ? "<0.01" : v.toFixed(v >= 10 ? 1 : 2);
  if (u === "%") return `${Math.round(v)}%`;
  if (u === "yr") return `${v.toFixed(1)} yr`;
  return v.toFixed(1);
}

/** Side-by-side comparison. The first column is the reference; deltas are against it. Every value is read from the scoring model. */
export function CompareTable({ columns }: { columns: Column[] }) {
  const rows = useMemo(() => buildComparison(columns.map((c) => c.card)), [columns]);
  return (
    <div className="space-y-3">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((c) => (
          <div key={c.key} className="border-t-2 pt-1.5" style={{ borderColor: c.color }}>
            <p className="x5-mono text-[0.9rem] tracking-widest" style={{ color: c.color }}>{c.title}</p>
            <p className="line-clamp-2 text-[0.9rem] leading-snug text-[var(--x5-dim)]">{c.sub}</p>
          </div>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.dim.key}>
          <div className="flex items-baseline justify-between">
            <p className="x5-label">{r.dim.label}</p>
            <ProvTag prov={r.dim.prov} />
          </div>
          <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
            {r.values.map((v, i) => {
              const better = r.dim.higherIsBetter ? r.delta[i] > 0 : r.delta[i] < 0;
              const worse = r.dim.higherIsBetter ? r.delta[i] < 0 : r.delta[i] > 0;
              return (
                <div key={columns[i].key}>
                  <div className="x5-bar">
                    <i style={{ width: `${Math.min(100, (v / r.scaleMax) * 100)}%`, background: columns[i].color, opacity: r.best === i ? 1 : 0.55 }} />
                  </div>
                  <p className="x5-mono mt-1 flex items-baseline gap-1 text-[0.9rem] tabular-nums text-[var(--x5-text)]">
                    {fmt(r, v)}
                    {i > 0 && r.delta[i] !== 0 && <span className={better ? "text-[var(--x5-green)]" : worse ? "text-[var(--x5-bad)]" : ""}>{r.delta[i] > 0 ? "+" : ""}{fmt(r, r.delta[i])}</span>}
                    {r.best === i && <span className="text-[var(--x5-cyan)]" aria-label="best">●</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[0.9rem] leading-relaxed text-[var(--x5-faint)]">● marks the best value per dimension. Deltas are relative to the first column. All values come from the deterministic scoring model; emissions are indicative.</p>
    </div>
  );
}

/** WHAT IF: disposal against the best pathway in each of three lenses. Each lens can be swapped for any pathway in its group. */
export function WhatIfPanel({ baseline, pathways, onSelect, onExplain }: { baseline: BaselineFuture; pathways: Pathway[]; onSelect: (id: string) => void; onExplain: (ids: string[]) => void }) {
  const lenses = useMemo(() => LENSES.map((l) => ({ ...l, list: pathways.filter((p) => l.cats.includes(p.category)).sort((a, b) => b.score.composite - a.score.composite) })).filter((l) => l.list.length > 0), [pathways]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const picked = lenses.map((l) => l.list.find((p) => p.id === choice[l.key]) ?? bestBy(l.list, (p) => p.score.composite) ?? l.list[0]);
  const columns = [baseColumn(baseline), ...picked.map((p, i) => pathColumn(p, lenses[i].label))];
  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-[var(--x5-dim)]">What happens to this object if it is disposed of, repaired, reused, transformed or recovered? Each alternative is the strongest pathway in that lens by composite score. Swap any of them.</p>
      <div className="space-y-2">
        {lenses.map((l, i) => (
          <label key={l.key} className="block">
            <span className="x5-label mb-1 block" style={{ color: CATEGORY_META[picked[i].category].color }}>{l.label}</span>
            <select className="x5-input !py-1.5 !text-base" value={picked[i].id} onChange={(e) => setChoice((c) => ({ ...c, [l.key]: e.target.value }))}>
              {l.list.map((p) => (
                <option key={p.id} value={p.id}>
                  #{num3(p.num)} · {p.title.slice(0, 64)} · {p.score.circularityIndex.toFixed(0)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <CompareTable columns={columns} />
      <div className="flex flex-wrap gap-2">
        {picked.map((p) => (
          <button key={p.id} type="button" className="x5-chip" onClick={() => onSelect(p.id)}>
            View #{num3(p.num)} in tree
          </button>
        ))}
        <button type="button" className="x5-chip" onClick={() => onExplain(picked.map((p) => p.id))}>
          Explain trade-offs
        </button>
      </div>
    </div>
  );
}

/** COMPARE FUTURES: 2 to 4 hand-picked pathways, always read against disposal. */
export function ComparePanel({ baseline, pathways, ids, onRemove, onSelect, onExplain }: { baseline: BaselineFuture; pathways: Pathway[]; ids: string[]; onRemove: (id: string) => void; onSelect: (id: string) => void; onExplain: (ids: string[]) => void }) {
  const chosen = ids.map((id) => pathways.find((p) => p.id === id)).filter((p): p is Pathway => Boolean(p));
  if (chosen.length < 2) {
    return (
      <div className="space-y-3 text-base leading-relaxed text-[var(--x5-dim)]">
        <p>Select 2 to 4 pathways to compare them against disposal. Add them from the pathway detail panel or tick them in the pathway list.</p>
        {chosen.map((p) => (
          <p key={p.id} className="x5-mono text-[var(--x5-text)]">#{num3(p.num)} {p.title}</p>
        ))}
        <p className="x5-label">{chosen.length} of 2 minimum selected</p>
      </div>
    );
  }
  const columns = [baseColumn(baseline), ...chosen.map((p) => pathColumn(p))];
  return (
    <div className="space-y-4">
      <ul className="space-y-1">
        {chosen.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-base">
            <span className="h-2 w-2" style={{ background: CATEGORY_META[p.category].color }} aria-hidden />
            <button type="button" className="x5-mono min-w-0 flex-1 truncate text-left text-[var(--x5-text)] hover:text-[var(--x5-cyan)]" onClick={() => onSelect(p.id)}>
              #{num3(p.num)} {CATEGORY_META[p.category].label} · {p.title}
            </button>
            <button type="button" className="x5-chip !py-0.5" onClick={() => onRemove(p.id)} aria-label={`Remove pathway ${p.num} from comparison`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <CompareTable columns={columns} />
      <button type="button" className="x5-chip" onClick={() => onExplain(chosen.map((p) => p.id))}>
        Explain trade-offs
      </button>
    </div>
  );
}

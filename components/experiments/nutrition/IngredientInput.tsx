"use client";
import { Plus, X } from "lucide-react";
import { useId, type KeyboardEvent } from "react";

export const EXAMPLES = ["stale bread", "overripe banana", "tomato", "rice", "lentils"];
export const MAX_CHIPS = 15;

export function IngredientInput({ chips, draft, onDraft, onAdd, onRemove, disabled }: {
  chips: string[];
  draft: string;
  onDraft: (v: string) => void;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      onAdd(draft);
    } else if (e.key === "Backspace" && !draft && chips.length) onRemove(chips[chips.length - 1]);
  }
  return (
    <div>
      <label htmlFor={id} className="wg-tag mb-2 block">
        Food matter input · discarded ingredients
      </label>
      <div className="flex gap-2">
        <input id={id} value={draft} maxLength={60} disabled={disabled} onChange={(e) => onDraft(e.target.value)} onKeyDown={onKey} placeholder="ingredient + Enter" autoComplete="off" />
        <button type="button" onClick={() => onAdd(draft)} disabled={disabled || !draft.trim()} aria-label="Add ingredient" className="shrink-0 border border-[color:var(--wg-line)] px-3 text-white/70 transition hover:border-[color:var(--wg-cyan)] hover:text-white disabled:opacity-40">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul className="mt-3 flex min-h-8 flex-wrap gap-2" aria-label="Ingredients added">
        {chips.length === 0 && <li className="wg-mono text-[0.84rem] tracking-[0.1em] text-white/35">NO FOOD MATTER LOADED. ADD INGREDIENTS OR SCAN A PHOTO.</li>}
        {chips.map((c) => (
          <li key={c} className="wg-mono flex items-center gap-1.5 border border-[color:var(--wg-line)] bg-[rgb(123_224_208/0.06)] py-1 pl-3 pr-1 text-sm">
            <span className="max-w-[12rem] truncate">{c}</span>
            <button type="button" disabled={disabled} aria-label={`Remove ${c}`} onClick={() => onRemove(c)} className="p-1 text-white/50 hover:bg-white/10 hover:text-white">
              <X className="h-3 w-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="wg-tag !text-white/40">Quick add</span>
        {EXAMPLES.filter((x) => !chips.includes(x)).map((x) => (
          <button key={x} type="button" disabled={disabled || chips.length >= MAX_CHIPS} onClick={() => onAdd(x)} className="wg-mono border border-dashed border-[color:var(--wg-line)] px-2.5 py-1 text-[0.88rem] text-white/60 transition hover:border-[color:var(--wg-cyan)] hover:text-white disabled:opacity-40">
            + {x}
          </button>
        ))}
      </div>
    </div>
  );
}

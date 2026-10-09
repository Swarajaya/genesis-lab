"use client";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Stage } from "@/components/ui/AiProgress";
import type { NutritionResult } from "./types";

const MAX = 5 * 1024 * 1024;
const OK = ["image/jpeg", "image/png", "image/webp"];

function Step({ n, label, state }: { n: string; label: string; state: "idle" | "active" | "done" }) {
  return (
    <li className="flex items-center gap-2">
      <span className="wg-dot" data-s={state === "idle" ? "off" : state} aria-hidden />
      <span className={`wg-mono text-[0.82rem] uppercase tracking-[0.2em] ${state === "idle" ? "text-white/35" : "text-white/90"}`}>
        {n} {label}
      </span>
    </li>
  );
}

/** Large image scanner. Step states come from real conditions: file loaded, vision stage, extraction, grams estimated. */
export function ScannerPanel({ file, onFile, stage, loading, result, disabled }: { file: File | null; onFile: (f: File | null) => void; stage: Stage | null; loading: boolean; result: NutritionResult | null; disabled: boolean }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function accept(f: File | undefined | null) {
    setError(null);
    if (!f) return;
    if (!OK.includes(f.type)) return setError("Unsupported image. Use JPEG, PNG or WebP.");
    if (f.size > MAX) return setError("That image is larger than 5 MB.");
    onFile(f);
  }

  const order = ["analyzing", "understanding", "generating", "validating", "complete"];
  const at = stage ? order.indexOf(stage) : -1;
  const detecting = loading && at === 1;
  const imageCount = result?.ingredients.filter((i) => i.source === "image").length ?? 0;
  const detectDone = Boolean(result) || at > 1;
  const steps = [
    { n: "01", label: "Scan", state: !file ? "idle" : "done" },
    { n: "02", label: "Detect", state: !file ? "idle" : detectDone ? "done" : detecting ? "active" : "idle" },
    { n: "03", label: "Segment", state: result && imageCount > 0 ? "done" : "idle" },
    { n: "04", label: "Quantify", state: result && imageCount > 0 ? "done" : "idle" },
  ] as const;

  return (
    <div>
      <label htmlFor={id} className="wg-tag mb-2 block">
        Waste scanner · optional photo
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) accept(e.dataTransfer.files?.[0]);
        }}
        className={`relative flex min-h-[15rem] items-center justify-center overflow-hidden border ${drag ? "border-[color:var(--wg-green)] bg-[rgb(155_232_106/0.08)]" : "border-[color:var(--wg-line)] bg-black/40"}`}
      >
        <input id={id} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled} onChange={(e) => accept(e.target.files?.[0])} />
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected waste photo" className="absolute inset-0 h-full w-full object-cover opacity-80" />
            {(detecting || (loading && at <= 1)) && <div className="wg-scanline" aria-hidden />}
            <span className="absolute left-2 top-2 h-4 w-4 border-l border-t border-[color:var(--wg-cyan)]" aria-hidden />
            <span className="absolute right-2 top-2 h-4 w-4 border-r border-t border-[color:var(--wg-cyan)]" aria-hidden />
            <span className="absolute bottom-2 left-2 h-4 w-4 border-b border-l border-[color:var(--wg-cyan)]" aria-hidden />
            <span className="absolute bottom-2 right-2 h-4 w-4 border-b border-r border-[color:var(--wg-cyan)]" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-8">
              <span className="wg-mono min-w-0 flex-1 truncate text-sm text-white/80">{file?.name}</span>
              <button
                type="button"
                aria-label="Remove image"
                disabled={disabled}
                onClick={() => {
                  onFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="border border-[color:var(--wg-line)] p-1.5 text-white/70 hover:text-white disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="relative flex flex-col items-center gap-2 p-6 text-center text-white/60 transition hover:text-white disabled:opacity-40">
            <ImagePlus className="h-7 w-7 text-[color:var(--wg-cyan)]" aria-hidden />
            <span className="wg-mono text-sm uppercase tracking-[0.2em]">Drop waste photo or choose file</span>
            <span className="wg-mono text-[0.78rem] tracking-[0.12em] text-white/35">JPEG · PNG · WebP · up to 5 MB</span>
          </button>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4" aria-label="Scanner steps">
        {steps.map((s) => (
          <Step key={s.n} n={s.n} label={s.label} state={s.state} />
        ))}
      </ol>
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { EXAMPLES } from "./model";

const MAX = 5 * 1024 * 1024;
const OK = ["image/jpeg", "image/png", "image/webp"];

interface Props {
  name: string;
  setName: (s: string) => void;
  mass: string;
  setMass: (s: string) => void;
  image: File | null;
  setImage: (f: File | null) => void;
  loading: boolean;
  invalid: string | null;
  canReset: boolean;
  onAnalyze: () => void;
  onReset: () => void;
}

function Photo({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled: boolean }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
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
    setErr(null);
    if (!f) return;
    if (!OK.includes(f.type)) return setErr("Unsupported image. Use JPEG, PNG or WebP.");
    if (f.size > MAX) return setErr("That image is larger than 5 MB.");
    onFile(f);
  }
  return (
    <div className="flex h-full flex-col">
      <label htmlFor={id} className="x5-label mb-2 block">Photo · optional</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!disabled) accept(e.dataTransfer.files?.[0]); }}
        className="relative flex min-h-[9.5rem] flex-1 items-center justify-center rounded-2xl border border-dashed p-4 transition"
        style={{ borderColor: drag ? "var(--x5-cyan)" : "var(--x5-line-strong)", background: drag ? "rgb(182 242 107 / 0.08)" : "rgb(255 255 255 / 0.025)" }}
      >
        <input id={id} ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled} onChange={(e) => accept(e.target.files?.[0])} />
        {preview ? (
          <div className="flex w-full items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected upload preview" className="h-24 w-24 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base text-[var(--x5-text)]">{file?.name}</p>
              <p className="text-sm text-[var(--x5-faint)]">{file ? (file.size / 1024).toFixed(0) : 0} KB</p>
            </div>
            <button type="button" aria-label="Remove image" className="x5-chip !p-2" onClick={() => { onFile(null); if (input.current) input.current.value = ""; }}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="flex flex-col items-center gap-2 text-center text-[var(--x5-dim)] hover:text-[var(--x5-text)]">
            <ImagePlus className="h-7 w-7" aria-hidden />
            <span className="text-base font-medium">Drop a photo or browse</span>
            <span className="text-sm text-[var(--x5-faint)]">JPEG, PNG or WebP, up to 5 MB</span>
          </button>
        )}
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-[var(--x5-bad)]">{err}</p>}
    </div>
  );
}

export function Ingestion({ name, setName, mass, setMass, image, setImage, loading, invalid, canReset, onAnalyze, onReset }: Props) {
  const nameId = useId();
  const massId = useId();
  return (
    <form
      className="x5-panel p-5 sm:p-7"
      aria-label="Object ingestion"
      onSubmit={(e) => {
        e.preventDefault();
        if (!loading) onAnalyze();
      }}
    >
      <p className="x5-label mb-5 text-center !text-[var(--x5-cyan)]">Object ingestion</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col">
          <label htmlFor={nameId} className="x5-label mb-2 block">Object</label>
          <input id={nameId} className="x5-input" value={name} maxLength={80} disabled={loading} onChange={(e) => setName(e.target.value)} placeholder="old laptop" autoComplete="off" />
          <p className="x5-label mb-2 mt-5">Quick inputs</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Example objects">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="x5-chip" aria-pressed={name === ex} disabled={loading} onClick={() => setName(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </div>
        <Photo file={image} onFile={setImage} disabled={loading} />
        <div className="flex flex-col">
          <label htmlFor={massId} className="x5-label mb-2 block">Mass · kg · optional</label>
          <input id={massId} className="x5-input" type="number" inputMode="decimal" min={0.001} max={500} step="any" value={mass} disabled={loading} onChange={(e) => setMass(e.target.value)} placeholder="auto-estimated" />
          <p className="mt-3 text-sm leading-relaxed text-[var(--x5-faint)]">Leave empty and the mass is estimated from the object type. Estimates are labelled as such everywhere they appear.</p>
        </div>
      </div>
      <div className="mt-7 flex flex-col items-center gap-3">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="submit" className="x5-btn min-w-[15rem]" disabled={loading}>
            {loading ? "Analysing…" : "Analyze object"}
          </button>
          {canReset && (
            <button type="button" className="x5-btn ghost" onClick={onReset}>
              Reset
            </button>
          )}
        </div>
        {invalid && (
          <p role="alert" className="text-sm text-[var(--x5-bad)]">
            {invalid}
          </p>
        )}
      </div>
    </form>
  );
}

"use client";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const MAX = 5 * 1024 * 1024;
const OK = ["image/jpeg", "image/png", "image/webp"];

export function ImageDropzone({ file, onFile, label }: { file: File | null; onFile: (f: File | null) => void; label: string }) {
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

  return (
    <div>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
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
          accept(e.dataTransfer.files?.[0]);
        }}
        className={`relative flex min-h-28 items-center justify-center rounded-xl border border-dashed p-3 transition ${drag ? "border-signal bg-signal/10" : "border-line bg-white/[0.02]"}`}
      >
        <input id={id} ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => accept(e.target.files?.[0])} />
        {preview ? (
          <div className="flex w-full items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected upload preview" className="h-20 w-20 rounded-lg object-cover" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate text-text">{file?.name}</p>
              <p className="text-xs text-faint">{file ? (file.size / 1024).toFixed(0) : 0} KB</p>
            </div>
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => {
                onFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="rounded-full border border-line p-2 text-dim hover:text-text"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => inputRef.current?.click()} className="flex flex-col items-center gap-1.5 text-sm text-dim hover:text-text">
            <ImagePlus className="h-5 w-5" aria-hidden />
            <span>Drop a photo or choose a file</span>
            <span className="text-xs text-faint">JPEG, PNG or WebP, up to 5 MB</span>
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

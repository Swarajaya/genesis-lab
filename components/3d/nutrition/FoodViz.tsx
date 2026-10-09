"use client";
import dynamic from "next/dynamic";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { FoodBlob } from "@/components/experiments/nutrition/types";
import { BLOB_COLORS, blobRadius } from "./FoodScene";

const SceneFrame = dynamic(() => import("@/components/3d/SceneFrame"), { ssr: false });
const FoodScene = dynamic(() => import("./FoodScene"), { ssr: false });

function Fallback({ blobs, selected, hovered, onHover, onSelect }: Pick<Props, "blobs" | "selected" | "hovered" | "onHover" | "onSelect">) {
  const max = Math.max(...blobs.map((b) => b.grams), 1);
  return (
    <svg viewBox="-100 -70 200 140" className="h-full w-full" role="group" aria-label="Meal composition, 2D view">
      <ellipse cx="0" cy="8" rx="78" ry="44" fill="none" stroke="#9aa5b8" strokeOpacity="0.5" strokeWidth="2" />
      <ellipse cx="0" cy="12" rx="70" ry="38" fill="#10151f" fillOpacity="0.8" />
      {blobs.map((b, i) => {
        const a = (i / blobs.length) * Math.PI * 2 - Math.PI / 2;
        const cx = Math.cos(a) * 66;
        const cy = 8 + Math.sin(a) * 36;
        const r = 5 + 14 * Math.cbrt(b.grams / max) * (blobRadius(b.grams, max) / blobRadius(max, max));
        const color = BLOB_COLORS[i % BLOB_COLORS.length];
        return (
          <g
            key={`${b.name}-${i}`}
            tabIndex={0}
            role="button"
            aria-pressed={selected === i}
            aria-label={`${b.name}, ${b.grams} grams`}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(i)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(i);
              }
            }}
            style={{ cursor: "pointer", outline: "none" }}
          >
            <circle cx={cx} cy={cy} r={r + (hovered === i ? 2 : 0)} fill={color} fillOpacity={selected === i ? 1 : 0.75} stroke={selected === i || hovered === i ? "#e8edf5" : "none"} strokeWidth="1.5" />
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  blobs: FoodBlob[];
  hovered: number | null;
  selected: number | null;
  onHover: (i: number | null) => void;
  onSelect: (i: number) => void;
}

/** Interactive 3D (or 2D fallback) view of a meal's ingredients, sized by grams. */
export function FoodViz(props: Props) {
  const caps = useCapabilities();
  const active = props.hovered ?? props.selected;
  const shown = active !== null ? props.blobs[active] : null;
  return (
    <div className="relative">
      <div className="h-72 w-full sm:h-80">
        <SceneFrame
          caps={caps}
          className="h-full w-full cursor-grab"
          label={`3D view of ${props.blobs.length} ingredients orbiting a plate, sized by grams`}
          camera={{ position: [0, 3.2, 6.2], fov: 45 }}
          fallback={<Fallback {...props} />}
        >
          <FoodScene {...props} reducedMotion={caps.reducedMotion} />
        </SceneFrame>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line bg-black/50 px-3 py-1.5 text-xs backdrop-blur" aria-live="polite">
        {shown ? (
          <>
            <span className="text-text">{shown.name}</span> <span className="text-dim">{shown.grams} g</span>
          </>
        ) : (
          <span className="text-faint">Hover or click an ingredient</span>
        )}
      </div>
    </div>
  );
}

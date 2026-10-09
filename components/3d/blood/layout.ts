import type { MatchResult, Verdict } from "@/lib/engines/blood/engine";

export const VERDICT_COLOR: Record<Verdict, string> = { MATCH: "#5fe3a1", PARTIAL: "#f2c260", INCOMPATIBLE: "#ff6b7a" };
export const RECIPIENT_COLOR = "#7be0d0";

export interface NodeLayout {
  code: string;
  verdict: Verdict;
  score: number;
  units: number;
  /** Position in a unit disc, y up. */
  x: number;
  y: number;
  /** Small deterministic depth offset for the 3D view. */
  z: number;
  /** Node radius in scene units (size by stock). */
  size: number;
  phase: number;
}

/** Deterministic polar layout: angle by rank, orbit radius by distance. Shared by the 3D scene and the SVG fallback. */
export function computeLayout(ranking: MatchResult[]): NodeLayout[] {
  const n = ranking.length;
  if (n === 0) return [];
  const maxKm = Math.max(1, ...ranking.map((r) => r.donor.distanceKm));
  return ranking.map((r, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.12 : -0.08);
    const orbit = 0.42 + 0.5 * Math.sqrt(r.donor.distanceKm / maxKm);
    const units = r.donor.units;
    return {
      code: r.donor.code,
      verdict: r.verdict,
      score: r.score,
      units,
      x: Math.cos(angle) * orbit,
      y: Math.sin(angle) * orbit,
      z: Math.sin(i * 2.399) * 0.18,
      size: 0.045 + 0.09 * Math.min(1, Math.sqrt(units / 8)),
      phase: i * 1.37,
    };
  });
}

export interface NetworkProps {
  ranking: MatchResult[];
  selected: string | null;
  hovered: string | null;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
}

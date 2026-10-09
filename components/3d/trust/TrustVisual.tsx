"use client";
import dynamic from "next/dynamic";
import { useCapabilities } from "@/hooks/useCapabilities";
import TrustScene, { type Verdict } from "./TrustScene";

const SceneFrame = dynamic(() => import("@/components/3d/SceneFrame"), { ssr: false, loading: () => <div className="h-full w-full" aria-hidden /> });
const COLOR: Record<Verdict, string> = { none: "#7be0d0", valid: "#5fe3a1", invalid: "#ff6b7a" };
const STEPS = ["Private data", "Commitment", "Proof", "Challenge", "Verified claim"];

/** 2D fallback: same story as the 3D scene (private domain | boundary | verifier) without WebGL. */
export function TrustFallback({ phase, verdict }: { phase: number; verdict: Verdict }) {
  const c = COLOR[verdict];
  const lit = (i: number) => phase >= i + 1;
  return (
    <svg viewBox="0 0 640 220" className="h-full w-full" role="img" aria-label="Private data stays inside the privacy boundary; only the proof crosses to the verifier">
      <rect x="10" y="20" width="250" height="180" fill="none" stroke="#b48bff" strokeOpacity={phase >= 1 ? 0.7 : 0.25} strokeDasharray="4 5" rx="4" />
      <text x="22" y="40" fill="#b48bff" fontSize="15" letterSpacing="2">PRIVATE DOMAIN</text>
      {["Name", "Credentials", "University", "Clearance", "Score"].map((t, i) => (
        <text key={t} x="26" y={72 + i * 24} fill={phase >= 1 ? "#4a5468" : "#9aa5b8"} fontSize="17" fontFamily="monospace">{phase >= 1 ? "████████" : t}</text>
      ))}
      <line x1="270" y1="14" x2="270" y2="206" stroke="#7be0d0" strokeWidth="1" strokeOpacity="0.8" />
      <text x="276" y="30" fill="#7be0d0" fontSize="14" letterSpacing="2">PRIVACY BOUNDARY</text>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${70 + i * 118},${190})`}>
          <circle r="5" fill={lit(i) ? c : "#2a3342"} />
          <text y="18" textAnchor="middle" fill={lit(i) ? c : "#6b768a"} fontSize="14">{STEPS[i]}</text>
        </g>
      ))}
      <path d="M 200 110 H 560" stroke={c} strokeOpacity={phase >= 3 ? 0.9 : 0.15} strokeWidth="1.5" strokeDasharray="3 5" />
      <circle cx="560" cy="110" r="22" fill="none" stroke={phase >= 4 ? c : "#6b768a"} strokeWidth="1.5" />
      <text x="560" y="114" textAnchor="middle" fill={phase >= 5 ? c : "#6b768a"} fontSize="15">{phase >= 5 ? (verdict === "valid" ? "✓" : "✕") : "VERIFIER"}</text>
    </svg>
  );
}

export function TrustVisual({ phase, verdict, privateCount }: { phase: number; verdict: Verdict; privateCount: number }) {
  const caps = useCapabilities();
  return (
    <div className="h-72 w-full sm:h-[26rem]">
      <SceneFrame caps={caps} className="h-full w-full" label="Private attributes stay behind the privacy boundary; only the zero-knowledge proof reaches the verifier and the trust node" fallback={<TrustFallback phase={phase} verdict={verdict} />} camera={{ position: [0.6, 0.9, 7.2], fov: 42 }}>
        <TrustScene phase={phase} verdict={verdict} privateCount={Math.min(privateCount, 17)} particles={caps.lowPower ? 90 : 200} reducedMotion={caps.reducedMotion} />
      </SceneFrame>
    </div>
  );
}

"use client";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useCapabilities } from "@/hooks/useCapabilities";
import { LIFECYCLE_COLOR } from "@/components/experiments/expiry/types";
import type { CoinProps } from "./CoinScene";

const SceneFrame = dynamic(() => import("@/components/3d/SceneFrame"), { ssr: false });
const CoinScene = dynamic(() => import("./CoinScene"), { ssr: false });

type VizProps = Omit<CoinProps, "reducedMotion" | "lowPower">;

function Fallback({ timeFrac, balanceFrac, state, burstKey, reducedMotion }: VizProps & { reducedMotion: boolean }) {
  const expired = state === "EXPIRED";
  const color = state === "SPENT" ? "#6b768a" : state === "EXPIRING" ? "#f2c260" : "#7be0d0";
  const scale = 0.55 + 0.45 * Math.min(1, balanceFrac) * (0.6 + 0.4 * timeFrac);
  const shards = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2;
    return { x: Math.cos(a) * 70, y: Math.sin(a) * 50 + 14, r: (i % 2 ? 1 : -1) * 70 };
  });
  return (
    <svg viewBox="-100 -70 200 140" className="h-full w-full" role="img" aria-label={`2D view of the money token, state ${state}`}>
      <motion.g initial={false} animate={{ scale: expired ? 0.6 : scale, opacity: expired ? 0 : 0.35 + 0.65 * timeFrac }} transition={{ duration: reducedMotion ? 0 : 0.7 }}>
        <circle r="40" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="3" style={{ filter: `drop-shadow(0 0 ${Math.round(14 * timeFrac)}px ${color})` }} />
        <circle r="28" fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1.5" />
        <path d="M-8 -12h16M-8 -4h16M-8 -12c14 0 14 16 0 16l12 14" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      {shards.map((s, i) => (
        <motion.polygon
          key={i}
          points="0,-7 6,5 -6,5"
          fill="#4a5260"
          initial={false}
          animate={{ x: expired ? s.x : 0, y: expired ? s.y : 0, rotate: expired ? s.r : 0, opacity: expired ? 0.8 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.8 }}
        />
      ))}
      <AnimatePresence>
        {!reducedMotion &&
          burstKey > 0 &&
          Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <motion.circle key={`${burstKey}-${i}`} r="3" fill="#5fe3a1" initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(a) * 60, y: Math.sin(a) * 45, opacity: 0 }} transition={{ duration: 0.9 }} />;
          })}
      </AnimatePresence>
    </svg>
  );
}

export function MoneyViz(props: VizProps) {
  const caps = useCapabilities();
  return (
    <div className="relative h-64 w-full sm:h-72">
      <SceneFrame
        caps={caps}
        className="h-full w-full"
        label={`3D money token, state ${props.state}. It glows while time remains, dims and shatters on expiry, and sheds particles on approved spends.`}
        camera={{ position: [0, 0, 5.2], fov: 45 }}
        fallback={<Fallback {...props} reducedMotion={caps.reducedMotion} />}
      >
        <CoinScene {...props} reducedMotion={caps.reducedMotion} lowPower={caps.lowPower} />
      </SceneFrame>
      <span className="pointer-events-none absolute bottom-2 left-3 rounded-md border border-line bg-black/50 px-2 py-1 font-mono text-[0.65rem] backdrop-blur" style={{ color: LIFECYCLE_COLOR[props.state] }}>
        {props.state}
      </span>
    </div>
  );
}

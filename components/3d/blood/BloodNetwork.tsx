"use client";
import dynamic from "next/dynamic";
import { useCapabilities } from "@/hooks/useCapabilities";
import NetworkSvg from "./NetworkSvg";
import type { NetworkProps } from "./layout";

const BloodScene = dynamic(() => import("./BloodScene"), { ssr: false, loading: () => <div className="h-full w-full" aria-hidden /> });

/** Living network: R3F when WebGL is available, otherwise (or on low-power, touch-first devices) the SVG version. */
export default function BloodNetwork(props: NetworkProps) {
  const caps = useCapabilities();
  if (caps.ready && !caps.webgl) return <NetworkSvg {...props} />;
  return <BloodScene {...props} caps={caps} />;
}

"use client";
import { useEffect, useState } from "react";

export interface Capabilities {
  ready: boolean;
  webgl: boolean;
  reducedMotion: boolean;
  /** Small/touch/low-core devices get fewer particles and a lower pixel ratio. */
  lowPower: boolean;
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>({ ready: false, webgl: false, reducedMotion: false, lowPower: false });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const compute = () =>
      setCaps({
        ready: true,
        webgl: detectWebGL(),
        reducedMotion: mq.matches,
        lowPower: window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4,
      });
    compute();
    mq.addEventListener("change", compute);
    return () => mq.removeEventListener("change", compute);
  }, []);
  return caps;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Drives a 0..1 playback value with requestAnimationFrame. With reduced motion it jumps straight to the end. */
export function useReplay(durationMs: number, reduced: boolean) {
  const [p, setP] = useState(0);
  const [running, setRunning] = useState(false);
  const raf = useRef(0);
  const start = useCallback(
    (onDone?: () => void) => {
      cancelAnimationFrame(raf.current);
      if (reduced) {
        setP(1);
        setRunning(false);
        onDone?.();
        return;
      }
      const t0 = performance.now();
      setP(0);
      setRunning(true);
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / durationMs);
        setP(ease(k));
        if (k < 1) raf.current = requestAnimationFrame(tick);
        else {
          setRunning(false);
          onDone?.();
        }
      };
      raf.current = requestAnimationFrame(tick);
    },
    [durationMs, reduced],
  );
  const reset = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setRunning(false);
    setP(0);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return { p, running, start, reset };
}

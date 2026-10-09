"use client";
import { Canvas } from "@react-three/fiber";
import { Component, type ReactNode } from "react";
import type { Capabilities } from "@/hooks/useCapabilities";

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* WebGL/runtime failure: fall back to the 2D view. Nothing sensitive to log. */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Shared R3F canvas: capped pixel ratio, demand-driven when reduced motion is on, and a 2D fallback if
 * WebGL is missing or throws. Always import this file with next/dynamic({ ssr: false }).
 */
export default function SceneFrame({
  children,
  fallback,
  caps,
  camera = { position: [0, 0, 7], fov: 45 },
  className = "",
  label,
}: {
  children: ReactNode;
  fallback: ReactNode;
  caps: Capabilities;
  camera?: { position: [number, number, number]; fov: number };
  className?: string;
  label: string;
}) {
  if (!caps.ready) return <div className={className} aria-hidden />;
  if (!caps.webgl) return <>{fallback}</>;
  return (
    <Boundary fallback={fallback}>
      <div className={className} role="img" aria-label={label}>
        <Canvas
          dpr={caps.lowPower ? [1, 1.25] : [1, 1.5]}
          camera={camera}
          frameloop={caps.reducedMotion ? "demand" : "always"}
          gl={{ antialias: !caps.lowPower, alpha: true, powerPreference: "high-performance" }}
        >
          {children}
        </Canvas>
      </div>
    </Boundary>
  );
}

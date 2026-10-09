"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type Verdict = "none" | "valid" | "invalid";
const COL: Record<Verdict, string> = { none: "#7be0d0", valid: "#5fe3a1", invalid: "#ff6b7a" };
const X0 = -1.8; // commitment node, inside the private domain
const X1 = 3.4; // trust node
const BOUNDARY = -0.7;

/** Head position (0..1 along commit -> trust) for each real processing phase. */
function headFor(phase: number, verdict: Verdict): number {
  if (phase <= 1) return -1;
  if (phase === 2) return 0.02;
  if (phase === 3) return 0.34;
  if (phase === 4) return 0.66;
  return verdict === "valid" ? 1 : 0.74;
}

/**
 * Private data cluster -> commitment -> privacy boundary -> proof stream -> verifier ring -> trust node.
 * `phase` mirrors the real pipeline stage (see useTrustLab). Raw attribute nodes never cross the boundary.
 */
export default function TrustScene({ phase, verdict, privateCount, particles, reducedMotion }: { phase: number; verdict: Verdict; privateCount: number; particles: number; reducedMotion: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const stream = useRef<THREE.Points>(null);
  const cluster = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const trust = useRef<THREE.Mesh>(null);
  const head = useRef(-1);
  const goal = headFor(phase, verdict);

  const nodes = useMemo(
    () =>
      Array.from({ length: privateCount }, (_, i) => {
        const y = 1 - ((i + 0.5) / privateCount) * 2;
        const rad = Math.sqrt(1 - y * y);
        const th = i * 2.399963;
        return [Math.cos(th) * rad * 0.85 + X0 - 1.5, y * 0.85, Math.sin(th) * rad * 0.85] as [number, number, number];
      }),
    [privateCount],
  );
  const pos = useMemo(() => new Float32Array(particles * 3), [particles]);

  function apply(time: number) {
    const h = head.current;
    for (let i = 0; i < particles; i++) {
      const lag = (i / particles) * 0.3;
      const t = Math.min(Math.max(h - lag, 0), 1);
      const a = i * 2.399963 + time * 1.5;
      const r = 0.1 + 0.16 * Math.sin(t * Math.PI) * ((i * 37) % 10) / 10;
      pos[i * 3] = X0 + (X1 - X0) * t;
      pos[i * 3 + 1] = Math.sin(a) * r;
      pos[i * 3 + 2] = Math.cos(a) * r;
    }
    const attr = stream.current?.geometry.getAttribute("position");
    if (attr) attr.needsUpdate = true;
    const mat = stream.current?.material as THREE.PointsMaterial | undefined;
    if (mat) mat.opacity = h < 0 ? 0 : 0.95;
  }

  useEffect(() => {
    if (reducedMotion) {
      head.current = goal;
      apply(0);
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, reducedMotion, verdict]);

  useFrame((state, dt) => {
    if (reducedMotion) return;
    head.current += (goal - head.current) * Math.min(1, dt * 2.4);
    apply(state.clock.elapsedTime);
    if (cluster.current) cluster.current.rotation.y += dt * (phase >= 1 ? 0.06 : 0.3);
    if (ring.current) ring.current.rotation.x += dt * (phase >= 4 ? 0.9 : 0.25);
    if (trust.current) {
      trust.current.rotation.y += dt * 0.6;
      trust.current.rotation.x += dt * 0.3;
    }
  });

  const c = COL[verdict];
  const locked = phase >= 1;
  return (
    <>
      <group ref={cluster}>
        {nodes.map((p, i) => (
          <mesh key={i} position={p}>
            <octahedronGeometry args={[0.09, 0]} />
            <meshBasicMaterial color={locked ? "#3a4256" : "#b48bff"} wireframe={locked} transparent opacity={locked ? 0.7 : 0.95} />
          </mesh>
        ))}
      </group>
      {/* lock ring around the private domain */}
      <mesh position={[X0 - 1.5, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.05, 0.008, 6, 48]} />
        <meshBasicMaterial color="#b48bff" transparent opacity={locked ? 0.55 : 0.12} />
      </mesh>
      {/* commitment node */}
      <mesh position={[X0, 0, 0]}>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshBasicMaterial color={phase >= 2 ? "#7be0d0" : "#3a4256"} wireframe />
      </mesh>
      {/* privacy boundary */}
      <group position={[BOUNDARY, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <gridHelper args={[3.2, 12, "#7be0d0", "#2a3a46"]} />
      </group>
      <mesh position={[BOUNDARY, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.2, 3.2]} />
        <meshBasicMaterial color="#7be0d0" transparent opacity={0.035} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* proof stream */}
      <points ref={stream}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color={c} size={0.05} sizeAttenuation transparent opacity={0} depthWrite={false} />
      </points>
      {/* verifier ring */}
      <mesh ref={ring} position={[1.9, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.8, 0.012, 8, 56]} />
        <meshBasicMaterial color={phase >= 4 ? c : "#6b768a"} transparent opacity={phase >= 4 ? 0.95 : 0.4} />
      </mesh>
      {/* trust node */}
      <mesh ref={trust} position={[X1, 0, 0]}>
        <octahedronGeometry args={[0.28, 0]} />
        <meshBasicMaterial color={phase >= 5 ? c : "#3a4256"} wireframe={phase < 5} transparent opacity={0.95} />
      </mesh>
    </>
  );
}

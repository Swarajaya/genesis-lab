"use client";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { QuantumResult } from "@/lib/engines/quantum";

const CYAN = new THREE.Color("#7be0d0");
const VIOLET = new THREE.Color("#8f7bff");
const GREEN = new THREE.Color("#9be86a");
const FLOOR = -1.25;

const ham = (a: string, b: string) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
};

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Layout {
  pos: [number, number, number];
  bar: [number, number, number];
  norm: number;
  optimal: boolean;
}

function layoutNodes(q: QuantumResult): Layout[] {
  const span = Math.max(q.energyMax - q.energyMin, 1e-6);
  const order = q.nodes.map((n, i) => ({ n, i })).sort((a, b) => a.n.energy - b.n.energy);
  const out: Layout[] = new Array(q.nodes.length);
  order.forEach(({ n, i }, rank) => {
    const norm = Math.min(1, Math.max(0, (n.energy - q.energyMin) / span));
    const isOpt = n.bits === q.optimalBits;
    const r = isOpt ? 0 : 0.7 + norm * 1.9 + (rank % 3) * 0.08;
    const a = rank * 2.39996;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    out[i] = { pos: [x, -0.55 + norm * 1.1, z], bar: [x, FLOOR, z], norm, optimal: isOpt };
  });
  return out;
}

function probAt(probs: number[], f: number): number {
  const i = Math.min(probs.length - 1, Math.floor(f));
  const j = Math.min(probs.length - 1, i + 1);
  return probs[i] + (probs[j] - probs[i]) * (f - i);
}

function Node({ q, index, lay, pr }: { q: QuantumResult; index: number; lay: Layout; pr: { current: number } }) {
  const node = q.nodes[index];
  const sphere = useRef<THREE.Mesh>(null);
  const bar = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const maxP = useMemo(() => Math.max(...q.nodes.flatMap((n) => n.probs), 1e-6), [q]);
  const base = useMemo(() => CYAN.clone().lerp(VIOLET, lay.norm), [lay.norm]);
  useFrame(() => {
    const f = pr.current * q.steps;
    const p = probAt(node.probs, f);
    const w = Math.sqrt(p / maxP);
    const conv = smooth(0.7, 0.95, pr.current);
    const s = 0.07 + 0.34 * w + (lay.optimal ? 0.1 * conv : 0);
    if (sphere.current) {
      sphere.current.scale.setScalar(s / 0.1);
      const m = sphere.current.material as THREE.MeshStandardMaterial;
      m.color.copy(base).lerp(GREEN, lay.optimal ? conv : 0);
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.35 + 1.1 * w;
    }
    if (bar.current) {
      const h = 0.04 + (p / maxP) * 2.2;
      bar.current.scale.y = h;
      bar.current.position.y = FLOOR + h / 2;
      const m = bar.current.material as THREE.MeshStandardMaterial;
      m.color.copy(base).lerp(GREEN, lay.optimal ? conv : 0);
      m.emissive.copy(m.color);
    }
    if (halo.current) {
      halo.current.visible = lay.optimal && conv > 0.02;
      halo.current.scale.setScalar(1 + conv * 2.4);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * conv;
    }
  });
  return (
    <group>
      <mesh ref={sphere} position={lay.pos}><sphereGeometry args={[0.1, 16, 12]} /><meshStandardMaterial color="#7be0d0" roughness={0.3} /></mesh>
      <mesh ref={halo} position={lay.pos} rotation={[Math.PI / 2, 0, 0]} visible={false}><torusGeometry args={[0.14, 0.008, 6, 48]} /><meshBasicMaterial color="#9be86a" transparent opacity={0} /></mesh>
      <mesh ref={bar} position={[lay.bar[0], FLOOR + 0.02, lay.bar[2]]}><boxGeometry args={[0.07, 1, 0.07]} /><meshStandardMaterial color="#7be0d0" roughness={0.4} transparent opacity={0.85} /></mesh>
    </group>
  );
}

function Edges({ q, layout, pr }: { q: QuantumResult; layout: Layout[]; pr: { current: number } }) {
  const ref = useRef<THREE.LineSegments>(null);
  const geo = useMemo(() => {
    const pts: number[] = [];
    for (let a = 0; a < q.nodes.length; a++)
      for (let b = a + 1; b < q.nodes.length; b++)
        if (ham(q.nodes[a].bits, q.nodes[b].bits) === 1) pts.push(...layout[a].pos, ...layout[b].pos);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [q, layout]);
  useFrame(() => {
    if (ref.current) (ref.current.material as THREE.LineBasicMaterial).opacity = 0.12 + 0.35 * smooth(0.05, 0.5, pr.current);
  });
  return <lineSegments ref={ref} geometry={geo}><lineBasicMaterial color="#7be0d0" transparent opacity={0.2} /></lineSegments>;
}

function Particles({ layout, pr }: { layout: Layout[]; pr: { current: number } }) {
  const COUNT = 140;
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({ a: i * 2.39996, r: 0.6 + ((i * 37) % 100) / 100 * 2.2, y: ((i * 53) % 100) / 100 * 2 - 1, sp: 0.15 + ((i * 17) % 10) / 40 })), []);
  const opt = layout.find((l) => l.optimal)?.pos ?? [0, -0.55, 0];
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(COUNT * 3), 3));
    return g;
  }, []);
  useFrame(({ clock }) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    const pull = smooth(0.5, 1, pr.current);
    seeds.forEach((s, i) => {
      const a = s.a + t * s.sp;
      const k = pull * (i % 3 === 0 ? 0.95 : 0.55);
      const r = s.r * (1 - k * 0.85);
      pos.setXYZ(i, Math.cos(a) * r + opt[0] * k * 0.3, s.y * (1 - k * 0.6) + opt[1] * k * 0.4 + Math.sin(t + i) * 0.04, Math.sin(a) * r + opt[2] * k * 0.3);
    });
    pos.needsUpdate = true;
    if (ref.current) ref.current.rotation.y = 0;
  });
  return <points ref={ref} geometry={geo}><pointsMaterial color="#b9fff0" size={0.035} transparent opacity={0.8} depthWrite={false} sizeAttenuation /></points>;
}

export default function QuantumStateScene({ quantum, progress, reducedMotion }: { quantum: QuantumResult; progress: number; reducedMotion: boolean }) {
  const pr = useRef(progress);
  pr.current = progress;
  const layout = useMemo(() => layoutNodes(quantum), [quantum]);
  const well = useMemo(() => new THREE.LatheGeometry([[0.05, -0.62], [0.5, -0.5], [1.0, -0.2], [1.6, 0.25], [2.2, 0.62], [2.7, 0.62]].map(([x, y]) => new THREE.Vector2(x, y)), 36), []);
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[0, 3, 0]} intensity={18} color="#7be0d0" />
      <pointLight position={[3, -1, 3]} intensity={10} color="#8f7bff" />
      <group rotation={[0.25, 0, 0]}>
        <mesh geometry={well}><meshBasicMaterial color="#274a4a" wireframe transparent opacity={0.28} side={THREE.DoubleSide} /></mesh>
        {[1.0, 1.8, 2.6].map((r, i) => (
          <mesh key={r} position={[0, FLOOR, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r, 0.006, 6, 120]} /><meshBasicMaterial color={i === 1 ? "#8f7bff" : "#7be0d0"} transparent opacity={0.45} /></mesh>
        ))}
        <gridHelper args={[6, 12, "#1d3a3a", "#122022"]} position={[0, FLOOR, 0]} />
        <Edges q={quantum} layout={layout} pr={pr} />
        {quantum.nodes.map((_, i) => (
          <Node key={quantum.nodes[i].bits} q={quantum} index={i} lay={layout[i]} pr={pr} />
        ))}
        <Particles layout={layout} pr={pr} />
      </group>
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={!reducedMotion} autoRotateSpeed={0.9} minPolarAngle={0.6} maxPolarAngle={1.45} />
    </>
  );
}

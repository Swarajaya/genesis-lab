"use client";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Capabilities } from "@/hooks/useCapabilities";
import { chaos, dynEdges, dynPosition, lerp3, terrainPosition, type P3 } from "@/lib/engines/gamezero/discovery/layout";
import type { Analysis } from "@/lib/engines/gamezero/discovery/session";
import { TERRAINS } from "@/lib/engines/gamezero/discovery/space";
import { COLORS } from "@/lib/engines/gamezero/types";
import { COLOR_HEX } from "@/components/experiments/gamezero/helpers";

const SceneFrame = dynamic(() => import("../SceneFrame"), { ssr: false });
const EDGES = dynEdges();
const CYAN = new THREE.Color("#7be0d0");
const VIOLET = new THREE.Color("#a78bfa");
const GREEN = new THREE.Color("#5fe3a1");
const RED = new THREE.Color("#ff6b7a");

interface NodeSpec {
  id: string;
  target: P3;
  scale: number;
  color: THREE.Color;
  opacity: number;
}

/** One glowing node that eases toward the position/size/opacity the optimizer state asks for. */
function Node({ spec, animate }: { spec: NodeSpec; animate: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    const m = mesh.current;
    const mt = mat.current;
    if (!m || !mt) return;
    const k = animate ? 1 - Math.exp(-dt * 3.2) : 1;
    m.position.x += (spec.target.x - m.position.x) * k;
    m.position.y += (spec.target.y - m.position.y) * k;
    m.position.z += (spec.target.z - m.position.z) * k;
    const s = m.scale.x + (spec.scale - m.scale.x) * k;
    m.scale.setScalar(s);
    mt.opacity += (spec.opacity - mt.opacity) * k;
    mt.color.lerp(spec.color, k);
    mt.emissive.lerp(spec.color, k);
  });
  return (
    <mesh ref={mesh} position={[spec.target.x, spec.target.y, spec.target.z]}>
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial ref={mat} color={spec.color} emissive={spec.color} emissiveIntensity={0.9} transparent opacity={spec.opacity} roughness={0.4} flatShading />
    </mesh>
  );
}

function Lines({ segments }: { segments: { a: P3; b: P3; w: number; color: THREE.Color }[] }) {
  const geo = useMemo(() => {
    const pos: number[] = [];
    const col: number[] = [];
    for (const s of segments) {
      pos.push(s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z);
      for (let i = 0; i < 2; i++) col.push(s.color.r * s.w, s.color.g * s.w, s.color.b * s.w);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [segments]);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial vertexColors transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

function Particles({ speed, count }: { speed: number; count: number }) {
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const p: number[] = [];
    for (let i = 0; i < count; i++) {
      const a = (i * 2.399963) % (Math.PI * 2);
      const r = 0.5 + ((i * 7919) % 100) / 100 * 1.4;
      p.push(Math.cos(a) * r, (((i * 31) % 100) / 100 - 0.5) * 0.9, Math.sin(a) * r);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    return g;
  }, [count]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * speed;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color="#9fe9dd" size={0.014} transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function CoreScene({ a, targetColor, animate }: { a: Analysis; targetColor: string | null; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  const order = a.knowledge;
  useFrame((_, dt) => {
    if (!animate) return;
    if (group.current) group.current.rotation.y += dt * (0.05 + 0.09 * (1 - order));
    if (shell.current) shell.current.rotation.x += dt * 0.2;
  });
  const colorList = COLORS.filter((c) => a.atoms.some((x) => x.color === c));
  const dynPos = (i: number) => lerp3(chaos(i), dynPosition(i), 0.25 + 0.75 * order);

  const nodes: NodeSpec[] = [];
  for (const n of a.dynNodes) {
    nodes.push({
      id: `d${n.index}`,
      target: dynPos(n.index),
      scale: n.alive ? 0.035 + 0.11 * Math.sqrt(n.mass) : 0.014,
      color: n.alive ? (n.mass > 0.5 ? GREEN : VIOLET) : RED,
      opacity: n.alive ? 0.6 + 0.4 * Math.min(1, n.mass * 3) : 0.14,
    });
  }
  colorList.forEach((c, ci) => {
    TERRAINS.forEach((t, ri) => {
      const atom = a.atoms.find((x) => x.color === c && x.role === t);
      if (!atom) return;
      const dead = atom.status === "REJECTED";
      nodes.push({
        id: atom.id,
        target: lerp3(chaos(100 + ci * 5 + ri), terrainPosition(ci, ri, colorList.length), 0.25 + 0.75 * order),
        scale: dead ? 0.012 : (0.02 + 0.045 * atom.confidence) * (targetColor === c ? 1.5 : 1),
        color: new THREE.Color(COLOR_HEX[c]),
        opacity: dead ? 0.1 : 0.35 + 0.65 * atom.confidence,
      });
    });
  });

  const segments = useMemo(() => {
    const out: { a: P3; b: P3; w: number; color: THREE.Color }[] = [];
    for (const [i, j] of EDGES) {
      const ni = a.dynNodes[i];
      const nj = a.dynNodes[j];
      const both = ni.alive && nj.alive;
      out.push({ a: dynPos(i), b: dynPos(j), w: both ? 0.12 + 0.7 * Math.min(1, Math.sqrt(ni.mass * nj.mass) * 4) : 0.025, color: both ? VIOLET : RED });
    }
    for (const n of a.dynNodes) if (n.alive) out.push({ a: { x: 0, y: 0, z: 0 }, b: dynPos(n.index), w: 0.05 + 0.8 * Math.sqrt(n.mass), color: CYAN });
    // search path: the optimizer's leading hypothesis after each observation
    const lead = a.leadHistory.filter((x, i, arr) => x >= 0 && (i === 0 || arr[i - 1] !== x));
    for (let i = 1; i < lead.length; i++) out.push({ a: dynPos(lead[i - 1]), b: dynPos(lead[i]), w: 1, color: GREEN });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.version]);

  const coreColor = a.verified ? GREEN : CYAN;
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[2, 2, 2]} intensity={14} color="#a78bfa" />
      <pointLight position={[-2, -1, -2]} intensity={8} color="#7be0d0" />
      <group ref={group}>
        <Lines segments={segments} />
        {nodes.map((n) => (
          <Node key={n.id} spec={n} animate={animate} />
        ))}
        <mesh scale={0.1 + 0.2 * order}>
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={coreColor} emissive={coreColor} emissiveIntensity={1.4} flatShading />
        </mesh>
        <mesh ref={shell} scale={0.34 + 0.12 * order}>
          <icosahedronGeometry args={[1, 1]} />
          <meshBasicMaterial color={coreColor} wireframe transparent opacity={0.16} />
        </mesh>
        <Particles speed={0.05 + 0.2 * (1 - order)} count={140} />
      </group>
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.9} maxPolarAngle={2.2} />
    </>
  );
}

export default function DiscoveryCore3D({ a, targetColor, caps, fallback, className = "", label }: { a: Analysis; targetColor: string | null; caps: Capabilities; fallback: React.ReactNode; className?: string; label: string }) {
  return (
    <SceneFrame caps={caps} fallback={fallback} className={className} label={label} camera={{ position: [0, 0.8, 3.2], fov: 46 }}>
      <CoreScene a={a} targetColor={targetColor} animate={!caps.reducedMotion} />
    </SceneFrame>
  );
}

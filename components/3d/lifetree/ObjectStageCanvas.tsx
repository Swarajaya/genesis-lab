"use client";
import { Html, OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Capabilities } from "@/hooks/useCapabilities";
import { CATEGORY_META, MATERIAL_COLOR, fatesFor, reassembles, type ComponentSpec, type Pathway } from "@/components/experiments/object/model";
import type { ObjectForm } from "@/lib/engines/object/types";

const SceneFrame = dynamic(() => import("../SceneFrame"), { ssr: false });

interface Props {
  components: ComponentSpec[];
  form: ObjectForm;
  /** component map: false = assembled silhouette, true = parts separated */
  exploded: boolean;
  /** future simulator: -1 when not simulating, otherwise 0..4 */
  step: number;
  pathway: Pathway | null;
  activeComp: string | null;
  caps: Capabilities;
  fallback: React.ReactNode;
  className?: string;
  label: string;
}

const fib = (i: number, n: number, R: number, off = 0) => {
  const y = 1 - ((i + 0.5) / Math.max(n, 1)) * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const th = (i + off) * 2.399963;
  return new THREE.Vector3(Math.cos(th) * r * R, y * R * 0.75, Math.sin(th) * r * R);
};

interface Target { pos: THREE.Vector3; s: number; o: number; color: THREE.Color }

function sizeOf(c: ComponentSpec) {
  return Math.min(1.1, Math.max(0.22, 0.28 + Math.cbrt(c.massFraction) * 0.9));
}

function Silhouette({ form, visible }: { form: ObjectForm; visible: boolean }) {
  const parts = useMemo(() => {
    const mk = (g: THREE.BufferGeometry, pos: [number, number, number] = [0, 0, 0]) => ({ geo: new THREE.EdgesGeometry(g), pos });
    switch (form) {
      case "container": return [mk(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 16)), mk(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), [0, 0.85, 0])];
      case "box": return [mk(new THREE.BoxGeometry(1.3, 1, 1.3))];
      case "furniture": return [mk(new THREE.BoxGeometry(1.2, 0.14, 1.2), [0, 0, 0]), mk(new THREE.BoxGeometry(1.2, 1.1, 0.12), [0, 0.6, -0.55]), mk(new THREE.BoxGeometry(0.1, 0.9, 0.1), [0.5, -0.5, 0.5]), mk(new THREE.BoxGeometry(0.1, 0.9, 0.1), [-0.5, -0.5, 0.5])];
      case "garment": return [mk(new THREE.BoxGeometry(1.5, 1.4, 0.12))];
      case "device": return [mk(new THREE.BoxGeometry(1.6, 0.1, 1.15), [0, -0.3, 0.2]), mk(new THREE.BoxGeometry(1.6, 1.05, 0.07), [0, 0.2, -0.38])];
      default: return [mk(new THREE.IcosahedronGeometry(0.75, 0))];
    }
  }, [form]);
  useEffect(() => () => parts.forEach((p) => p.geo.dispose()), [parts]);
  return (
    <group visible={visible}>
      {parts.map((p, i) => (
        <lineSegments key={i} geometry={p.geo} position={p.pos}>
          <lineBasicMaterial color="#e6ffb3" transparent opacity={0.7} />
        </lineSegments>
      ))}
    </group>
  );
}

function Scene({ components, form, exploded, step, pathway, activeComp, caps }: Omit<Props, "fallback" | "className" | "label">) {
  const invalidate = useThree((s) => s.invalidate);
  const reduced = caps.reducedMotion;
  const n = components.length;
  const groups = useRef<(THREE.Group | null)[]>([]);
  const targets = useRef<Target[]>([]);
  const fills = useMemo(() => components.map((c) => new THREE.MeshBasicMaterial({ color: MATERIAL_COLOR[c.material], transparent: true, opacity: 0.35, depthWrite: false })), [components]);
  const lines = useMemo(() => components.map((c) => new THREE.LineBasicMaterial({ color: MATERIAL_COLOR[c.material], transparent: true, opacity: 0.95 })), [components]);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const edge = useMemo(() => new THREE.EdgesGeometry(box), [box]);
  useEffect(() => () => { fills.forEach((m) => m.dispose()); lines.forEach((m) => m.dispose()); }, [fills, lines]);
  useEffect(() => () => { box.dispose(); edge.dispose(); }, [box, edge]);

  const simulating = step >= 0;
  const color = pathway ? CATEGORY_META[pathway.category].color : "#b6f26b";

  // Target state for every component, recomputed only when props change (not per frame).
  useLayoutEffect(() => {
    const fates = fatesFor(components, simulating ? pathway : null);
    const affected = components.filter((c) => fates.get(c.id) === "transform");
    const mats = [...new Set(affected.map((c) => c.material))];
    const back = reassembles(pathway);
    targets.current = components.map((c, i) => {
      const rest = fib(i, n, 0.32 + 0.04 * n).setY(((i / Math.max(n, 1)) - 0.5) * 0.9);
      const out = fib(i, n, 2.3, 0.5);
      const j = affected.findIndex((a) => a.id === c.id);
      const fate = fates.get(c.id) ?? "transform";
      const base = sizeOf(c);
      let pos = rest;
      let s = base * 0.55;
      let o = 0.35;
      const col = new THREE.Color(MATERIAL_COLOR[c.material]);
      if (!simulating) {
        if (exploded) { pos = out; s = base; o = 0.5; }
      } else {
        s = base;
        o = 0.55;
        pos = out;
        if (step >= 1 && fate === "discard") { pos = out.clone().setY(-2.5); o = 0.18; s = base * 0.85; col.set("#6b7385"); }
        else if (step === 1) pos = new THREE.Vector3(Math.cos((j / Math.max(affected.length, 1)) * 6.283) * 2, 0, Math.sin((j / Math.max(affected.length, 1)) * 6.283) * 2);
        else if (step === 2) {
          const k = Math.max(0, mats.indexOf(c.material));
          const a = (k / Math.max(mats.length, 1)) * 6.283;
          pos = new THREE.Vector3(Math.cos(a) * 2.1 + ((j % 3) - 1) * 0.35, ((Math.floor(j / 3)) - 0.5) * 0.4, Math.sin(a) * 2.1);
        } else if (step === 3) {
          const k = Math.max(0, mats.indexOf(c.material));
          const a = (k / Math.max(mats.length, 1)) * 6.283;
          pos = new THREE.Vector3(Math.cos(a) * 1.4 + ((j % 3) - 1) * 0.25, ((Math.floor(j / 3)) - 0.5) * 0.3, Math.sin(a) * 1.4);
          col.set(color);
          s = base * 0.85;
        } else if (step >= 4 && fate === "transform") {
          if (back) { pos = rest; s = base * 0.55; col.set(color); o = 0.5; }
          else {
            const a = (j / Math.max(affected.length, 1)) * 6.283;
            pos = new THREE.Vector3(Math.cos(a) * 1.25, 0.25, Math.sin(a) * 1.25);
            s = base * 0.7;
            col.set(color);
            o = 0.7;
          }
        }
      }
      if (activeComp === c.id) { o = 0.95; s *= 1.2; }
      return { pos, s, o, color: col };
    });
    fills.forEach((m, i) => m.color.copy(targets.current[i].color));
    lines.forEach((m, i) => m.color.copy(targets.current[i].color));
    if (reduced) {
      groups.current.forEach((g, i) => {
        const t = targets.current[i];
        if (g && t) { g.position.copy(t.pos); g.scale.setScalar(t.s); fills[i].opacity = t.o; }
      });
    }
    invalidate();
  }, [components, exploded, step, pathway, activeComp, n, simulating, color, reduced, fills, lines, invalidate]);

  useFrame((_, dt) => {
    if (reduced) return;
    const k = 1 - Math.exp(-dt * 3.4);
    groups.current.forEach((g, i) => {
      const t = targets.current[i];
      if (!g || !t) return;
      g.position.lerp(t.pos, k);
      g.scale.setScalar(g.scale.x + (t.s - g.scale.x) * k);
      fills[i].opacity += (t.o - fills[i].opacity) * k;
      lines[i].color.lerp(t.color, k);
      fills[i].color.lerp(t.color, k);
    });
  });

  const showLabels = (exploded || simulating) && !caps.lowPower;
  return (
    <group>
      <Silhouette form={form} visible={!exploded && !simulating} />
      {components.map((c, i) => (
        <group key={c.id} ref={(el) => { groups.current[i] = el; }} scale={sizeOf(c) * 0.55}>
          <mesh geometry={box} material={fills[i]} />
          <lineSegments geometry={edge} material={lines[i]} />
          {showLabels && (
            <Html center position={[0, 0.9, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
              <span className="x5-mono whitespace-nowrap text-[13px] tracking-wider" style={{ color: activeComp === c.id ? "#fff" : "#9aa3b2" }}>{c.name}</span>
            </Html>
          )}
        </group>
      ))}
      {simulating && step >= 4 && !reassembles(pathway) && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
          <torusGeometry args={[1.25, 0.012, 8, 72]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

/** Procedural component stage. It makes no claim to be a reconstruction of the real object: blocks are sized by mass share and coloured by material. */
export default function ObjectStageCanvas({ fallback, className, label, ...rest }: Props) {
  const { caps } = rest;
  return (
    <SceneFrame caps={caps} fallback={fallback} className={className} label={label} camera={{ position: [0, 1.6, 6.4], fov: 42 }}>
      <Scene {...rest} />
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={3.5} maxDistance={10} autoRotate={!caps.reducedMotion} autoRotateSpeed={0.6} />
    </SceneFrame>
  );
}

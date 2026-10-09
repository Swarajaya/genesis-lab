"use client";
import { Billboard, Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EXPERIMENTS, type ExperimentSlug } from "@/lib/experiments";

const RING = 3.4;
const TILT = 0.32;

function nodePos(index: number, t: number, out: THREE.Vector3) {
  const a = (index / EXPERIMENTS.length) * Math.PI * 2 + t;
  return out.set(Math.cos(a) * RING, Math.sin(a) * RING * Math.sin(TILT), Math.sin(a) * RING * Math.cos(TILT));
}

function Core({ energy }: { energy: React.RefObject<number> }) {
  const shell = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((s, dt) => {
    const e = energy.current ?? 0;
    if (shell.current) {
      shell.current.rotation.y += dt * (0.25 + e * 1.2);
      shell.current.rotation.x += dt * 0.12;
    }
    if (inner.current) inner.current.scale.setScalar(1 + Math.sin(s.clock.elapsedTime * (1.4 + e * 3)) * 0.06 + e * 0.15);
    if (halo.current) halo.current.opacity = 0.04 + e * 0.1;
  });
  return (
    <group>
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.62, 3]} />
        <meshBasicMaterial color="#aef5ea" />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial color="#7be0d0" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial ref={halo} color="#7be0d0" transparent opacity={0.05} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

function Particles({ count, pointer }: { count: number; pointer: THREE.Vector2 }) {
  const ref = useRef<THREE.Points>(null);
  const base = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 5 + Math.random() * 10;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      a[i * 3] = r * Math.sin(ph) * Math.cos(th);
      a[i * 3 + 1] = r * Math.cos(ph) * 0.6;
      a[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    return a;
  }, [count]);
  useFrame((_, dt) => {
    const p = ref.current;
    if (!p) return;
    p.rotation.y += dt * 0.02;
    p.position.x += (pointer.x * 0.6 - p.position.x) * 0.04;
    p.position.y += (pointer.y * 0.4 - p.position.y) * 0.04;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[base, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#9aa5b8" transparent opacity={0.55} sizeAttenuation depthWrite={false} />
    </points>
  );
}

function Node({ index, hue, domain, short, hovered, selected, dim, onHover, onSelect, getPos }: { index: number; hue: string; domain: string; short: string; hovered: boolean; selected: boolean; dim: boolean; onHover: (v: boolean) => void; onSelect: () => void; getPos: (i: number, v: THREE.Vector3) => void }) {
  const g = useRef<THREE.Group>(null);
  const m = useRef<THREE.Mesh>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dt) => {
    if (!g.current) return;
    getPos(index, v);
    g.current.position.copy(v);
    const target = selected ? 1.7 : hovered ? 1.35 : 1;
    const k = 1 - Math.pow(0.001, dt);
    g.current.scale.setScalar(g.current.scale.x + (target - g.current.scale.x) * k);
    if (m.current) {
      m.current.rotation.x += dt * 0.6;
      m.current.rotation.y += dt * 0.9;
      (m.current.material as THREE.MeshBasicMaterial).opacity = dim ? 0.35 : 1;
    }
    void s;
  });
  const geo = index % 3;
  return (
    <group ref={g}>
      <mesh
        ref={m}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = "";
        }}
      >
        {geo === 0 ? <octahedronGeometry args={[0.34, 0]} /> : geo === 1 ? <dodecahedronGeometry args={[0.32, 0]} /> : <torusKnotGeometry args={[0.22, 0.07, 64, 8]} />}
        <meshBasicMaterial color={hue} wireframe transparent />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshBasicMaterial color={hue} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshBasicMaterial color={hue} transparent opacity={hovered || selected ? 0.12 : 0.035} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <Billboard position={[0, -0.75, 0]}>
        <Text position={[0, 0.1, 0]} fontSize={0.13} letterSpacing={0.2} anchorX="center" anchorY="middle" color={hue} fillOpacity={dim ? 0.35 : 1} raycast={() => null}>
          {domain.toUpperCase()}
        </Text>
        <Text position={[0, -0.12, 0]} fontSize={0.17} anchorX="center" anchorY="middle" color="#e6e6e6" fillOpacity={dim ? 0.35 : 1} raycast={() => null}>
          {short}
        </Text>
      </Billboard>
    </group>
  );
}

export interface LandingSceneProps {
  active: ExperimentSlug | null;
  onSelect: (s: ExperimentSlug | null) => void;
  entering: boolean;
  lowPower: boolean;
  reduced: boolean;
}

export default function LandingScene({ active, onSelect, entering, lowPower, reduced }: LandingSceneProps) {
  const { camera, pointer } = useThree();
  const t = useRef(0);
  const energy = useRef(0);
  const look = useRef(new THREE.Vector3());
  const goal = useRef(new THREE.Vector3(0, 0.6, 9));
  const lookGoal = useRef(new THREE.Vector3());
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const [hover, setHover] = useState<ExperimentSlug | null>(null);
  const frozen = useRef<number | null>(null);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const idx = active ? EXPERIMENTS.findIndex((e) => e.slug === active) : -1;
    if (idx >= 0) {
      if (frozen.current === null) frozen.current = t.current;
    } else {
      frozen.current = null;
      if (!reduced) t.current += dt * 0.12;
    }
    const time = frozen.current ?? t.current;

    // energy: closer pointer to the core => more energetic; hover/active add more
    const near = 1 - Math.min(1, Math.hypot(pointer.x, pointer.y) / 1.2);
    const targetE = entering ? 1.5 : Math.max(near * 0.6, hover ? 0.7 : 0, idx >= 0 ? 0.9 : 0);
    energy.current += (targetE - energy.current) * Math.min(1, dt * 3);

    if (entering) {
      goal.current.set(0, 0, 0.9);
      lookGoal.current.set(0, 0, 0);
    } else if (idx >= 0) {
      nodePos(idx, time, tmp);
      const out = new THREE.Vector3(tmp.x, 0, tmp.z).normalize();
      goal.current.set(tmp.x + out.x * 2.6, tmp.y + 0.5, tmp.z + out.z * 2.6);
      lookGoal.current.copy(tmp);
    } else {
      goal.current.set(pointer.x * 0.9, 0.6 + pointer.y * 0.55, 9);
      lookGoal.current.set(0, -1.1, 0);
    }
    const k = reduced ? 1 : 1 - Math.pow(entering ? 0.04 : 0.012, dt);
    camera.position.lerp(goal.current, k);
    look.current.lerp(lookGoal.current, k);
    camera.lookAt(look.current);
  });

  const getPos = (i: number, v: THREE.Vector3) => {
    nodePos(i, frozen.current ?? t.current, v);
  };

  return (
    <>
      <Core energy={energy} />
      <mesh rotation={[Math.PI / 2 - TILT, 0, 0]}>
        <ringGeometry args={[RING - 0.012, RING + 0.012, 128]} />
        <meshBasicMaterial color="#7be0d0" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <Particles count={lowPower ? 260 : 700} pointer={pointer} />
      {EXPERIMENTS.map((e, i) => (
        <Node
          key={e.slug}
          index={i}
          hue={e.hue}
          domain={e.shortDomain}
          short={e.short}
          hovered={hover === e.slug}
          selected={active === e.slug}
          dim={active !== null && active !== e.slug}
          onHover={(v) => setHover(v ? e.slug : null)}
          onSelect={() => onSelect(active === e.slug ? null : e.slug)}
          getPos={getPos}
        />
      ))}
    </>
  );
}

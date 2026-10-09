"use client";
import { Line, OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Capabilities } from "@/hooks/useCapabilities";
import type { Color, GameEvent, Pos, PublicWorld, Terrain } from "@/lib/engines/gamezero/types";
import { COLOR_HEX, EVENT_HEX } from "@/components/experiments/gamezero/helpers";

const SceneFrame = dynamic(() => import("../SceneFrame"), { ssr: false });

export interface WorldFlash {
  n: number;
  pos: Pos;
  event: Exclude<GameEvent, "none">;
}

interface Props {
  world: PublicWorld;
  pos: Pos;
  trail: Pos[];
  visited: Set<string>;
  /** role per color that the agent has verified (null = still unknown) */
  roles: Record<string, Terrain | null>;
  /** 0..1 how structured the world looks, from real knowledge */
  order: number;
  flash: WorldFlash | null;
  caps: Capabilities;
  fallback: React.ReactNode;
  className?: string;
  label: string;
}

const cellX = (n: number, x: number) => x - (n - 1) / 2;

function Marker({ role, hex }: { role: Terrain; hex: string }) {
  switch (role) {
    case "solid":
      return (
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[0.62, 0.52, 0.62]} />
          <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={0.35} flatShading />
        </mesh>
      );
    case "hazard":
      return (
        <mesh position={[0, 0.3, 0]}>
          <coneGeometry args={[0.3, 0.55, 4]} />
          <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={0.9} flatShading />
        </mesh>
      );
    case "reward":
      return (
        <mesh position={[0, 0.34, 0]}>
          <octahedronGeometry args={[0.24]} />
          <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={1.1} flatShading />
        </mesh>
      );
    case "goal":
      return (
        <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.26, 0.06, 6, 18]} />
          <meshStandardMaterial color="#ffffff" emissive={hex} emissiveIntensity={1.4} />
        </mesh>
      );
    default:
      return null;
  }
}

function Tile({ x, z, hex, role, known, visited, order }: { x: number; z: number; hex: string; role: Terrain | null; known: boolean; visited: boolean; order: number }) {
  const g = useRef<THREE.Group>(null);
  const seed = x * 1.7 + z * 2.3;
  useFrame(({ clock }) => {
    if (!g.current) return;
    const bob = Math.sin(clock.elapsedTime * 0.8 + seed) * 0.04 * (1 - order);
    const lift = known ? 0.06 : -0.05;
    g.current.position.y += (lift + bob - g.current.position.y) * 0.08;
  });
  return (
    <group ref={g} position={[x, 0, z]}>
      <mesh>
        <boxGeometry args={[0.9, 0.12, 0.9]} />
        <meshStandardMaterial color={hex} emissive={hex} emissiveIntensity={known ? 0.4 : 0.1} transparent opacity={known ? 0.95 : 0.5} roughness={0.5} />
      </mesh>
      {known && role && <Marker role={role} hex={hex} />}
      {visited && (
        <mesh position={[0.32, 0.08, 0.32]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
  );
}

function Player({ x, z }: { x: number; z: number }) {
  const m = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!m.current) return;
    const k = 1 - Math.exp(-dt * 7);
    m.current.position.x += (x - m.current.position.x) * k;
    m.current.position.z += (z - m.current.position.z) * k;
  });
  return (
    <group ref={m} position={[x, 0.34, z]}>
      <mesh>
        <sphereGeometry args={[0.2, 18, 18]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.2} />
      </mesh>
      <pointLight color="#7be0d0" intensity={3} distance={2.5} />
    </group>
  );
}

function FlashRing({ flash, n }: { flash: WorldFlash | null; n: number }) {
  const m = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  const last = useRef(-1);
  useFrame((_, dt) => {
    if (!m.current || !flash) return;
    if (last.current !== flash.n) {
      last.current = flash.n;
      t.current = 0;
    }
    t.current = Math.min(1.2, t.current + dt);
    const s = 0.4 + t.current * 2.2;
    m.current.scale.set(s, s, s);
    (m.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t.current / 1.2);
  });
  if (!flash) return null;
  return (
    <mesh ref={m} position={[cellX(n, flash.pos.x), 0.14, cellX(n, flash.pos.y)]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.28, 0.36, 28]} />
      <meshBasicMaterial color={EVENT_HEX[flash.event]} transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

function WorldScene({ world, pos, trail, visited, roles, order, flash, animate }: Omit<Props, "caps" | "fallback" | "className" | "label"> & { animate: boolean }) {
  const n = world.size;
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (root.current && animate) root.current.rotation.y = Math.sin(clock.elapsedTime * 0.15) * 0.12;
  });
  const trailPts = useMemo(() => trail.map((p) => new THREE.Vector3(cellX(n, p.x), 0.2, cellX(n, p.y))), [trail, n]);
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} />
      <group ref={root}>
        {world.colors.flatMap((row, y) =>
          row.map((c: Color, x) => {
            const role = roles[c] ?? null;
            return <Tile key={`${x},${y}`} x={cellX(n, x)} z={cellX(n, y)} hex={COLOR_HEX[c]} role={role} known={role !== null} visited={visited.has(`${x},${y}`)} order={order} />;
          }),
        )}
        {trailPts.length > 1 && <Line points={trailPts} color="#7be0d0" lineWidth={2} transparent opacity={0.65} />}
        <Player x={cellX(n, pos.x)} z={cellX(n, pos.y)} />
        <FlashRing flash={flash} n={n} />
      </group>
      <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0.35} maxPolarAngle={1.2} />
    </>
  );
}

export default function World3D(props: Props) {
  const { caps, fallback, className = "", label, ...rest } = props;
  return (
    <SceneFrame caps={caps} fallback={fallback} className={className} label={label} camera={{ position: [0, rest.world.size * 1.2, rest.world.size * 1.1], fov: 42 }}>
      <WorldScene {...rest} animate={!caps.reducedMotion} />
    </SceneFrame>
  );
}

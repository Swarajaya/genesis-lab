"use client";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import type { FoodBlob } from "@/components/experiments/nutrition/types";

export const BLOB_COLORS = ["#9be86a", "#f2c260", "#ff8f6b", "#7be0d0", "#c79bff", "#ff6b7a", "#7aa2ff", "#e8edf5"];

export function blobRadius(grams: number, max: number): number {
  return 0.22 + 0.5 * Math.cbrt(grams / Math.max(max, 1));
}

function Blob({ index, count, radius, active, onHover, onSelect, selected, reduced }: {
  index: number;
  count: number;
  radius: number;
  active: boolean;
  selected: boolean;
  reduced: boolean;
  onHover: (i: number | null) => void;
  onSelect: (i: number) => void;
}) {
  const ref = useRef<Group>(null);
  const angle = (index / count) * Math.PI * 2;
  const x = Math.cos(angle) * 1.9;
  const z = Math.sin(angle) * 1.9;
  const color = BLOB_COLORS[index % BLOB_COLORS.length];
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    ref.current.position.y = 0.6 + Math.sin(clock.elapsedTime * 0.9 + index) * 0.07;
  });
  const s = selected ? 1.18 : active ? 1.08 : 1;
  return (
    <group ref={ref} position={[x, 0.6, z]} scale={s}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(index);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
      >
        <icosahedronGeometry args={[radius, 3]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} emissive={color} emissiveIntensity={selected ? 0.5 : active ? 0.3 : 0.08} />
      </mesh>
    </group>
  );
}

export default function FoodScene({ blobs, hovered, selected, onHover, onSelect, reducedMotion }: {
  blobs: FoodBlob[];
  hovered: number | null;
  selected: number | null;
  onHover: (i: number | null) => void;
  onSelect: (i: number) => void;
  reducedMotion: boolean;
}) {
  const max = useMemo(() => Math.max(...blobs.map((b) => b.grams), 1), [blobs]);
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} />
      <pointLight position={[-4, 2, -3]} intensity={12} color="#7be0d0" />
      <group rotation={[0.35, 0, 0]}>
        <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.9, 0.07, 16, 96]} />
          <meshStandardMaterial color="#9aa5b8" roughness={0.35} metalness={0.5} />
        </mesh>
        <mesh position={[0, -0.04, 0]}>
          <cylinderGeometry args={[1.95, 1.6, 0.08, 64]} />
          <meshStandardMaterial color="#10151f" roughness={0.6} metalness={0.2} transparent opacity={0.9} />
        </mesh>
        {blobs.map((b, i) => (
          <Blob
            key={`${b.name}-${i}`}
            index={i}
            count={blobs.length}
            radius={blobRadius(b.grams, max)}
            active={hovered === i}
            selected={selected === i}
            reduced={reducedMotion}
            onHover={onHover}
            onSelect={onSelect}
          />
        ))}
      </group>
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={!reducedMotion} autoRotateSpeed={0.8} minPolarAngle={0.6} maxPolarAngle={1.5} />
    </>
  );
}

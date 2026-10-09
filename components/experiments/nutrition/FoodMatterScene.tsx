"use client";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import { FoodMesh } from "./FoodMesh";
import { blobRadius } from "./FoodScene";
import type { MatterItem } from "./labTypes";

function Item({ item, index, count, size, active, selected, reduced, onHover, onSelect }: { item: MatterItem; index: number; count: number; size: number; active: boolean; selected: boolean; reduced: boolean; onHover: (i: number | null) => void; onSelect: (i: number) => void }) {
  const ref = useRef<Group>(null);
  const a = (index / count) * Math.PI * 2;
  const base: [number, number, number] = [Math.cos(a) * 2.1, 0.7, Math.sin(a) * 2.1];
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    ref.current.position.y = base[1] + Math.sin(clock.elapsedTime * 0.9 + index * 1.3) * 0.12;
    ref.current.rotation.y = clock.elapsedTime * 0.35 + index;
  });
  const s = size * (selected ? 1.2 : active ? 1.1 : 1);
  return (
    <group ref={ref} position={base} scale={s}>
      <FoodMesh kind={item.kind} seed={`${item.name}${index}`} />
      {/* generous invisible hit target so small foods are easy to hover */}
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); onHover(index); }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => { e.stopPropagation(); onSelect(index); }}
      >
        <sphereGeometry args={[0.6, 12, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {(active || selected) && (
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.62, 0.012, 8, 48]} /><meshBasicMaterial color="#9be86a" /></mesh>
      )}
    </group>
  );
}

function ScanRing({ reduced }: { reduced: boolean }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current || reduced) return;
    const t = (clock.elapsedTime % 4) / 4;
    ref.current.position.y = -0.2 + t * 2.4;
    ref.current.scale.setScalar(1 + 0.04 * Math.sin(t * 20));
    (ref.current.material as { opacity: number }).opacity = 0.55 * Math.sin(Math.PI * t);
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[2.35, 0.008, 6, 96]} />
      <meshBasicMaterial color="#7be0d0" transparent opacity={0.4} />
    </mesh>
  );
}

export default function FoodMatterScene({ items, hovered, selected, onHover, onSelect, reducedMotion }: { items: MatterItem[]; hovered: number | null; selected: number | null; onHover: (i: number | null) => void; onSelect: (i: number) => void; reducedMotion: boolean }) {
  const max = useMemo(() => Math.max(...items.map((b) => b.grams), 1), [items]);
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 3]} intensity={1.5} />
      <pointLight position={[-4, 2, -3]} intensity={14} color="#7be0d0" />
      <pointLight position={[3, -1, 4]} intensity={8} color="#8f7bff" />
      <group rotation={[0.3, 0, 0]}>
        <gridHelper args={[7, 14, "#2c5b57", "#16272b"]} position={[0, -0.1, 0]} />
        {[2.1, 2.7].map((r, i) => (
          <mesh key={r} position={[0, 0.7, 0]} rotation={[Math.PI / 2 + (i ? 0.25 : 0), 0, 0]}><torusGeometry args={[r, 0.006, 6, 120]} /><meshBasicMaterial color={i ? "#8f7bff" : "#7be0d0"} transparent opacity={0.5} /></mesh>
        ))}
        <ScanRing reduced={reducedMotion} />
        {items.map((it, i) => (
          <Item key={`${it.name}-${i}`} item={it} index={i} count={items.length} size={0.7 + 0.7 * (blobRadius(it.grams, max) - 0.22)} active={hovered === i} selected={selected === i} reduced={reducedMotion} onHover={onHover} onSelect={onSelect} />
        ))}
      </group>
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={!reducedMotion} autoRotateSpeed={0.7} minPolarAngle={0.7} maxPolarAngle={1.5} />
    </>
  );
}

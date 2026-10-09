"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { isStaple } from "@/lib/engines/quantum/objective";
import { FoodMesh } from "./FoodMesh";
import { brothColor, classifyFood, seeded, type FoodKind, type MealKind } from "./foodKinds";

export interface MealLine {
  name: string;
  grams: number;
}

function lathe(points: [number, number][], seg = 40) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

function Bowl() {
  const outer = useMemo(() => lathe([[0.001, 0], [0.5, 0], [0.95, 0.22], [1.2, 0.62], [1.24, 0.66]]), []);
  const inner = useMemo(() => lathe([[1.2, 0.62], [0.92, 0.26], [0.48, 0.06], [0.001, 0.06]]), []);
  return (
    <group>
      <mesh geometry={outer}><meshStandardMaterial color="#e8eef6" roughness={0.25} metalness={0.15} side={THREE.DoubleSide} /></mesh>
      <mesh geometry={inner}><meshStandardMaterial color="#c9d4e2" roughness={0.4} metalness={0.1} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.65, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.22, 0.02, 8, 64]} /><meshStandardMaterial color="#7be0d0" emissive="#7be0d0" emissiveIntensity={0.9} /></mesh>
    </group>
  );
}

function Plate() {
  const g = useMemo(() => lathe([[0.001, 0], [1.0, 0], [1.4, 0.09], [1.5, 0.14]]), []);
  return (
    <group>
      <mesh geometry={g}><meshStandardMaterial color="#e8eef6" roughness={0.25} metalness={0.15} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.49, 0.015, 8, 64]} /><meshStandardMaterial color="#7be0d0" emissive="#7be0d0" emissiveIntensity={0.9} /></mesh>
    </group>
  );
}

function Board() {
  return (
    <group>
      <mesh position={[0, 0.06, 0]}><boxGeometry args={[2.7, 0.12, 1.7]} /><meshStandardMaterial color="#8a5a34" roughness={0.8} /></mesh>
      <mesh position={[1.4, 0.06, 0]}><boxGeometry args={[0.35, 0.07, 0.3]} /><meshStandardMaterial color="#8a5a34" roughness={0.8} /></mesh>
    </group>
  );
}

interface Piece {
  kind: FoodKind;
  seed: string;
  pos: [number, number, number];
  rot: number;
  scale: number;
}

/** Deterministic spiral heap of miniature ingredient pieces. */
function heap(lines: MealLine[], rnd: () => number, o: { radius: number; baseY: number; rise: number; lift?: boolean; scale: number }): Piece[] {
  const max = Math.max(...lines.map((l) => l.grams), 1);
  const pieces: Piece[] = [];
  lines.forEach((l, li) => {
    const count = Math.max(1, Math.min(4, Math.round(l.grams / 70)));
    for (let k = 0; k < count; k++) pieces.push({ kind: classifyFood(l.name), seed: `${l.name}${li}${k}`, pos: [0, 0, 0], rot: rnd() * 6.283, scale: o.scale * (0.75 + 0.45 * Math.cbrt(l.grams / max)) });
  });
  const n = pieces.length;
  pieces.forEach((p, i) => {
    const a = i * 2.39996 + rnd() * 0.4;
    const r = o.radius * Math.sqrt((i + 0.5) / n);
    p.pos = [Math.cos(a) * r, o.baseY + (1 - r / o.radius) * o.rise + rnd() * 0.05, Math.sin(a) * r];
  });
  return pieces;
}

function Pieces({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((p, i) => (
        <group key={i} position={p.pos} rotation={[0, p.rot, 0]} scale={p.scale}>
          <FoodMesh kind={p.kind} seed={p.seed} />
        </group>
      ))}
    </>
  );
}

/**
 * A recognisable stylised meal built from the meal's own ingredients. The vessel and arrangement depend on the
 * meal category (salad, soup, toast, pasta, rice, porridge, egg, patty, generic plate).
 */
export function MealMesh({ kind, name, lines }: { kind: MealKind; name: string; lines: MealLine[] }) {
  const real = useMemo(() => lines.filter((l) => !isStaple(l.name)), [lines]);
  const kinds = useMemo(() => real.map((l) => classifyFood(l.name)), [real]);
  const pieces = useMemo(() => {
    const r = seeded(name + "p");
    switch (kind) {
      case "salad": return heap(real, r, { radius: 0.85, baseY: 0.3, rise: 0.5, scale: 0.5 });
      case "soup": return heap(real, r, { radius: 0.8, baseY: 0.46, rise: 0.06, scale: 0.4 });
      case "toast": return heap(real.filter((l) => classifyFood(l.name) !== "bread"), r, { radius: 0.8, baseY: 0.36, rise: 0.12, scale: 0.34 });
      case "pasta": return heap(real.filter((l) => classifyFood(l.name) !== "pasta"), r, { radius: 1.05, baseY: 0.3, rise: 0.2, scale: 0.36 });
      case "rice": return heap(real.filter((l) => classifyFood(l.name) !== "rice"), r, { radius: 0.75, baseY: 0.78, rise: 0.12, scale: 0.34 });
      case "porridge": return heap(real.filter((l) => classifyFood(l.name) !== "oat"), r, { radius: 0.7, baseY: 0.5, rise: 0.08, scale: 0.34 });
      case "egg": return heap(real.filter((l) => classifyFood(l.name) !== "egg"), r, { radius: 0.85, baseY: 0.34, rise: 0.1, scale: 0.34 });
      case "patty": return heap(real, r, { radius: 1.0, baseY: 0.2, rise: 0.0, scale: 0.34 }).filter((_, i) => i % 2 === 0);
      default: return heap(real, r, { radius: 1.0, baseY: 0.3, rise: 0.15, scale: 0.55 });
    }
  }, [kind, real, name]);

  const broth = brothColor(kinds);
  const dominant = kinds.find((k) => k !== "generic") ?? "generic";
  const doughColor = dominant === "potato" ? "#c9a06a" : dominant === "lentil" ? "#b7822c" : dominant === "carrot" ? "#e08a2a" : "#c79a58";

  if (kind === "salad") return (<group><Bowl /><Pieces pieces={pieces} /></group>);
  if (kind === "soup")
    return (
      <group>
        <Bowl />
        <mesh position={[0, 0.44, 0]}><cylinderGeometry args={[1.0, 0.92, 0.04, 40]} /><meshStandardMaterial color={broth} roughness={0.25} emissive={broth} emissiveIntensity={0.18} /></mesh>
        <Pieces pieces={pieces} />
      </group>
    );
  if (kind === "toast")
    return (
      <group>
        <Board />
        {[-0.55, 0.45].map((x, i) => (
          <group key={i} position={[x, 0.2, i === 0 ? -0.1 : 0.15]} rotation={[-Math.PI / 2, 0, i === 0 ? 0.15 : -0.2]} scale={1.2}><FoodMesh kind="bread" seed={`${name}${i}`} /></group>
        ))}
        <Pieces pieces={pieces} />
      </group>
    );
  if (kind === "pasta")
    return (
      <group>
        <Plate />
        <group position={[0, 0.28, 0]} scale={2.3}><FoodMesh kind="pasta" seed={name} /></group>
        <Pieces pieces={pieces} />
      </group>
    );
  if (kind === "rice")
    return (
      <group>
        <Bowl />
        <group position={[0, 0.52, 0]} scale={2.7}><FoodMesh kind="rice" seed={name} /></group>
        <Pieces pieces={pieces} />
      </group>
    );
  if (kind === "porridge")
    return (
      <group>
        <Bowl />
        <mesh position={[0, 0.46, 0]}><cylinderGeometry args={[0.98, 0.9, 0.06, 40]} /><meshStandardMaterial color="#ecdcb8" roughness={0.7} /></mesh>
        <Pieces pieces={pieces} />
      </group>
    );
  if (kind === "egg")
    return (
      <group>
        <Plate />
        <mesh position={[0, 0.22, 0]} scale={[1.15, 0.22, 0.8]}><sphereGeometry args={[0.7, 28, 16]} /><meshStandardMaterial color="#f5d45c" roughness={0.5} emissive="#f5d45c" emissiveIntensity={0.1} /></mesh>
        <Pieces pieces={pieces} />
      </group>
    );
  if (kind === "patty")
    return (
      <group>
        <Plate />
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[(i - 1) * 0.12, 0.24 + i * 0.17, 0]} rotation={[0, i, 0]}><cylinderGeometry args={[0.62 - i * 0.04, 0.6 - i * 0.04, 0.16, 28]} /><meshStandardMaterial color={doughColor} roughness={0.85} /></mesh>
        ))}
        <group position={[0, 0.8, 0]} scale={0.6}><FoodMesh kind="leaf" seed={name} /></group>
        <Pieces pieces={pieces} />
      </group>
    );
  return (<group><Plate /><Pieces pieces={pieces} /></group>);
}

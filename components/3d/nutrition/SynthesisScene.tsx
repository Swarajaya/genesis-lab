"use client";
import { OrbitControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FoodMesh } from "./FoodMesh";
import { MealMesh } from "./MealMesh";
import { phaseAt, SYNTH_DURATION, type SynthItem, type SynthMeal } from "./labTypes";
import { seeded } from "./foodKinds";

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const backOut = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const PCOUNT = 240;

function Ingredient({ item, index, count, size, t0, reduced }: { item: SynthItem; index: number; count: number; size: number; t0: React.MutableRefObject<number | null>; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const a0 = (index / count) * Math.PI * 2;
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = reduced ? SYNTH_DURATION + 1 : clock.elapsedTime - t0.current;
    let r = 2.1, y = 0.7 + Math.sin(t * 0.9 + index * 1.3) * 0.12, s = 1;
    const spin = t < 1.3 ? t * 0.12 : t < 1.9 ? 0.12 * 1.3 + (t - 1.3) * 0.5 : 0.12 * 1.3 + 0.6 * 0.5 + (t - 1.9) * 0.9;
    let a = a0 + spin;
    if (t >= 1.9 && t < 2.7) {
      r = 2.1 + 0.35 * Math.sin(t * 9 + index * 2);
      y = 0.7 + 0.3 * Math.sin(t * 7 + index);
      a += 0.35 * Math.sin(t * 11 + index);
    }
    const conv = sm(2.7, 3.3, t);
    if (item.inMeal) {
      r = r + (1.0 - r) * conv;
      y = y + (0.8 - y) * conv;
      const syn = sm(3.3, 4.0, t);
      r = r + (0.12 - r) * syn;
      a += syn * (t - 3.3) * 6;
      s = 1 - 0.5 * syn;
      s *= 1 - sm(4.0, 4.3, t);
    } else {
      r = r + (4.0 - r) * conv;
      s = 1 - sm(2.7, 3.5, t);
    }
    g.visible = s > 0.01;
    g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    g.rotation.y = t * 0.6 + index;
    g.scale.setScalar(Math.max(0.0001, s * size));
  });
  return (
    <group ref={ref}>
      <FoodMesh kind={item.kind} seed={`${item.name}${index}`} />
    </group>
  );
}

function Dust({ t0, reduced }: { t0: React.MutableRefObject<number | null>; reduced: boolean }) {
  const seeds = useMemo(() => {
    const r = seeded("dust");
    return Array.from({ length: PCOUNT }, () => ({ a: r() * 6.283, r: 0.4 + r() * 2.8, y: r() * 2 - 0.2, sp: 0.1 + r() * 0.35, dir: r() * 6.283 }));
  }, []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(PCOUNT * 3), 3));
    return g;
  }, []);
  const mat = useRef<THREE.PointsMaterial>(null);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = reduced ? SYNTH_DURATION + 1 : clock.elapsedTime - t0.current;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const suck = sm(2.7, 4.0, t), burst = sm(4.0, 4.5, t);
    seeds.forEach((s, i) => {
      const a = s.a + clock.elapsedTime * s.sp + suck * 4;
      let r = s.r * (1 - suck * 0.92);
      let y = s.y * (1 - suck * 0.6) + 0.3 * suck;
      if (burst > 0) {
        r = r + burst * (1.2 + (i % 7) * 0.25) * (1 - sm(4.5, 5.5, t) * 0.4);
        y = y + burst * 0.8;
      }
      pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    });
    pos.needsUpdate = true;
    if (mat.current) mat.current.opacity = 0.35 + 0.5 * sm(1.3, 2.2, t);
  });
  return <points geometry={geo}><pointsMaterial ref={mat} color="#b9fff0" size={0.04} transparent opacity={0.5} depthWrite={false} sizeAttenuation /></points>;
}

function Rings({ t0, reduced }: { t0: React.MutableRefObject<number | null>; reduced: boolean }) {
  const refs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = reduced ? SYNTH_DURATION + 1 : clock.elapsedTime - t0.current;
    const vis = sm(1.3, 1.9, t) * (1 - 0.7 * sm(4.0, 4.8, t));
    refs.forEach((r, i) => {
      if (!r.current) return;
      r.current.rotation.z = t * (0.4 + i * 0.25) * (i % 2 ? -1 : 1);
      r.current.scale.setScalar(1 - sm(2.7, 4.0, t) * 0.55 + i * 0.0);
      (r.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * vis;
    });
  });
  return (
    <>
      {refs.map((r, i) => (
        <mesh key={i} ref={r} position={[0, 0.75, 0]} rotation={[Math.PI / 2 + i * 0.5, i * 0.4, 0]}>
          <torusGeometry args={[1.6 + i * 0.5, 0.008, 6, 120]} />
          <meshBasicMaterial color={i === 1 ? "#8f7bff" : "#7be0d0"} transparent opacity={0} />
        </mesh>
      ))}
    </>
  );
}

function Meal({ meal, t0, reduced }: { meal: SynthMeal; t0: React.MutableRefObject<number | null>; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const flash = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (t0.current === null) t0.current = clock.elapsedTime;
    const t = reduced ? SYNTH_DURATION + 1 : clock.elapsedTime - t0.current;
    const k = sm(4.0, 4.9, t);
    if (ref.current) {
      const s = k <= 0 ? 0.0001 : Math.max(0.0001, backOut(k));
      ref.current.scale.setScalar(s * 1.05);
      ref.current.position.y = -0.1 + (1 - k) * -0.4;
      ref.current.visible = k > 0;
      if (t > SYNTH_DURATION) ref.current.rotation.y += 0.004;
    }
    if (flash.current) flash.current.intensity = reduced ? 0 : 40 * Math.max(0, Math.sin(Math.PI * sm(4.0, 4.7, t))) ;
  });
  return (
    <>
      <group ref={ref} scale={0.0001} visible={false}>
        <MealMesh kind={meal.kind} name={meal.name} lines={meal.lines} />
      </group>
      <pointLight ref={flash} position={[0, 1.4, 0]} intensity={0} color="#9be86a" distance={7} />
    </>
  );
}

function Clock({ runId, t0, onPhase, reduced }: { runId: number; t0: React.MutableRefObject<number | null>; onPhase: (p: number, done: boolean) => void; reduced: boolean }) {
  const last = useRef(-1);
  useEffect(() => {
    t0.current = null;
    last.current = -1;
  }, [runId, t0]);
  useFrame(({ clock }) => {
    if (t0.current === null) return;
    const t = reduced ? SYNTH_DURATION + 1 : clock.elapsedTime - t0.current;
    const p = phaseAt(Math.min(t, SYNTH_DURATION - 0.001));
    const done = t >= SYNTH_DURATION;
    const key = done ? 99 : p;
    if (key !== last.current) {
      last.current = key;
      onPhase(p, done);
    }
  });
  return null;
}

export default function SynthesisScene({ items, meal, runId, onPhase, reducedMotion }: { items: SynthItem[]; meal: SynthMeal; runId: number; onPhase: (phase: number, done: boolean) => void; reducedMotion: boolean }) {
  const t0 = useRef<number | null>(null);
  const max = useMemo(() => Math.max(...items.map((i) => i.grams), 1), [items]);
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={1.5} />
      <pointLight position={[-4, 2, -3]} intensity={14} color="#7be0d0" />
      <pointLight position={[3, -1, 4]} intensity={8} color="#8f7bff" />
      <group rotation={[0.25, 0, 0]}>
        <gridHelper args={[8, 16, "#2c5b57", "#16272b"]} position={[0, -0.12, 0]} />
        <mesh position={[0, -0.1, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.7, 0.01, 6, 100]} /><meshBasicMaterial color="#7be0d0" transparent opacity={0.5} /></mesh>
        <Rings t0={t0} reduced={reducedMotion} />
        {items.map((it, i) => (
          <Ingredient key={`${runId}-${it.name}-${i}`} item={it} index={i} count={items.length} size={0.7 + 0.6 * Math.cbrt(it.grams / max)} t0={t0} reduced={reducedMotion} />
        ))}
        <Dust t0={t0} reduced={reducedMotion} />
        <Meal key={`meal-${runId}-${meal.name}`} meal={meal} t0={t0} reduced={reducedMotion} />
      </group>
      <Clock runId={runId} t0={t0} onPhase={onPhase} reduced={reducedMotion} />
      <OrbitControls enablePan={false} enableZoom={false} autoRotate={false} minPolarAngle={0.6} maxPolarAngle={1.5} />
    </>
  );
}

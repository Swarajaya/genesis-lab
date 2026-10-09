"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Group, type Mesh, type MeshStandardMaterial } from "three";

export interface CoinProps {
  /** Share of the expiry window still left, 0..1. */
  timeFrac: number;
  /** Balance divided by the amount issued, 0..1. */
  balanceFrac: number;
  state: "ACTIVE" | "EXPIRING" | "EXPIRED" | "SPENT";
  /** Increments on every approved spend to trigger a particle burst. */
  burstKey: number;
  burstFrac: number;
  reducedMotion: boolean;
  lowPower: boolean;
}

const SIGNAL = new Color("#7be0d0");
const WARN = new Color("#f2c260");
const GREY = new Color("#4a5260");
const SHARDS = 14;
const PARTS = 28;

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function Shards({ shatter, reduced, color }: { shatter: number; reduced: boolean; color: Color }) {
  const refs = useRef<(Mesh | null)[]>([]);
  const prog = useRef(0);
  const dirs = useMemo(
    () =>
      Array.from({ length: SHARDS }, (_, i) => {
        const a = (i / SHARDS) * Math.PI * 2 + hash(i) * 0.4;
        return { x: Math.cos(a), y: Math.sin(a), z: (hash(i + 9) - 0.5) * 1.2, spin: (hash(i + 3) - 0.5) * 4, s: 0.28 + hash(i + 5) * 0.3 };
      }),
    [],
  );
  useFrame((_, dt) => {
    prog.current += (shatter - prog.current) * (reduced ? 1 : Math.min(1, dt * 2.5));
    const p = prog.current;
    dirs.forEach((d, i) => {
      const m = refs.current[i];
      if (!m) return;
      m.visible = p > 0.01;
      const travel = p * (1.2 + hash(i + 1) * 1.1);
      m.position.set(d.x * (0.55 + travel), d.y * (0.55 + travel) - p * p * 0.9, d.z * p);
      m.rotation.set(p * d.spin, p * d.spin * 0.6, p * d.spin);
      const mat = m.material as MeshStandardMaterial;
      mat.opacity = Math.max(0, 0.9 - p * 0.55);
      mat.color.copy(color);
    });
  });
  return (
    <>
      {dirs.map((d, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} visible={false} scale={d.s}>
          <tetrahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial color="#4a5260" transparent opacity={0.9} roughness={0.8} />
        </mesh>
      ))}
    </>
  );
}

function Burst({ burstKey, frac, reduced, count }: { burstKey: number; frac: number; reduced: boolean; count: number }) {
  const refs = useRef<(Mesh | null)[]>([]);
  const t = useRef(2);
  const seen = useRef(burstKey);
  const strength = useRef(1);
  useFrame((_, dt) => {
    if (seen.current !== burstKey) {
      seen.current = burstKey;
      t.current = reduced ? 2 : 0;
      strength.current = 0.6 + frac * 1.4;
    }
    t.current += dt;
    const p = Math.min(1, t.current / 1.4);
    for (let i = 0; i < count; i++) {
      const m = refs.current[i];
      if (!m) continue;
      m.visible = p < 1;
      const a = hash(i) * Math.PI * 2;
      const up = 0.3 + hash(i + 40) * 0.9;
      const dist = (0.8 + hash(i + 7) * 1.8) * strength.current * p;
      m.position.set(Math.cos(a) * dist, Math.sin(a) * dist * 0.6 + up * p * 1.2 - p * p * 0.8, (hash(i + 2) - 0.5) * dist);
      m.scale.setScalar(0.06 * (1 - p) + 0.01);
      (m.material as MeshStandardMaterial).opacity = 1 - p;
    }
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} visible={false}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshStandardMaterial color="#5fe3a1" emissive="#5fe3a1" emissiveIntensity={1.2} transparent />
        </mesh>
      ))}
    </>
  );
}

export default function CoinScene({ timeFrac, balanceFrac, state, burstKey, burstFrac, reducedMotion, lowPower }: CoinProps) {
  const group = useRef<Group>(null);
  const coin = useRef<Group>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const rim = useRef<MeshStandardMaterial>(null);
  const cur = useRef({ scale: 1, glow: 1, mix: 1, show: 1 });
  const invalidate = useThree((s) => s.invalidate);
  const tint = useMemo(() => new Color(), []);
  const expired = state === "EXPIRED";

  useEffect(() => {
    invalidate();
  }, [timeFrac, balanceFrac, state, invalidate]);

  useFrame(({ clock }, dt) => {
    const k = reducedMotion ? 1 : Math.min(1, dt * 3);
    const c = cur.current;
    const targetScale = 0.55 + 0.45 * Math.min(1, balanceFrac) * (0.6 + 0.4 * timeFrac);
    const targetGlow = state === "SPENT" ? 0.05 : expired ? 0 : 0.15 + 0.85 * timeFrac;
    const targetMix = expired || state === "SPENT" ? 0 : 0.35 + 0.65 * timeFrac;
    c.scale += (targetScale - c.scale) * k;
    c.glow += (targetGlow - c.glow) * k;
    c.mix += (targetMix - c.mix) * k;
    c.show += ((expired ? 0 : 1) - c.show) * k;
    if (coin.current) {
      coin.current.scale.setScalar(Math.max(0.001, c.scale * c.show));
      coin.current.visible = c.show > 0.02;
    }
    const base = state === "EXPIRING" ? WARN : SIGNAL;
    tint.copy(GREY).lerp(base, c.mix);
    for (const m of [mat.current, rim.current]) {
      if (!m) continue;
      m.color.copy(tint);
      m.emissive.copy(tint);
      m.emissiveIntensity = c.glow * 0.9;
    }
    if (group.current && !reducedMotion) {
      group.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.7;
      group.current.rotation.x = -0.25 + Math.sin(clock.elapsedTime * 0.35) * 0.08;
      group.current.position.y = Math.sin(clock.elapsedTime * 0.9) * 0.06;
    } else if (group.current) {
      group.current.rotation.set(-0.25, 0.4, 0);
    }
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <pointLight position={[3, 3, 4]} intensity={30} color="#ffffff" />
      <pointLight position={[-3, -1, 2]} intensity={12} color="#7be0d0" />
      <group ref={group}>
        <group ref={coin}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[1.25, 1.25, 0.18, lowPower ? 32 : 64]} />
            <meshStandardMaterial ref={mat} color="#7be0d0" emissive="#7be0d0" metalness={0.6} roughness={0.35} />
          </mesh>
          <mesh>
            <torusGeometry args={[1.25, 0.07, 12, lowPower ? 32 : 72]} />
            <meshStandardMaterial ref={rim} color="#7be0d0" emissive="#7be0d0" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.1]}>
            <torusGeometry args={[0.75, 0.02, 8, 48]} />
            <meshStandardMaterial color="#04110e" roughness={0.6} />
          </mesh>
        </group>
        <Shards shatter={expired ? 1 : 0} reduced={reducedMotion} color={GREY} />
        <Burst burstKey={burstKey} frac={burstFrac} reduced={reducedMotion} count={lowPower ? PARTS / 2 : PARTS} />
      </group>
    </>
  );
}

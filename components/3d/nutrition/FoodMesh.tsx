"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { KIND_COLOR, seeded, type FoodKind } from "./foodKinds";

/**
 * Procedural low-poly food meshes. Every kind fits roughly inside a sphere of radius 0.5 centred at the origin,
 * so callers scale it by grams. No textures and no external assets, so it runs without a dedicated GPU.
 */

function Mat({ color, rough = 0.6, glow = 0, metal = 0.02, opacity = 1 }: { color: string; rough?: number; glow?: number; metal?: number; opacity?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={metal} emissive={color} emissiveIntensity={glow} transparent={opacity < 1} opacity={opacity} />;
}

function lathe(points: [number, number][], seg = 28) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

function noisyBlob(radius: number, seed: string, amp: number, detail = 2) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const rnd = seeded(seed);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const map = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let f = map.get(k);
    if (f === undefined) { f = 1 + (rnd() - 0.5) * amp; map.set(k, f); }
    v.multiplyScalar(f);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function leafGeometry(seed: string) {
  const g = new THREE.PlaneGeometry(0.62, 0.8, 8, 10);
  const rnd = seeded(seed);
  const p = g.attributes.position;
  const ph = rnd() * 6;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = (y + 0.4) / 0.8;
    const width = Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) ** 0.7;
    const nx = x * width * 1.25;
    const z = -0.22 * (x / 0.31) ** 2 * width + 0.12 * Math.sin(y * 9 + ph) * Math.abs(x) * 2 + t * t * 0.18;
    p.setXYZ(i, nx, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function Bread({ c }: { c: string }) {
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.3, -0.34);
    s.lineTo(0.3, -0.34);
    s.lineTo(0.3, 0.1);
    s.bezierCurveTo(0.42, 0.14, 0.4, 0.4, 0.2, 0.4);
    s.lineTo(-0.2, 0.4);
    s.bezierCurveTo(-0.4, 0.4, -0.42, 0.14, -0.3, 0.1);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 });
  }, []);
  return (
    <group rotation={[0.2, 0.3, 0]}>
      <mesh geometry={geo} position={[0, 0, -0.07]}><Mat color="#c68a45" rough={0.8} /></mesh>
      <mesh position={[0, 0.02, 0.1]} scale={[0.5, 0.62, 1]}><circleGeometry args={[0.5, 24]} /><Mat color={c} rough={0.9} /></mesh>
    </group>
  );
}

function Tomato({ c }: { c: string }) {
  return (
    <group>
      <mesh scale={[1, 0.86, 1]}><sphereGeometry args={[0.42, 24, 18]} /><Mat color={c} rough={0.32} glow={0.12} /></mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.cos((i / 5) * 6.283) * 0.1, 0.36, Math.sin((i / 5) * 6.283) * 0.1]} rotation={[0.5 * Math.sin((i / 5) * 6.283), 0, -0.5 * Math.cos((i / 5) * 6.283)]} scale={[0.5, 0.1, 0.18]}>
          <sphereGeometry args={[0.2, 8, 6]} /><Mat color="#3f9a3a" />
        </mesh>
      ))}
      <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.025, 0.03, 0.1, 6]} /><Mat color="#2e7a2c" /></mesh>
    </group>
  );
}

function Leaf({ c, seed }: { c: string; seed: string }) {
  const geos = useMemo(() => [0, 1, 2, 3].map((i) => leafGeometry(`${seed}${i}`)), [seed]);
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} rotation={[-0.5, (i / 4) * 6.283, 0.15]} position={[Math.sin((i / 4) * 6.283) * 0.08, 0.02 * i, Math.cos((i / 4) * 6.283) * 0.08]} scale={0.9 + 0.08 * i}>
          <meshStandardMaterial color={i % 2 ? c : "#7ad45a"} roughness={0.55} side={THREE.DoubleSide} emissive={c} emissiveIntensity={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function Banana({ c }: { c: string }) {
  const geo = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.42, -0.1, 0), new THREE.Vector3(-0.2, -0.3, 0), new THREE.Vector3(0.12, -0.28, 0), new THREE.Vector3(0.38, 0.05, 0), new THREE.Vector3(0.4, 0.22, 0)]), 28, 0.085, 10, false), []);
  return (
    <group rotation={[0.2, 0.4, 0.1]}>
      <mesh geometry={geo}><Mat color={c} rough={0.5} glow={0.1} /></mesh>
      <mesh position={[-0.43, -0.09, 0]}><sphereGeometry args={[0.06, 8, 8]} /><Mat color="#4a3524" /></mesh>
      <mesh position={[0.4, 0.24, 0]}><cylinderGeometry args={[0.04, 0.05, 0.09, 8]} /><Mat color="#6b8a2e" /></mesh>
    </group>
  );
}

function Cluster({ color, count, seed, shape, spread = 0.36 }: { color: string; count: number; seed: string; shape: "rice" | "lentil" | "bean" | "pea" | "oat"; spread?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const r = seeded(seed);
    return Array.from({ length: count }, () => {
      const a = r() * 6.283, d = Math.sqrt(r()) * spread, h = (1 - d / spread) * 0.22 * r();
      return { p: [Math.cos(a) * d, h - 0.08, Math.sin(a) * d] as [number, number, number], rot: [r() * 3, r() * 3, r() * 3] as [number, number, number] };
    });
  }, [count, seed, spread]);
  const scale = useMemo<[number, number, number]>(() => (shape === "rice" ? [0.5, 0.5, 1.6] : shape === "lentil" ? [1, 0.45, 1] : shape === "bean" ? [0.8, 0.7, 1.3] : shape === "oat" ? [1.4, 0.3, 1] : [1, 1, 1]), [shape]);
  const size = shape === "rice" ? 0.05 : shape === "lentil" ? 0.07 : shape === "bean" ? 0.09 : shape === "pea" ? 0.075 : 0.07;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.rotation.set(...it.rot);
      o.scale.set(...scale);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [items, scale]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[size, 8, 6]} />
      <Mat color={color} rough={0.7} />
    </instancedMesh>
  );
}

function Carrot({ c }: { c: string }) {
  return (
    <group rotation={[0, 0, -0.9]}>
      <mesh position={[0, -0.04, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.16, 0.8, 14]} /><Mat color={c} rough={0.55} glow={0.1} /></mesh>
      {[-0.07, 0, 0.07].map((x, i) => (
        <mesh key={i} position={[x, 0.46, 0]} rotation={[0, 0, x * 3]} scale={[0.6, 1, 0.6]}><coneGeometry args={[0.05, 0.28, 6]} /><Mat color="#58b848" /></mesh>
      ))}
    </group>
  );
}

function Potato({ c, seed }: { c: string; seed: string }) {
  const geo = useMemo(() => noisyBlob(0.4, seed, 0.28), [seed]);
  return <mesh geometry={geo} scale={[1.1, 0.8, 0.85]}><Mat color={c} rough={0.9} /></mesh>;
}

function Onion({ c }: { c: string }) {
  const geo = useMemo(() => lathe([[0.001, -0.38], [0.22, -0.34], [0.38, -0.12], [0.38, 0.06], [0.24, 0.26], [0.08, 0.42], [0.02, 0.5]]), []);
  return <mesh geometry={geo}><Mat color={c} rough={0.4} glow={0.05} /></mesh>;
}

function Egg({ c }: { c: string }) {
  const geo = useMemo(() => lathe([[0.001, -0.4], [0.18, -0.34], [0.3, -0.15], [0.32, 0.05], [0.24, 0.26], [0.12, 0.38], [0.001, 0.42]]), []);
  return <mesh geometry={geo} rotation={[0, 0, 0.3]}><Mat color={c} rough={0.35} /></mesh>;
}

function Apple({ c }: { c: string }) {
  const geo = useMemo(() => lathe([[0.001, -0.36], [0.2, -0.38], [0.38, -0.2], [0.4, 0.05], [0.28, 0.3], [0.1, 0.32], [0.001, 0.26]]), []);
  return (
    <group>
      <mesh geometry={geo}><Mat color={c} rough={0.3} glow={0.1} /></mesh>
      <mesh position={[0.02, 0.38, 0]} rotation={[0, 0, 0.2]}><cylinderGeometry args={[0.018, 0.02, 0.16, 6]} /><Mat color="#5a3a22" /></mesh>
    </group>
  );
}

function Orange({ c }: { c: string }) {
  return (
    <group>
      <mesh><sphereGeometry args={[0.4, 24, 18]} /><Mat color={c} rough={0.75} glow={0.1} /></mesh>
      <mesh position={[0, 0.4, 0]} scale={[1, 0.4, 1]}><sphereGeometry args={[0.05, 8, 6]} /><Mat color="#3f7a2c" /></mesh>
    </group>
  );
}

function Cheese({ c }: { c: string }) {
  return (
    <group rotation={[0.3, 0.5, 0]}>
      <mesh><cylinderGeometry args={[0.42, 0.42, 0.26, 3, 1]} /><Mat color={c} rough={0.5} glow={0.08} /></mesh>
      {[[0.12, 0.13, 0.05], [-0.1, 0.13, -0.08], [0.0, -0.13, 0.12]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}><sphereGeometry args={[0.05, 8, 6]} /><Mat color="#d6b24a" /></mesh>
      ))}
    </group>
  );
}

function Milk({ c }: { c: string }) {
  const geo = useMemo(() => lathe([[0.001, -0.3], [0.2, -0.3], [0.26, 0.2], [0.28, 0.3]]), []);
  return (
    <group>
      <mesh geometry={geo}><meshStandardMaterial color="#cfd8e3" roughness={0.2} metalness={0.1} transparent opacity={0.55} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.25, 0.24, 0.02, 20]} /><Mat color={c} glow={0.15} /></mesh>
    </group>
  );
}

function Pasta({ c }: { c: string }) {
  const tubes = useMemo(() => [0, 1, 2, 3, 4, 5].map((i) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 8 }, (_, k) => new THREE.Vector3(Math.cos(k * 1.1 + i) * (0.12 + k * 0.03), -0.1 + i * 0.05 + Math.sin(k) * 0.03, Math.sin(k * 1.1 + i) * (0.12 + k * 0.03)))), 40, 0.022, 6, false)), []);
  return <group>{tubes.map((g, i) => <mesh key={i} geometry={g}><Mat color={c} rough={0.6} /></mesh>)}</group>;
}

function Cucumber({ c }: { c: string }) {
  return (
    <group rotation={[0, 0, 1.1]}>
      <mesh><cylinderGeometry args={[0.13, 0.13, 0.7, 14]} /><Mat color={c} rough={0.5} /></mesh>
      <mesh position={[0, 0.35, 0]}><sphereGeometry args={[0.13, 12, 8]} /><Mat color={c} rough={0.5} /></mesh>
      <mesh position={[0, -0.35, 0]}><sphereGeometry args={[0.13, 12, 8]} /><Mat color={c} rough={0.5} /></mesh>
      <mesh position={[0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.012, 0.012, 0.7, 4]} /><Mat color="#cfe8b0" /></mesh>
    </group>
  );
}

function Chicken({ c }: { c: string }) {
  return (
    <group rotation={[0, 0, 0.7]}>
      <mesh scale={[1, 1.2, 0.9]}><sphereGeometry args={[0.28, 16, 12]} /><Mat color={c} rough={0.6} /></mesh>
      <mesh position={[0, -0.34, 0]}><cylinderGeometry args={[0.05, 0.08, 0.4, 8]} /><Mat color="#f2e7d4" /></mesh>
      <mesh position={[0, -0.56, 0]}><sphereGeometry args={[0.07, 8, 6]} /><Mat color="#f2e7d4" /></mesh>
    </group>
  );
}

function Pepper({ c }: { c: string }) {
  const geo = useMemo(() => lathe([[0.001, -0.36], [0.2, -0.34], [0.34, -0.1], [0.32, 0.18], [0.18, 0.32], [0.001, 0.3]]), []);
  return (
    <group>
      <mesh geometry={geo}><Mat color={c} rough={0.25} glow={0.1} /></mesh>
      <mesh position={[0, 0.36, 0]}><cylinderGeometry args={[0.03, 0.05, 0.14, 8]} /><Mat color="#3f8a2e" /></mesh>
    </group>
  );
}

function Mushroom({ c }: { c: string }) {
  return (
    <group>
      <mesh position={[0, 0.12, 0]} scale={[1, 0.65, 1]}><sphereGeometry args={[0.36, 20, 12, 0, 6.283, 0, Math.PI / 2]} /><Mat color="#a98a66" rough={0.7} /></mesh>
      <mesh position={[0, -0.12, 0]}><cylinderGeometry args={[0.1, 0.13, 0.42, 10]} /><Mat color={c} rough={0.8} /></mesh>
    </group>
  );
}

function Generic({ c, seed }: { c: string; seed: string }) {
  const geo = useMemo(() => noisyBlob(0.36, seed, 0.35, 1), [seed]);
  return <mesh geometry={geo}><meshStandardMaterial color={c} roughness={0.5} flatShading emissive={c} emissiveIntensity={0.14} /></mesh>;
}

export function FoodMesh({ kind, seed = "x" }: { kind: FoodKind; seed?: string }) {
  const c = KIND_COLOR[kind];
  switch (kind) {
    case "bread": return <Bread c={c} />;
    case "tomato": return <Tomato c={c} />;
    case "leaf": return <Leaf c={c} seed={seed} />;
    case "banana": return <Banana c={c} />;
    case "rice": return <Cluster color={c} count={90} seed={seed} shape="rice" />;
    case "lentil": return <Cluster color={c} count={70} seed={seed} shape="lentil" />;
    case "bean": return <Cluster color={c} count={36} seed={seed} shape="bean" />;
    case "pea": return <Cluster color={c} count={34} seed={seed} shape="pea" />;
    case "oat": return <Cluster color={c} count={60} seed={seed} shape="oat" />;
    case "carrot": return <Carrot c={c} />;
    case "potato": return <Potato c={c} seed={seed} />;
    case "onion": return <Onion c={c} />;
    case "egg": return <Egg c={c} />;
    case "apple": return <Apple c={c} />;
    case "orange": return <Orange c={c} />;
    case "cheese": return <Cheese c={c} />;
    case "milk": return <Milk c={c} />;
    case "pasta": return <Pasta c={c} />;
    case "cucumber": return <Cucumber c={c} />;
    case "chicken": return <Chicken c={c} />;
    case "pepper": return <Pepper c={c} />;
    case "mushroom": return <Mushroom c={c} />;
    default: return <Generic c={c} seed={seed} />;
  }
}

"use client";
import { Html, OrbitControls } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Capabilities } from "@/hooks/useCapabilities";
import { CATEGORY_META, num3, type Pathway, type TreeLayout } from "@/components/experiments/object/model";

const SceneFrame = dynamic(() => import("../SceneFrame"), { ssr: false });

interface Props {
  pathways: Pathway[];
  layout: TreeLayout;
  visible: Set<string>;
  selectedId: string | null;
  hoverId: string | null;
  compareIds: string[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  caps: Capabilities;
  fallback: React.ReactNode;
  className?: string;
  label: string;
}

const scratch = new THREE.Object3D();
const tmpColor = new THREE.Color();
const CAM_HOME = new THREE.Vector3(0, 3.6, 10.5);

const VERT = /* glsl */ `
attribute vec3 aStart; attribute vec3 aEnd; attribute float aWhich; attribute float aDelay; attribute vec3 aColor; attribute float aAlpha;
uniform float uGrow; varying vec3 vC; varying float vA;
void main() {
  float g = clamp((uGrow - aDelay) / 0.4, 0.0, 1.0);
  g = g * g * (3.0 - 2.0 * g);
  vec3 p = mix(aStart, aEnd, aWhich * g);
  vC = aColor; vA = aAlpha * smoothstep(0.0, 0.06, g);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */ `varying vec3 vC; varying float vA; void main() { gl_FragColor = vec4(vC, vA); }`;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

interface Edge {
  a: [number, number, number];
  b: [number, number, number];
  hub: number;
  leaf: number;
  delay: number;
}

function TreeScene({ pathways, layout, visible, selectedId, hoverId, compareIds, onSelect, onHover, caps }: Omit<Props, "fallback" | "className" | "label">) {
  const invalidate = useThree((s) => s.invalidate);
  const reduced = caps.reducedMotion;
  const grow = useRef(reduced ? 1.3 : 0);
  const n = layout.leaves.length;
  const index = useMemo(() => new Map(layout.leaves.map((l, i) => [l.id, i])), [layout]);
  const byId = useMemo(() => new Map(pathways.map((p) => [p.id, p])), [pathways]);

  /* ---------- branch geometry (static positions, growth in the vertex shader) ---------- */
  const edges = useMemo<Edge[]>(() => {
    const e: Edge[] = [];
    layout.hubs.forEach((h, i) => e.push({ a: [0, 0, 0], b: [h.x, h.y, h.z], hub: i, leaf: -1, delay: i * 0.02 }));
    layout.leaves.forEach((l, i) => {
      const h = layout.hubs[l.hub];
      e.push({ a: [h.x, h.y, h.z], b: [l.x, l.y, l.z], hub: l.hub, leaf: i, delay: 0.3 + (i / Math.max(n, 1)) * 0.45 });
    });
    return e;
  }, [layout, n]);

  const branch = useMemo(() => {
    const V = edges.length * 2;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(V * 3), aS = new Float32Array(V * 3), aE = new Float32Array(V * 3), aW = new Float32Array(V), aD = new Float32Array(V);
    edges.forEach((e, i) => {
      for (let v = 0; v < 2; v++) {
        const o = (i * 2 + v) * 3;
        const p = v === 0 ? e.a : e.b;
        pos.set(p, o);
        aS.set(e.a, o);
        aE.set(e.b, o);
        aW[i * 2 + v] = v;
        aD[i * 2 + v] = e.delay;
      }
    });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aStart", new THREE.BufferAttribute(aS, 3));
    g.setAttribute("aEnd", new THREE.BufferAttribute(aE, 3));
    g.setAttribute("aWhich", new THREE.BufferAttribute(aW, 1));
    g.setAttribute("aDelay", new THREE.BufferAttribute(aD, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(V * 3), 3));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(V), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    return g;
  }, [edges]);
  const material = useMemo(() => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, uniforms: { uGrow: { value: grow.current } } }), []);
  useEffect(() => () => { branch.dispose(); }, [branch]);
  useEffect(() => () => { material.dispose(); }, [material]);

  const selIdx = selectedId ? index.get(selectedId) ?? -1 : -1;
  const selHub = selIdx >= 0 ? layout.leaves[selIdx].hub : -1;

  useLayoutEffect(() => {
    const col = branch.getAttribute("aColor") as THREE.BufferAttribute;
    const alp = branch.getAttribute("aAlpha") as THREE.BufferAttribute;
    const cmp = new Set(compareIds);
    edges.forEach((e, i) => {
      const hubCat = layout.hubs[e.hub].category;
      let on: boolean;
      let a: number;
      let k = 1;
      if (e.leaf < 0) {
        on = layout.leaves.some((l) => l.hub === e.hub && visible.has(l.id));
        a = on ? 0.7 : 0.12;
        if (e.hub === selHub) { a = 1; k = 1.5; }
      } else {
        const l = layout.leaves[e.leaf];
        on = visible.has(l.id);
        a = on ? 0.3 : 0.04;
        if (l.id === selectedId) { a = 1; k = 1.6; }
        else if (l.id === hoverId) { a = 0.9; k = 1.3; }
        else if (cmp.has(l.id)) { a = 0.85; k = 1.2; }
      }
      tmpColor.set(CATEGORY_META[hubCat].color).multiplyScalar(k);
      for (let v = 0; v < 2; v++) {
        col.setXYZ(i * 2 + v, tmpColor.r, tmpColor.g, tmpColor.b);
        alp.setX(i * 2 + v, a);
      }
    });
    col.needsUpdate = true;
    alp.needsUpdate = true;
    invalidate();
  }, [branch, edges, layout, visible, selectedId, hoverId, compareIds, selHub, invalidate]);

  /* ---------- pathway nodes (instanced) ---------- */
  const core = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const cmpSet = useMemo(() => new Set(compareIds), [compareIds]);

  const writeInstances = (time: number) => {
    const m = core.current;
    if (!m) return;
    layout.leaves.forEach((l, i) => {
      const on = visible.has(l.id);
      const sel = l.id === selectedId;
      const hot = sel || l.id === hoverId;
      const born = smooth((grow.current - (0.3 + (i / Math.max(n, 1)) * 0.45 + 0.28)) / 0.3);
      const pulse = sel && !reduced ? 1 + Math.sin(time * 3.2) * 0.12 : 1;
      const s = (on ? (hot ? 1.7 : cmpSet.has(l.id) ? 1.35 : 1) : 0.45) * pulse * born;
      scratch.position.set(l.x, l.y, l.z);
      scratch.scale.setScalar(Math.max(1e-4, l.size * s));
      scratch.updateMatrix();
      m.setMatrixAt(i, scratch.matrix);
      if (halo.current) {
        scratch.scale.setScalar(Math.max(1e-4, l.size * s * (hot ? 3.4 : 2.4)));
        scratch.updateMatrix();
        halo.current.setMatrixAt(i, scratch.matrix);
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (halo.current) halo.current.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const m = core.current;
    if (!m) return;
    layout.leaves.forEach((l, i) => {
      const on = visible.has(l.id);
      const hot = l.id === selectedId || l.id === hoverId;
      tmpColor.set(CATEGORY_META[l.category].color).multiplyScalar(on ? (hot ? 1.5 : 0.55 + 0.6 * l.glow) : 0.12);
      m.setColorAt(i, tmpColor);
      if (halo.current) {
        tmpColor.set(CATEGORY_META[l.category].color).multiplyScalar(on ? 0.45 * l.glow + (hot ? 0.5 : 0) : 0);
        halo.current.setColorAt(i, tmpColor);
      }
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (halo.current?.instanceColor) halo.current.instanceColor.needsUpdate = true;
    writeInstances(0);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, visible, selectedId, hoverId, cmpSet, invalidate]);

  /* ---------- energy particles along branches ---------- */
  const PN = caps.lowPower ? 40 : 110;
  const pGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PN * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);
    return g;
  }, [PN]);
  useEffect(() => () => { pGeo.dispose(); }, [pGeo]);
  const assign = useMemo(() => {
    const a = new Int32Array(PN);
    const phase = new Float32Array(PN);
    const speed = new Float32Array(PN);
    for (let i = 0; i < PN; i++) { phase[i] = (i * 0.618034) % 1; speed[i] = 0.1 + ((i * 7) % 5) * 0.03; }
    return { a, phase, speed };
  }, [PN]);
  useMemo(() => {
    const sel: number[] = [];
    if (selIdx >= 0) edges.forEach((e, i) => { if ((e.leaf < 0 && e.hub === selHub) || e.leaf === selIdx) sel.push(i); });
    for (let i = 0; i < PN; i++) assign.a[i] = sel.length && i % 2 === 0 ? sel[(i / 2) % sel.length | 0] : (i * 31 + 7) % Math.max(edges.length, 1);
  }, [edges, selIdx, selHub, PN, assign]);

  useFrame(({ clock }, dt) => {
    if (reduced) return;
    if (grow.current < 1.3) {
      grow.current = Math.min(1.3, grow.current + dt / 2.2);
      material.uniforms.uGrow.value = grow.current;
      writeInstances(clock.elapsedTime);
    } else if (selIdx >= 0) writeInstances(clock.elapsedTime);
    const pos = pGeo.getAttribute("position") as THREE.BufferAttribute;
    const t = clock.elapsedTime;
    for (let i = 0; i < PN; i++) {
      const e = edges[assign.a[i]];
      if (!e) continue;
      const f = (assign.phase[i] + t * assign.speed[i]) % 1;
      const g = smooth((grow.current - e.delay) / 0.4);
      const k = f * g;
      pos.setXYZ(i, e.a[0] + (e.b[0] - e.a[0]) * k, e.a[1] + (e.b[1] - e.a[1]) * k, e.a[2] + (e.b[2] - e.a[2]) * k);
    }
    pos.needsUpdate = true;
  });

  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    e.stopPropagation();
    const i = e.instanceId;
    if (i === undefined) return undefined;
    const l = layout.leaves[i];
    return l && visible.has(l.id) ? l : undefined;
  };

  /* ---------- camera moves toward the selected node and back out ---------- */
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const camera = useThree((s) => s.camera);
  const goal = useRef({ target: new THREE.Vector3(), cam: CAM_HOME.clone(), until: 0 });
  useEffect(() => {
    const g = goal.current;
    if (selIdx >= 0) {
      const l = layout.leaves[selIdx];
      const p = new THREE.Vector3(l.x, l.y, l.z);
      const out = new THREE.Vector3(l.x, 0, l.z).normalize();
      g.target.copy(p);
      g.cam.copy(p).addScaledVector(out, 4.2).add(new THREE.Vector3(0, 1.1, 0));
    } else {
      g.target.set(0, 0, 0);
      g.cam.copy(CAM_HOME);
    }
    g.until = performance.now() + 1900;
    if (reduced && controls) {
      controls.target.copy(g.target);
      camera.position.copy(g.cam);
      controls.update();
      invalidate();
    }
  }, [selIdx, layout, controls, camera, reduced, invalidate]);
  useFrame((_, dt) => {
    const g = goal.current;
    if (reduced || !controls || performance.now() > g.until) return;
    const k = 1 - Math.exp(-dt * 3);
    controls.target.lerp(g.target, k);
    camera.position.lerp(g.cam, k);
    controls.update();
  });

  const tip = hoverId ? layout.leaves[index.get(hoverId) ?? -1] : undefined;
  const tipPath = hoverId ? byId.get(hoverId) : undefined;

  return (
    <group>
      <Root animate={!reduced} />
      <lineSegments geometry={branch} material={material} frustumCulled={false} />
      <points geometry={pGeo} frustumCulled={false}>
        <pointsMaterial size={0.055} color="#e6ffb3" transparent opacity={0.85} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
      </points>
      <instancedMesh
        key={n}
        ref={core}
        args={[undefined, undefined, n]}
        frustumCulled={false}
        onPointerMove={(e) => {
          const l = pick(e);
          onHover(l ? l.id : null);
          document.body.style.cursor = l ? "pointer" : "";
        }}
        onPointerOut={() => {
          onHover(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          const l = pick(e);
          if (l) onSelect(l.id);
        }}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial />
      </instancedMesh>
      {!caps.lowPower && (
        <instancedMesh key={`h${n}`} ref={halo} args={[undefined, undefined, n]} frustumCulled={false} raycast={() => null}>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
        </instancedMesh>
      )}
      {layout.hubs.map((h) => (
        <group key={h.category} position={[h.x, h.y, h.z]}>
          <mesh>
            <octahedronGeometry args={[0.13, 0]} />
            <meshBasicMaterial color={CATEGORY_META[h.category].color} />
          </mesh>
          <Html center position={[0, 0.34, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
            <span className="x5-mono whitespace-nowrap text-[13px] tracking-[0.14em]" style={{ color: CATEGORY_META[h.category].color }}>
              {CATEGORY_META[h.category].label} · {h.count}
            </span>
          </Html>
        </group>
      ))}
      {tip && tipPath && (
        <Html position={[tip.x, tip.y + tip.size * 2.4, tip.z]} center style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="x5-panel w-max max-w-[230px] -translate-y-full whitespace-normal px-2.5 py-1.5" style={{ background: "rgb(3 8 11 / 0.95)" }}>
            <p className="text-base text-[var(--x5-text)]">{tipPath.title}</p>
            <p className="x5-mono mt-0.5 text-[0.85rem] tracking-wider text-[var(--x5-dim)]">
              #{num3(tipPath.num)} · CI {tipPath.score.circularityIndex.toFixed(1)} · {CATEGORY_META[tipPath.category].label}
            </p>
          </div>
        </Html>
      )}
    </group>
  );
}

function Root({ animate }: { animate: boolean }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (a.current) { a.current.rotation.y = t * 0.4; a.current.rotation.x = t * 0.25; }
    if (b.current) b.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.08);
  });
  return (
    <group>
      <mesh ref={a}>
        <icosahedronGeometry args={[0.38, 1]} />
        <meshBasicMaterial color="#f4ffe0" wireframe />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={b}>
        <sphereGeometry args={[0.7, 20, 20]} />
        <meshBasicMaterial color="#b6f26b" transparent opacity={0.13} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <Html center position={[0, -0.75, 0]} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
        <span className="x5-mono whitespace-nowrap text-[13px] tracking-[0.2em] text-[#e6ffb3]">ORIGINAL OBJECT</span>
      </Html>
    </group>
  );
}

function Stars({ count }: { count: number }) {
  const geo = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 11 + (((i * 7919) % 100) / 100) * 6;
      const t = i * 2.399963;
      const u = ((i * 0.618034) % 1) * 2 - 1;
      const s = Math.sqrt(1 - u * u);
      p[i * 3] = Math.cos(t) * s * r;
      p[i * 3 + 1] = u * r;
      p[i * 3 + 2] = Math.sin(t) * s * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    return g;
  }, [count]);
  useEffect(() => () => { geo.dispose(); }, [geo]);
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.035} color="#9aa3b2" transparent opacity={0.45} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** The 3D life tree: object core, category hubs, one instanced node per pathway, branches that grow outward. */
export default function LifeTreeCanvas({ fallback, className, label, ...rest }: Props) {
  const { caps, selectedId } = rest;
  return (
    <SceneFrame caps={caps} fallback={fallback} className={className} label={label} camera={{ position: [CAM_HOME.x, CAM_HOME.y, CAM_HOME.z], fov: 44 }}>
      <TreeScene {...rest} />
      {!caps.lowPower && <Stars count={120} />}
      <OrbitControls makeDefault enablePan={false} enableDamping minDistance={2.5} maxDistance={15} autoRotate={!caps.reducedMotion && !selectedId} autoRotateSpeed={0.45} />
    </SceneFrame>
  );
}

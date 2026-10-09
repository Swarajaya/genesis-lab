"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { EXPERIMENTS, type ExperimentSlug } from "@/lib/experiments";

const R = 3.6;
const TAU = Math.PI * 2;
const ADD = THREE.AdditiveBlending;

/* ------------------------------------------------------------------ emblems (one unique procedural symbol per experiment) */

type EmblemProps = { hue: string; active: boolean; reduced: boolean };

/** Blood: a living cell network. */
function BloodEmblem({ hue, active, reduced }: EmblemProps) {
  const g = useRef<THREE.Group>(null);
  const cells = useRef<THREE.Mesh[]>([]);
  const pts = useMemo(() => Array.from({ length: 7 }, (_, i) => new THREE.Vector3(Math.cos((i / 7) * TAU) * 0.36, Math.sin((i / 7) * TAU) * 0.36, Math.sin(i * 2.1) * 0.16)), []);
  const lines = useMemo(() => {
    const p: number[] = [];
    pts.forEach((a, i) => {
      p.push(0, 0, 0, a.x, a.y, a.z);
      const b = pts[(i + 1) % pts.length];
      p.push(a.x, a.y, a.z, b.x, b.y, b.z);
    });
    return new Float32Array(p);
  }, [pts]);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (g.current && !reduced) g.current.rotation.z += dt * (active ? 0.9 : 0.25);
    cells.current.forEach((m, i) => m && m.scale.setScalar(1 + Math.sin(t * 2.4 + i) * 0.22 * (reduced ? 0 : 1)));
  });
  return (
    <group ref={g}>
      <mesh>
        <sphereGeometry args={[0.15, 20, 20]} />
        <meshBasicMaterial color={hue} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[lines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={hue} transparent opacity={0.55} />
      </lineSegments>
      {pts.map((p, i) => (
        <mesh key={i} position={p} ref={(m) => void (m && (cells.current[i] = m))}>
          <sphereGeometry args={[0.07, 14, 14]} />
          <meshBasicMaterial color="#ffd0d6" />
        </mesh>
      ))}
    </group>
  );
}

/** Nutrition: a phyllotaxis seed head. */
function SeedEmblem({ hue, active, reduced }: EmblemProps) {
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => {
    const n = 140;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.045 * Math.sqrt(i) * 1.75;
      const th = i * 2.399963;
      a[i * 3] = Math.cos(th) * r;
      a[i * 3 + 1] = Math.sin(th) * r;
      a[i * 3 + 2] = Math.sin(i * 0.3) * 0.05;
    }
    return a;
  }, []);
  useFrame((_, dt) => {
    if (ref.current && !reduced) ref.current.rotation.z -= dt * (active ? 0.8 : 0.2);
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.055} color={hue} sizeAttenuation transparent opacity={0.95} blending={ADD} depthWrite={false} />
    </points>
  );
}

/** GameZero: a 3x3 board whose cells light up as the agent "thinks". */
function BoardEmblem({ hue, reduced }: EmblemProps) {
  const cubes = useRef<THREE.Mesh[]>([]);
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    cubes.current.forEach((m, i) => {
      if (!m) return;
      const on = reduced ? i === 4 : Math.sin(t * 1.6 + i * 1.9) > 0.55;
      (m.material as THREE.MeshBasicMaterial).color.set(on ? "#ffffff" : hue);
      (m.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.45;
      m.scale.setScalar(on ? 1.18 : 1);
    });
    if (g.current && !reduced) g.current.rotation.set(-0.5, Math.sin(t * 0.6) * 0.5, 0);
  });
  return (
    <group ref={g}>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[((i % 3) - 1) * 0.24, (Math.floor(i / 3) - 1) * 0.24, 0]} ref={(m) => void (m && (cubes.current[i] = m))}>
          <boxGeometry args={[0.17, 0.17, 0.17]} />
          <meshBasicMaterial color={hue} transparent opacity={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Trust: a sealed commitment (solid core inside a wire shell) with proof particles streaming outward. */
function VaultEmblem({ hue, active, reduced }: EmblemProps) {
  const shell = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const dust = useRef<THREE.Points>(null);
  const base = useMemo(() => {
    const n = 60;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = (i / n) * TAU * 3;
      a[i * 3] = Math.cos(th);
      a[i * 3 + 1] = Math.sin(th);
      a[i * 3 + 2] = (i % 7) * 0.02;
    }
    return a;
  }, []);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (!reduced) {
      if (shell.current) shell.current.rotation.y += dt * (active ? 1.2 : 0.4);
      if (core.current) core.current.rotation.x -= dt * 0.8;
    }
    if (dust.current) {
      const arr = dust.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < 60; i++) {
        const k = reduced ? 0.55 : (t * 0.35 + i / 60) % 1;
        const rr = 0.18 + k * 0.46;
        arr[i * 3] = base[i * 3] * rr;
        arr[i * 3 + 1] = base[i * 3 + 1] * rr;
      }
      dust.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  return (
    <group>
      <mesh ref={core}>
        <octahedronGeometry args={[0.15, 0]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh ref={shell}>
        <icosahedronGeometry args={[0.3, 1]} />
        <meshBasicMaterial color={hue} wireframe transparent opacity={0.8} />
      </mesh>
      <points ref={dust}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array(base), 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.035} color={hue} transparent opacity={0.8} sizeAttenuation blending={ADD} depthWrite={false} />
      </points>
    </group>
  );
}

/** Object: a branching life tree. */
function TreeEmblem({ hue, active, reduced }: EmblemProps) {
  const g = useRef<THREE.Group>(null);
  const { segs, tips } = useMemo(() => {
    const segs: number[] = [];
    const tips: THREE.Vector3[] = [];
    const grow = (x: number, y: number, ang: number, len: number, depth: number) => {
      const nx = x + Math.sin(ang) * len;
      const ny = y + Math.cos(ang) * len;
      segs.push(x, y, 0, nx, ny, 0);
      if (depth === 0) return void tips.push(new THREE.Vector3(nx, ny, 0));
      grow(nx, ny, ang - 0.55, len * 0.7, depth - 1);
      grow(nx, ny, ang + 0.55, len * 0.7, depth - 1);
    };
    grow(0, -0.4, 0, 0.3, 4);
    return { segs: new Float32Array(segs), tips };
  }, []);
  useFrame(({ clock }, dt) => {
    if (g.current && !reduced) g.current.rotation.y += dt * (active ? 1.1 : 0.35);
    void clock;
  });
  return (
    <group ref={g}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[segs, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={hue} />
      </lineSegments>
      {tips.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshBasicMaterial color="#eafff3" />
        </mesh>
      ))}
    </group>
  );
}

/** Expiry: a coin inside a draining countdown arc. */
function CoinEmblem({ hue, active, reduced }: EmblemProps) {
  const coin = useRef<THREE.Mesh>(null);
  const arc = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (reduced) return;
    if (coin.current) coin.current.rotation.y += dt * (active ? 2.4 : 1);
    if (arc.current) arc.current.rotation.z -= dt * 0.5;
    void clock;
  });
  return (
    <group>
      <mesh ref={coin} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.05, 40]} />
        <meshBasicMaterial color={hue} />
      </mesh>
      <mesh ref={arc}>
        <torusGeometry args={[0.38, 0.018, 8, 60, TAU * 0.72]} />
        <meshBasicMaterial color="#fff3d1" />
      </mesh>
    </group>
  );
}

const EMBLEMS: Record<ExperimentSlug, (p: EmblemProps) => React.ReactElement> = {
  blood: BloodEmblem,
  nutrition: SeedEmblem,
  gamezero: BoardEmblem,
  trust: VaultEmblem,
  object: TreeEmblem,
  expiry: CoinEmblem,
};

/* ------------------------------------------------------------------ portal */

/** Text drawn once into a texture: no per-frame DOM work, always faces the camera. */
function LabelSprite({ text, color, opacity }: { text: string; color: string; opacity: React.RefObject<THREE.SpriteMaterial | null> }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 72;
    const x = c.getContext("2d");
    if (x) {
      x.font = "500 30px ui-monospace, Menlo, Consolas, monospace";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillStyle = color;
      (x as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
      x.fillText(text, 256, 38);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, color]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <sprite position={[0, -1.25, 0]} scale={[2.6, 0.37, 1]}>
      <spriteMaterial ref={opacity} map={tex} transparent depthWrite={false} depthTest={false} />
    </sprite>
  );
}

function Portal({ index, slug, hue, label, selected, hovered, onHover, onSelect, reduced }: { index: number; slug: ExperimentSlug; hue: string; label: string; selected: boolean; hovered: boolean; onHover: (v: boolean) => void; onSelect: () => void; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const tag = useRef<THREE.SpriteMaterial>(null);
  const wp = useMemo(() => new THREE.Vector3(), []);
  const a = (index / 6) * TAU;
  const pos = useMemo(() => new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R), [a]);
  const Emblem = EMBLEMS[slug];
  useFrame(({ clock, camera }, dt) => {
    if (!g.current) return;
    const k = Math.min(1, dt * 7);
    const s = selected ? 1.3 : hovered ? 1.14 : 1;
    g.current.scale.setScalar(g.current.scale.x + (s - g.current.scale.x) * k);
    g.current.position.y = reduced ? 0 : Math.sin(clock.elapsedTime * 0.9 + index * 1.3) * 0.09;
    // Billboard: the gate always faces the viewer, so it can never turn edge-on and vanish.
    g.current.lookAt(camera.position);
    if (halo.current) halo.current.opacity += ((selected ? 0.3 : hovered ? 0.2 : 0.09) - halo.current.opacity) * k;
    if (beam.current) beam.current.opacity += ((selected ? 0.2 : hovered ? 0.12 : 0.05) - beam.current.opacity) * k;
    if (ring.current && !reduced) ring.current.rotation.z += dt * (selected ? 0.9 : 0.15);
    if (tag.current) {
      g.current.getWorldPosition(wp);
      tag.current.opacity = wp.z > 0 ? (selected || hovered ? 1 : 0.75) : 0;
    }
  });
  return (
    <group position={pos}>
      {/* teleporter pad + light column */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.69, 0]}>
        <ringGeometry args={[0.55, 0.62, 48]} />
        <meshBasicMaterial color={hue} transparent opacity={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.69, 0]}>
        <circleGeometry args={[0.55, 48]} />
        <meshBasicMaterial color={hue} transparent opacity={0.12} depthWrite={false} blending={ADD} />
      </mesh>
      <mesh position={[0, -0.85, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 1.7, 32, 1, true]} />
        <meshBasicMaterial ref={beam} color={hue} transparent opacity={0.05} depthWrite={false} blending={ADD} side={THREE.DoubleSide} />
      </mesh>
      <group ref={g}>
        <mesh
          onClick={(e) => {
            if (e.delta > 6) return;
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
          <circleGeometry args={[0.85, 40]} />
          <meshBasicMaterial ref={halo} color={hue} transparent opacity={0.09} depthWrite={false} blending={ADD} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <torusGeometry args={[0.8, 0.028, 12, 80]} />
          <meshBasicMaterial color={hue} />
        </mesh>
        <mesh ref={ring}>
          <torusGeometry args={[0.92, 0.008, 6, 90, TAU * 0.78]} />
          <meshBasicMaterial color={hue} transparent opacity={0.75} />
        </mesh>
        <Emblem hue={hue} active={selected || hovered} reduced={reduced} />
        <LabelSprite text={`${String(index + 1).padStart(2, "0")} · ${label}`} color={hue} opacity={tag} />
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ world */

function Core({ reduced }: { reduced: boolean }) {
  const rings = useRef<THREE.Mesh[]>([]);
  const inner = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    if (reduced) return;
    rings.current.forEach((m, i) => m && (m.rotation[(["x", "y", "z"] as const)[i]] += dt * (0.5 + i * 0.3)));
    inner.current?.scale.setScalar(1 + Math.sin(clock.elapsedTime * 1.8) * 0.07);
  });
  return (
    <group>
      <mesh ref={inner}>
        <icosahedronGeometry args={[0.38, 2]} />
        <meshBasicMaterial color="#d9fff8" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.95, 32, 32]} />
        <meshBasicMaterial color="#7be0d0" transparent opacity={0.06} depthWrite={false} blending={ADD} />
      </mesh>
      {[0.62, 0.78, 0.94].map((r, i) => (
        <mesh key={r} ref={(m) => void (m && (rings.current[i] = m))} rotation={[i * 1.1, i * 0.7, 0]}>
          <torusGeometry args={[r, 0.008, 6, 90]} />
          <meshBasicMaterial color="#7be0d0" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Beams({ reduced }: { reduced: boolean }) {
  const pulses = useRef<THREE.Mesh[]>([]);
  const geo = useMemo(() => {
    const p: number[] = [];
    for (let i = 0; i < 6; i++) p.push(0, 0, 0, Math.cos((i / 6) * TAU) * R, 0, Math.sin((i / 6) * TAU) * R);
    return new Float32Array(p);
  }, []);
  useFrame(({ clock }) => {
    pulses.current.forEach((m, i) => {
      if (!m) return;
      const k = reduced ? 0.5 : (clock.elapsedTime * 0.35 + i * 0.17) % 1;
      const a = (i / 6) * TAU;
      m.position.set(Math.cos(a) * R * k, 0, Math.sin(a) * R * k);
      m.scale.setScalar(Math.sin(k * Math.PI) + 0.2);
    });
  });
  return (
    <group>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geo, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#7be0d0" transparent opacity={0.16} />
      </lineSegments>
      {EXPERIMENTS.map((e, i) => (
        <mesh key={e.slug} ref={(m) => void (m && (pulses.current[i] = m))}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshBasicMaterial color={e.hue} transparent opacity={0.95} blending={ADD} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Floor({ lowPower, reduced }: { lowPower: boolean; reduced: boolean }) {
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!pulse.current || reduced) return;
    const k = (clock.elapsedTime * 0.28) % 1;
    pulse.current.scale.setScalar(0.3 + k * 3.2);
    (pulse.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.35;
  });
  return (
    <group position={[0, -1.7, 0]}>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[2.3, 2.34, 128]} />
        <meshBasicMaterial color="#7be0d0" transparent opacity={0.3} depthWrite={false} blending={ADD} />
      </mesh>
      <gridHelper args={[26, lowPower ? 26 : 52, "#2e5a57", "#12202a"]} />
      {[2, 3.6, 5.4, 7.6].map((r, i) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <ringGeometry args={[r - 0.012, r + 0.012, 128]} />
          <meshBasicMaterial color="#7be0d0" transparent opacity={0.28 - i * 0.05} />
        </mesh>
      ))}
    </group>
  );
}

function Stars({ count, pointer }: { count: number; pointer: THREE.Vector2 }) {
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 14;
      const th = Math.random() * TAU;
      a[i * 3] = Math.cos(th) * r;
      a[i * 3 + 1] = (Math.random() - 0.35) * 12;
      a[i * 3 + 2] = Math.sin(th) * r;
    }
    return a;
  }, [count]);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.012;
    ref.current.position.x += (pointer.x * 0.5 - ref.current.position.x) * 0.03;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#aab8cc" transparent opacity={0.6} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** Drag-to-rotate ring, camera that dollies to the selected portal, gentle pointer parallax. */
function Rig({ selected, reduced, children }: { selected: ExperimentSlug | null; reduced: boolean; children: React.ReactNode }) {
  const ring = useRef<THREE.Group>(null);
  const { camera, gl, pointer } = useThree();
  const st = useRef({ rot: 0, vel: 0, dragging: false, lastX: 0 });
  const look = useRef(new THREE.Vector3());
  const goal = useRef(new THREE.Vector3());
  const lookGoal = useRef(new THREE.Vector3());

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      st.current.dragging = true;
      st.current.lastX = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!st.current.dragging) return;
      const dx = e.clientX - st.current.lastX;
      st.current.lastX = e.clientX;
      st.current.rot += dx * 0.006;
      st.current.vel = dx * 0.006;
    };
    const up = () => (st.current.dragging = false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = st.current;
    const idx = selected ? EXPERIMENTS.findIndex((e) => e.slug === selected) : -1;
    if (idx >= 0 && !s.dragging) {
      const target = (idx / 6) * TAU - Math.PI / 2;
      let d = target - s.rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.rot += d * Math.min(1, dt * 4);
    } else if (!s.dragging) {
      s.rot += s.vel;
      s.vel *= 0.94;
      if (!reduced && Math.abs(s.vel) < 0.0006) s.rot += dt * 0.08;
    }
    if (ring.current) ring.current.rotation.y = s.rot;
    const focus = idx >= 0;
    const k = reduced ? 1 : 1 - Math.pow(0.02, dt);
    goal.current.set(pointer.x * 0.7, focus ? 0.7 + pointer.y * 0.25 : 2.6 + pointer.y * 0.5, focus ? 8.2 : 10.2);
    camera.position.lerp(goal.current, k);
    lookGoal.current.set(0, focus ? 0 : -0.35, focus ? R * 0.55 : 0);
    look.current.lerp(lookGoal.current, k);
    camera.lookAt(look.current);
  });
  return <group ref={ring}>{children}</group>;
}

export default function LabScene({ selected, onSelect, hovered, onHover, lowPower, reduced }: { selected: ExperimentSlug | null; onSelect: (s: ExperimentSlug | null) => void; hovered: ExperimentSlug | null; onHover: (s: ExperimentSlug | null) => void; lowPower: boolean; reduced: boolean }) {
  const { pointer } = useThree();
  return (
    <>
      <Floor lowPower={lowPower} reduced={reduced} />
      <Stars count={lowPower ? 160 : 420} pointer={pointer} />
      <Rig selected={selected} reduced={reduced}>
        <Core reduced={reduced} />
        <Beams reduced={reduced} />
        {EXPERIMENTS.map((e, i) => (
          <Portal key={e.slug} index={i} slug={e.slug} hue={e.hue} label={e.shortDomain} selected={selected === e.slug} hovered={hovered === e.slug} onHover={(v) => onHover(v ? e.slug : null)} onSelect={() => onSelect(selected === e.slug ? null : e.slug)} reduced={reduced} />
        ))}
      </Rig>
    </>
  );
}

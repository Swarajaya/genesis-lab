"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import SceneFrame from "@/components/3d/SceneFrame";
import type { Capabilities } from "@/hooks/useCapabilities";
import LiveNetworkSvg from "./LiveNetworkSvg";
import { NODE_COLOR, slotPosition, type LiveNetworkProps, type LiveNode } from "./liveLayout";

const damp = THREE.MathUtils.damp;
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const UP = new THREE.Vector3(0, 1, 0);
const flowGeo = new THREE.SphereGeometry(0.035, 8, 8);
const nodeGeo = new THREE.IcosahedronGeometry(1, 2);
const labelCache = new Map<string, THREE.CanvasTexture>();

function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}|${color}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 72;
  const g = c.getContext("2d")!;
  g.font = "600 30px ui-monospace, Menlo, Consolas, monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0,0,0,0.9)";
  g.shadowBlur = 8;
  g.fillStyle = color;
  g.fillText(text, 160, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, t);
  return t;
}

function Label({ text, color, y }: { text: string; color: string; y: number }) {
  const tex = useMemo(() => labelTexture(text, color), [text, color]);
  return (
    <sprite position={[0, y, 0]} scale={[1.15, 0.26, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

/** Hub = the emergency. Colour and pulse speed follow severity (shortage of critical units). */
function Hub({ severity, reduced }: { severity: number; reduced: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const color = useMemo(() => new THREE.Color("#7be0d0"), []);
  const target = useMemo(() => new THREE.Color(), []);
  const sev = useRef(0);
  useFrame(({ clock }, dt) => {
    sev.current = damp(sev.current, severity, 2.5, dt);
    target.set("#7be0d0").lerp(new THREE.Color("#f2c260"), Math.min(1, sev.current * 2)).lerp(new THREE.Color("#ff6b7a"), Math.max(0, sev.current * 2 - 1));
    color.lerp(target, 0.08);
    const t = clock.elapsedTime;
    const speed = reduced ? 0 : 1 + sev.current * 2.2;
    if (core.current) {
      const s = 0.48 + (reduced ? 0 : Math.sin(t * 2 * speed) * 0.035 * (1 + sev.current));
      core.current.scale.setScalar(s);
      core.current.rotation.y = t * 0.3;
    }
    if (coreMat.current) {
      coreMat.current.color.copy(color);
      coreMat.current.emissive.copy(color);
      coreMat.current.emissiveIntensity = 0.7 + sev.current * 0.7;
    }
    if (ringA.current) {
      ringA.current.rotation.z = t * 0.35 * speed;
      (ringA.current.material as THREE.MeshBasicMaterial).color.copy(color);
    }
    if (ringB.current) {
      ringB.current.rotation.x = Math.PI / 2.4 + t * 0.2 * speed;
      (ringB.current.material as THREE.MeshBasicMaterial).color.copy(color);
    }
  });
  return (
    <group>
      <mesh ref={core} geometry={nodeGeo}>
        <meshStandardMaterial ref={coreMat} color="#7be0d0" emissive="#7be0d0" emissiveIntensity={0.7} roughness={0.35} metalness={0.2} flatShading />
      </mesh>
      <mesh ref={ringA} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.95, 0.012, 8, 96]} />
        <meshBasicMaterial color="#7be0d0" transparent opacity={0.55} />
      </mesh>
      <mesh ref={ringB}>
        <torusGeometry args={[1.18, 0.008, 8, 96]} />
        <meshBasicMaterial color="#7be0d0" transparent opacity={0.3} />
      </mesh>
      <pointLight intensity={2.2} distance={7} color="#7be0d0" />
    </group>
  );
}

interface NodeProps {
  node: LiveNode;
  slot: number;
  bornAt: number;
  selected: boolean;
  hovered: boolean;
  highlighted: boolean;
  reduced: boolean;
  onSelect: LiveNetworkProps["onSelect"];
  onHover: LiveNetworkProps["onHover"];
  burst: LiveNetworkProps["burst"];
}

function Node({ node, slot, bornAt, selected, hovered, highlighted, reduced, onSelect, onHover, burst }: NodeProps) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Mesh>(null);
  const edge = useRef<THREE.Mesh>(null);
  const edgeMat = useRef<THREE.MeshBasicMaterial>(null);
  const flows = useRef<Array<THREE.Mesh | null>>([]);
  const color = useMemo(() => new THREE.Color(NODE_COLOR[node.state]), [node.state]);
  const cur = useMemo(() => new THREE.Color(NODE_COLOR[node.state]), []); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = slotPosition(slot, node.distanceKm);
  const offline = node.state === "offline";
  const radiusFactor = useRef(1);
  const scale = useRef(0);
  const op = useRef(1);
  const size = 0.1 + 0.07 * Math.min(1, Math.sqrt(node.units / 6)) + (node.state === "live" ? 0.04 : 0);
  const flowing = node.committed > 0 && !offline;

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const age = t - bornAt;
    const intro = Math.min(1, Math.max(0, age / 0.9));
    radiusFactor.current = damp(radiusFactor.current, offline ? 1.18 : 1, 2.2, dt);
    scale.current = damp(scale.current, (offline ? 0.72 : 1) * (selected ? 1.35 : hovered ? 1.2 : 1) * (highlighted && !reduced ? 1 + Math.sin(t * 7) * 0.12 : 1), 6, dt);
    op.current = damp(op.current, offline ? 0.35 : 1, 3, dt);
    cur.lerp(color, 0.1);
    const s = size * scale.current * (intro < 1 ? Math.max(0.001, easeOutBack(intro)) : 1);
    const rf = radiusFactor.current * (intro < 1 ? 0.55 + 0.45 * intro : 1);
    if (root.current) root.current.position.set(pos.x * rf, pos.y + (reduced || offline ? 0 : Math.sin(t * 0.9 + slot) * 0.04), pos.z * rf);
    if (body.current) body.current.scale.setScalar(s);
    if (mat.current) {
      mat.current.color.copy(cur);
      mat.current.emissive.copy(cur);
      mat.current.emissiveIntensity = (offline ? 0.1 : 0.55) + (selected || highlighted ? 0.55 : 0);
      mat.current.opacity = op.current;
    }
    if (halo.current) {
      const pulse = highlighted || selected ? 1 + ((t * 1.4) % 1) * 1.2 : intro < 1 ? 1 + intro * 2 : 1;
      halo.current.visible = highlighted || selected || intro < 1;
      halo.current.scale.setScalar(size * 2.1 * pulse);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = (highlighted || selected ? 0.5 : 0.35 * (1 - intro)) * (highlighted || selected ? 1 - ((t * 1.4) % 1) : 1);
      halo.current.lookAt(0, 6, 8);
    }
    // edge (hub -> node)
    if (edge.current && edgeMat.current) {
      const p = root.current!.position;
      const len = p.length();
      edge.current.position.copy(p).multiplyScalar(0.5);
      edge.current.scale.set(1, Math.max(0.001, len), 1);
      edge.current.quaternion.setFromUnitVectors(UP, p.clone().normalize());
      edgeMat.current.color.copy(cur);
      edgeMat.current.opacity = (offline ? 0.06 : flowing || selected || highlighted ? 0.5 : 0.16) * Math.min(1, intro * 1.3);
    }
    // flow particles donor -> hub
    flows.current.forEach((m, i) => {
      if (!m) return;
      m.visible = flowing && !reduced;
      if (!m.visible) return;
      const f = ((t * 0.35 + i / 3) % 1);
      m.position.copy(root.current!.position).multiplyScalar(1 - f);
      m.scale.setScalar(0.6 + Math.sin(f * Math.PI) * 0.8);
    });
  });

  const isBurst = burst?.code === node.code;
  return (
    <>
      <mesh ref={edge} frustumCulled={false}>
        <cylinderGeometry args={[0.006, 0.006, 1, 6, 1, true]} />
        <meshBasicMaterial ref={edgeMat} color={NODE_COLOR[node.state]} transparent opacity={0.2} depthWrite={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => void (flows.current[i] = m)} geometry={flowGeo} visible={false} frustumCulled={false}>
          <meshBasicMaterial color={NODE_COLOR[node.state]} toneMapped={false} />
        </mesh>
      ))}
      <group ref={root}>
        <mesh
          ref={body}
          geometry={nodeGeo}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(node.code);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = "";
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.delta > 6) return;
            onSelect(selected ? null : node.code);
          }}
        >
          <meshStandardMaterial ref={mat} color={NODE_COLOR[node.state]} emissive={NODE_COLOR[node.state]} emissiveIntensity={0.55} roughness={0.4} metalness={0.15} transparent flatShading />
        </mesh>
        <mesh ref={halo} visible={false}>
          <ringGeometry args={[0.9, 1, 40]} />
          <meshBasicMaterial color={NODE_COLOR[node.state]} transparent opacity={0.4} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {(selected || hovered || node.state === "live" || highlighted || isBurst) && <Label text={node.code} color={node.state === "live" ? "#d9c6ff" : "#e8edf5"} y={size * 2.6 + 0.16} />}
        {(selected || hovered || node.state === "live") && <Label text={`${node.group} · ${node.units}u`} color="#9aa5b8" y={-size * 2.6 - 0.12} />}
      </group>
    </>
  );
}

/** DONOR -> BLOOD UNIT -> PATIENT. A unit travels from the donor to the hub with a short trail, then the hub flashes. */
function Burst({ burst, nodes, slots, reduced }: { burst: NonNullable<LiveNetworkProps["burst"]>; nodes: LiveNode[]; slots: Map<string, number>; reduced: boolean }) {
  const parts = useRef<Array<THREE.Mesh | null>>([]);
  const flash = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  const node = nodes.find((n) => n.code === burst.code);
  const slot = slots.get(burst.code) ?? 0;
  const from = useMemo(() => {
    const p = slotPosition(slot, node?.distanceKm ?? 6);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, [slot, node?.distanceKm]);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const age = clock.elapsedTime - start.current;
    const dur = reduced ? 0.01 : 1.6;
    parts.current.forEach((m, i) => {
      if (!m) return;
      const f = Math.min(1, Math.max(0, (age - i * 0.07) / dur));
      const e = f * f * (3 - 2 * f);
      m.position.copy(from).multiplyScalar(1 - e);
      m.position.y += Math.sin(e * Math.PI) * 0.55;
      m.visible = f > 0 && f < 1;
      m.scale.setScalar(i === 0 ? 1.6 : 1.1 - i * 0.14);
    });
    if (flash.current) {
      const k = Math.min(1, Math.max(0, (age - dur) / 0.7));
      flash.current.visible = k > 0 && k < 1;
      flash.current.scale.setScalar(0.8 + k * 2.2);
      (flash.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.8;
      flash.current.lookAt(0, 6, 8);
    }
  });
  return (
    <group>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} ref={(m) => void (parts.current[i] = m)} geometry={flowGeo} frustumCulled={false}>
          <meshBasicMaterial color={i === 0 ? "#ffffff" : "#ff8c99"} toneMapped={false} transparent opacity={1 - i * 0.15} />
        </mesh>
      ))}
      <mesh ref={flash} visible={false}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial color="#ffd3d8" transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Particles({ count }: { count: number }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = (i * 2.399) % (Math.PI * 2);
      const r = 2 + ((i * 0.6180339) % 1) * 5;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = ((i * 0.37) % 1) * 4 - 1.6;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);
  const ref = useRef<THREE.Points>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.012;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.02} color="#9fb6d6" transparent opacity={0.45} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function Floor() {
  return (
    <group position={[0, -0.9, 0]}>
      {[1.6, 2.7, 3.8].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.006, r + 0.006, 128]} />
          <meshBasicMaterial color="#7be0d0" transparent opacity={0.1} />
        </mesh>
      ))}
    </group>
  );
}

/** Drag to rotate with inertia, slow idle drift, and a smooth dolly toward the selected donor. */
function Rig({ children, selectedAngle, reduced }: { children: React.ReactNode; selectedAngle: number | null; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const vel = useRef(0);
  const yaw = useRef(0);
  const dragging = useRef(false);
  const last = useRef(0);
  const gl = useThree((s) => s.gl);
  const look = useMemo(() => new THREE.Vector3(), []);
  const goal = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      dragging.current = true;
      last.current = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      vel.current = (e.clientX - last.current) * 0.006;
      yaw.current += vel.current;
      last.current = e.clientX;
    };
    const up = () => (dragging.current = false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);
  useFrame(({ camera, pointer }, dt) => {
    if (!dragging.current) {
      vel.current = damp(vel.current, 0, 3, dt);
      if (selectedAngle !== null) {
        // rotate so the selected node faces the camera (+z)
        const target = Math.PI / 2 - selectedAngle;
        let diff = ((target - yaw.current + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (diff < -Math.PI) diff += Math.PI * 2;
        yaw.current += diff * Math.min(1, dt * 2.4);
      } else yaw.current += vel.current + (reduced ? 0 : dt * 0.06);
    }
    if (group.current) group.current.rotation.y = yaw.current;
    goal.set(pointer.x * 0.5, (selectedAngle !== null ? 2.4 : 3.3) + pointer.y * 0.3, selectedAngle !== null ? 5.2 : 7.4);
    camera.position.x = damp(camera.position.x, goal.x, 2, dt);
    camera.position.y = damp(camera.position.y, goal.y, 2, dt);
    camera.position.z = damp(camera.position.z, goal.z, 2, dt);
    look.set(0, selectedAngle !== null ? -0.1 : 0, selectedAngle !== null ? 1.2 : 0);
    camera.lookAt(look);
  });
  return <group ref={group}>{children}</group>;
}

function Scene({ nodes, selected, hovered, onSelect, onHover, highlight, burst, severity, reduced, lowPower }: LiveNetworkProps & { reduced: boolean; lowPower: boolean }) {
  const slots = useRef(new Map<string, number>());
  const born = useRef(new Map<string, number>());
  const clock = useThree((s) => s.clock);
  nodes.forEach((n) => {
    if (!slots.current.has(n.code)) {
      slots.current.set(n.code, slots.current.size);
      born.current.set(n.code, born.current.size === 0 && clock.elapsedTime < 1.5 ? clock.elapsedTime - 1 : clock.elapsedTime);
    }
  });
  const selNode = selected ? nodes.find((n) => n.code === selected) : null;
  const selAngle = selNode ? slotPosition(slots.current.get(selNode.code) ?? 0, selNode.distanceKm).angle : null;
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={0.9} />
      <Floor />
      <Particles count={lowPower ? 60 : 140} />
      <Rig selectedAngle={selAngle} reduced={reduced}>
        <Hub severity={severity} reduced={reduced} />
        {nodes.map((n) => (
          <Node
            key={n.code}
            node={n}
            slot={slots.current.get(n.code) ?? 0}
            bornAt={born.current.get(n.code) ?? 0}
            selected={selected === n.code}
            hovered={hovered === n.code}
            highlighted={highlight.includes(n.code)}
            reduced={reduced}
            onSelect={onSelect}
            onHover={onHover}
            burst={burst}
          />
        ))}
        {burst && <Burst key={burst.key} burst={burst} nodes={nodes} slots={slots.current} reduced={reduced} />}
      </Rig>
    </>
  );
}

export default function LiveScene(props: LiveNetworkProps & { caps: Capabilities }) {
  const { caps, ...rest } = props;
  return (
    <SceneFrame caps={caps} label="Live blood network: donors orbiting an emergency hub" camera={{ position: [0, 3.3, 7.4], fov: 42 }} className="h-full w-full" fallback={<LiveNetworkSvg {...rest} />}>
      <Scene {...rest} reduced={caps.reducedMotion} lowPower={caps.lowPower} />
    </SceneFrame>
  );
}

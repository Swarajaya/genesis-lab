"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import SceneFrame from "@/components/3d/SceneFrame";
import type { Capabilities } from "@/hooks/useCapabilities";
import NetworkSvg from "./NetworkSvg";
import { computeLayout, RECIPIENT_COLOR, VERDICT_COLOR, type NetworkProps, type NodeLayout } from "./layout";

const SCALE = 2.6;
const UP = new THREE.Vector3(0, 1, 0);

function Edge({ n, active, animate }: { n: NodeLayout; active: boolean; animate: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const { pos, quat, len } = useMemo(() => {
    const to = new THREE.Vector3(n.x * SCALE, n.y * SCALE, n.z * SCALE);
    const l = to.length();
    return { pos: to.clone().multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, to.clone().normalize()), len: l };
  }, [n.x, n.y, n.z]);
  const dim = n.verdict === "INCOMPATIBLE";
  const radius = dim ? 0.004 : 0.004 + (n.score / 100) * 0.016;
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const base = active ? 0.9 : dim ? 0.15 : 0.35;
    mat.current.opacity = animate && !active && !dim ? base + 0.22 * Math.sin(clock.elapsedTime * 2 + n.phase) : base;
  });
  return (
    <mesh position={pos} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, len, 6, 1, true]} />
      <meshBasicMaterial ref={mat} color={VERDICT_COLOR[n.verdict]} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  );
}

function Donor({ n, active, selected, animate, onSelect, onHover }: { n: NodeLayout; active: boolean; selected: boolean; animate: boolean } & Pick<NetworkProps, "onSelect" | "onHover">) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const color = VERDICT_COLOR[n.verdict];
  const r = n.size * SCALE * 1.15;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      const k = animate ? 1 : 0;
      group.current.position.set(n.x * SCALE + Math.sin(t * 0.5 + n.phase) * 0.05 * k, n.y * SCALE + Math.cos(t * 0.4 + n.phase) * 0.05 * k, n.z * SCALE);
      const target = active ? 1.3 : 1;
      group.current.scale.setScalar(animate ? THREE.MathUtils.lerp(group.current.scale.x, target, 0.15) : target);
    }
    if (halo.current) halo.current.scale.setScalar(1 + (animate ? 0.18 * Math.sin(t * 2.2 + n.phase) : 0) + (selected ? 0.25 : 0));
  });
  const dim = n.verdict === "INCOMPATIBLE";
  return (
    <group
      ref={group}
      position={[n.x * SCALE, n.y * SCALE, n.z * SCALE]}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        onHover(n.code);
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(n.code);
      }}
    >
      <mesh ref={halo}>
        <sphereGeometry args={[r * 2, 20, 20]} />
        <meshBasicMaterial color={color} transparent opacity={dim ? 0.05 : 0.13} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[r, 28, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={dim ? 0.25 : 0.9} roughness={0.35} transparent opacity={dim ? 0.6 : 1} />
      </mesh>
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 1.7, 0.012, 8, 40]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
    </group>
  );
}

function Recipient({ animate }: { animate: boolean }) {
  const core = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (core.current) core.current.scale.setScalar(animate ? 1 + 0.1 * Math.sin(clock.elapsedTime * 2.6) : 1);
  });
  return (
    <group>
      <mesh ref={core}>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color={RECIPIENT_COLOR} emissive={RECIPIENT_COLOR} emissiveIntensity={1} roughness={0.3} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.45, 24, 24]} />
        <meshBasicMaterial color={RECIPIENT_COLOR} transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Network({ ranking, selected, hovered, onSelect, onHover, animate }: NetworkProps & { animate: boolean }) {
  const root = useRef<THREE.Group>(null);
  const nodes = useMemo(() => computeLayout(ranking), [ranking]);
  useFrame(({ clock }) => {
    if (root.current && animate) {
      root.current.rotation.y = Math.sin(clock.elapsedTime * 0.15) * 0.3;
      root.current.rotation.x = Math.sin(clock.elapsedTime * 0.12) * 0.12;
    }
  });
  return (
    <group ref={root}>
      <Recipient animate={animate} />
      {nodes.map((n) => (
        <Edge key={`e-${n.code}`} n={n} active={n.code === selected || n.code === hovered} animate={animate} />
      ))}
      {nodes.map((n) => (
        <Donor key={n.code} n={n} animate={animate} active={n.code === selected || n.code === hovered} selected={n.code === selected} onSelect={onSelect} onHover={onHover} />
      ))}
    </group>
  );
}

export default function BloodScene(props: NetworkProps & { caps: Capabilities }) {
  const { caps, ...net } = props;
  return (
    <SceneFrame
      caps={caps}
      className="h-full w-full"
      camera={{ position: [0, 0, 7.2], fov: 45 }}
      label="Interactive 3D donor compatibility network. A keyboard-accessible list of the same donors is below."
      fallback={<NetworkSvg {...net} />}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[3, 4, 6]} intensity={40} />
      <pointLight position={[-4, -3, 3]} intensity={14} color="#7be0d0" />
      <Network {...net} animate={!caps.reducedMotion} />
    </SceneFrame>
  );
}

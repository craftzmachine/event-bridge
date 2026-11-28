// The floor plan in 3D (WebGL, three.js through @react-three/fiber), as a viewer: tables with linens and
// centrepieces, chairs, stage, mandap, dance floor, counters, walls. Chairs and furniture are instanced so a
// 300-table plan stays smooth. Camera presets (overview, top, from the entrance, from the stage) and a walk mode.
// Lazy-loaded with three.js only when someone opens 3D. Nothing is fetched from outside the site.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LayoutItem, VenueLayout } from "../../types";
import { buildScene, HEIGHTS, type Paint, type Part, type Scene3D } from "../../lib/layout3d";
import { saveBlob } from "../../lib/files";
import type { Tone } from "./PlanCanvas";

const PAINT: Record<Paint, { color: string; roughness: number; metalness?: number }> = {
  linen: { color: "#f6f0e4", roughness: 0.9 },
  gold: { color: "#c3a46e", roughness: 0.35, metalness: 0.6 },
  stage: { color: "#6e2f2a", roughness: 0.8 },
  carpet: { color: "#8c3b34", roughness: 1 },
  wood: { color: "#6b4a33", roughness: 0.7 },
  dark: { color: "#2a2522", roughness: 0.6 },
  floral: { color: "#e9b9b0", roughness: 0.9 },
  wall: { color: "#e6dfd3", roughness: 0.95 },
  dance: { color: "#ffffff", roughness: 0.25 },
};
const TONE_COLOR: Record<Tone, string> = { gold: "#c3a46e", ink2: "#5b6f8a", taupe: "#9aa38b", stone: "#a59a8e" };

type Preset = "overview" | "top" | "entrance" | "stage" | "walk";

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function Plan3D({ layout, title, seatTone, seatName }: {
  layout: VenueLayout;
  title: string;
  seatTone?: (it: LayoutItem, seat: number) => Tone | undefined;
  seatName?: (it: LayoutItem, seat: number) => string | undefined;
}) {
  const scene = useMemo(() => buildScene(layout), [layout]);
  const [preset, setPreset] = useState<Preset>("overview");
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const gl = useRef<THREE.WebGLRenderer | null>(null);
  const items = useMemo(() => new Map(layout.items.map((i) => [i.id, i])), [layout.items]);
  const ok = useMemo(hasWebGL, []);
  // stable, so hovering a chair (which re-renders for the name tip) doesn't rebuild every chair
  const toneOf = useCallback((c: Scene3D["chairs"][number]) => {
    const it = items.get(c.itemId);
    return it && seatTone ? seatTone(it, c.seat) : undefined;
  }, [items, seatTone]);

  if (!ok)
    return (
      <div className="grid h-80 place-items-center rounded-lg border border-line bg-paper-2 p-6 text-center text-sm text-ink-2">
        This browser can't show 3D (WebGL is turned off or not supported). The 2D plan has everything you need.
      </div>
    );

  const save = () => {
    gl.current?.domElement.toBlob((b) => b && saveBlob(b, `${title.replace(/[^\w-]+/g, "_") || "Plan"}_3D.png`), "image/png");
  };

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="3D views">
        {(["overview", "top", "entrance", "stage", "walk"] as Preset[]).map((p) => (
          <button key={p} type="button" aria-pressed={preset === p} onClick={() => setPreset(p)}
            className={`rounded-sm border border-solid px-3 py-1.5 text-sm ${preset === p ? "border-gold bg-gold-soft text-ink" : "border-line bg-card text-ink"}`}>
            {{ overview: "Overview", top: "Top", entrance: "From the entrance", stage: "From the stage", walk: "Walk" }[p]}
          </button>
        ))}
        <button type="button" className="btn-ghost btn-sm ml-auto" onClick={save}>⤓ Save image</button>
      </div>
      <div className="relative h-[min(72vh,640px)] min-h-[320px] overflow-hidden rounded-lg border border-line" style={{ background: "#1d1915", touchAction: "none" }}
        onPointerLeave={() => setTip(null)}>
        <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ fov: 50, near: 0.1, far: 1000 }}
          onCreated={({ gl: r }) => {
            gl.current = r;
            r.toneMapping = THREE.ACESFilmicToneMapping;
            r.outputColorSpace = THREE.SRGBColorSpace;
          }}>
          <color attach="background" args={["#1d1915"]} />
          <fog attach="fog" args={["#1d1915", Math.max(scene.w, scene.d) * 1.5, Math.max(scene.w, scene.d) * 4]} />
          <Lights scene={scene} />
          <Room scene={scene} />
          <Parts parts={scene.parts} />
          <Chairs scene={scene} tone={toneOf} onHover={seatName ? (i, e) => {
            const c = scene.chairs[i];
            const it = items.get(c.itemId);
            const name = it ? seatName(it, c.seat) : undefined;
            setTip(name ? { text: name, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY } : null);
          } : undefined} />
          <Labels scene={scene} />
          <Camera scene={scene} preset={preset} />
        </Canvas>
        {tip && <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-sm bg-espresso px-2 py-1 text-xs text-on-espresso" style={{ left: tip.x + 12, top: tip.y - 28 }}>{tip.text}</div>}
        <p className="pointer-events-none absolute bottom-2 left-3 m-0 text-xs text-[#cfc5b6]">
          {preset === "walk" ? "Drag to look around · W A S D or arrow keys to walk" : "Drag to orbit · right-drag to pan · scroll or pinch to zoom"}
        </p>
      </div>
    </div>
  );
}

function Lights({ scene }: { scene: Scene3D }) {
  const size = Math.max(scene.w, scene.d);
  const light = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.target.position.set(scene.w / 2, 0, scene.d / 2);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    cam.left = -size;
    cam.right = size;
    cam.top = size;
    cam.bottom = -size;
    cam.far = size * 4;
    cam.updateProjectionMatrix();
  }, [scene.w, scene.d, size]);
  return (
    <>
      <hemisphereLight args={["#fff4e0", "#3a2c22", 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight ref={light} position={[scene.w * 0.3, size * 1.2, scene.d * 0.2]} intensity={1.6} color="#fff1d6" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004} />
      {/* warm fill from the entrance side */}
      <pointLight position={[scene.w / 2, 4, scene.d]} intensity={size * 1.5} distance={size * 2} color="#ffd9a8" />
    </>
  );
}

function Room({ scene }: { scene: Scene3D }) {
  return (
    <group>
      {/* the venue floor and a darker surround */}
      <mesh rotation-x={-Math.PI / 2} position={[scene.w / 2, -0.01, scene.d / 2]} receiveShadow>
        <planeGeometry args={[scene.w * 3, scene.d * 3]} />
        <meshStandardMaterial color="#2b241e" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[scene.w / 2, 0, scene.d / 2]} receiveShadow>
        <planeGeometry args={[scene.w, scene.d]} />
        <meshStandardMaterial color="#d8ccb6" roughness={0.85} />
      </mesh>
      {/* a low skirting round the room's edge */}
      {[
        [scene.w / 2, 0, scene.w, 0.1],
        [scene.w / 2, scene.d, scene.w, 0.1],
        [0, scene.d / 2, 0.1, scene.d],
        [scene.w, scene.d / 2, 0.1, scene.d],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.15, z]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.3, d]} />
          <meshStandardMaterial color="#b9ab95" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 40);

/** all boxes and cylinders of one paint as one instanced mesh each */
function Parts({ parts }: { parts: Part[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, Part[]>();
    for (const p of parts) {
      if (p.paint === "dance") continue;
      const k = `${p.shape}|${p.paint}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [parts]);
  const dance = parts.filter((p) => p.paint === "dance");
  return (
    <>
      {groups.map(([k, list]) => <InstancedParts key={k} list={list} />)}
      {dance.map((p, i) => <DanceFloor key={i} p={p} />)}
    </>
  );
}

function InstancedParts({ list }: { list: Part[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const paint = PAINT[list[0].paint];
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
      const s = p.shape === "cyl" ? new THREE.Vector3(p.w, p.h, p.w) : new THREE.Vector3(p.w, p.h, p.d);
      m.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);
  return (
    <instancedMesh ref={ref} args={[list[0].shape === "cyl" ? CYL : BOX, undefined, list.length]} castShadow receiveShadow>
      <meshStandardMaterial color={paint.color} roughness={paint.roughness} metalness={paint.metalness ?? 0} />
    </instancedMesh>
  );
}

function DanceFloor({ p }: { p: Part }) {
  const tex = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#f3efe8";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#2d2925";
    g.fillRect(0, 0, 64, 64);
    g.fillRect(64, 64, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(p.w / 2, p.d / 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [p.w, p.d]);
  return (
    <mesh position={[p.x, p.y, p.z]} rotation-y={p.rotY} receiveShadow>
      <boxGeometry args={[p.w, p.h, p.d]} />
      <meshStandardMaterial map={tex} roughness={0.2} metalness={0.1} />
    </mesh>
  );
}

const SEAT = new THREE.BoxGeometry(0.44, 0.06, 0.42);
const BACK = new THREE.BoxGeometry(0.44, 0.46, 0.05);
const LEG = new THREE.CylinderGeometry(0.018, 0.018, HEIGHTS.chairSeat, 8);

function Chairs({ scene, tone, onHover }: { scene: Scene3D; tone: (c: Scene3D["chairs"][number]) => Tone | undefined; onHover?: (i: number, e: ThreeEvent<PointerEvent>) => void }) {
  const seat = useRef<THREE.InstancedMesh>(null);
  const back = useRef<THREE.InstancedMesh>(null);
  const legs = useRef<THREE.InstancedMesh>(null);
  const n = scene.chairs.length;
  useEffect(() => {
    if (!seat.current || !back.current || !legs.current || !n) return;
    const m = new THREE.Matrix4();
    const base = new THREE.Matrix4();
    const off = new THREE.Matrix4();
    const one = new THREE.Vector3(1, 1, 1);
    const col = new THREE.Color();
    scene.chairs.forEach((c, i) => {
      base.compose(new THREE.Vector3(c.x, 0, c.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rotY), one);
      seat.current!.setMatrixAt(i, m.multiplyMatrices(base, off.makeTranslation(0, HEIGHTS.chairSeat, 0)));
      back.current!.setMatrixAt(i, m.multiplyMatrices(base, off.makeTranslation(0, HEIGHTS.chairSeat + 0.26, -0.19)));
      [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(([lx, lz], k) =>
        legs.current!.setMatrixAt(i * 4 + k, m.multiplyMatrices(base, off.makeTranslation(lx, HEIGHTS.chairSeat / 2, lz))));
      const t = tone(c);
      seat.current!.setColorAt(i, col.set(t ? TONE_COLOR[t] : "#efe6d6"));
    });
    for (const mesh of [seat.current, back.current, legs.current]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    if (seat.current.instanceColor) seat.current.instanceColor.needsUpdate = true;
  }, [scene.chairs, tone, n]);
  if (!n) return null;
  return (
    <>
      <instancedMesh ref={seat} args={[SEAT, undefined, n]} castShadow receiveShadow
        onPointerMove={onHover ? (e) => { e.stopPropagation(); if (e.instanceId !== undefined) onHover(e.instanceId, e); } : undefined}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={back} args={[BACK, undefined, n]} castShadow receiveShadow>
        <meshStandardMaterial color="#c3a46e" roughness={0.4} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={legs} args={[LEG, undefined, n * 4]} castShadow>
        <meshStandardMaterial color="#c3a46e" roughness={0.4} metalness={0.5} />
      </instancedMesh>
    </>
  );
}

/** table numbers and zone names as sprites drawn on a canvas (no font downloads) */
function Labels({ scene }: { scene: Scene3D }) {
  const sprites = useMemo(
    () =>
      scene.labels.map((l) => {
        const cv = document.createElement("canvas");
        const g = cv.getContext("2d")!;
        const font = "600 48px Georgia, 'Times New Roman', serif";
        g.font = font;
        const w = l.badge ? 96 : Math.min(1024, Math.ceil(g.measureText(l.text).width) + 48);
        cv.width = w;
        cv.height = 96;
        g.font = font;
        g.textAlign = "center";
        g.textBaseline = "middle";
        if (l.badge) {
          g.fillStyle = "#c3a46e";
          g.beginPath();
          g.arc(48, 48, 44, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#ffffff";
        } else {
          g.fillStyle = "rgba(29,25,21,0.78)";
          g.beginPath();
          g.roundRect(0, 8, w, 80, 40);
          g.fill();
          g.fillStyle = "#f6f0e4";
        }
        g.fillText(l.text, w / 2, 50);
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        const h = l.badge ? 0.55 : 0.6;
        return { l, t, scale: [(w / 96) * h, h, 1] as [number, number, number] };
      }),
    [scene.labels],
  );
  return (
    <>
      {sprites.map(({ l, t, scale }, i) => (
        <sprite key={i} position={[l.x, l.y, l.z]} scale={scale}>
          <spriteMaterial map={t} depthWrite={false} transparent />
        </sprite>
      ))}
    </>
  );
}

/** orbit controls for the presets, or a first-person walk (drag to look, WASD / arrows to move) */
function Camera({ scene, preset }: { scene: Scene3D; preset: Preset }) {
  const { camera, gl } = useThree();
  const orbit = useRef<OrbitControls | null>(null);
  const walk = useRef({ yaw: 0, pitch: 0, keys: new Set<string>(), drag: null as null | { x: number; y: number } });

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.maxPolarAngle = Math.PI / 2 - 0.03;
    c.minDistance = 1.5;
    c.maxDistance = Math.max(scene.w, scene.d) * 3;
    orbit.current = c;
    return () => c.dispose();
  }, [camera, gl, scene.w, scene.d]);

  // move the camera when the preset changes
  useEffect(() => {
    const c = orbit.current;
    if (!c) return;
    const cx = scene.w / 2;
    const cz = scene.d / 2;
    const size = Math.max(scene.w, scene.d);
    c.enabled = preset !== "walk";
    const look = (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => {
      camera.position.set(px, py, pz);
      c.target.set(tx, ty, tz);
      camera.lookAt(tx, ty, tz);
      c.update();
    };
    if (preset === "overview") look(cx, size * 0.75, scene.d + size * 0.45, cx, 0, cz);
    else if (preset === "top") look(cx, size * 1.25, cz + 0.01, cx, 0, cz);
    else if (preset === "entrance") look(scene.entrance.x, 1.7, Math.min(scene.d + 1, scene.entrance.z + 1), scene.focus.x, 1.1, scene.focus.z);
    else if (preset === "stage") look(scene.focus.x, 2.4, scene.focus.z + 2, scene.entrance.x, 1, scene.entrance.z);
    else {
      camera.position.set(scene.entrance.x, 1.6, Math.min(scene.d - 0.5, scene.entrance.z - 0.5));
      const dx = scene.focus.x - camera.position.x;
      const dz = scene.focus.z - camera.position.z;
      walk.current.yaw = Math.atan2(-dx, -dz);
      walk.current.pitch = 0;
    }
  }, [preset, camera, scene]);

  // walk mode: drag to look, keys to move
  useEffect(() => {
    if (preset !== "walk") return;
    const el = gl.domElement;
    const w = walk.current;
    const down = (e: PointerEvent) => {
      w.drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!w.drag) return;
      w.yaw -= (e.clientX - w.drag.x) * 0.004;
      w.pitch = Math.max(-1.2, Math.min(1.2, w.pitch - (e.clientY - w.drag.y) * 0.004));
      w.drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      w.drag = null;
    };
    const key = (on: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
        if (on) w.keys.add(k);
        else w.keys.delete(k);
      }
    };
    const kd = key(true);
    const ku = key(false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      w.keys.clear();
    };
  }, [preset, gl]);

  useFrame((_, dt) => {
    if (preset !== "walk") {
      orbit.current?.update();
      return;
    }
    const w = walk.current;
    const speed = 3 * Math.min(dt, 0.05);
    const fx = -Math.sin(w.yaw);
    const fz = -Math.cos(w.yaw);
    let mx = 0;
    let mz = 0;
    if (w.keys.has("w") || w.keys.has("arrowup")) (mx += fx), (mz += fz);
    if (w.keys.has("s") || w.keys.has("arrowdown")) (mx -= fx), (mz -= fz);
    if (w.keys.has("a") || w.keys.has("arrowleft")) (mx += fz), (mz -= fx);
    if (w.keys.has("d") || w.keys.has("arrowright")) (mx -= fz), (mz += fx);
    camera.position.x = Math.max(0.3, Math.min(scene.w - 0.3, camera.position.x + mx * speed));
    camera.position.z = Math.max(0.3, Math.min(scene.d - 0.3, camera.position.z + mz * speed));
    camera.position.y = 1.6;
    camera.rotation.set(w.pitch, w.yaw, 0, "YXZ");
  });
  return null;
}

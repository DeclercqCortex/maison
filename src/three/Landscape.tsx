import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { lotRect, lotSize, type Rect } from '../model/lot';
import type { Lot } from '../model/types';

/** Height of the ground where the house stands, a touch below the ground floor so the two never flicker. */
export const GROUND_Y = -0.06;

/** Small repeatable random generator, so the countryside looks the same every time. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Smooth rolling value between 0 and 1 for a point on the ground. */
function roll(x: number, z: number): number {
  const n =
    Math.sin(x * 0.013 + 1.3) * Math.cos(z * 0.011 - 0.4) * 0.55 +
    Math.sin(x * 0.031 + z * 0.027) * 0.3 +
    Math.sin(z * 0.052 - x * 0.019 + 2.1) * 0.15;
  return n * 0.5 + 0.5;
}

/**
 * Height of the ground. The lot and a margin around it are level, so the house
 * and garden sit flat; beyond that the land rises into gentle hills.
 */
export function groundHeight(x: number, z: number, lot: Lot): number {
  const { width, depth } = lotSize(lot);
  const flat = Math.hypot(width, depth) / 2 + 20;
  const r = Math.hypot(x - lot.centre.x, z - lot.centre.y);
  const t = Math.min(1, Math.max(0, (r - flat) / 140));
  const blend = t * t * (3 - 2 * t);
  return GROUND_Y + blend * roll(x, z) * 20;
}

/** The grassland: one big sheet of ground, level near the house and hilly in the distance. */
export function Terrain({ lot }: { lot: Lot }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1800, 1800, 220, 220);
    g.rotateX(-Math.PI / 2);
    g.translate(lot.centre.x, 0, lot.centre.y);
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const lush = new THREE.Color('#6f9a4d');
    const dry = new THREE.Color('#9aa25a');
    const deep = new THREE.Color('#587f3f');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const [x, z] = [pos.getX(i), pos.getZ(i)];
      pos.setY(i, groundHeight(x, z, lot));
      // Patches of lusher and drier grass, so the land does not look like a flat green sheet.
      const patch = roll(x * 2.3 + 40, z * 2.1 - 17);
      c.copy(lush).lerp(patch > 0.5 ? dry : deep, Math.abs(patch - 0.5) * 1.3);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [lot]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors roughness={1} />
    </mesh>
  );
}

const GRASS_AREA = 80; // metres across: the patch of blades that travels with the view
const GRASS_TUFTS = 140000;
const MAX_HOLES = 24;

const grassVertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCentre;
  uniform float uArea;
  uniform vec4 uHouse;
  uniform vec4 uHoles[${MAX_HOLES}];
  attribute vec3 offset;
  attribute float seed;
  varying float vHeight;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    // Tufts are scattered once, then wrapped around wherever the view is centred,
    // so there is always grass underfoot without drawing the whole lot.
    vec2 base = mod(offset.xz - uCentre.xz + uArea * 0.5, uArea) - uArea * 0.5 + uCentre.xz;
    float fromCentre = distance(base, uCentre.xz);
    float size = (0.45 + seed * 0.55) * smoothstep(uArea * 0.5, uArea * 0.36, fromCentre);
    // No grass inside the house, or on patios, paths and ponds.
    if (base.x > uHouse.x && base.x < uHouse.z && base.y > uHouse.y && base.y < uHouse.w) size = 0.0;
    for (int i = 0; i < ${MAX_HOLES}; i++) {
      if (uHoles[i].z > 0.0 && distance(base, uHoles[i].xy) < uHoles[i].z) size = 0.0;
    }
    float turn = seed * 6.2832;
    vec3 p = position;
    p.xz = vec2(p.x * cos(turn) - p.z * sin(turn), p.x * sin(turn) + p.z * cos(turn));
    p *= size;
    // Wind: the tips sway, the roots stay put.
    float sway = sin(uTime * 1.6 + base.x * 0.35 + base.y * 0.22 + seed * 6.0) * 0.5
               + sin(uTime * 0.7 + base.x * 0.08) * 0.5;
    p.x += sway * 0.09 * position.y * position.y * size * 2.0;
    vec4 mvPosition = modelViewMatrix * vec4(base.x + p.x, ${GROUND_Y.toFixed(2)} + p.y, base.y + p.z, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vHeight = position.y / 0.42;
    vShade = 0.8 + seed * 0.4;
    #include <fog_vertex>
  }
`;

const grassFragment = /* glsl */ `
  uniform float uLight;
  varying float vHeight;
  varying float vShade;
  #include <fog_pars_fragment>
  void main() {
    vec3 root = vec3(0.16, 0.30, 0.10);
    vec3 tip = vec3(0.50, 0.68, 0.26);
    gl_FragColor = vec4(mix(root, tip, vHeight) * vShade * uLight, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** One tuft: three thin blades fanned out. */
function tuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const [dx, dz] = [Math.cos(a) * 0.028, Math.sin(a) * 0.028];
    const lean = [Math.cos(a + 1.3) * 0.06, Math.sin(a + 1.3) * 0.06];
    positions.push(-dx, 0, -dz, dx, 0, dz, lean[0], 0.42, lean[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

/**
 * Blades of grass that sway in the wind. They are drawn only around where the
 * camera is looking; the green ground underneath carries on into the distance.
 */
export function Grass(props: {
  /** Area with no grass: the outside of the house on the plan. */
  house: Rect | null;
  /** Circles with no grass (x, z, radius): patios, paths, ponds. */
  holes: [number, number, number][];
  /** 1 in full daylight, lower at night. */
  light: number;
  /** Draw fewer blades, for slower computers. */
  sparse: boolean;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', tuftGeometry().getAttribute('position'));
    const random = seeded(2024);
    const offsets = new Float32Array(GRASS_TUFTS * 3);
    const seeds = new Float32Array(GRASS_TUFTS);
    for (let i = 0; i < GRASS_TUFTS; i++) {
      offsets[i * 3] = random() * GRASS_AREA;
      offsets[i * 3 + 2] = random() * GRASS_AREA;
      seeds[i] = random();
    }
    g.setAttribute('offset', new THREE.InstancedBufferAttribute(offsets, 3));
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 1));
    g.instanceCount = GRASS_TUFTS;
    return g;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: grassVertex,
        fragmentShader: grassFragment,
        side: THREE.DoubleSide,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uTime: { value: 0 },
            uCentre: { value: new THREE.Vector3() },
            uArea: { value: GRASS_AREA },
            uLight: { value: 1 },
            uHouse: { value: new THREE.Vector4(0, 0, 0, 0) },
            uHoles: { value: Array.from({ length: MAX_HOLES }, () => new THREE.Vector4()) },
          },
        ]),
      }),
    [],
  );
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);

  useLayoutEffect(() => {
    geometry.instanceCount = props.sparse ? Math.round(GRASS_TUFTS * 0.35) : GRASS_TUFTS;
  }, [geometry, props.sparse]);

  useLayoutEffect(() => {
    const u = material.uniforms;
    u.uLight.value = props.light;
    const h = props.house;
    if (h) u.uHouse.value.set(h.minX, h.minY, h.maxX, h.maxY);
    else u.uHouse.value.set(0, 0, 0, 0);
    (u.uHoles.value as THREE.Vector4[]).forEach((v, i) => {
      const hole = props.holes[i];
      v.set(hole?.[0] ?? 0, hole?.[1] ?? 0, hole?.[2] ?? 0, 0);
    });
  }, [material, props.house, props.holes, props.light]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    // Keep the grass centred on what the camera orbits around.
    const target = (state.controls as { target?: THREE.Vector3 } | null)?.target;
    if (target) material.uniforms.uCentre.value.copy(target);
  });

  // The blades move in the shader, so the usual off-screen test would wrongly hide them.
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

/** Scattered trees on the hills around the lot, to give the land some depth. */
export function DistantTrees({ lot }: { lot: Lot }) {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);
  const trees = useMemo(() => {
    const random = seeded(77);
    const { width, depth } = lotSize(lot);
    const inner = Math.hypot(width, depth) / 2 + 8;
    const list: { x: number; z: number; size: number; tone: number }[] = [];
    for (let tries = 0; tries < 6000 && list.length < 420; tries++) {
      const angle = random() * Math.PI * 2;
      const r = inner + random() * random() * 620;
      const [x, z] = [lot.centre.x + Math.cos(angle) * r, lot.centre.y + Math.sin(angle) * r];
      // Trees gather in clumps and hedgerows rather than being spread evenly.
      if (roll(x * 3.1 + 9, z * 2.7 - 4) < 0.56) continue;
      list.push({ x, z, size: 0.75 + random() * 0.9, tone: random() });
    }
    return list;
  }, [lot]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    trees.forEach((t, i) => {
      const y = groundHeight(t.x, t.z, lot);
      m.compose(new THREE.Vector3(t.x, y + 1.5 * t.size, t.z), q, new THREE.Vector3(t.size, t.size, t.size));
      trunks.current?.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, y + 4.6 * t.size, t.z), q, new THREE.Vector3(t.size, t.size * (0.9 + t.tone * 0.5), t.size));
      crowns.current?.setMatrixAt(i, m);
      crowns.current?.setColorAt(i, color.setHSL(0.26 + t.tone * 0.06, 0.38, 0.24 + t.tone * 0.1));
    });
    for (const mesh of [trunks.current, crowns.current]) {
      if (!mesh) continue;
      mesh.count = trees.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [trees, lot]);

  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, 420]} frustumCulled={false}>
        <cylinderGeometry args={[0.22, 0.3, 3, 6]} />
        <meshStandardMaterial color="#5b4636" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, 420]} frustumCulled={false}>
        <icosahedronGeometry args={[2.6, 1]} />
        <meshStandardMaterial roughness={1} flatShading />
      </instancedMesh>
    </>
  );
}

/** A post-and-rail fence around the edge of the lot. */
export function LotFence({ lot }: { lot: Lot }) {
  const posts = useRef<THREE.InstancedMesh>(null);
  const rect = useMemo(() => lotRect(lot), [lot]);
  const { width, depth } = lotSize(lot);
  const spots = useMemo(() => {
    const list: [number, number][] = [];
    const along = (from: [number, number], to: [number, number]) => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const n = Math.max(1, Math.round(len / 2.5));
      for (let i = 0; i < n; i++) list.push([from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);
    };
    const [a, b, c, d]: [number, number][] = [
      [rect.minX, rect.minY], [rect.maxX, rect.minY], [rect.maxX, rect.maxY], [rect.minX, rect.maxY],
    ];
    along(a, b);
    along(b, c);
    along(c, d);
    along(d, a);
    return list;
  }, [rect]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => posts.current?.setMatrixAt(i, m.makeTranslation(x, GROUND_Y + 0.6, z)));
    if (posts.current) {
      posts.current.count = spots.length;
      posts.current.instanceMatrix.needsUpdate = true;
    }
  }, [spots]);

  const [cx, cz] = [lot.centre.x, lot.centre.y];
  const rails = [0.45, 0.95].flatMap((y) => [
    { key: `n${y}`, position: [cx, GROUND_Y + y, rect.minY], size: [width, 0.08, 0.04] },
    { key: `s${y}`, position: [cx, GROUND_Y + y, rect.maxY], size: [width, 0.08, 0.04] },
    { key: `w${y}`, position: [rect.minX, GROUND_Y + y, cz], size: [0.04, 0.08, depth] },
    { key: `e${y}`, position: [rect.maxX, GROUND_Y + y, cz], size: [0.04, 0.08, depth] },
  ]) as { key: string; position: [number, number, number]; size: [number, number, number] }[];

  return (
    <>
      {/* Remounted when the number of posts changes, since its capacity is fixed at creation. */}
      <instancedMesh key={spots.length} ref={posts} args={[undefined, undefined, spots.length]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.1, 1.2, 0.1]} />
        <meshStandardMaterial color="#8a6f52" roughness={1} />
      </instancedMesh>
      {rails.map((r) => (
        <mesh key={r.key} position={r.position} castShadow>
          <boxGeometry args={r.size} />
          <meshStandardMaterial color="#9a7d5d" roughness={1} />
        </mesh>
      ))}
    </>
  );
}

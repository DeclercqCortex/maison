import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EMPIRE_STATE_FOOTPRINT, type CityBox, type CityPlan } from '../model/city';
import { GROUND_Y, mergeCopies } from './Landscape';

/** Size of one window bay on a facade picture: 8 bays across and 8 floors up per picture. */
const BAY = 3.2;
const STOREY = 3.6;
const CELLS = 8;

/** Pavement top, a kerb's height above the road. */
const KERB = GROUND_Y + 0.15;
const ROAD = GROUND_Y - 0.2;

/** Facade pictures: the wall with its windows, and which windows are lit at night. Drawn once. */
let facades: { masonry: THREE.Texture; masonryGlow: THREE.Texture; glass: THREE.Texture; glassGlow: THREE.Texture } | null = null;
function facadeTextures() {
  if (facades) return facades;
  const size = 512;
  const cell = size / CELLS;
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const canvas = (draw: (g: CanvasRenderingContext2D) => void, color: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const lit: boolean[] = Array.from({ length: CELLS * CELLS }, () => random() < 0.32);
  const warmth = Array.from({ length: CELLS * CELLS }, () => random());
  // Brick or stone: a pale wall (tinted per building) with a dark punched window in each bay.
  const masonry = canvas((g) => {
    g.fillStyle = '#ece8e0';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < CELLS; r++)
      for (let c = 0; c < CELLS; c++) {
        const shade = 40 + Math.floor(warmth[r * CELLS + c] * 25);
        g.fillStyle = `rgb(${shade}, ${shade + 10}, ${shade + 22})`;
        g.fillRect(c * cell + cell * 0.24, r * cell + cell * 0.2, cell * 0.52, cell * 0.56);
      }
  }, true);
  const masonryGlow = canvas((g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < CELLS; r++)
      for (let c = 0; c < CELLS; c++) {
        if (!lit[r * CELLS + c]) continue;
        const w = warmth[r * CELLS + c];
        g.fillStyle = w > 0.8 ? '#cfe2ff' : `rgb(255, ${200 + Math.floor(w * 40)}, ${120 + Math.floor(w * 60)})`;
        g.fillRect(c * cell + cell * 0.24, r * cell + cell * 0.2, cell * 0.52, cell * 0.56);
      }
  }, true);
  // Glass curtain wall: panes between thin mullions, with a band at each floor.
  const glass = canvas((g) => {
    g.fillStyle = '#c3d0d8';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#6d7a84';
    for (let r = 0; r < CELLS; r++) g.fillRect(0, r * cell, size, cell * 0.16);
    for (let c = 0; c < CELLS; c++) g.fillRect(c * cell, 0, cell * 0.06, size);
  }, true);
  const glassGlow = canvas((g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < CELLS; r++)
      for (let c = 0; c < CELLS; c++) {
        if (!lit[(r * CELLS + c + 11) % lit.length]) continue;
        g.fillStyle = warmth[(r * CELLS + c + 11) % warmth.length] > 0.5 ? '#9fb0d0' : '#c9a878';
        g.fillRect(c * cell + cell * 0.06, r * cell + cell * 0.16, cell * 0.94, cell * 0.84);
      }
  }, true);
  facades = { masonry, masonryGlow, glass, glassGlow };
  return facades;
}

/** Collects boxes into one geometry whose facade pictures are measured in metres, so windows keep their size. */
class BoxBatch {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private colors: number[] = [];

  private quad(corners: number[][], normal: number[], uv: number[][], color: THREE.Color) {
    for (const k of [0, 1, 2, 0, 2, 3]) {
      this.positions.push(...corners[k]);
      this.normals.push(...normal);
      this.uvs.push(...uv[k]);
      // Four channels (colour plus full opacity): the ray tracer reads vertex colours that way.
      this.colors.push(color.r, color.g, color.b, 1);
    }
  }

  add(b: CityBox, tint: string | THREE.Color) {
    const color = new THREE.Color(tint);
    const [x0, x1, z0, z1, y0, y1] = [b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, b.y, b.y + b.h];
    const u = (m: number) => m / (BAY * CELLS);
    const v = (m: number) => m / (STOREY * CELLS);
    // Each side, counter-clockwise seen from outside.
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[u(x0), v(y0)], [u(x1), v(y0)], [u(x1), v(y1)], [u(x0), v(y1)]], color);
    this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[u(-x1), v(y0)], [u(-x0), v(y0)], [u(-x0), v(y1)], [u(-x1), v(y1)]], color);
    this.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[u(-z1), v(y0)], [u(-z0), v(y0)], [u(-z0), v(y1)], [u(-z1), v(y1)]], color);
    this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[u(z0), v(y0)], [u(z1), v(y0)], [u(z1), v(y1)], [u(z0), v(y1)]], color);
    // The roof takes a plain corner of the picture, with no window.
    const roof = [0.01, 0.01];
    this.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [roof, roof, roof, roof], color.clone().multiplyScalar(0.8));
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 4));
    g.computeBoundingSphere();
    return g;
  }
}

type Copy = Parameters<typeof mergeCopies>[1][number];
const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string): Copy => ({
  position: [x, y, z], scale: [w, h, d], color: new THREE.Color(color),
});
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** Frees generated geometries when they are replaced. */
function useDispose(list: (THREE.BufferGeometry | THREE.Material)[]) {
  useEffect(() => () => list.forEach((g) => g.dispose()), [list]);
}

/** Facade materials whose windows light up as night falls. */
function useFacadeMaterials(night: number) {
  const materials = useMemo(() => {
    const t = facadeTextures();
    return {
      masonry: new THREE.MeshStandardMaterial({ map: t.masonry, emissiveMap: t.masonryGlow, emissive: '#ffffff', vertexColors: true, roughness: 0.85 }),
      glass: new THREE.MeshStandardMaterial({ map: t.glass, emissiveMap: t.glassGlow, emissive: '#ffffff', vertexColors: true, roughness: 0.2, metalness: 0.35 }),
    };
  }, []);
  useDispose(useMemo(() => [materials.masonry, materials.glass], [materials]));
  // Lights come on in the evening, a few at first and then most of them.
  const glow = Math.max(0, Math.min(1, (night - 0.3) / 0.5)) * 1.3;
  materials.masonry.emissiveIntensity = glow;
  materials.glass.emissiveIntensity = glow * 0.6;
  return materials;
}

/** The streets, blocks, towers, park and river around the apartment. */
export function City({ plan, night }: { plan: CityPlan; night: number }) {
  const materials = useFacadeMaterials(night);
  const geometry = useMemo(() => {
    const masonry = new BoxBatch();
    const glass = new BoxBatch();
    for (const b of plan.buildings) for (const part of b.boxes) (b.kind === 'glass' ? glass : masonry).add({ ...part, y: part.y + KERB }, b.tint);

    const pavements = mergeCopies(
      UNIT_BOX,
      plan.blocks.map((r) => box((r.minX + r.maxX) / 2, (KERB + ROAD) / 2, (r.minY + r.maxY) / 2, r.maxX - r.minX, KERB - ROAD, r.maxY - r.minY, '#b7b4ac')),
    );
    const { extent } = plan;
    const markings = mergeCopies(
      UNIT_BOX,
      plan.avenues.flatMap((x) => [
        box(x - 0.18, ROAD + 0.03, (extent.minY + extent.maxY) / 2, 0.15, 0.04, extent.maxY - extent.minY, '#e3b62f'),
        box(x + 0.18, ROAD + 0.03, (extent.minY + extent.maxY) / 2, 0.15, 0.04, extent.maxY - extent.minY, '#e3b62f'),
      ]),
    );
    // Cars: a body and a cabin, pointing along their street.
    const cars = mergeCopies(
      UNIT_BOX,
      plan.cars.flatMap((c) => {
        const [w, d] = c.along === 'z' ? [1.9, 4.6] : [4.6, 1.9];
        const [cw, cd] = c.along === 'z' ? [1.7, 2.4] : [2.4, 1.7];
        return [box(c.x, ROAD + 0.65, c.z, w, 0.8, d, c.color), box(c.x, ROAD + 1.35, c.z, cw, 0.65, cd, '#2a3038')];
      }),
    );
    const tanks = plan.buildings.filter((b) => b.waterTower).map((b) => b.waterTower!);
    const tankBodies = mergeCopies(
      new THREE.CylinderGeometry(1.6, 1.6, 3.2, 10),
      tanks.map((t) => ({ position: [t.x, KERB + t.y + 3.4, t.z], scale: [1, 1, 1], color: new THREE.Color('#6b4f3a') })),
    );
    const tankRoofs = mergeCopies(
      new THREE.ConeGeometry(1.75, 1.3, 10),
      tanks.map((t) => ({ position: [t.x, KERB + t.y + 5.65, t.z], scale: [1, 1, 1], color: new THREE.Color('#4a3a2e') })),
    );
    const tankLegs = mergeCopies(
      UNIT_BOX,
      tanks.flatMap((t) => [
        box(t.x - 1, KERB + t.y + 0.9, t.z - 1, 0.18, 1.8, 0.18, '#3b3f45'),
        box(t.x + 1, KERB + t.y + 0.9, t.z - 1, 0.18, 1.8, 0.18, '#3b3f45'),
        box(t.x - 1, KERB + t.y + 0.9, t.z + 1, 0.18, 1.8, 0.18, '#3b3f45'),
        box(t.x + 1, KERB + t.y + 0.9, t.z + 1, 0.18, 1.8, 0.18, '#3b3f45'),
      ]),
    );
    const park = plan.park;
    const trunks = mergeCopies(
      new THREE.CylinderGeometry(0.25, 0.35, 3, 6),
      plan.parkTrees.map((t) => ({ position: [t.x, KERB + 1.5 * t.size, t.z], scale: [t.size, t.size, t.size], color: new THREE.Color('#5b4636') })),
    );
    const crowns = mergeCopies(
      new THREE.IcosahedronGeometry(3.4, 1),
      plan.parkTrees.map((t, i) => ({
        position: [t.x, KERB + 5.4 * t.size, t.z],
        scale: [t.size, t.size, t.size],
        color: new THREE.Color().setHSL(0.25 + (i % 7) * 0.01, 0.4, 0.22 + (i % 5) * 0.025),
      })),
    );
    return {
      masonry: masonry.build(), glass: glass.build(), pavements, markings, cars, tankBodies, tankRoofs, tankLegs, trunks, crowns,
      parkCentre: [(park.minX + park.maxX) / 2, (park.minY + park.maxY) / 2] as const,
      parkSize: [park.maxX - park.minX, park.maxY - park.minY] as const,
    };
  }, [plan]);
  useDispose(
    useMemo(
      () => [geometry.masonry, geometry.glass, geometry.pavements, geometry.markings, geometry.cars, geometry.tankBodies,
        geometry.tankRoofs, geometry.tankLegs, geometry.trunks, geometry.crowns],
      [geometry],
    ),
  );

  const { extent, home, shore, pond } = plan;
  const roadWidth = extent.maxX - shore + 3000;
  return (
    <group>
      {/* Roads everywhere on land; the blocks stand on them. */}
      <mesh rotation-x={-Math.PI / 2} position={[shore + roadWidth / 2, ROAD, (extent.minY + extent.maxY) / 2]} receiveShadow>
        <planeGeometry args={[roadWidth, extent.maxY - extent.minY + 6000]} />
        <meshStandardMaterial color="#45484d" roughness={0.95} />
      </mesh>
      {/* The apartment's own block: paved level with the ground floor, for the garden pieces. */}
      <mesh position={[(home.minX + home.maxX) / 2, GROUND_Y - 0.1, (home.minY + home.maxY) / 2]} receiveShadow>
        <boxGeometry args={[home.maxX - home.minX, 0.2, home.maxY - home.minY]} />
        <meshStandardMaterial color="#cdc9c0" roughness={0.9} />
      </mesh>
      <mesh geometry={geometry.pavements} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} />
      </mesh>
      <mesh geometry={geometry.markings}>
        <meshStandardMaterial vertexColors roughness={0.8} />
      </mesh>
      <mesh geometry={geometry.cars} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh geometry={geometry.masonry} material={materials.masonry} castShadow receiveShadow />
      <mesh geometry={geometry.glass} material={materials.glass} castShadow receiveShadow />
      <mesh geometry={geometry.tankBodies} castShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <mesh geometry={geometry.tankRoofs} castShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <mesh geometry={geometry.tankLegs}>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>

      {/* The park: lawns, groves of trees and a lake. */}
      <mesh position={[geometry.parkCentre[0], (KERB + ROAD) / 2, geometry.parkCentre[1]]} receiveShadow>
        <boxGeometry args={[geometry.parkSize[0], KERB - ROAD, geometry.parkSize[1]]} />
        <meshStandardMaterial color="#5e8c47" roughness={1} />
      </mesh>
      <mesh position={[pond.x, KERB + 0.02, pond.z]} scale={[pond.rx, 1, pond.rz]} receiveShadow>
        <cylinderGeometry args={[1, 1, 0.06, 40]} />
        <meshStandardMaterial color="#3d6f86" roughness={0.1} metalness={0.2} />
      </mesh>
      <mesh geometry={geometry.trunks} castShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <mesh geometry={geometry.crowns} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>

      {/* The river and the harbour, with a stone wall along the bank. */}
      <mesh rotation-x={-Math.PI / 2} position={[shore - 4000, GROUND_Y - 1.4, (extent.minY + extent.maxY) / 2]}>
        <planeGeometry args={[8000, extent.maxY - extent.minY + 6000]} />
        <meshStandardMaterial color="#2f5f78" roughness={0.12} metalness={0.25} />
      </mesh>
      <mesh position={[shore - 1, GROUND_Y - 0.7, (extent.minY + extent.maxY) / 2]}>
        <boxGeometry args={[2, 1.6, extent.maxY - extent.minY + 6000]} />
        <meshStandardMaterial color="#8d8a83" roughness={1} />
      </mesh>

      <EmpireStateBuilding x={plan.empireState.x} z={plan.empireState.z} night={night} material={materials.masonry} />
      <StatueOfLiberty x={plan.liberty.x} z={plan.liberty.z} island={plan.liberty.island} night={night}
        // She looks out toward the city.
        facing={Math.atan2(home.minX - plan.liberty.x, (home.minY + home.maxY) / 2 - plan.liberty.z)} />
    </group>
  );
}

/**
 * The Empire State Building (1931): a wide base, a slender shaft rising in
 * setbacks to the 86th-floor observatory, then the mast and the antenna,
 * 443 m in all. Lit at the top after dark.
 */
function EmpireStateBuilding({ x, z, night, material }: { x: number; z: number; night: number; material: THREE.Material }) {
  const body = useMemo(() => {
    const batch = new BoxBatch();
    const stone = '#d9d0bb';
    // [width, depth, height of top], each tier standing on the one below.
    const tiers: [number, number, number][] = [
      [EMPIRE_STATE_FOOTPRINT.w, EMPIRE_STATE_FOOTPRINT.d, 24],
      [100, 50, 82],
      [86, 46, 102],
      [72, 42, 122],
      [58, 38, 268],
      [50, 32, 296],
      [42, 28, 314],
      [34, 24, 326],
    ];
    let y = 0;
    for (const [w, d, top] of tiers) {
      batch.add({ x: 0, z: 0, w, d, y, h: top - y }, stone);
      y = top;
    }
    // Wings that step out from the shaft on the long sides, as on the real building.
    batch.add({ x: 0, z: 22, w: 30, d: 6, y: 122, h: 140 }, stone);
    batch.add({ x: 0, z: -22, w: 30, d: 6, y: 122, h: 140 }, stone);
    return batch.build();
  }, []);
  useDispose(useMemo(() => [body], [body]));
  const lit = Math.max(0, Math.min(1, (night - 0.3) / 0.4));
  const base = KERB;
  return (
    <group position={[x, base, z]}>
      <mesh geometry={body} material={material} castShadow receiveShadow />
      {/* The mast: an eight-sided crown of setbacks, then a domed top and the antenna. */}
      <mesh position-y={337} castShadow>
        <cylinderGeometry args={[9, 11, 22, 8]} />
        <meshStandardMaterial color="#e3dccb" emissive="#fff3d6" emissiveIntensity={lit * 0.9} roughness={0.7} />
      </mesh>
      <mesh position-y={355} castShadow>
        <cylinderGeometry args={[6.5, 8.5, 14, 8]} />
        <meshStandardMaterial color="#e3dccb" emissive="#ffffff" emissiveIntensity={lit * 1.1} roughness={0.7} />
      </mesh>
      <mesh position-y={368} castShadow>
        <cylinderGeometry args={[3, 6.5, 12, 8]} />
        <meshStandardMaterial color="#c9c3b5" emissive="#ffffff" emissiveIntensity={lit * 1.1} roughness={0.6} />
      </mesh>
      <mesh position-y={378} castShadow>
        <sphereGeometry args={[3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#b9b4aa" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position-y={411}>
        <cylinderGeometry args={[0.35, 1.4, 64, 8]} />
        <meshStandardMaterial color="#9aa0a6" roughness={0.4} metalness={0.7} />
      </mesh>
      <mesh position-y={444}>
        <sphereGeometry args={[1.2, 10, 8]} />
        <meshStandardMaterial color="#ff4a3a" emissive="#ff2a1a" emissiveIntensity={0.4 + lit * 2} />
      </mesh>
    </group>
  );
}

/** A cylinder running from one point to another, for arms and the torch. */
function Limb({ from, to, radius, material }: { from: THREE.Vector3; to: THREE.Vector3; radius: [number, number]; material: THREE.Material }) {
  const dir = to.clone().sub(from);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return (
    <mesh position={from.clone().add(to).multiplyScalar(0.5)} quaternion={quaternion} material={material} castShadow>
      <cylinderGeometry args={[radius[1], radius[0], dir.length(), 12]} />
    </mesh>
  );
}

/**
 * The Statue of Liberty (1886) on Liberty Island: the star-shaped walls of Fort
 * Wood, the granite pedestal, and the green copper figure in her robe, crown
 * of seven rays, torch raised in her right hand and tablet in her left. 93 m
 * from the ground to the tip of the torch.
 */
function StatueOfLiberty({ x, z, island, night, facing }: { x: number; z: number; island: number; night: number; facing: number }) {
  const parts = useMemo(() => {
    const copper = new THREE.MeshStandardMaterial({ color: '#6fa58b', roughness: 0.55, metalness: 0.15 });
    const granite = new THREE.MeshStandardMaterial({ color: '#c8bca3', roughness: 0.9 });
    // Fort Wood: an eleven-pointed star.
    const star = new THREE.Shape();
    for (let i = 0; i < 22; i++) {
      const r = i % 2 === 0 ? 42 : 30;
      const a = (i / 22) * Math.PI * 2;
      if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const fort = new THREE.ExtrudeGeometry(star, { depth: 8, bevelEnabled: false });
    fort.rotateX(-Math.PI / 2);
    // The robe, from the hem up to the shoulders, turned on a lathe.
    const robe = new THREE.LatheGeometry(
      [[6.4, 0], [6.8, 1.5], [5.6, 8], [4.7, 15], [4.2, 20], [4.5, 26], [4.8, 31], [3.8, 33], [1.6, 34.2], [0, 34.5]].map(
        ([r, y]) => new THREE.Vector2(r, y),
      ),
      28,
    );
    // The figure faces +z, so her right hand is toward -x.
    // Seven rays of the crown, fanned out across the front of the head.
    const rays = Array.from({ length: 7 }, (_, i) => {
      const a = ((i - 3) / 3) * 1.25;
      const dir = new THREE.Vector3(Math.sin(a), 0.55, Math.cos(a) * 0.9 + 0.1).normalize();
      return dir;
    });
    const merged = mergeGeometries([robe.toNonIndexed()], false);
    robe.dispose();
    return { copper, granite, fort, robe: merged!, rays };
  }, []);
  useDispose(useMemo(() => [parts.copper, parts.granite, parts.fort, parts.robe], [parts]));
  const glow = 0.6 + Math.max(0, night - 0.2) * 2.5;
  const S = 47.3; // the statue stands on top of the pedestal
  const v = (px: number, py: number, pz: number) => new THREE.Vector3(px, py, pz);
  return (
    <group position={[x, GROUND_Y - 1.4, z]} rotation-y={facing}>
      {/* The island, its lawns and the fort walls. */}
      <mesh position-y={0.8} receiveShadow>
        <cylinderGeometry args={[island, island + 6, 3, 40]} />
        <meshStandardMaterial color="#6f9a52" roughness={1} />
      </mesh>
      <mesh geometry={parts.fort} position-y={2.3} material={parts.granite} castShadow receiveShadow />
      {/* The pedestal: a broad base, the main block and its cornice. */}
      <mesh position-y={10.3 + 7} material={parts.granite} castShadow receiveShadow>
        <boxGeometry args={[26, 14, 26]} />
      </mesh>
      <mesh position-y={24.3 + 9} material={parts.granite} castShadow receiveShadow>
        <boxGeometry args={[19, 18, 19]} />
      </mesh>
      <mesh position-y={42.3 + 1.2} material={parts.granite} castShadow>
        <boxGeometry args={[21, 2.4, 21]} />
      </mesh>
      <mesh position-y={44.7 + 1.3} material={parts.granite} castShadow>
        <boxGeometry args={[16, 2.6, 16]} />
      </mesh>
      {/* The figure. */}
      <group position-y={S}>
        <mesh geometry={parts.robe} material={parts.copper} castShadow receiveShadow />
        <Limb from={v(0, 33.5, 0)} to={v(0, 35.5, 0.2)} radius={[1.3, 1.1]} material={parts.copper} />
        <mesh position={[0, 37, 0.4]} material={parts.copper} castShadow>
          <sphereGeometry args={[2.1, 18, 14]} />
        </mesh>
        <mesh position={[0, 38.2, 0.3]} rotation-x={Math.PI / 2} material={parts.copper}>
          <torusGeometry args={[2.1, 0.45, 8, 24]} />
        </mesh>
        {parts.rays.map((dir, i) => (
          <Limb key={i} from={v(0, 38.4, 0.3).addScaledVector(dir, 1.6)} to={v(0, 38.4, 0.3).addScaledVector(dir, 5.2)}
            radius={[0.45, 0.05]} material={parts.copper} />
        ))}
        {/* Right arm raised, holding the torch. */}
        <Limb from={v(-3.6, 31.5, 0)} to={v(-4.6, 39, 0.4)} radius={[1.3, 1.05]} material={parts.copper} />
        <Limb from={v(-4.6, 39, 0.4)} to={v(-5.4, 45.5, 0.6)} radius={[1.05, 0.85]} material={parts.copper} />
        <Limb from={v(-5.4, 45.5, 0.6)} to={v(-5.6, 48, 0.65)} radius={[0.6, 0.75]} material={parts.copper} />
        <mesh position={[-5.6, 48.5, 0.65]} material={parts.copper} castShadow>
          <cylinderGeometry args={[1.5, 1.0, 1.1, 16]} />
        </mesh>
        <mesh position={[-5.6, 50.4, 0.65]}>
          <coneGeometry args={[1.25, 2.8, 14]} />
          <meshStandardMaterial color="#e8b84a" emissive="#ffc75a" emissiveIntensity={glow} roughness={0.3} metalness={0.6} />
        </mesh>
        {/* Left arm bent, holding the tablet against her side. */}
        <Limb from={v(3.6, 31, 0)} to={v(4.8, 24.5, 1)} radius={[1.2, 1]} material={parts.copper} />
        <mesh position={[4.6, 22, 1.6]} rotation={[0.15, 0, -0.22]} material={parts.copper} castShadow>
          <boxGeometry args={[2.8, 7, 0.9]} />
        </mesh>
      </group>
    </group>
  );
}

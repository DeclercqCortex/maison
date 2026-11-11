import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DEFAULT_WALL_COLOR, floorMaterial } from '../catalog/materials';
import type { Feature, Floor, Opening, Vec2, Wall } from '../model/types';
import { add, dist, lerp, normalize, pointInPolygon, scale, sub } from '../model/geometry';
import { SLAB } from '../model/floors';
import { detectRooms, roomLabel } from '../model/rooms';
import { featureToPlan, stairBoxes, stairOutline } from '../model/stairs';
import { touchesOtherWall } from '../plan/wallShape';
import { buildSlabGeometry, buildWallGeometry, paintWallFaces } from './geometry';
import { ItemModel } from './Items';

/** Thickness of the visible floor surface laid on top of the structural slab. */
export const FINISH = 0.04;

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
const MATERIALS = {
  // Walls are white and tinted per face through vertex colours, so each room can have its own paint.
  wall: mat('#ffffff', { vertexColors: true }),
  plaster: mat(DEFAULT_WALL_COLOR),
  slab: mat('#d8d5cd'),
  frame: mat('#fbfaf7', { roughness: 0.6 }),
  door: mat('#8b5e3c', { roughness: 0.6 }),
  glass: mat('#a9d4ee', { transparent: true, opacity: 0.35, roughness: 0.1 }),
  stairs: mat('#b99a6f', { roughness: 0.7 }),
  stone: mat('#9a948a'),
  soot: mat('#2a2725'),
};

const NO_OPENINGS: Opening[] = [];
const rad = (degrees: number): number => (degrees * Math.PI) / 180;

/** Frees a generated geometry's GPU memory when it is replaced or removed. */
function useDisposable<T extends THREE.BufferGeometry>(geometry: T): T {
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** Position and turn for anything attached to a wall: x along the wall, y up, z out of its `side: 1` face. */
function wallFrame(wall: Wall, along: number): { position: [number, number, number]; rotation: [number, number, number] } {
  const d = sub(wall.b, wall.a);
  const p = lerp(wall.a, wall.b, along / (dist(wall.a, wall.b) || 1));
  return { position: [p.x, 0, p.y], rotation: [0, -Math.atan2(d.y, d.x), 0] };
}

/**
 * Cutaway: while the camera is outside a wall (the wall stands between it and
 * the middle of the floor), `apply(true)` is called so the wall can drop out of
 * the way. Checked every frame, so walls rise and fall as the view turns.
 */
function useCutaway(wall: Wall, centre: Vec2 | null, apply: (down: boolean) => void) {
  const state = useRef<boolean | null>(null);
  useFrame(({ camera }) => {
    let down = false;
    if (centre) {
      const mid = lerp(wall.a, wall.b, 0.5);
      const outward = sub(mid, centre);
      const toCamera = { x: camera.position.x - mid.x, y: camera.position.z - mid.y };
      // Walls close to the middle of the floor are partitions, not outside walls: leave them up.
      down = Math.hypot(outward.x, outward.y) > 0.75 && outward.x * toCamera.x + outward.y * toCamera.y > 0;
    }
    if (down !== state.current) {
      state.current = down;
      apply(down);
    }
  });
}

/** How much of a wall's height is left standing when it is cut away. */
const STUB = 0.05;

/** One wall. Memoised, so editing the plan only rebuilds the walls that actually changed. */
const WallMesh = memo(function WallMesh(props: {
  wall: Wall;
  openings: Opening[];
  extendStart: boolean;
  extendEnd: boolean;
  /** Extra height, so outside walls run unbroken past the slab between floors. */
  extraHeight: number;
  cutaway: Vec2 | null;
  /** Paint on the wall's `side: 1` face and on its opposite face. */
  front: string;
  back: string;
}) {
  const { wall, openings, extendStart, extendEnd, extraHeight, front, back } = props;
  const geometry = useDisposable(
    useMemo(() => {
      const g = buildWallGeometry(dist(wall.a, wall.b), wall.height + extraHeight, wall.thickness, extendStart, extendEnd, openings);
      paintWallFaces(g, front, back, DEFAULT_WALL_COLOR);
      return g;
    }, [wall, openings, extendStart, extendEnd, extraHeight, front, back]),
  );
  const mesh = useRef<THREE.Mesh>(null);
  useCutaway(wall, props.cutaway, (down) => {
    if (!mesh.current) return;
    mesh.current.scale.y = down ? STUB : 1;
    mesh.current.castShadow = !down;
  });
  return <mesh ref={mesh} geometry={geometry} material={MATERIALS.wall} castShadow receiveShadow {...wallFrame(wall, 0)} />;
});

function Slab(props: { outline: Vec2[]; holes: Vec2[][]; thickness: number; y: number; material: THREE.Material }) {
  const { outline, holes, thickness } = props;
  const geometry = useDisposable(
    useMemo(() => {
      // A hole is only cut if it lies wholly inside this slab.
      const inside = holes.filter((h) => h.every((p) => pointInPolygon(p, outline)));
      return buildSlabGeometry(outline, inside, thickness);
    }, [outline, holes, thickness]),
  );
  return <mesh geometry={geometry} material={props.material} position-y={props.y} castShadow receiveShadow />;
}

const FRAME = 0.05;

/** Frame, door leaf and glass for one opening. An archway is just the hole in the wall. */
function OpeningModel({ opening: o, wall, cutaway }: { opening: Opening; wall: Wall; cutaway: Vec2 | null }) {
  const group = useRef<THREE.Group>(null);
  // A door or window disappears along with its wall.
  useCutaway(wall, cutaway, (down) => {
    if (group.current) group.current.visible = !down;
  });
  if (o.type === 'archway') return null;
  const w = Math.min(o.width, dist(wall.a, wall.b));
  const h = Math.min(o.height, wall.height - 0.05 - o.sill);
  const depth = wall.thickness + 0.02;
  const frame = wallFrame(wall, o.offset);
  const side = (x: number, key: string) => (
    <mesh key={key} position={[x, o.sill + h / 2, 0]} material={MATERIALS.frame} castShadow>
      <boxGeometry args={[FRAME, h, depth]} />
    </mesh>
  );
  const rail = (y: number, key: string) => (
    <mesh key={key} position={[0, y, 0]} material={MATERIALS.frame} castShadow>
      <boxGeometry args={[w, FRAME, depth]} />
    </mesh>
  );
  if (o.type === 'window') {
    return (
      <group ref={group} {...frame}>
        {side(-w / 2 + FRAME / 2, 'l')}
        {side(w / 2 - FRAME / 2, 'r')}
        {rail(o.sill + FRAME / 2, 'b')}
        {rail(o.sill + h - FRAME / 2, 't')}
        <mesh position={[0, o.sill + h / 2, 0]} material={MATERIALS.frame}>
          <boxGeometry args={[0.03, h - 2 * FRAME, 0.04]} />
        </mesh>
        <mesh position={[0, o.sill + h / 2, 0]} material={MATERIALS.glass}>
          <boxGeometry args={[w - 2 * FRAME, h - 2 * FRAME, 0.01]} />
        </mesh>
      </group>
    );
  }
  // The leaf hangs from one jamb and stands ajar toward the side it opens to.
  const leaf = w - 2 * FRAME;
  const direction = o.hingeAtB ? -1 : 1;
  return (
    <group ref={group} {...frame}>
      {side(-w / 2 + FRAME / 2, 'l')}
      {side(w / 2 - FRAME / 2, 'r')}
      {rail(h - FRAME / 2, 't')}
      <group position={[-direction * (w / 2 - FRAME), 0, 0]} rotation={[0, -direction * o.side * rad(30), 0]}>
        <mesh position={[(direction * leaf) / 2, (h - FRAME) / 2, 0]} material={MATERIALS.door} castShadow>
          <boxGeometry args={[leaf, h - FRAME, 0.04]} />
        </mesh>
      </group>
    </group>
  );
}

function FeatureModel({ feature: f, wallHeight }: { feature: Feature; wallHeight: number }) {
  const boxes = useMemo(
    () => (f.type === 'stairs' ? stairBoxes(f, wallHeight + SLAB) : []),
    [f.type, f.width, f.depth, f.shape, wallHeight],
  );
  const place = { position: [f.at.x, 0, f.at.y] as [number, number, number], rotation: [0, -rad(f.rotation), 0] as [number, number, number] };
  if (f.type === 'stairs') {
    return (
      <group {...place}>
        {boxes.map((b, i) => (
          <mesh key={i} position={[b.x, (b.top + b.bottom) / 2, b.y]} rotation={[0, -rad(b.angle), 0]}
            material={MATERIALS.stairs} castShadow receiveShadow>
            <boxGeometry args={[b.sizeX, b.top - b.bottom, b.sizeY]} />
          </mesh>
        ))}
      </group>
    );
  }
  if (f.type === 'column') {
    return (
      <mesh position={[f.at.x, wallHeight / 2, f.at.y]} rotation={place.rotation} material={MATERIALS.plaster} castShadow receiveShadow>
        <boxGeometry args={[f.width, wallHeight, f.depth]} />
      </mesh>
    );
  }
  // Fireplace: a stone surround with a dark firebox on its open (+z) face and a chimney breast above.
  const mantel = Math.min(1.15, wallHeight * 0.45);
  const jamb = Math.min(0.2, f.width * 0.15);
  return (
    <group {...place}>
      <mesh position-y={mantel / 2} material={MATERIALS.stone} castShadow receiveShadow>
        <boxGeometry args={[f.width, mantel, f.depth]} />
      </mesh>
      <mesh position={[0, mantel * 0.36, f.depth / 2]} material={MATERIALS.soot}>
        <boxGeometry args={[f.width - 2 * jamb, mantel * 0.72, 0.02]} />
      </mesh>
      <mesh position-y={(mantel + wallHeight) / 2} material={MATERIALS.plaster} castShadow receiveShadow>
        <boxGeometry args={[f.width * 0.75, wallHeight - mantel, f.depth * 0.8]} />
      </mesh>
    </group>
  );
}

const stairHoles = (features: Feature[] | undefined): Vec2[][] =>
  (features ?? []).filter((f) => f.type === 'stairs').map((f) => stairOutline(f).map((p) => featureToPlan(f, p)));

/**
 * Everything on one floor, built from the same data the plan editor draws.
 * `ceiling` adds the slab above the rooms (used when the whole house is shown).
 */
export const FloorModel = memo(function FloorModel(props: {
  floor: Floor;
  below?: Floor;
  ceiling: boolean;
  /** Middle of the floor on the plan, to cut away the walls nearest the camera; null to leave all walls up. */
  cutaway: Vec2 | null;
  selectedItemId: string | null;
  /** Colour of wall faces that look outdoors. */
  siding: string;
}) {
  const { floor, below, ceiling, cutaway, selectedItemId, siding } = props;
  const walls = floor.walls;
  const rooms = useMemo(() => detectRooms(walls), [walls]);
  const joined = useMemo(
    () => new Map(walls.map((w) => [w.id, [touchesOtherWall(w.a, w, walls), touchesOtherWall(w.b, w, walls)] as const])),
    [walls],
  );
  const openingsByWall = useMemo(() => {
    const map = new Map<string, Opening[]>();
    for (const o of floor.openings) map.set(o.wallId, [...(map.get(o.wallId) ?? []), o]);
    return map;
  }, [floor.openings]);
  const wallById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls]);
  // Stairs from the floor below arrive through this floor; this floor's own stairs go through its ceiling.
  const arriving = useMemo(() => stairHoles(below?.features), [below?.features]);
  const leaving = useMemo(() => stairHoles(floor.features), [floor.features]);
  // Each face of a wall takes the paint of the room it looks into.
  const paint = useMemo(() => {
    const map = new Map<string, [string, string]>();
    for (const w of walls) {
      const mid = lerp(w.a, w.b, 0.5);
      const dir = normalize(sub(w.b, w.a));
      const colorOn = (side: number): string => {
        const p = add(mid, scale({ x: -dir.y, y: dir.x }, side * (w.thickness / 2 + 0.15)));
        const room = rooms.find((r) => pointInPolygon(p, r.polygon));
        if (!room) return siding;
        return roomLabel(room, floor.labels)?.wallColor || DEFAULT_WALL_COLOR;
      };
      map.set(w.id, [colorOn(1), colorOn(-1)]);
    }
    return map;
  }, [walls, rooms, floor.labels, siding]);

  return (
    <group position-y={floor.elevation}>
      {rooms.map((r, i) => (
        <Slab key={`f${i}`} outline={r.polygon} holes={arriving} thickness={FINISH} y={0}
          material={floorMaterial(roomLabel(r, floor.labels)?.floorMaterial)} />
      ))}
      {ceiling &&
        rooms.map((r, i) => (
          <Slab key={`c${i}`} outline={r.polygon} holes={leaving} thickness={SLAB - FINISH}
            y={floor.wallHeight + SLAB - FINISH} material={MATERIALS.slab} />
        ))}
      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openingsByWall.get(w.id) ?? NO_OPENINGS}
          extendStart={joined.get(w.id)![0]} extendEnd={joined.get(w.id)![1]}
          extraHeight={ceiling ? SLAB : 0} cutaway={cutaway} front={paint.get(w.id)![0]} back={paint.get(w.id)![1]} />
      ))}
      {floor.items.map((item) => (
        <ItemModel key={item.id} item={item} selected={item.id === selectedItemId} />
      ))}
      {floor.openings.map((o) => {
        const wall = wallById.get(o.wallId);
        return wall && <OpeningModel key={o.id} opening={o} wall={wall} cutaway={cutaway} />;
      })}
      {floor.features.map((f) => (
        <FeatureModel key={f.id} feature={f} wallHeight={floor.wallHeight} />
      ))}
    </group>
  );
});

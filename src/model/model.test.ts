import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { detectRooms, roomName, setRoomProps } from './rooms';
import { canStand, isBlocked, pickWallFace, rectCorners, shapesOverlap, snapItemToWall, wallMountPose } from './placement3d';
import { CATALOG, catalogItem } from '../catalog/catalog';
import { sampleProject } from './sample';
import { pointInPolygon } from './geometry';
import { ACRE, insideRect, lotRect, lotSize, roofBase } from './lot';
import { buildRoof } from '../three/roofGeometry';
import { GROUND_Y, groundHeight } from '../three/Landscape';
import { parseLength, formatLength } from './units';
import { snapPoint } from '../plan/snap';
import { findOpeningSpot, placeFeature } from '../plan/placement';
import { addFloor, floorAt, recomputeElevations, removeFloor, tidyFloor } from './floors';
import { emptyFloor, emptyProject, migrateProject, STAIR_SIZES, type Opening, type Wall } from './types';
import { stairBoxes } from './stairs';
import { buildSlabGeometry, buildWallGeometry, paintWallFaces } from '../three/geometry';

let n = 0;
const wall = (ax: number, ay: number, bx: number, by: number, thickness = 0.2): Wall => ({
  id: `w${n++}`,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  thickness,
  height: 2.7,
});
const box = (x: number, y: number, w: number, h: number): Wall[] => [
  wall(x, y, x + w, y),
  wall(x + w, y, x + w, y + h),
  wall(x + w, y + h, x, y + h),
  wall(x, y + h, x, y),
];
const areas = (walls: Wall[]) => detectRooms(walls).map((r) => r.area).sort((a, b) => a - b);

describe('detectRooms', () => {
  it('finds no room in an open shape', () => {
    expect(detectRooms([wall(0, 0, 4, 0), wall(4, 0, 4, 3), wall(4, 3, 0, 3)])).toHaveLength(0);
  });

  it('finds one room in a closed box and measures inside the walls', () => {
    const rooms = detectRooms(box(0, 0, 4, 3));
    expect(rooms).toHaveLength(1);
    // 4 x 3 centre to centre, minus 0.1 m of wall on every side.
    expect(rooms[0].area).toBeCloseTo(3.8 * 2.8, 6);
    expect(rooms[0].centroid.x).toBeCloseTo(2, 6);
    expect(rooms[0].centroid.y).toBeCloseTo(1.5, 6);
  });

  it('gives the same result whichever way the walls were drawn', () => {
    const reversed = box(0, 0, 4, 3).map((w) => ({ ...w, a: w.b, b: w.a }));
    expect(areas(reversed)[0]).toBeCloseTo(3.8 * 2.8, 6);
  });

  it('splits a box into two rooms with a dividing wall that ends on other walls', () => {
    const result = areas([...box(0, 0, 6, 3), wall(2, 0, 2, 3)]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBeCloseTo(1.8 * 2.8, 6);
    expect(result[1]).toBeCloseTo(3.8 * 2.8, 6);
  });

  it('makes four rooms from two walls that cross inside a box', () => {
    expect(areas([...box(0, 0, 4, 4), wall(2, 0, 2, 4), wall(0, 2, 4, 2)])).toHaveLength(4);
  });

  it('ignores a dead-end wall poking into a room', () => {
    const result = areas([...box(0, 0, 4, 3), wall(2, 0, 2, 1.5)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeCloseTo(3.8 * 2.8, 6);
  });

  it('handles an L-shaped room', () => {
    const l = [wall(0, 0, 4, 0, 0), wall(4, 0, 4, 2, 0), wall(4, 2, 2, 2, 0), wall(2, 2, 2, 4, 0), wall(2, 4, 0, 4, 0), wall(0, 4, 0, 0, 0)];
    expect(areas(l)[0]).toBeCloseTo(12, 6);
  });
});

describe('units', () => {
  it('parses metric lengths', () => {
    expect(parseLength('4.2', 'metric')).toBeCloseTo(4.2);
    expect(parseLength('420cm', 'metric')).toBeCloseTo(4.2);
    expect(parseLength('abc', 'metric')).toBeNull();
    expect(parseLength('0', 'metric')).toBeNull();
  });
  it('parses imperial lengths', () => {
    expect(parseLength('10', 'imperial')).toBeCloseTo(3.048);
    expect(parseLength(`12'6"`, 'imperial')).toBeCloseTo(3.81);
    expect(parseLength('6"', 'imperial')).toBeCloseTo(0.1524);
  });
  it('round-trips its own formatting', () => {
    expect(parseLength(formatLength(3.81, 'imperial'), 'imperial')).toBeCloseTo(3.81);
    expect(parseLength(formatLength(4.25, 'metric'), 'metric')).toBeCloseTo(4.25);
  });
});

describe('floors', () => {
  it('upgrades a version 1 project', () => {
    const v1 = { version: 1, name: 'Old', units: 'metric', floors: [{ id: 'f', name: 'Ground floor', elevation: 0, wallHeight: 2.7, walls: [], labels: [] }] };
    const p = migrateProject(v1)!;
    expect(p.version).toBe(2);
    expect(p.floors[0]).toMatchObject({ level: 0, openings: [], features: [] });
    expect(migrateProject({ version: 2, name: 'x' })).toBeNull();
    expect(migrateProject('nope')).toBeNull();
  });

  it('stacks floors and works out their heights', () => {
    const p = emptyProject();
    addFloor(p, 'above');
    addFloor(p, 'above');
    addFloor(p, 'below');
    recomputeElevations(p);
    expect(p.floors.map((f) => f.level)).toEqual([-1, 0, 1, 2]);
    expect(p.floors.map((f) => f.name)).toEqual(['Basement', 'Ground floor', 'Floor 1', 'Floor 2']);
    expect(p.floors.map((f) => +f.elevation.toFixed(2))).toEqual([-3, 0, 3, 6]);
  });

  it('closes the gap when a floor is removed', () => {
    const p = emptyProject();
    addFloor(p, 'above');
    addFloor(p, 'above');
    removeFloor(p, floorAt(p, 1)!.id);
    expect(p.floors.map((f) => f.level)).toEqual([0, 1]);
    expect(p.floors[1].name).toBe('Floor 1');
    removeFloor(p, floorAt(p, 0)!.id);
    expect(p.floors.map((f) => f.level)).toEqual([0]);
    removeFloor(p, p.floors[0].id);
    expect(p.floors).toHaveLength(1);
  });

  it('keeps openings inside their wall and drops orphans', () => {
    const f = emptyFloor(0);
    const w = wall(0, 0, 4, 0);
    const opening = (wallId: string, offset: number): Opening => ({
      id: `o${offset}`, wallId, type: 'door', offset, width: 1, height: 2.1, sill: 0, side: 1, hingeAtB: false,
    });
    f.walls.push(w);
    f.openings.push(opening(w.id, 3.9), opening('gone', 1));
    tidyFloor(f);
    expect(f.openings).toHaveLength(1);
    expect(f.openings[0].offset).toBeCloseTo(3.5);
  });
});

describe('findOpeningSpot', () => {
  const w = wall(0, 0, 4, 0);
  const o = { zoom: 60, step: 0.1 };
  const door: Opening = { id: 'd', wallId: w.id, type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0, side: 1, hingeAtB: false };
  it('lands on the nearest wall, on the cursor side', () => {
    const spot = findOpeningSpot({ x: 2.52, y: 0.2 }, 0.9, { walls: [w], openings: [] }, o)!;
    expect(spot).toMatchObject({ wallId: w.id, side: 1, valid: true });
    expect(spot.offset).toBeCloseTo(2.5);
    expect(findOpeningSpot({ x: 2.52, y: -0.2 }, 0.9, { walls: [w], openings: [] }, o)!.side).toBe(-1);
  });
  it('stays inside the wall', () => {
    expect(findOpeningSpot({ x: 0.1, y: 0 }, 0.9, { walls: [w], openings: [] }, o)!.offset).toBeCloseTo(0.45);
  });
  it('refuses to overlap another opening, except itself', () => {
    const floor = { walls: [w], openings: [door] };
    expect(findOpeningSpot({ x: 1.4, y: 0 }, 0.9, floor, o)!.valid).toBe(false);
    expect(findOpeningSpot({ x: 1.4, y: 0 }, 0.9, floor, { ...o, ignoreId: 'd' })!.valid).toBe(true);
    expect(findOpeningSpot({ x: 3, y: 0 }, 0.9, floor, o)!.valid).toBe(true);
  });
  it('finds nothing far from any wall', () => {
    expect(findOpeningSpot({ x: 2, y: 3 }, 0.9, { walls: [w], openings: [] }, o)).toBeNull();
  });
  it('puts a fireplace flush against a wall, facing away from it', () => {
    const placed = placeFeature({ x: 2.03, y: 0.3 }, { type: 'fireplace', width: 1.4, depth: 0.5, rotation: 0 }, [w], o);
    expect(placed.at.x).toBeCloseTo(2);
    expect(placed.at.y).toBeCloseTo(0.1 + 0.25);
    expect(placed.rotation).toBeCloseTo(0);
    const other = placeFeature({ x: 2.03, y: -0.3 }, { type: 'fireplace', width: 1.4, depth: 0.5, rotation: 0 }, [w], o);
    expect(other.at.y).toBeCloseTo(-0.35);
    expect(other.rotation).toBeCloseTo(180);
  });
});

describe('3D geometry', () => {
  const box = (g: BufferGeometry) => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(3));
  };
  const triangles = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

  it('builds a plain wall as a box, extended at joined ends', () => {
    expect(box(buildWallGeometry(4, 2.7, 0.2, false, false, []))).toEqual([0, 0, -0.1, 4, 2.7, 0.1]);
    expect(box(buildWallGeometry(4, 2.7, 0.2, true, true, []))).toEqual([-0.1, 0, -0.1, 4.1, 2.7, 0.1]);
    expect(triangles(buildWallGeometry(4, 2.7, 0.2, false, false, []))).toBe(12);
  });

  it('cuts doors and windows without changing the overall size', () => {
    const plain = buildWallGeometry(4, 2.7, 0.2, false, false, []);
    const door = buildWallGeometry(4, 2.7, 0.2, false, false, [{ offset: 1, width: 0.9, height: 2.1, sill: 0 }]);
    const both = buildWallGeometry(4, 2.7, 0.2, false, false, [
      { offset: 1, width: 0.9, height: 2.1, sill: 0 },
      { offset: 3, width: 1.2, height: 1.2, sill: 0.9 },
    ]);
    expect(box(both)).toEqual(box(plain));
    expect(triangles(door)).toBeGreaterThan(triangles(plain));
    expect(triangles(both)).toBeGreaterThan(triangles(door));
  });

  it('survives openings that overlap or are taller than the wall', () => {
    const g = buildWallGeometry(4, 2.7, 0.2, false, false, [
      { offset: 1, width: 1, height: 9, sill: 0 },
      { offset: 1.2, width: 1, height: 2, sill: 0 },
    ]);
    expect(box(g)).toEqual([0, 0, -0.1, 4, 2.7, 0.1]);
  });

  it('lays a slab flat with its top at zero', () => {
    const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const hole = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }];
    expect(box(buildSlabGeometry(square, [], 0.3))).toEqual([0, -0.3, 0, 4, 0, 3]);
    expect(triangles(buildSlabGeometry(square, [hole], 0.3))).toBeGreaterThan(triangles(buildSlabGeometry(square, [], 0.3)));
  });

  it('builds stairs that climb to one riser below the next floor', () => {
    for (const shape of ['straight', 'L', 'U', 'spiral'] as const) {
      const size = STAIR_SIZES[shape];
      const boxes = stairBoxes({ ...size, shape }, 3).filter((b) => b.top <= 3);
      const tops = boxes.map((b) => b.top).sort((a, b) => a - b);
      expect(tops[tops.length - 1]).toBeCloseTo(3 - 3 / 17, 5);
      expect(tops.length).toBe(16);
      // Every piece stays inside the footprint (spiral steps are checked by radius).
      for (const b of boxes) {
        if (shape === 'spiral') expect(Math.hypot(b.x, b.y)).toBeLessThan(size.width / 2);
        else {
          expect(Math.abs(b.x) + b.sizeX / 2).toBeLessThanOrEqual(size.width / 2 + 1e-9);
          expect(Math.abs(b.y) + b.sizeY / 2).toBeLessThanOrEqual(size.depth / 2 + 1e-9);
        }
      }
    }
  });
});

describe('furniture placement', () => {
  const room = box(0, 0, 4, 3); // walls 0.2 thick, so the inside runs from 0.1 to 3.9 and 0.1 to 2.9
  const polygons = [[{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]];

  it('tells overlapping footprints from ones that only touch', () => {
    const a = rectCorners({ x: 0, y: 0 }, 2, 1, 0);
    expect(shapesOverlap(a, rectCorners({ x: 1.5, y: 0 }, 2, 1, 0))).toBe(true);
    expect(shapesOverlap(a, rectCorners({ x: 2, y: 0 }, 2, 1, 0))).toBe(false);
    expect(shapesOverlap(a, rectCorners({ x: 0, y: 1.3 }, 2, 1, 45))).toBe(true);
    expect(shapesOverlap(a, rectCorners({ x: 0, y: 2.5 }, 2, 1, 45))).toBe(false);
  });

  it('pushes furniture flush against a nearby wall, facing into the room', () => {
    const snapped = snapItemToWall({ x: 2.02, y: 0.7 }, 1.6, 0.9, room)!;
    expect(snapped.at.x).toBeCloseTo(2);
    expect(snapped.at.y).toBeCloseTo(0.1 + 0.45);
    expect(snapped.rotation).toBeCloseTo(0);
    expect(isBlocked(rectCorners(snapped.at, 1.6, 0.9, snapped.rotation), room, [])).toBe(false);
    expect(snapItemToWall({ x: 2, y: 1.5 }, 1.6, 0.9, room)).toBeNull();
  });

  it('blocks furniture that runs into a wall or another piece', () => {
    expect(isBlocked(rectCorners({ x: 2, y: 0.3 }, 1.6, 0.9, 0), room, [])).toBe(true);
    const sofa = rectCorners({ x: 2, y: 0.55 }, 1.6, 0.9, 0);
    expect(isBlocked(rectCorners({ x: 2.5, y: 1 }, 1, 0.6, 0), room, [sofa])).toBe(true);
    expect(isBlocked(rectCorners({ x: 2, y: 2 }, 1, 0.6, 0), room, [sofa])).toBe(false);
  });

  it('finds the inside wall face under the pointer and mounts a picture on it', () => {
    // Looking from the middle of the room toward the top wall (y = 0), slightly upward.
    const hit = pickWallFace([2, 1.5, 1.5], [0, 0.1, -1], room, 0, polygons)!;
    expect(hit.wall).toBe(room[0]);
    expect(hit.along).toBeCloseTo(2);
    expect(hit.height).toBeCloseTo(1.5 + 0.14);
    const pose = wallMountPose(hit, { w: 0.8, d: 0.04, h: 0.6 });
    expect(pose.at.y).toBeCloseTo(0.1 + 0.02);
    expect(pose.elevation).toBeCloseTo(1.35);
    // From outside the house the outer face is ignored, and the far inside face is found instead.
    const outside = pickWallFace([2, 1.5, -5], [0, 0, 1], room, 0, polygons)!;
    expect(outside.wall).toBe(room[2]);
  });

  it('lets a person through doorways but not walls or windows', () => {
    const w = room[0];
    const opening = (type: Opening['type']): Opening => ({
      id: type, wallId: w.id, type, offset: 2, width: 0.9, height: 2.1, sill: 0, side: 1, hingeAtB: false,
    });
    expect(canStand({ x: 2, y: 1.5 }, room, [])).toBe(true);
    expect(canStand({ x: 2, y: 0.05 }, room, [])).toBe(false);
    expect(canStand({ x: 2, y: 0.05 }, room, [opening('door')])).toBe(true);
    expect(canStand({ x: 2, y: 0.05 }, room, [opening('window')])).toBe(false);
    expect(canStand({ x: 2.42, y: 0.05 }, room, [opening('door')])).toBe(false);
  });

  it('has a consistent catalog', () => {
    expect(new Set(CATALOG.map((c) => c.id)).size).toBe(CATALOG.length);
    for (const c of CATALOG) {
      expect(c.colors.length, c.id).toBeGreaterThan(0);
      // Every part stays inside the size the item claims, give or take a little trim.
      // (Turned parts are skipped: their extents no longer line up with the axes.)
      for (const p of c.parts.filter((x) => !x.rot)) {
        expect(Math.abs(p.pos[0]) + p.size[0] / 2, `${c.id} width`).toBeLessThanOrEqual(c.size.w / 2 + 0.06);
        expect(Math.abs(p.pos[2]) + p.size[2] / 2, `${c.id} depth`).toBeLessThanOrEqual(c.size.d / 2 + 0.06);
        expect(p.pos[1] + p.size[1] / 2, `${c.id} height`).toBeLessThanOrEqual(c.size.h + 0.06);
      }
    }
  });

  it('remembers a room\'s finishes without losing its name', () => {
    const f = emptyFloor(0);
    f.walls.push(...room);
    const [r] = detectRooms(f.walls);
    setRoomProps(f, r, { name: 'Kitchen' });
    setRoomProps(f, r, { floorMaterial: 'tile-white', wallColor: '#cfdcea' });
    expect(f.labels).toHaveLength(1);
    expect(f.labels[0]).toMatchObject({ name: 'Kitchen', floorMaterial: 'tile-white', wallColor: '#cfdcea' });
    expect(roomName(r, f.labels)).toBe('Kitchen');
  });

  it('paints the two faces of a wall separately', () => {
    const g = buildWallGeometry(4, 2.7, 0.2, false, false, []);
    paintWallFaces(g, '#ff0000', '#0000ff', '#00ff00');
    const normal = g.getAttribute('normal');
    const color = g.getAttribute('color');
    for (let i = 0; i < normal.count; i++) {
      const [r, gr, b] = [color.getX(i), color.getY(i), color.getZ(i)];
      if (normal.getZ(i) > 0.5) expect([r, gr, b]).toEqual([1, 0, 0]);
      else if (normal.getZ(i) < -0.5) expect([r, gr, b]).toEqual([0, 0, 1]);
      else expect([r, gr, b]).toEqual([0, 1, 0]);
    }
  });
});

describe('lot and roof', () => {
  const size = (g: BufferGeometry) => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(3) + 0);
  };

  it('turns acres into a rectangle of the right area and shape', () => {
    const square = lotSize({ acres: 1, aspect: 1 });
    expect(square.width).toBeCloseTo(63.615, 2);
    expect(square.depth).toBeCloseTo(63.615, 2);
    const wide = lotSize({ acres: 2.5, aspect: 2 });
    expect(wide.width * wide.depth).toBeCloseTo(2.5 * ACRE, 3);
    expect(wide.width / wide.depth).toBeCloseTo(2);
    const rect = lotRect({ acres: 1, aspect: 1, centre: { x: 10, y: -5 }, fence: true });
    expect((rect.minX + rect.maxX) / 2).toBeCloseTo(10);
    expect(insideRect([{ x: 10, y: -5 }], rect)).toBe(true);
    expect(insideRect([{ x: 10, y: -5 }, { x: 60, y: 0 }], rect)).toBe(false);
  });

  it('gives older plans a default lot and roof', () => {
    const p = migrateProject({ version: 2, name: 'x', units: 'metric', floors: [emptyFloor(0)] })!;
    expect(p.lot.acres).toBe(1);
    expect(p.exterior.roof.type).toBe('gable');
    expect(p.outdoor).toEqual([]);
    const kept = migrateProject({ ...p, lot: { ...p.lot, acres: 3 }, exterior: { siding: '#000000' } })!;
    expect(kept.lot.acres).toBe(3);
    expect(kept.exterior).toMatchObject({ siding: '#000000', roof: { type: 'gable', pitch: 30 } });
  });

  it('rests the roof on the top floor', () => {
    const p = emptyProject();
    expect(roofBase(p.floors)).toBeNull();
    p.floors[0].walls.push(...box(0, 0, 8, 6));
    addFloor(p, 'above');
    floorAt(p, 1)!.walls.push(...box(0, 0, 5, 6));
    recomputeElevations(p);
    const base = roofBase(p.floors)!;
    expect(base.rect).toEqual({ minX: 0, maxX: 5, minY: 0, maxY: 6 });
    expect(base.y).toBeCloseTo(3 + 2.7 + 0.3);
  });

  it('builds each roof type to cover the house plus its overhang', () => {
    const slope = Math.tan((30 * Math.PI) / 180);
    const gable = buildRoof('gable', 10, 6, 30, 0.5);
    expect(gable.rise).toBeCloseTo(3.5 * slope);
    expect(size(gable.roof)).toEqual([-5.5, -0.12, -3.5, 5.5, +(3.5 * slope).toFixed(3), 3.5]);
    expect(gable.walls).toHaveLength(2);
    // The gable-end walls stay within the house and under the roof.
    for (const w of gable.walls) {
      const [minX, minY, minZ, maxX, maxY, maxZ] = size(w);
      expect(Math.max(-minX, maxX)).toBeLessThanOrEqual(5);
      expect([minY, minZ, maxZ]).toEqual([0, -3, 3]);
      expect(maxY).toBeLessThan(gable.rise);
    }
    const hip = buildRoof('hip', 10, 6, 30, 0.5);
    expect(size(hip.roof)).toEqual([-5.5, 0, -3.5, 5.5, +(3.5 * slope).toFixed(3), 3.5]);
    expect(hip.walls).toHaveLength(0);
    const shed = buildRoof('shed', 10, 6, 30, 0.5);
    expect(shed.rise).toBeCloseTo(7 * slope);
    expect(shed.walls).toHaveLength(3);
    expect(size(buildRoof('flat', 10, 6, 30, 0.5).roof)).toEqual([-5.15, 0, -3.15, 5.15, 0.18, 3.15]);
  });

  it('keeps the ground level around the house and hilly far away', () => {
    const lot = { acres: 1, aspect: 1, centre: { x: 0, y: 0 }, fence: true };
    expect(groundHeight(0, 0, lot)).toBeCloseTo(GROUND_Y);
    expect(groundHeight(40, -40, lot)).toBeCloseTo(GROUND_Y);
    const far = [[400, 300], [-500, 200], [100, -600], [-300, -450]].map(([x, z]) => groundHeight(x, z, lot));
    expect(Math.max(...far)).toBeGreaterThan(3);
    expect(Math.min(...far)).toBeGreaterThanOrEqual(GROUND_Y);
  });
});

describe('example house', () => {
  const p = sampleProject();
  const outline = (i: { catalogId: string; at: { x: number; y: number }; rotation: number }) => {
    const d = catalogItem(i.catalogId)!;
    return rectCorners(i.at, d.collide?.w ?? d.size.w, d.collide?.d ?? d.size.d, i.rotation);
  };
  const standing = (items: typeof p.outdoor) =>
    items.filter((i) => {
      const d = catalogItem(i.catalogId)!;
      return d.placement === 'floor' && !d.flat;
    });

  it('is a valid project with the rooms it claims', () => {
    expect(migrateProject(JSON.parse(JSON.stringify(p)))).not.toBeNull();
    expect(p.floors.map((f) => detectRooms(f.walls).length)).toEqual([3, 4]);
    for (const f of p.floors) {
      const names = detectRooms(f.walls).map((r) => roomName(r, f.labels));
      expect(names, f.name).not.toContain('Room');
    }
    expect(p.floors.map((f) => +f.elevation.toFixed(2))).toEqual([0, 3]);
  });

  it('only uses things that exist, and keeps every opening inside its wall', () => {
    for (const f of p.floors) {
      for (const i of f.items) expect(catalogItem(i.catalogId), i.catalogId).toBeDefined();
      for (const o of f.openings) {
        const w = f.walls.find((x) => x.id === o.wallId)!;
        expect(w, o.wallId).toBeDefined();
        const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        expect(o.offset - o.width / 2, `${o.wallId} ${o.offset}`).toBeGreaterThan(0.1);
        expect(o.offset + o.width / 2, `${o.wallId} ${o.offset}`).toBeLessThan(len - 0.1);
        // Openings must not land where another wall joins this one.
        const span = [o.offset - o.width / 2, o.offset + o.width / 2];
        for (const other of f.walls) {
          if (other === w) continue;
          for (const end of [other.a, other.b]) {
            const along = ((end.x - w.a.x) * (w.b.x - w.a.x) + (end.y - w.a.y) * (w.b.y - w.a.y)) / len;
            const off = Math.abs((end.x - w.a.x) * (w.b.y - w.a.y) - (end.y - w.a.y) * (w.b.x - w.a.x)) / len;
            if (off < 0.01 && along > 0.01 && along < len - 0.01) {
              expect(along + other.thickness / 2 <= span[0] || along - other.thickness / 2 >= span[1], `${o.wallId} ${o.offset} meets ${other.id}`).toBe(true);
            }
          }
        }
      }
      for (const o of f.openings) {
        const clash = f.openings.find((x) => x !== o && x.wallId === o.wallId && Math.abs(x.offset - o.offset) < (x.width + o.width) / 2);
        expect(clash, `${o.wallId} ${o.offset}`).toBeUndefined();
      }
    }
    for (const i of p.outdoor) expect(catalogItem(i.catalogId), i.catalogId).toBeDefined();
  });

  it('has no furniture stuck in a wall or in other furniture', () => {
    for (const f of p.floors) {
      const pieces = standing(f.items);
      for (const piece of pieces) {
        const others = pieces.filter((x) => x !== piece).map(outline);
        expect(isBlocked(outline(piece), f.walls, []), `${f.name}: ${piece.catalogId} in a wall`).toBe(false);
        expect(isBlocked(outline(piece), [], others), `${f.name}: ${piece.catalogId} overlaps furniture`).toBe(false);
      }
    }
  });

  it('keeps the garden on the lot, out of the house and untangled', () => {
    const lot = lotRect(p.lot);
    const ground = p.floors[0];
    const rooms = detectRooms(ground.walls);
    const pieces = standing(p.outdoor);
    for (const i of p.outdoor) {
      const d = catalogItem(i.catalogId)!;
      expect(insideRect(rectCorners(i.at, d.size.w, d.size.d, i.rotation), lot), `${i.catalogId} off the lot`).toBe(true);
      expect(rooms.some((r) => pointInPolygon(i.at, r.polygon)), `${i.catalogId} indoors`).toBe(false);
      expect(isBlocked(rectCorners(i.at, d.size.w, d.size.d, i.rotation), ground.walls, []), `${i.catalogId} in the house`).toBe(false);
    }
    for (const piece of pieces) {
      const others = pieces.filter((x) => x !== piece).map(outline);
      expect(isBlocked(outline(piece), [], others), `${piece.catalogId} overlaps`).toBe(false);
    }
  });
});

describe('snapPoint', () => {
  const walls = [wall(0, 0, 4, 0)];
  const opts = { walls, zoom: 60, step: 0.1 };
  it('snaps to a nearby corner', () => {
    const r = snapPoint({ x: 3.95, y: 0.08 }, opts);
    expect(r.kind).toBe('endpoint');
    expect(r.point).toEqual({ x: 4, y: 0 });
  });
  it('snaps onto a wall', () => {
    const r = snapPoint({ x: 2.02, y: 0.05 }, opts);
    expect(r.kind).toBe('wall');
    expect(r.point.x).toBeCloseTo(2);
    expect(r.point.y).toBeCloseTo(0);
  });
  it('snaps to the grid in open space', () => {
    const r = snapPoint({ x: 1.33, y: 2.48 }, opts);
    expect(r.point.x).toBeCloseTo(1.3);
    expect(r.point.y).toBeCloseTo(2.5);
  });
  it('straightens a nearly horizontal wall', () => {
    const r = snapPoint({ x: 3.0, y: 2.14 }, { ...opts, from: { x: 1, y: 2 } });
    expect(r.point.y).toBeCloseTo(2);
  });
  it('does nothing when disabled', () => {
    const raw = { x: 3.97, y: 0.03 };
    expect(snapPoint(raw, { ...opts, disabled: true }).point).toEqual(raw);
  });
});

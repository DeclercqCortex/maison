import type { Opening, Vec2, Wall } from './types';
import { add, dist, normalize, pointInPolygon, projectOnSegment, scale, sub } from './geometry';

/** Corners of a w × d rectangle centred on `at`, turned by `rotation` degrees. */
export function rectCorners(at: Vec2, w: number, d: number, rotation: number): Vec2[] {
  const a = (rotation * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => ({
    x: at.x + x * c - y * s,
    y: at.y + x * s + y * c,
  }));
}

/**
 * Whether two convex shapes overlap by more than a sliver. Shapes that only
 * touch (a sofa flush against a wall) do not count as overlapping.
 */
export function shapesOverlap(a: Vec2[], b: Vec2[], tolerance = 0.01): boolean {
  for (const shape of [a, b]) {
    for (let i = 0; i < shape.length; i++) {
      const edge = sub(shape[(i + 1) % shape.length], shape[i]);
      const axis = normalize({ x: -edge.y, y: edge.x });
      const project = (pts: Vec2[]) => pts.map((p) => p.x * axis.x + p.y * axis.y);
      const pa = project(a);
      const pb = project(b);
      const overlap = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= tolerance) return false;
    }
  }
  return true;
}

function wallRect(w: Wall): Vec2[] {
  const d = normalize(sub(w.b, w.a));
  const n = { x: (-d.y * w.thickness) / 2, y: (d.x * w.thickness) / 2 };
  return [add(w.a, n), add(w.b, n), sub(w.b, n), sub(w.a, n)];
}

/** Whether a footprint runs into a wall or into any of the other footprints. */
export function isBlocked(rect: Vec2[], walls: Wall[], others: Vec2[][]): boolean {
  return walls.some((w) => shapesOverlap(rect, wallRect(w))) || others.some((o) => shapesOverlap(rect, o));
}

/**
 * If an item is close to a wall, the position and turn that put its back flush
 * against that wall, facing into the room. Null if no wall is near enough.
 */
export function snapItemToWall(
  raw: Vec2,
  w: number,
  d: number,
  walls: Wall[],
  maxGap = 0.3,
  step = 0.05,
): { at: Vec2; rotation: number } | null {
  let best: { wall: Wall; t: number; gap: number } | null = null;
  for (const wall of walls) {
    const hit = projectOnSegment(raw, wall.a, wall.b);
    const len = dist(wall.a, wall.b);
    // Only snap where the item's whole back fits along the wall.
    if (hit.t * len < w / 2 - 0.02 || (1 - hit.t) * len < w / 2 - 0.02) continue;
    const gap = hit.d - wall.thickness / 2 - d / 2;
    if (gap < maxGap && (!best || gap < best.gap)) best = { wall, t: hit.t, gap };
  }
  if (!best) return null;
  const { wall } = best;
  const len = dist(wall.a, wall.b);
  const dir = normalize(sub(wall.b, wall.a));
  const normal = { x: -dir.y, y: dir.x };
  const fromStart = sub(raw, wall.a);
  const side = normal.x * fromStart.x + normal.y * fromStart.y >= 0 ? 1 : -1;
  const along = Math.max(w / 2, Math.min(len - w / 2, Math.round((best.t * len) / step) * step));
  const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI + (side === 1 ? 0 : 180);
  return {
    at: add(add(wall.a, scale(dir, along)), scale(normal, side * (wall.thickness / 2 + d / 2))),
    rotation: ((Math.round(angle * 100) / 100) % 360 + 360) % 360,
  };
}

export interface WallFaceHit {
  wall: Wall;
  /** Distance along the wall from its start. */
  along: number;
  /** Height above the floor. */
  height: number;
  /** Which face of the wall: 1 or -1 along its normal. */
  side: 1 | -1;
  /** Distance along the ray, to compare hits. */
  distance: number;
}

/**
 * The wall face a ray (from the camera through the pointer) lands on. Only
 * faces that look into a room count, so outside faces never catch the pointer.
 * 3D coordinates: plan x is x, plan y is z, height is y.
 */
export function pickWallFace(
  origin: [number, number, number],
  direction: [number, number, number],
  walls: Wall[],
  floorY: number,
  roomPolygons: Vec2[][],
): WallFaceHit | null {
  let best: WallFaceHit | null = null;
  for (const wall of walls) {
    const len = dist(wall.a, wall.b);
    if (len < 1e-6) continue;
    const dir = normalize(sub(wall.b, wall.a));
    const normal = { x: -dir.y, y: dir.x };
    for (const side of [1, -1] as const) {
      const facing = direction[0] * normal.x * side + direction[2] * normal.y * side;
      if (facing >= -1e-6) continue; // looking at this face from behind
      const p0 = add(wall.a, scale(normal, (side * wall.thickness) / 2));
      const distance = ((p0.x - origin[0]) * normal.x * side + (p0.y - origin[2]) * normal.y * side) / facing;
      if (distance <= 0 || (best && distance >= best.distance)) continue;
      const hit = { x: origin[0] + direction[0] * distance, y: origin[2] + direction[2] * distance };
      const height = origin[1] + direction[1] * distance - floorY;
      const along = (hit.x - wall.a.x) * dir.x + (hit.y - wall.a.y) * dir.y;
      if (along < 0 || along > len || height < 0 || height > wall.height) continue;
      const inFront = add(hit, scale(normal, side * 0.2));
      if (!roomPolygons.some((poly) => pointInPolygon(inFront, poly))) continue;
      best = { wall, along, height, side, distance };
    }
  }
  return best;
}

/** Where a wall-mounted item of the given size goes for a wall-face hit. */
export function wallMountPose(
  hit: WallFaceHit,
  size: { w: number; d: number; h: number },
  step = 0.05,
): { at: Vec2; rotation: number; elevation: number } {
  const { wall, side } = hit;
  const len = dist(wall.a, wall.b);
  const dir = normalize(sub(wall.b, wall.a));
  const normal = { x: -dir.y, y: dir.x };
  const snap = (v: number) => Math.round(v / step) * step;
  const along = len > size.w ? Math.max(size.w / 2, Math.min(len - size.w / 2, snap(hit.along))) : len / 2;
  const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI + (side === 1 ? 0 : 180);
  return {
    at: add(add(wall.a, scale(dir, along)), scale(normal, side * (wall.thickness / 2 + size.d / 2))),
    rotation: ((Math.round(angle * 100) / 100) % 360 + 360) % 360,
    elevation: Math.max(0, Math.min(wall.height - size.h, snap(hit.height - size.h / 2))),
  };
}

/**
 * Whether a person can stand at a point: not inside or too close to a wall,
 * except in a doorway or archway.
 */
export function canStand(p: Vec2, walls: Wall[], openings: Opening[], radius = 0.2): boolean {
  for (const wall of walls) {
    const hit = projectOnSegment(p, wall.a, wall.b);
    if (hit.d >= wall.thickness / 2 + radius) continue;
    const along = hit.t * dist(wall.a, wall.b);
    const inDoorway = openings.some(
      (o) => o.wallId === wall.id && o.type !== 'window' && Math.abs(along - o.offset) < o.width / 2 - radius * 0.6,
    );
    if (!inDoorway) return false;
  }
  return true;
}

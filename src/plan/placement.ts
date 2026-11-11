import type { Feature, Opening, Vec2, Wall } from '../model/types';
import { add, dist, normalize, projectOnSegment, scale, sub } from '../model/geometry';
import { snapToGrid } from './snap';

export interface OpeningSpot {
  wallId: string;
  /** Distance from the wall's start to the centre of the opening. */
  offset: number;
  /** The side of the wall the cursor is on. */
  side: 1 | -1;
  /** False if the opening would not fit or would overlap another one. */
  valid: boolean;
}

export interface SpotOptions {
  /** Pixels per metre. */
  zoom: number;
  /** Grid snap distance in metres. */
  step: number;
  /** An opening being moved, which must not block itself. */
  ignoreId?: string;
  /** Turn off grid and centre snapping. */
  free?: boolean;
}

/** Where an opening of the given width would land on the wall nearest the cursor. */
export function findOpeningSpot(
  raw: Vec2,
  width: number,
  floor: { walls: Wall[]; openings: Opening[] },
  o: SpotOptions,
): OpeningSpot | null {
  let best: { wall: Wall; t: number } | null = null;
  let bestD = 24 / o.zoom;
  for (const w of floor.walls) {
    const hit = projectOnSegment(raw, w.a, w.b);
    if (hit.d < bestD) {
      bestD = hit.d;
      best = { wall: w, t: hit.t };
    }
  }
  if (!best) return null;
  const { wall } = best;
  const len = dist(wall.a, wall.b);
  const d = sub(wall.b, wall.a);
  const fromStart = sub(raw, wall.a);
  const side: 1 | -1 = -d.y * fromStart.x + d.x * fromStart.y >= 0 ? 1 : -1;
  if (len < width + 0.02) return { wallId: wall.id, offset: len / 2, side, valid: false };

  let offset = best.t * len;
  if (!o.free) {
    offset = Math.round(offset / o.step) * o.step;
    if (Math.abs(best.t * len - len / 2) < 8 / o.zoom) offset = len / 2;
  }
  offset = Math.max(width / 2, Math.min(len - width / 2, offset));
  const blocked = floor.openings.some(
    (other) =>
      other.wallId === wall.id &&
      other.id !== o.ignoreId &&
      Math.abs(other.offset - offset) < (other.width + width) / 2 + 0.05,
  );
  return { wallId: wall.id, offset, side, valid: !blocked };
}

/**
 * Where a feature lands for a cursor position. Fireplaces sit flush against the
 * nearest wall, facing into the room; everything else snaps to the grid.
 */
export function placeFeature(
  raw: Vec2,
  f: Pick<Feature, 'type' | 'width' | 'depth' | 'rotation'>,
  walls: Wall[],
  o: { zoom: number; step: number; free?: boolean },
): { at: Vec2; rotation: number } {
  if (f.type === 'fireplace') {
    let best: { wall: Wall; t: number } | null = null;
    let bestD = Infinity;
    for (const w of walls) {
      const hit = projectOnSegment(raw, w.a, w.b);
      if (hit.d < Math.max(30 / o.zoom, w.thickness / 2 + f.depth + 0.15) && hit.d < bestD) {
        bestD = hit.d;
        best = { wall: w, t: hit.t };
      }
    }
    if (best) {
      const { wall } = best;
      const len = dist(wall.a, wall.b);
      const dir = normalize(sub(wall.b, wall.a));
      const normal = { x: -dir.y, y: dir.x };
      const fromStart = sub(raw, wall.a);
      const side = normal.x * fromStart.x + normal.y * fromStart.y >= 0 ? 1 : -1;
      let along = best.t * len;
      if (!o.free) along = Math.round(along / o.step) * o.step;
      if (len > f.width) along = Math.max(f.width / 2, Math.min(len - f.width / 2, along));
      const onWall = add(wall.a, scale(dir, along));
      const angle = (Math.atan2(dir.y, dir.x) * 180) / Math.PI + (side === 1 ? 0 : 180);
      return {
        at: add(onWall, scale(normal, side * (wall.thickness / 2 + f.depth / 2))),
        rotation: ((Math.round(angle * 100) / 100) % 360 + 360) % 360,
      };
    }
  }
  return { at: o.free ? raw : snapToGrid(raw, o.step), rotation: f.rotation };
}

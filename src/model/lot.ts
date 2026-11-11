import type { Floor, Lot, Vec2 } from './types';
import { SLAB } from './floors';

/** Square metres in one acre. */
export const ACRE = 4046.8564224;

export interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Width (across the plan) and depth (down the plan) of the lot, in metres. */
export function lotSize(lot: Pick<Lot, 'acres' | 'aspect'>): { width: number; depth: number } {
  const area = lot.acres * ACRE;
  const width = Math.sqrt(area * lot.aspect);
  return { width, depth: area / width };
}

export function lotRect(lot: Lot): Rect {
  const { width, depth } = lotSize(lot);
  return {
    minX: lot.centre.x - width / 2,
    maxX: lot.centre.x + width / 2,
    minY: lot.centre.y - depth / 2,
    maxY: lot.centre.y + depth / 2,
  };
}

export const insideRect = (points: Vec2[], r: Rect): boolean =>
  points.every((p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY);

/** The smallest upright rectangle around a floor's walls, or null if it has none. */
export function wallBounds(floor: Pick<Floor, 'walls'>): Rect | null {
  const pts = floor.walls.flatMap((w) => [w.a, w.b]);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * Where the roof goes: over the rectangle around the top floor's walls, resting
 * on top of them. Null if the top floor has no walls yet.
 */
export function roofBase(floors: Floor[]): { rect: Rect; y: number; thickness: number } | null {
  const top = floors.reduce((a, b) => (b.level > a.level ? b : a));
  const rect = wallBounds(top);
  if (!rect) return null;
  const thickness = Math.max(...top.walls.map((w) => w.thickness));
  return { rect, y: top.elevation + top.wallHeight + SLAB, thickness };
}

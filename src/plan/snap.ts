import type { Vec2, Wall } from '../model/types';
import { dist, projectOnSegment, sub } from '../model/geometry';

export type SnapKind = 'none' | 'grid' | 'endpoint' | 'wall' | 'angle' | 'guide';

export interface SnapResult {
  point: Vec2;
  kind: SnapKind;
  /** Alignment lines to draw, from an existing corner to the snapped point. */
  guides: { from: Vec2; to: Vec2 }[];
}

export interface SnapOptions {
  walls: Wall[];
  /** Walls to ignore (the ones being dragged). */
  exclude?: Set<string>;
  /** Start of the wall being drawn; enables angle snapping. */
  from?: Vec2;
  /** Pixels per metre. */
  zoom: number;
  /** Grid snap distance in metres. */
  step: number;
  disabled?: boolean;
}

const roundTo = (v: number, step: number): number => Math.round(v / step) * step;
export const snapToGrid = (p: Vec2, step: number): Vec2 => ({ x: roundTo(p.x, step), y: roundTo(p.y, step) });

/**
 * Snaps a cursor position, in order of priority: existing corners, points on
 * existing walls, then the grid refined by alignment guides and 45° angles.
 */
export function snapPoint(raw: Vec2, o: SnapOptions): SnapResult {
  if (o.disabled) return { point: raw, kind: 'none', guides: [] };
  const walls = o.exclude ? o.walls.filter((w) => !o.exclude!.has(w.id)) : o.walls;
  const px = 1 / o.zoom;

  // 1. Existing corners.
  let best: Vec2 | null = null;
  let bestD = 10 * px;
  for (const w of walls) {
    for (const p of [w.a, w.b]) {
      const d = dist(raw, p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  if (best) return { point: { ...best }, kind: 'endpoint', guides: [] };

  // 2. A point on an existing wall.
  let onWall: { wall: Wall; t: number; point: Vec2 } | null = null;
  bestD = 8 * px;
  for (const w of walls) {
    const hit = projectOnSegment(raw, w.a, w.b);
    if (hit.d < bestD) {
      bestD = hit.d;
      onWall = { wall: w, t: hit.t, point: hit.point };
    }
  }
  if (onWall) {
    const { wall } = onWall;
    const d = sub(wall.b, wall.a);
    // Keep the wall being drawn straight if it can meet this wall horizontally or vertically.
    if (o.from) {
      const candidates: Vec2[] = [];
      if (Math.abs(d.y) > 1e-9) {
        const t = (o.from.y - wall.a.y) / d.y;
        if (t >= 0 && t <= 1) candidates.push({ x: wall.a.x + d.x * t, y: o.from.y });
      }
      if (Math.abs(d.x) > 1e-9) {
        const t = (o.from.x - wall.a.x) / d.x;
        if (t >= 0 && t <= 1) candidates.push({ x: o.from.x, y: wall.a.y + d.y * t });
      }
      const straight = candidates.find((c) => dist(c, raw) < 14 * px);
      if (straight) return { point: straight, kind: 'wall', guides: [] };
    }
    // Otherwise slide along the wall in grid steps measured from its start.
    const len = Math.hypot(d.x, d.y);
    const along = Math.max(0, Math.min(len, roundTo(onWall.t * len, o.step)));
    return {
      point: { x: wall.a.x + (d.x / len) * along, y: wall.a.y + (d.y / len) * along },
      kind: 'wall',
      guides: [],
    };
  }

  // 3. Grid, then alignment with existing corners.
  const point = snapToGrid(raw, o.step);
  let kind: SnapKind = 'grid';
  let guideX: Vec2 | null = null;
  let guideY: Vec2 | null = null;
  let dx = 6 * px;
  let dy = 6 * px;
  const corners = walls.flatMap((w) => [w.a, w.b]);
  if (o.from) corners.push(o.from);
  for (const p of corners) {
    if (Math.abs(p.x - raw.x) < dx) {
      dx = Math.abs(p.x - raw.x);
      guideX = p;
    }
    if (Math.abs(p.y - raw.y) < dy) {
      dy = Math.abs(p.y - raw.y);
      guideY = p;
    }
  }
  if (guideX) point.x = guideX.x;
  if (guideY) point.y = guideY.y;
  if (guideX || guideY) kind = 'guide';

  // 4. Lock to 0°, 45°, 90°... when close to one of them.
  if (o.from) {
    const v = sub(point, o.from);
    const len = Math.hypot(v.x, v.y);
    if (len > 1e-9) {
      const angle = Math.atan2(v.y, v.x);
      const eighth = Math.round(angle / (Math.PI / 4));
      if (Math.abs(angle - eighth * (Math.PI / 4)) < (7 * Math.PI) / 180) {
        const k = ((eighth % 8) + 8) % 8;
        if (k === 0 || k === 4) point.y = o.from.y;
        else if (k === 2 || k === 6) point.x = o.from.x;
        else {
          const side = roundTo((Math.abs(v.x) + Math.abs(v.y)) / 2, o.step);
          point.x = o.from.x + Math.sign(v.x) * side;
          point.y = o.from.y + Math.sign(v.y) * side;
        }
        if (kind === 'grid') kind = 'angle';
      }
    }
  }

  const guides: SnapResult['guides'] = [];
  for (const g of [guideX, guideY]) {
    if (!g || g === o.from) continue;
    if ((g === guideX && Math.abs(g.x - point.x) < 1e-9) || (g === guideY && Math.abs(g.y - point.y) < 1e-9)) {
      guides.push({ from: g, to: point });
    }
  }
  return { point, kind, guides };
}

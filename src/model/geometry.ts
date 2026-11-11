import type { Vec2 } from './types';

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;

export function normalize(a: Vec2): Vec2 {
  const len = Math.hypot(a.x, a.y);
  return len < 1e-12 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

/** Closest point on segment ab to p: parameter t in [0,1], the point, and its distance. */
export function projectOnSegment(p: Vec2, a: Vec2, b: Vec2): { t: number; point: Vec2; d: number } {
  const ab = sub(b, a);
  const len2 = ab.x * ab.x + ab.y * ab.y;
  let t = len2 < 1e-12 ? 0 : ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = lerp(a, b, t);
  return { t, point, d: dist(p, point) };
}

/** Where segments ab and cd cross strictly inside both: parameter along ab, or null. */
export function segmentCrossing(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) return null;
  const ac = sub(c, a);
  const t = cross(ac, s) / denom;
  const u = cross(ac, r) / denom;
  const e = 1e-9;
  return t > e && t < 1 - e && u > e && u < 1 - e ? t : null;
}

/** Intersection of two infinite lines given as point + direction, or null if parallel. */
export function lineIntersection(p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null {
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-9) return null;
  const t = cross(sub(q, p), s) / denom;
  return add(p, scale(r, t));
}

export function signedArea(poly: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

export function centroid(poly: Vec2[]): Vec2 {
  const area = signedArea(poly);
  if (Math.abs(area) < 1e-9) {
    const n = poly.length || 1;
    return scale(poly.reduce(add, { x: 0, y: 0 }), 1 / n);
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const k = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Move each edge of a polygon inward by its own distance. The polygon must have
 * positive signed area. Edge i runs from poly[i] to poly[i+1] and uses dists[i].
 */
export function insetPolygon(poly: Vec2[], dists: number[]): Vec2[] {
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const dir = normalize(sub(poly[(i + 1) % n], p));
    const normal = { x: -dir.y, y: dir.x };
    return { point: add(p, scale(normal, dists[i])), dir };
  });
  return poly.map((_, i) => {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    return lineIntersection(prev.point, prev.dir, cur.point, cur.dir) ?? cur.point;
  });
}

import type { Vec2, Wall } from '../model/types';
import { add, dist, normalize, projectOnSegment, scale, sub } from '../model/geometry';

const TOUCH = 2e-3;

/** True if point p (an end of `self`) touches any other wall. */
export function touchesOtherWall(p: Vec2, self: Wall, walls: Wall[]): boolean {
  return walls.some((w) => w !== self && projectOnSegment(p, w.a, w.b).d < TOUCH);
}

/**
 * The wall's outline as a 4-corner polygon. Ends that meet another wall are
 * extended by half the thickness so corners are filled in.
 */
export function wallOutline(w: Pick<Wall, 'a' | 'b' | 'thickness'>, extendA: boolean, extendB: boolean): Vec2[] {
  const d = normalize(sub(w.b, w.a));
  const h = w.thickness / 2;
  const n = { x: -d.y * h, y: d.x * h };
  const a = extendA ? sub(w.a, scale(d, h)) : w.a;
  const b = extendB ? add(w.b, scale(d, h)) : w.b;
  return [add(a, n), add(b, n), sub(b, n), sub(a, n)];
}

export type WallEnd = { wallId: string; end: 'a' | 'b'; orig: Vec2 };

/** Every wall end sitting exactly on point p. */
export function endsAt(p: Vec2, walls: Wall[]): WallEnd[] {
  const out: WallEnd[] = [];
  for (const w of walls) {
    if (dist(w.a, p) < TOUCH) out.push({ wallId: w.id, end: 'a', orig: w.a });
    if (dist(w.b, p) < TOUCH) out.push({ wallId: w.id, end: 'b', orig: w.b });
  }
  return out;
}

/** Both ends of a wall plus every other wall end that touches it, so they move together. */
export function endsAttachedTo(wall: Wall, walls: Wall[]): WallEnd[] {
  const out: WallEnd[] = [
    { wallId: wall.id, end: 'a', orig: wall.a },
    { wallId: wall.id, end: 'b', orig: wall.b },
  ];
  for (const w of walls) {
    if (w === wall) continue;
    if (projectOnSegment(w.a, wall.a, wall.b).d < TOUCH) out.push({ wallId: w.id, end: 'a', orig: w.a });
    if (projectOnSegment(w.b, wall.a, wall.b).d < TOUCH) out.push({ wallId: w.id, end: 'b', orig: w.b });
  }
  return out;
}

export const pointsAttr = (poly: Vec2[]): string => poly.map((p) => `${p.x},${p.y}`).join(' ');

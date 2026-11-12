import { SLAB } from './floors';
import type { Rect } from './lot';
import type { Floor, Project } from './types';

/** Depth of the shared corridor running along the back of each floor of an apartment block. */
export const CORRIDOR = 2.2;

/** Where everything in an apartment block goes, worked out from the apartment's own plan. */
export interface TowerLayout {
  /** The apartment's main floor, which every other flat in the block copies. */
  unit: Floor;
  /** Width of one flat, wall centre to wall centre: the step between neighbours. */
  unitWidth: number;
  /** Flats to the left and to the right of the user's one. */
  left: number;
  right: number;
  storeys: number;
  /** Height from one floor of the block to the next. */
  storeyHeight: number;
  /** Height of the apartment's floor above the ground. */
  base: number;
  /** The block's whole footprint on the plan, balconies included. */
  rect: Rect;
  /** The flats' outside walls (without the balconies), for the corridor and roof. */
  body: Rect;
  height: number;
}

/** Null for a house, or for an apartment with no walls yet. */
export function towerLayout(project: Project): TowerLayout | null {
  const b = project.building;
  if (project.kind !== 'apartment' || !b) return null;
  const unit = project.floors.find((f) => f.level === 0) ?? project.floors[0];
  const solid = unit.walls.filter((w) => !w.railing);
  const all = unit.walls;
  if (!solid.length) return null;
  const xs = solid.flatMap((w) => [w.a.x, w.b.x]);
  const ys = solid.flatMap((w) => [w.a.y, w.b.y]);
  const unitRect = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  const unitWidth = Math.max(1, unitRect.maxX - unitRect.minX);
  const left = Math.floor((b.unitsPerFloor - 1) / 2);
  const right = b.unitsPerFloor - 1 - left;
  const storeyHeight = unit.wallHeight + SLAB;
  const body = {
    minX: unitRect.minX - left * unitWidth,
    maxX: unitRect.maxX + right * unitWidth,
    minY: unitRect.minY - CORRIDOR,
    maxY: unitRect.maxY,
  };
  const allXs = all.flatMap((w) => [w.a.x, w.b.x]);
  const allYs = all.flatMap((w) => [w.a.y, w.b.y]);
  return {
    unit,
    unitWidth,
    left,
    right,
    storeys: b.storeys,
    storeyHeight,
    base: (b.floor - 1) * storeyHeight,
    body,
    rect: {
      minX: Math.min(body.minX, Math.min(...allXs) - left * unitWidth),
      maxX: Math.max(body.maxX, Math.max(...allXs) + right * unitWidth),
      minY: body.minY,
      maxY: Math.max(body.maxY, ...allYs),
    },
    height: b.storeys * storeyHeight,
  };
}

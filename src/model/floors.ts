import { emptyFloor, floorDefaultName, uid, type Floor, type Project } from './types';
import { dist } from './geometry';

/** Thickness of the structure between one floor's ceiling and the next floor's surface. */
export const SLAB = 0.3;

export function floorAt(project: Project, level: number): Floor | undefined {
  return project.floors.find((f) => f.level === level);
}

/** Sets every floor's elevation from the levels and wall heights. Ground floor is 0. */
export function recomputeElevations(project: Project): void {
  const floors = [...project.floors].sort((a, b) => a.level - b.level);
  const ground = floors.findIndex((f) => f.level === 0);
  if (ground < 0) return;
  const set = (f: Floor, value: number) => {
    if (Math.abs(f.elevation - value) > 1e-9) f.elevation = value;
  };
  set(floors[ground], 0);
  for (let i = ground + 1; i < floors.length; i++) {
    set(floors[i], floors[i - 1].elevation + floors[i - 1].wallHeight + SLAB);
  }
  for (let i = ground - 1; i >= 0; i--) {
    set(floors[i], floors[i + 1].elevation - floors[i].wallHeight - SLAB);
  }
}

/** Adds an empty floor on top of the house or underneath it. Returns the new floor's id. */
export function addFloor(project: Project, where: 'above' | 'below'): string {
  const levels = project.floors.map((f) => f.level);
  const edge = where === 'above' ? Math.max(...levels) : Math.min(...levels);
  const neighbour = floorAt(project, edge)!;
  const floor = emptyFloor(where === 'above' ? edge + 1 : edge - 1, neighbour.wallHeight);
  project.floors.push(floor);
  project.floors.sort((a, b) => a.level - b.level);
  return floor.id;
}

/** Removes a floor and closes the gap in the levels. The last floor cannot be removed. */
export function removeFloor(project: Project, id: string): void {
  const gone = project.floors.find((f) => f.id === id);
  if (!gone || project.floors.length < 2) return;
  project.floors = project.floors.filter((f) => f.id !== id);
  const hasAbove = project.floors.some((f) => f.level > gone.level);
  // Floors above drop down a level, unless a basement (or the lowest floor) went: then those below move up.
  const shiftAbove = gone.level > 0 || (gone.level === 0 && hasAbove);
  for (const f of project.floors) {
    const moves = shiftAbove ? f.level > gone.level : f.level < gone.level;
    if (!moves) continue;
    const next = f.level + (shiftAbove ? -1 : 1);
    if (f.name === floorDefaultName(f.level)) f.name = floorDefaultName(next);
    f.level = next;
  }
}

/** Copies the walls of one floor onto another, replacing nothing. */
export function copyWalls(from: Floor, to: Floor): void {
  for (const w of from.walls) {
    to.walls.push({ id: uid(), a: { ...w.a }, b: { ...w.b }, thickness: w.thickness, height: to.wallHeight });
  }
}

/** Keeps openings consistent after walls change: drops orphans and keeps each inside its wall. */
export function tidyFloor(floor: Floor): void {
  if (!floor.openings.length) return;
  const walls = new Map(floor.walls.map((w) => [w.id, w]));
  if (floor.openings.some((o) => !walls.has(o.wallId))) {
    floor.openings = floor.openings.filter((o) => walls.has(o.wallId));
  }
  for (const o of floor.openings) {
    const w = walls.get(o.wallId)!;
    const len = dist(w.a, w.b);
    const half = Math.min(o.width, len) / 2;
    const offset = Math.max(half, Math.min(len - half, o.offset));
    if (Math.abs(offset - o.offset) > 1e-9) o.offset = offset;
  }
}

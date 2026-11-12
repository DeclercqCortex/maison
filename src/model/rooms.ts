import type { RoomLabel, Vec2, Wall } from './types';
import {
  centroid,
  dist,
  insetPolygon,
  lerp,
  pointInPolygon,
  projectOnSegment,
  segmentCrossing,
  signedArea,
} from './geometry';

export interface Room {
  /** Outline along the wall centrelines. */
  polygon: Vec2[];
  /** Outline along the inside faces of the walls (the visible floor). */
  inner: Vec2[];
  /** Floor area inside the walls, in square metres. */
  area: number;
  centroid: Vec2;
}

/** The name and finishes pinned inside a room, if it has any. */
export function roomLabel(room: Room, labels: RoomLabel[]): RoomLabel | undefined {
  return labels.find((l) => pointInPolygon(l.at, room.polygon));
}

/** The name pinned inside a room, or a default. */
export function roomName(room: Room, labels: RoomLabel[]): string {
  return roomLabel(room, labels)?.name || 'Room';
}

/** Sets a room's name or finishes, pinning a new label inside the room if it has none yet. */
export function setRoomProps(
  floor: { labels: RoomLabel[] },
  room: Room,
  props: Partial<Pick<RoomLabel, 'name' | 'floorMaterial' | 'wallColor'>>,
  fallbackAt?: Vec2,
): void {
  const existing = roomLabel(room, floor.labels);
  if (existing) {
    Object.assign(existing, props);
    return;
  }
  // The middle of an L-shaped room can fall outside it; then pin where the user clicked.
  const at = pointInPolygon(room.centroid, room.polygon) || !fallbackAt ? room.centroid : fallbackAt;
  floor.labels.push({ id: Math.random().toString(36).slice(2, 10), at: { ...at }, name: '', ...props });
}

/** Whether a room is open to the outside: a balcony or deck, edged by a railing. */
export function isOutdoorRoom(room: Room, walls: Wall[]): boolean {
  const edges = room.polygon.map((p, i) => [p, room.polygon[(i + 1) % room.polygon.length]] as const);
  return walls.some((w) => {
    if (!w.railing) return false;
    const mid = lerp(w.a, w.b, 0.5);
    return edges.some(([a, b]) => projectOnSegment(mid, a, b).d < 0.01);
  });
}

const EPS = 1e-3;
const pointKey = (p: Vec2): string => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
const edgeKey = (u: number, v: number): string => (u < v ? `${u}-${v}` : `${v}-${u}`);

/**
 * Finds every closed room formed by a set of walls.
 *
 * Walls are first cut wherever they touch or cross each other, giving a planar
 * graph. Dead-end walls are dropped, then each enclosed face of the graph is
 * traced by always taking the sharpest turn to the same side.
 */
export function detectRooms(walls: Wall[]): Room[] {
  const verts: Vec2[] = [];
  const vertIndex = new Map<string, number>();
  const vertexId = (p: Vec2): number => {
    const k = pointKey(p);
    let id = vertIndex.get(k);
    if (id === undefined) {
      id = verts.length;
      verts.push(p);
      vertIndex.set(k, id);
    }
    return id;
  };

  const thickness = new Map<string, number>();
  const neighbours = new Map<number, Set<number>>();
  const link = (u: number, v: number) => {
    if (!neighbours.has(u)) neighbours.set(u, new Set());
    neighbours.get(u)!.add(v);
  };

  for (const w of walls) {
    if (dist(w.a, w.b) < EPS) continue;
    const cuts = [0, 1];
    for (const o of walls) {
      if (o === w) continue;
      for (const p of [o.a, o.b]) {
        const hit = projectOnSegment(p, w.a, w.b);
        if (hit.d < 2 * EPS && hit.t > 0 && hit.t < 1) cuts.push(hit.t);
      }
      const t = segmentCrossing(w.a, w.b, o.a, o.b);
      if (t !== null) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    const ids = cuts.map((t) => vertexId(lerp(w.a, w.b, t)));
    for (let i = 0; i + 1 < ids.length; i++) {
      const u = ids[i];
      const v = ids[i + 1];
      if (u === v) continue;
      const k = edgeKey(u, v);
      thickness.set(k, Math.max(thickness.get(k) ?? 0, w.thickness));
      link(u, v);
      link(v, u);
    }
  }

  // Drop dead ends: they cannot be part of a room outline.
  const queue = [...neighbours.keys()].filter((v) => neighbours.get(v)!.size === 1);
  while (queue.length) {
    const v = queue.pop()!;
    const set = neighbours.get(v);
    if (!set || set.size !== 1) continue;
    const [u] = set;
    neighbours.delete(v);
    const other = neighbours.get(u);
    if (other) {
      other.delete(v);
      if (other.size === 1) queue.push(u);
      if (other.size === 0) neighbours.delete(u);
    }
  }

  const ordered = new Map<number, number[]>();
  for (const [v, set] of neighbours) {
    const p = verts[v];
    const angle = (u: number) => Math.atan2(verts[u].y - p.y, verts[u].x - p.x);
    ordered.set(v, [...set].sort((x, y) => angle(x) - angle(y)));
  }

  const rooms: Room[] = [];
  const visited = new Set<string>();
  for (const [start, list] of ordered) {
    for (const first of list) {
      if (visited.has(`${start}>${first}`)) continue;
      const face: number[] = [];
      let u = start;
      let v = first;
      for (let guard = 0; guard < 100000; guard++) {
        visited.add(`${u}>${v}`);
        face.push(u);
        const around = ordered.get(v)!;
        const next = around[(around.indexOf(u) - 1 + around.length) % around.length];
        u = v;
        v = next;
        if (u === start && v === first) break;
      }
      const polygon = face.map((id) => verts[id]);
      // Enclosed faces come out with positive area; the outside face is negative.
      if (signedArea(polygon) <= EPS) continue;
      const insets = face.map((id, i) => (thickness.get(edgeKey(id, face[(i + 1) % face.length])) ?? 0) / 2);
      const inner = insetPolygon(polygon, insets);
      const area = signedArea(inner);
      if (area <= 0.01) continue;
      rooms.push({ polygon, inner, area, centroid: centroid(inner) });
    }
  }
  return rooms;
}

import * as THREE from 'three';
import type { Vec2 } from '../model/types';

export interface WallCut {
  /** Distance from the wall's start to the centre of the opening. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor. */
  sill: number;
}

/**
 * A wall with its openings cut out, in the wall's own frame: x runs along the
 * wall from its start, y is up, and the thickness is centred on z = 0.
 *
 * The wall face is drawn as a flat outline (with notches for doors and holes for
 * windows) and then extruded through the wall's thickness. Ends that meet
 * another wall are extended by half the thickness so corners close up.
 */
export function buildWallGeometry(
  length: number,
  height: number,
  thickness: number,
  extendStart: boolean,
  extendEnd: boolean,
  openings: WallCut[],
): THREE.BufferGeometry {
  const u0 = extendStart ? -thickness / 2 : 0;
  const u1 = length + (extendEnd ? thickness / 2 : 0);

  const cuts = openings
    .map((o) => {
      const half = Math.min(o.width, length) / 2;
      return {
        left: Math.max(0.001, o.offset - half),
        right: Math.min(length - 0.001, o.offset + half),
        bottom: Math.max(0, o.sill),
        top: Math.min(o.sill + o.height, height - 0.05),
      };
    })
    .filter((c) => c.right - c.left > 0.01 && c.top - c.bottom > 0.01)
    .sort((a, b) => a.left - b.left);

  // Drop any opening that overlaps the one before it: overlapping cuts cannot be triangulated.
  const clear: typeof cuts = [];
  for (const c of cuts) {
    if (!clear.length || c.left > clear[clear.length - 1].right + 0.001) clear.push(c);
  }

  const shape = new THREE.Shape();
  shape.moveTo(u0, 0);
  for (const c of clear) {
    if (c.bottom >= 0.005) continue;
    // A door or archway reaches the floor, so it is a notch in the outline rather than a hole.
    shape.lineTo(c.left, 0);
    shape.lineTo(c.left, c.top);
    shape.lineTo(c.right, c.top);
    shape.lineTo(c.right, 0);
  }
  shape.lineTo(u1, 0);
  shape.lineTo(u1, height);
  shape.lineTo(u0, height);
  shape.closePath();
  for (const c of clear) {
    if (c.bottom < 0.005) continue;
    const hole = new THREE.Path();
    hole.moveTo(c.left, c.bottom);
    hole.lineTo(c.right, c.bottom);
    hole.lineTo(c.right, c.top);
    hole.lineTo(c.left, c.top);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

/**
 * Colours a wall built by buildWallGeometry: one colour for the face on its
 * `side: 1` (+z), one for the opposite face, and one for the top, ends and the
 * inside edges of openings. The wall's material must use vertex colours.
 */
export function paintWallFaces(geometry: THREE.BufferGeometry, front: string, back: string, edge: string): void {
  const normals = geometry.getAttribute('normal');
  // Four channels (colour plus full opacity): the ray tracer reads vertex colours that way.
  const colors = new Float32Array(normals.count * 4);
  const [f, b, e] = [new THREE.Color(front), new THREE.Color(back), new THREE.Color(edge)];
  for (let i = 0; i < normals.count; i++) {
    const nz = normals.getZ(i);
    const c = nz > 0.5 ? f : nz < -0.5 ? b : e;
    colors.set([c.r, c.g, c.b, 1], i * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
}

function path<T extends THREE.Path>(target: T, points: Vec2[]): T {
  target.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) target.lineTo(points[i].x, points[i].y);
  target.closePath();
  return target;
}

/**
 * A flat slab (a floor or ceiling) from a plan outline, with optional holes.
 * Plan (x, y) becomes 3D (x, z). The top surface is at y = 0 and the slab hangs below it.
 */
export function buildSlabGeometry(outline: Vec2[], holes: Vec2[][], thickness: number): THREE.BufferGeometry {
  const shape = path(new THREE.Shape(), outline);
  for (const hole of holes) shape.holes.push(path(new THREE.Path(), hole));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

import * as THREE from 'three';
import type { RoofType } from '../model/types';

/** Thickness of the roof covering. */
const DECK = 0.12;
/** Thickness of the walls that fill in under a sloped roof. */
const FILL = 0.15;

export interface RoofParts {
  /** The roof covering itself. */
  roof: THREE.BufferGeometry;
  /** Wall pieces that close the gap between the wall tops and a sloped roof. */
  walls: THREE.BufferGeometry[];
  /** Height of the highest point above the wall tops. */
  rise: number;
}

function outline(points: [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  return shape;
}

/**
 * Draws a cross-section and pushes it along the roof's length. The result has
 * its length along x, the cross-section's first axis along z, and up along y.
 */
function prism(points: [number, number][], length: number, centre = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(outline(points), { depth: length, bevelEnabled: false });
  g.translate(0, 0, centre - length / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

/**
 * Builds a roof for a house `long` × `short` metres (the ridge runs along the
 * long side, which lies on x). The origin is the middle of the house at the
 * top of its walls.
 */
export function buildRoof(type: RoofType, long: number, short: number, pitchDegrees: number, overhang: number): RoofParts {
  const slope = Math.tan((pitchDegrees * Math.PI) / 180);
  const half = short / 2;
  const eave = half + overhang;
  const length = long + 2 * overhang;
  // Height of the underside of a sloped roof above the wall tops, at the wall line.
  const atWall = Math.max(0, overhang * slope - DECK);

  if (type === 'flat') {
    const roof = new THREE.BoxGeometry(long + 0.3, 0.18, short + 0.3);
    roof.translate(0, 0.09, 0);
    return { roof, walls: [], rise: 0.18 };
  }

  if (type === 'gable') {
    const rise = eave * slope;
    const roof = prism([[-eave, 0], [0, rise], [eave, 0], [eave, -DECK], [0, rise - DECK], [-eave, -DECK]], length);
    const end: [number, number][] = [[-half, 0], [half, 0], [half, atWall], [0, rise - DECK], [-half, atWall]];
    return {
      roof,
      walls: [prism(end, FILL, long / 2 - FILL / 2), prism(end, FILL, -(long / 2 - FILL / 2))],
      rise,
    };
  }

  if (type === 'shed') {
    // One slope, low on one long side and high on the other.
    const rise = 2 * eave * slope;
    const under = (across: number) => Math.max(0, (across + eave) * slope - DECK);
    const roof = prism([[-eave, 0], [eave, rise], [eave, rise - DECK], [-eave, -DECK]], length);
    const end: [number, number][] = [[-half, 0], [half, 0], [half, under(half)], [-half, under(-half)]];
    const high = under(half);
    const back = new THREE.BoxGeometry(long, high, FILL);
    // prism() turns the cross-section's +x toward -z, so the high side is at -z.
    back.translate(0, high / 2, -(half - FILL / 2));
    return {
      roof,
      walls: [prism(end, FILL, long / 2 - FILL / 2), prism(end, FILL, -(long / 2 - FILL / 2)), back],
      rise,
    };
  }

  // Hip: all four sides slope up to a short ridge.
  const rise = eave * slope;
  const lx = length / 2;
  const ridge = Math.max(0, lx - eave);
  const [a, b, c, d] = [[-lx, 0, -eave], [lx, 0, -eave], [lx, 0, eave], [-lx, 0, eave]];
  const [r1, r2] = [[-ridge, rise, 0], [ridge, rise, 0]];
  const triangles = [
    d, c, r2, d, r2, r1, // front slope
    b, a, r1, b, r1, r2, // back slope
    a, d, r1, // left end
    c, b, r2, // right end
    a, b, c, a, c, d, // underside
  ];
  const roof = new THREE.BufferGeometry();
  roof.setAttribute('position', new THREE.BufferAttribute(new Float32Array(triangles.flat()), 3));
  roof.computeVertexNormals();
  return { roof, walls: [], rise };
}

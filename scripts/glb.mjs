// Reads the measurements of a .glb 3D model without loading it into a 3D engine.
// A .glb file starts with a small header and a JSON description of the model;
// the description lists the smallest and largest coordinate of every mesh.
import { readFileSync } from 'node:fs';

/** The JSON description inside a .glb file. */
export function readGlbJson(path) {
  const data = readFileSync(path);
  if (data.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${path} is not a .glb file`);
  const length = data.readUInt32LE(12);
  if (data.toString('ascii', 16, 20) !== 'JSON') throw new Error(`${path} has no JSON description`);
  return JSON.parse(data.toString('utf8', 20, 20 + length));
}

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Multiplies two 4×4 matrices stored column by column, as glTF does. */
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
  return out;
}

/** The matrix for a node given as a translation, rotation (quaternion) and scale. */
function compose(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

/**
 * The box around a whole model: its smallest and largest x, y and z, after
 * every part has been moved into place.
 */
export function modelBounds(gltf) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    const local = node.matrix ?? compose(node.translation, node.rotation, node.scale);
    const world = multiply(parent, local);
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        if (!accessor?.min || !accessor?.max) continue;
        for (let corner = 0; corner < 8; corner++) {
          const p = [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? accessor.max[axis] : accessor.min[axis]));
          for (let axis = 0; axis < 3; axis++) {
            const v = world[axis] * p[0] + world[4 + axis] * p[1] + world[8 + axis] * p[2] + world[12 + axis];
            min[axis] = Math.min(min[axis], v);
            max[axis] = Math.max(max[axis], v);
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  const scene = gltf.scenes[gltf.scene ?? 0];
  for (const root of scene.nodes) visit(root, identity());
  return { min, max };
}

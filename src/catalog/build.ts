import * as THREE from 'three';
import type { CatalogItem, Part } from './catalog';
import { attachModel, loadModel } from './models';
import type { FurnitureStyle } from './kinds';
import { display, fitInto, plantRows } from './style';

/** A ridged roof one unit across (x), one high and one deep (z), centred on the origin. */
function unitPrism(): THREE.BufferGeometry {
  const triangle = new THREE.Shape();
  triangle.moveTo(-0.5, -0.5);
  triangle.lineTo(0.5, -0.5);
  triangle.lineTo(0, 0.5);
  triangle.closePath();
  const g = new THREE.ExtrudeGeometry(triangle, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

// Unit-sized shapes shared by every part of every item; each part just scales one.
const GEOMETRY: Record<Part['shape'], THREE.BufferGeometry> = {
  spike: new THREE.ConeGeometry(0.5, 1, 14),
  prism: unitPrism(),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 24),
  cone: new THREE.CylinderGeometry(0.3, 0.5, 1, 24),
  sphere: new THREE.SphereGeometry(0.5, 20, 14),
};

const materials = new Map<string, THREE.MeshStandardMaterial>();
const mirrors = new Set<THREE.MeshStandardMaterial>();
let reflective = false;

function setMirrorFinish(m: THREE.MeshStandardMaterial): void {
  m.metalness = reflective ? 1 : 0;
  m.roughness = reflective ? 0.03 : 0.25;
}

/**
 * Turns mirror surfaces into true mirrors, or back into plain pale glass.
 * Only the ray tracer can show reflections; in the ordinary view a true
 * mirror has nothing to reflect and would look black.
 */
export function setReflective(on: boolean): void {
  reflective = on;
  mirrors.forEach(setMirrorFinish);
}

function material(color: string, glow: boolean, glass: boolean, mirror: boolean): THREE.MeshStandardMaterial {
  const key = `${color}|${glow}|${glass}|${mirror}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: glass ? 0.1 : 0.8 });
    if (mirror) {
      mirrors.add(m);
      setMirrorFinish(m);
    }
    if (glow) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = 0.7;
    }
    if (glass) {
      m.transparent = true;
      m.opacity = 0.35;
    }
    materials.set(key, m);
  }
  return m;
}

/** Builds the 3D model of a catalog item, with its base on y = 0. */
export function buildItemObject(def: CatalogItem, color?: string): THREE.Group {
  const primary = color ?? def.colors[0];
  const group = new THREE.Group();
  // Downloaded models arrive a moment later; the group fills in when the file has loaded.
  if (def.model) attachModel(def, group);
  for (const part of def.parts) {
    const hex = part.color === 'primary' ? primary : part.color === 'secondary' ? def.secondary : part.color;
    const mesh = new THREE.Mesh(GEOMETRY[part.shape], material(hex, !!part.glow, !!part.glass, !!part.mirror));
    mesh.scale.set(...part.size);
    mesh.position.set(...part.pos);
    if (part.rot) mesh.rotation.set(...part.rot);
    mesh.castShadow = !def.flat && !part.glass;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

const OUTLINE_FILL = new THREE.MeshBasicMaterial({ color: '#8f969e', transparent: true, opacity: 0.16, depthWrite: false });
const OUTLINE_EDGE = new THREE.LineBasicMaterial({ color: '#6b7280', transparent: true, opacity: 0.85 });

/** A plain see-through box the size of a piece: where it is, without showing it in the wrong style. */
function outlineObject(def: CatalogItem): THREE.Group {
  const { w, d, h } = def.size;
  const height = Math.max(h, 0.02);
  const box = new THREE.BoxGeometry(w, height, d);
  const group = new THREE.Group();
  const fill = new THREE.Mesh(box, OUTLINE_FILL);
  fill.position.y = height / 2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), OUTLINE_EDGE);
  edges.position.y = height / 2;
  group.add(fill, edges);
  group.userData.outline = true;
  return group;
}

/**
 * The 3D object for a placed piece in the project's furniture style. The two
 * styles never mix (see `display`): a piece from the other style is drawn as
 * its closest stand-in of the same kind, turned and scaled to fit the same
 * footprint so the room's layout is the same in both styles, or, if nothing of
 * its kind exists in this style, as a plain outline of the space it takes.
 */
export function buildDisplayObject(def: CatalogItem, color: string | undefined, style: FurnitureStyle): THREE.Group {
  const shown = display(def, style);
  if (shown.as === 'itself') return buildItemObject(def, color);
  if (shown.as === 'outline') return outlineObject(def);
  const stand = shown.def;
  // A bed of flowers or a hedge is filled with copies of the plant, slightly turned so they do not look stamped out.
  const rows = plantRows(def.kind, def.size, stand.size);
  if (rows) {
    const group = new THREE.Group();
    const stepX = def.size.w / rows.across;
    const stepZ = def.size.d / rows.deep;
    for (let i = 0; i < rows.across; i++) {
      for (let j = 0; j < rows.deep; j++) {
        const copy = buildItemObject(stand);
        copy.scale.setScalar(rows.scale * (0.85 + ((i * 7 + j * 3) % 5) * 0.06));
        copy.rotation.y = ((i * 5 + j * 11) % 12) * (Math.PI / 6);
        copy.position.set(-def.size.w / 2 + stepX * (i + 0.5), 0, -def.size.d / 2 + stepZ * (j + 0.5));
        group.add(copy);
      }
    }
    group.userData.standIn = stand.id;
    return group;
  }
  const fit = fitInto(def.size, stand.size, def.kind);
  // Colours carry over only between pieces that can be recoloured.
  const inner = buildItemObject(stand, stand.parts.length ? color : undefined);
  // Turned first, then scaled along the room's axes, so the stretch lines up with the space.
  const turned = new THREE.Group();
  turned.add(inner);
  if (fit.turn) inner.rotation.y = Math.PI / 2;
  turned.scale.set(fit.x, fit.y, fit.z);
  const group = new THREE.Group();
  group.add(turned);
  group.userData.standIn = stand.id;
  return group;
}

let renderer: THREE.WebGLRenderer | null | undefined;
const thumbnails = new Map<string, string>();

/**
 * A small picture of an item for the catalog, rendered once and remembered.
 * Returns '' if the browser cannot provide a second 3D drawing surface.
 */
export async function thumbnail(def: CatalogItem): Promise<string> {
  const cached = thumbnails.get(def.id);
  if (cached !== undefined) return cached;
  // Some models come with their own preview picture: much quicker than loading the model to draw one.
  if (def.thumb) return `${import.meta.env.BASE_URL}models/${def.thumb}`;
  let url = '';
  try {
    // A downloaded model has to be fetched before it can be drawn.
    const object = def.model ? (await loadModel(def)).clone(true) : buildItemObject(def);
    if (renderer === undefined) {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(160, 160, false);
    }
    if (renderer) {
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#ffffff', '#b9b4aa', 1.3));
      const sun = new THREE.DirectionalLight('#ffffff', 1.6);
      sun.position.set(2, 4, 3);
      scene.add(sun);
      scene.add(object);
      const bounds = new THREE.Box3().setFromObject(object);
      const centre = bounds.getCenter(new THREE.Vector3());
      const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
      const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
      const distance = radius / Math.sin((15 * Math.PI) / 180);
      // Wall pieces are thin, so look at them nearly face on.
      const direction = def.placement === 'wall' ? new THREE.Vector3(0.35, 0.2, 1) : new THREE.Vector3(0.8, 0.65, 1);
      camera.position.copy(centre).addScaledVector(direction.normalize(), distance * 1.05);
      camera.lookAt(centre);
      renderer.render(scene, camera);
      url = renderer.domElement.toDataURL('image/png');
    }
  } catch (err) {
    // A model that fails to load just has no picture; only give up on drawing if the renderer itself failed.
    if (!def.model) renderer = null;
    else console.warn(`No picture for ${def.name}`, err);
  }
  thumbnails.set(def.id, url);
  return url;
}

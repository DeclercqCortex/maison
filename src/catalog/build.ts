import * as THREE from 'three';
import type { CatalogItem, Part } from './catalog';
import { attachModel, loadModel } from './models';

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

let renderer: THREE.WebGLRenderer | null | undefined;
const thumbnails = new Map<string, string>();

/**
 * A small picture of an item for the catalog, rendered once and remembered.
 * Returns '' if the browser cannot provide a second 3D drawing surface.
 */
export async function thumbnail(def: CatalogItem): Promise<string> {
  const cached = thumbnails.get(def.id);
  if (cached !== undefined) return cached;
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

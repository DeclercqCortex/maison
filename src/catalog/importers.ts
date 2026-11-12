import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import occtScriptUrl from 'occt-import-js/dist/occt-import-js.js?url';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

/**
 * Reads 3D model files and CAD files into three.js objects, ready to be
 * sized, turned and saved into the catalog as binary glTF.
 */

export type Unit = 'm' | 'cm' | 'mm' | 'in' | 'ft';
export const UNIT_METRES: Record<Unit, number> = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 };
export const UNIT_NAMES: Record<Unit, string> = { m: 'Metres', cm: 'Centimetres', mm: 'Millimetres', in: 'Inches', ft: 'Feet' };

/** File types that can be picked as the main file of a model. */
export const MODEL_EXTENSIONS = ['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply', 'dae', '3ds', '3mf', 'step', 'stp', 'iges', 'igs', 'brep', 'brp'];
const CAD = ['step', 'stp', 'iges', 'igs', 'brep', 'brp'];
/** Formats that usually come from CAD or 3D-printing programs, where z points up. */
const Z_UP = [...CAD, 'stl', '3mf', 'ply', '3ds'];

export interface ReadModel {
  object: THREE.Object3D;
  /** The main file's name without its extension. */
  name: string;
  format: string;
  /** Best guesses, which the user can change. */
  unit: Unit;
  zUp: boolean;
  triangles: number;
}

const extension = (name: string) => name.split('.').pop()!.toLowerCase();
const DEFAULT_MATERIAL = () => new THREE.MeshStandardMaterial({ color: '#c8c8c8', roughness: 0.55, metalness: 0.05 });

/** Lets loaders that fetch companion files (textures, .bin, .mtl) find them among the files the user picked. */
function managerFor(files: File[]): { manager: THREE.LoadingManager; revoke: () => void } {
  const byName = new Map<string, string>();
  for (const f of files) byName.set(f.name.toLowerCase(), URL.createObjectURL(f));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const name = decodeURIComponent(url.split(/[\\/]/).pop() ?? '').toLowerCase();
    return byName.get(name) ?? url;
  });
  return { manager, revoke: () => byName.forEach((u) => URL.revokeObjectURL(u)) };
}

type Occt = {
  ReadStepFile(content: Uint8Array, params: object | null): OcctResult;
  ReadIgesFile(content: Uint8Array, params: object | null): OcctResult;
  ReadBrepFile(content: Uint8Array, params: object | null): OcctResult;
};
interface OcctMesh {
  name?: string;
  color?: [number, number, number];
  brep_faces?: { first: number; last: number; color: [number, number, number] | null }[];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
}
interface OcctResult {
  success: boolean;
  meshes: OcctMesh[];
}

let dracoLoader: DRACOLoader | null = null;
/** The Draco decoder (in public/draco), set up once. */
function draco(): DRACOLoader {
  if (!dracoLoader) dracoLoader = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  return dracoLoader;
}

let occt: Promise<Occt> | null = null;
/** The OpenCascade CAD reader (about 7.6 MB), loaded the first time a CAD file is imported. */
function loadOcct(): Promise<Occt> {
  if (!occt) {
    occt = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = occtScriptUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('The CAD reader could not be loaded.'));
      document.head.appendChild(script);
    }).then(() => {
      const factory = (window as unknown as { occtimportjs: (o: object) => Promise<Occt> }).occtimportjs;
      return factory({ locateFile: () => occtWasmUrl });
    });
    occt.catch(() => (occt = null));
  }
  return occt;
}

/** Turns OpenCascade's triangle meshes into three.js meshes, keeping the colours the CAD file gave its faces. */
function fromOcct(result: OcctResult): THREE.Group {
  const group = new THREE.Group();
  const materials = new Map<string, THREE.Material>();
  const materialFor = (c: [number, number, number] | null | undefined) => {
    if (!c) return null;
    const key = c.map((v) => v.toFixed(3)).join(',');
    let m = materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c[0], c[1], c[2]), roughness: 0.5, metalness: 0.05 });
      materials.set(key, m);
    }
    return m;
  };
  for (const mesh of result.meshes) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
    if (mesh.attributes.normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
    g.setIndex(mesh.index.array);
    if (!mesh.attributes.normal) g.computeVertexNormals();
    const base = materialFor(mesh.color) ?? DEFAULT_MATERIAL();
    const faces = mesh.brep_faces ?? [];
    let material: THREE.Material | THREE.Material[] = base;
    // Faces with their own colours become groups with their own materials.
    if (faces.some((f) => f.color)) {
      const list: THREE.Material[] = [base];
      for (const f of faces) {
        const m = materialFor(f.color);
        let index = 0;
        if (m) {
          index = list.indexOf(m);
          if (index < 0) index = list.push(m) - 1;
        }
        g.addGroup(f.first * 3, (f.last - f.first + 1) * 3, index);
      }
      material = list;
    }
    const m = new THREE.Mesh(g, material);
    m.name = mesh.name ?? '';
    group.add(m);
  }
  return group;
}

function countTriangles(object: THREE.Object3D): number {
  let n = 0;
  object.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!(o as THREE.Mesh).isMesh || !g) return;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return Math.round(n);
}

/** The largest side of an object, in its own units. */
function largestSide(object: THREE.Object3D): number {
  const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  return Math.max(size.x, size.y, size.z);
}

/**
 * Reads the model in `files`. One file is the model itself (the first with a
 * known model extension); the rest are its companions, such as an OBJ's .mtl
 * and textures or a glTF's .bin.
 */
export async function readModelFiles(files: File[], onStatus: (text: string) => void = () => {}): Promise<ReadModel> {
  const main = files.find((f) => MODEL_EXTENSIONS.includes(extension(f.name)));
  if (!main) throw new Error(`Pick a model file: ${MODEL_EXTENSIONS.map((e) => '.' + e).join(', ')}.`);
  const format = extension(main.name);
  const name = main.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  const { manager, revoke } = managerFor(files);
  // Companion files (textures) load in the background; note when any start, and when they have all arrived.
  let started = false;
  manager.onStart = () => (started = true);
  const allLoaded = new Promise<void>((resolve) => (manager.onLoad = () => resolve()));
  let object: THREE.Object3D;
  try {
    const buffer = () => main.arrayBuffer();
    const text = () => main.text();
    switch (format) {
      case 'glb':
      case 'gltf': {
        const loader = new GLTFLoader(manager);
        // Scanned models (the Smithsonian's, for one) are often Draco-compressed.
        loader.setDRACOLoader(draco());
        const gltf = await loader.parseAsync(format === 'glb' ? await buffer() : await text(), '');
        object = gltf.scene;
        break;
      }
      case 'obj': {
        const loader = new OBJLoader(manager);
        const mtl = files.find((f) => extension(f.name) === 'mtl');
        if (mtl) {
          const materials = new MTLLoader(manager).parse(await mtl.text(), '');
          materials.preload();
          loader.setMaterials(materials);
        }
        object = loader.parse(await text());
        break;
      }
      case 'fbx':
        object = new FBXLoader(manager).parse(await buffer(), '');
        break;
      case 'stl': {
        const geometry = new STLLoader(manager).parse(await buffer());
        geometry.computeVertexNormals();
        const colored = !!geometry.getAttribute('color');
        object = new THREE.Mesh(geometry, colored ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }) : DEFAULT_MATERIAL());
        break;
      }
      case 'ply': {
        const geometry = new PLYLoader(manager).parse(await buffer());
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        const colored = !!geometry.getAttribute('color');
        object = new THREE.Mesh(geometry, colored ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }) : DEFAULT_MATERIAL());
        break;
      }
      case 'dae': {
        const collada = new ColladaLoader(manager).parse(await text(), '');
        if (!collada) throw new Error('This Collada file could not be read.');
        object = collada.scene;
        break;
      }
      case '3ds':
        object = new TDSLoader(manager).parse(await buffer(), '');
        break;
      case '3mf':
        object = new ThreeMFLoader(manager).parse(await buffer());
        break;
      default: {
        onStatus('Loading the CAD reader… (about 8 MB, the first time only)');
        const reader = await loadOcct();
        onStatus('Turning the CAD model into a mesh… (large assemblies can take a minute)');
        // Let the message show before the (blocking) conversion starts.
        await new Promise((r) => setTimeout(r, 50));
        const content = new Uint8Array(await buffer());
        // Ask for metres, and a fine enough mesh for curved surfaces to look smooth up close.
        const params = { linearUnit: 'meter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.35 };
        const result =
          format === 'iges' || format === 'igs'
            ? reader.ReadIgesFile(content, params)
            : format === 'brep' || format === 'brp'
              ? reader.ReadBrepFile(content, params)
              : reader.ReadStepFile(content, params);
        if (!result.success || !result.meshes.length) throw new Error('This CAD file has no solid shapes Maison can read.');
        object = fromOcct(result);
      }
    }
    // Wait for textures, so the preview and the saved file include them (but not forever, if one is missing).
    if (started) await Promise.race([allLoaded, new Promise((r) => setTimeout(r, 8000))]);
  } finally {
    // Keep the companion files' addresses alive a little longer, for textures still being decoded.
    setTimeout(revoke, 60_000);
  }
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !mesh.material) mesh.material = DEFAULT_MATERIAL();
  });

  // Guess the units from the size: real furniture is between a few centimetres and a few metres.
  const side = largestSide(object);
  const cad = CAD.includes(format);
  const unit: Unit = cad || format === 'glb' || format === 'gltf' ? 'm' : side > 400 ? 'mm' : side > 40 ? 'cm' : side > 8 ? 'in' : 'm';
  return { object, name: name || 'Imported model', format, unit, zUp: Z_UP.includes(format), triangles: countTriangles(object) };
}

/** How to place the read model: its units, which way is up, and how far to turn it. */
export interface Placement {
  unit: Unit;
  zUp: boolean;
  /** Quarter turns about the vertical, so its front faces the right way. */
  turns: number;
  /** Extra size factor on top of the units. */
  scale: number;
}

/**
 * The model at real size and the right way up, centred on its footprint with
 * its base on the floor, wrapped in a group. Returns its size in metres.
 */
export function prepare(read: ReadModel, p: Placement): { group: THREE.Group; size: { w: number; d: number; h: number } } {
  const inner = read.object.clone(true);
  const holder = new THREE.Group();
  holder.add(inner);
  if (p.zUp) inner.rotation.x = -Math.PI / 2;
  holder.rotation.y = (p.turns * Math.PI) / 2;
  holder.scale.setScalar(UNIT_METRES[p.unit] * p.scale);
  const group = new THREE.Group();
  group.add(holder);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const centre = box.getCenter(new THREE.Vector3());
  holder.position.set(-centre.x, -box.min.y, -centre.z);
  const size = box.getSize(new THREE.Vector3());
  return { group, size: { w: size.x, d: size.z, h: size.y } };
}

/** Saves a prepared model as one binary glTF file, with its transforms baked in. */
export async function toGlb(group: THREE.Group): Promise<Blob> {
  const data = await new GLTFExporter().parseAsync(group, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  return new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' });
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CatalogItem } from './catalog';

const loader = new GLTFLoader();
const templates = new Map<string, Promise<THREE.Group>>();
const listeners = new Set<() => void>();

/** Calls `fn` each time a model file finishes loading, so views can redraw. Returns the unsubscribe function. */
export function onModelLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Loads an item's model file (once; later calls share it) and returns it at
 * real size, centred on its footprint with its base on y = 0. The result is a
 * template: clone it rather than adding it to a scene.
 */
export function loadModel(def: CatalogItem): Promise<THREE.Group> {
  const model = def.model;
  if (!model) return Promise.reject(new Error(`${def.id} has no model file`));
  let template = templates.get(model.file);
  if (!template) {
    template = loader.loadAsync(model.url ?? `${import.meta.env.BASE_URL}models/${model.file}`).then((gltf) => {
      const inner = gltf.scene;
      inner.scale.setScalar(model.scale);
      inner.position.set(model.offset[0] * model.scale, model.offset[1] * model.scale, model.offset[2] * model.scale);
      // Some models carry their own lights (a showroom set-up); each placed copy would light the room, so drop them.
      const lights: THREE.Object3D[] = [];
      inner.traverse((o) => void ((o as THREE.Light).isLight && lights.push(o)));
      lights.forEach((l) => l.removeFromParent());
      inner.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = !def.flat;
          o.receiveShadow = true;
        }
      });
      const group = new THREE.Group();
      group.add(inner);
      return group;
    });
    templates.set(model.file, template);
  }
  return template;
}

/**
 * Fills `target` with a copy of the item's model once it has loaded. The
 * target can be added to a scene straight away; it is simply empty until then.
 */
export function attachModel(def: CatalogItem, target: THREE.Group): void {
  loadModel(def).then(
    (template) => {
      target.add(template.clone(true));
      listeners.forEach((fn) => fn());
    },
    (err) => console.warn(`Could not load the model for ${def.name}`, err),
  );
}

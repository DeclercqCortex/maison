import { useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { floorAt } from '../model/floors';
import { towerLayout, type TowerLayout } from '../model/building';
import type { Project } from '../model/types';
import { FloorModel } from './House';

type Parts = { material: THREE.Material; geometry: THREE.BufferGeometry }[];

/** Merges geometries that may carry different extra attributes, keeping the ones they all have. */
function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const names = Object.keys(list[0].attributes).filter((n) => list.every((g) => g.attributes[n]));
  for (const g of list) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  return mergeGeometries(list, false);
}

/** Bakes every visible mesh under `root` into one geometry per material, in `root`'s own coordinates. */
function bake(root: THREE.Object3D): Parts {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    for (let p: THREE.Object3D | null = mesh; p && p !== root; p = p.parent) if (!p.visible) return;
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    g.clearGroups();
    byMaterial.set(mesh.material, [...(byMaterial.get(mesh.material) ?? []), g]);
  });
  const parts: Parts = [];
  for (const [material, list] of byMaterial) {
    const geometry = mergeAll(list);
    list.forEach((g) => g.dispose());
    if (geometry) parts.push({ material, geometry });
  }
  return parts;
}

/** Where a copy of the flat goes: left or right along the block, up a number of floors. */
function copies(t: TowerLayout, occupied: Set<number>, upTo = Infinity): [number, number][] {
  const out: [number, number][] = [];
  for (let storey = 1; storey <= t.storeys && storey < upTo; storey++) {
    for (let i = -t.left; i <= t.right; i++) {
      if (i === 0 && occupied.has(storey)) continue; // the real apartment is drawn here
      out.push([i * t.unitWidth, (storey - 1) * t.storeyHeight]);
    }
  }
  return out;
}

/**
 * An apartment block, as many floors high as the user chose. The user's own
 * flat is drawn in full, furniture and all; every other flat in the block is a
 * copy of its outside (walls, windows, balcony), baked into a few large meshes
 * so even fifty floors draw quickly.
 */
export function Tower({ project, selectedItemId, upTo }: {
  project: Project;
  selectedItemId: string | null;
  /**
   * Only the floors of the block below this one, and not the apartment itself: what lies under the
   * flat when it is shown on its own from inside.
   */
  upTo?: number;
}) {
  const t = useMemo(() => towerLayout(project), [project]);
  const siding = project.exterior.siding;
  const unit = t?.unit;
  // The empty shell of one flat: what a neighbour's flat looks like from outside.
  const shell = useMemo(() => unit && { ...unit, items: [], elevation: 0 }, [unit]);
  const [source] = useState(() => new THREE.Group());
  const [parts, setParts] = useState<Parts>([]);
  const occupied = useMemo(
    () => new Set(project.floors.map((f) => (project.building?.floor ?? 1) + f.level)),
    [project.floors, project.building?.floor],
  );
  const placesKey = t ? `${upTo}:${t.storeys}:${t.left}:${t.right}:${t.unitWidth}:${t.storeyHeight}:${[...occupied].join(',')}` : '';

  useLayoutEffect(() => {
    if (!t || !shell) {
      setParts([]);
      return;
    }
    const storey = bake(source);
    const spots = copies(t, occupied, upTo);
    if (!spots.length) {
      storey.forEach((p) => p.geometry.dispose());
      setParts([]);
      return;
    }
    const built: Parts = [];
    for (const { material, geometry } of storey) {
      const placed = spots.map(([dx, dy]) => geometry.clone().translate(dx, dy, 0));
      const merged = mergeGeometries(placed, false);
      placed.forEach((g) => g.dispose());
      if (merged) built.push({ material, geometry: merged });
      geometry.dispose();
    }
    setParts(built);
    return () => built.forEach((p) => p.geometry.dispose());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell, siding, placesKey, source]);

  if (!t) {
    // No walls yet: just the apartment's own floors (which are empty).
    return null;
  }
  const { body } = t;
  const below = upTo !== undefined;
  // Seen from inside the flat, the block stops just below it.
  const height = below ? Math.min(t.height, (Math.max(1, upTo) - 1) * t.storeyHeight) : t.height;
  const wallTone = new THREE.Color(siding).multiplyScalar(0.88).getStyle();
  const bodyWidth = body.maxX - body.minX;
  const midX = (body.minX + body.maxX) / 2;
  return (
    <group>
      {shell &&
        createPortal(
          <FloorModel floor={shell} ceiling cutaway={null} selectedItemId={null} siding={siding} />,
          source,
        )}
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} castShadow receiveShadow />
      ))}
      {/* The user's own flat, at its floor. */}
      {!below && <group position-y={t.base}>
        {project.floors.map((f) => (
          <FloorModel key={f.id} floor={f} below={floorAt(project, f.level - 1)} ceiling cutaway={null}
            selectedItemId={selectedItemId} siding={siding} />
        ))}
      </group>}
      {/* The shared corridor and stairs behind the flats, rising the full height of the block. */}
      {height > 0 && <mesh position={[midX, height / 2, body.minY + 1.1]} castShadow receiveShadow>
        <boxGeometry args={[bodyWidth, height, 2.2]} />
        <meshStandardMaterial color={wallTone} roughness={0.9} />
      </mesh>}
      {/* Roof: a low wall round the edge and a plant room for the lifts. */}
      {!below && (
        [
          [midX, body.minY + 0.1, bodyWidth, 0.2],
          [midX, body.maxY - 0.1, bodyWidth, 0.2],
          [body.minX + 0.1, (body.minY + body.maxY) / 2, 0.2, body.maxY - body.minY],
          [body.maxX - 0.1, (body.minY + body.maxY) / 2, 0.2, body.maxY - body.minY],
        ] as const
      ).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, height + 0.45, z]} castShadow receiveShadow>
          <boxGeometry args={[w, 0.9, d]} />
          <meshStandardMaterial color={wallTone} roughness={0.9} />
        </mesh>
      ))}
      {!below && <mesh position={[midX, height + 1.4, body.minY + 2]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(6, bodyWidth * 0.4), 2.8, 3.6]} />
        <meshStandardMaterial color={wallTone} roughness={0.9} />
      </mesh>}
      {/* A covered entrance at the foot of the block, on the corridor side. */}
      <mesh position={[midX, 3.1, body.minY - 1.2]} castShadow receiveShadow>
        <boxGeometry args={[Math.min(8, bodyWidth * 0.5), 0.25, 2.4]} />
        <meshStandardMaterial color="#3b3f45" roughness={0.6} />
      </mesh>
    </group>
  );
}

import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildItemObject } from '../catalog/build';
import { onModelLoaded } from '../catalog/models';
import { catalogItem } from '../catalog/catalog';
import type { Item } from '../model/types';

/** The 3D object of every item on screen, by item id, so the pointer can be tested against them. */
export const itemObjects = new Map<string, THREE.Object3D>();

/** Redraws the view when a downloaded model finishes loading (the view may otherwise be idle). */
export function ModelWatcher() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => onModelLoaded(() => invalidate()), [invalidate]);
  return null;
}

/** A wire box around an item: the selection highlight and the placing guide. */
export function OutlineBox({ size, color = '#2f6fdb' }: { size: { w: number; d: number; h: number }; color?: string }) {
  const geometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(size.w + 0.04, size.h + 0.04, size.d + 0.04)),
    [size.w, size.h, size.d],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} position-y={size.h / 2}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

/** One placed piece of furniture, positioned relative to its floor. */
export const ItemModel = memo(function ItemModel({ item, selected }: { item: Item; selected: boolean }) {
  const def = catalogItem(item.catalogId);
  const object = useMemo(() => (def ? buildItemObject(def, item.color) : null), [def, item.color]);
  useEffect(() => {
    if (!object) return;
    object.userData.itemId = item.id;
    itemObjects.set(item.id, object);
    return () => {
      if (itemObjects.get(item.id) === object) itemObjects.delete(item.id);
    };
  }, [object, item.id]);
  if (!def || !object) return null;
  return (
    <group position={[item.at.x, item.elevation, item.at.y]} rotation={[0, (-item.rotation * Math.PI) / 180, 0]}>
      <primitive object={object} />
      {def.light && (
        <pointLight position={[0, def.light.y, 0]} color="#ffe2b8" intensity={def.light.intensity} distance={9} decay={2} />
      )}
      {selected && <OutlineBox size={def.size} />}
    </group>
  );
});

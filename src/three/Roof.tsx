import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { roofBase } from '../model/lot';
import type { ExteriorStyle, Floor } from '../model/types';
import { buildRoof } from './roofGeometry';

/**
 * The roof, generated over the rectangle around the top floor's walls. On a
 * house that is not a plain rectangle the roof still covers that whole
 * rectangle, so it overhangs any corner the house does not fill.
 */
export function Roof({ floors, style }: { floors: Floor[]; style: ExteriorStyle }) {
  const base = useMemo(() => roofBase(floors), [floors]);
  const { type, pitch, overhang, color } = style.roof;
  const width = base ? base.rect.maxX - base.rect.minX + base.thickness : 0;
  const depth = base ? base.rect.maxY - base.rect.minY + base.thickness : 0;
  // The ridge runs along the longer side; the roof is built that way and turned if needed.
  const turned = depth > width;
  const parts = useMemo(
    () => (width > 0 && depth > 0 ? buildRoof(type, Math.max(width, depth), Math.min(width, depth), pitch, overhang) : null),
    [type, width, depth, pitch, overhang],
  );
  useEffect(
    () => () => {
      parts?.roof.dispose();
      parts?.walls.forEach((g) => g.dispose());
    },
    [parts],
  );
  const roofMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }),
    [color],
  );
  const wallMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: style.siding, roughness: 0.85 }), [style.siding]);
  useEffect(() => () => roofMaterial.dispose(), [roofMaterial]);
  useEffect(() => () => wallMaterial.dispose(), [wallMaterial]);

  if (!base || !parts) return null;
  return (
    <group
      position={[(base.rect.minX + base.rect.maxX) / 2, base.y, (base.rect.minY + base.rect.maxY) / 2]}
      rotation={[0, turned ? Math.PI / 2 : 0, 0]}
    >
      <mesh geometry={parts.roof} material={roofMaterial} castShadow receiveShadow />
      {parts.walls.map((g, i) => (
        <mesh key={i} geometry={g} material={wallMaterial} castShadow receiveShadow />
      ))}
    </group>
  );
}

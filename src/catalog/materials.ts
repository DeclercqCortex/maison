import * as THREE from 'three';

export interface FloorMaterial {
  id: string;
  name: string;
  kind: 'wood' | 'tile' | 'carpet' | 'plain';
  color: string;
  /** Tile size in metres. */
  tile?: number;
}

export const FLOOR_MATERIALS: FloorMaterial[] = [
  { id: 'oak', name: 'Oak', kind: 'wood', color: '#c8a678' },
  { id: 'maple', name: 'Maple', kind: 'wood', color: '#e0cba5' },
  { id: 'walnut', name: 'Walnut', kind: 'wood', color: '#7d5b3e' },
  { id: 'tile-white', name: 'White tile', kind: 'tile', color: '#ecebe6', tile: 0.6 },
  { id: 'tile-grey', name: 'Grey tile', kind: 'tile', color: '#a3a8ad', tile: 0.6 },
  { id: 'tile-terracotta', name: 'Terracotta', kind: 'tile', color: '#b9684a', tile: 0.3 },
  { id: 'carpet-beige', name: 'Beige carpet', kind: 'carpet', color: '#cfc4b0' },
  { id: 'carpet-blue', name: 'Blue carpet', kind: 'carpet', color: '#6f86a6' },
  { id: 'concrete', name: 'Concrete', kind: 'plain', color: '#b9b7b1' },
];
export const DEFAULT_FLOOR = 'oak';

export const DEFAULT_WALL_COLOR = '#f1eee7';
export const WALL_COLORS = [
  DEFAULT_WALL_COLOR, '#ffffff', '#e8dcc8', '#f3d9cf', '#e9d8a6', '#d9e4dd',
  '#cfdcea', '#b8c4b0', '#8fa3ad', '#a35d4f', '#5b6770', '#3d405b',
];

/** Small repeatable random generator, so a texture looks the same every time it is made. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const shade = (hex: string, amount: number): string => {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
};

/** Paints the pattern for a floor material. Returns the canvas and the size in metres it covers. */
function paint(m: FloorMaterial): { canvas: HTMLCanvasElement; metres: [number, number] } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d')!;
  const random = seeded(m.id.length * 7919 + m.color.charCodeAt(3));
  g.fillStyle = m.color;
  g.fillRect(0, 0, 512, 512);

  if (m.kind === 'wood') {
    // Four planks across, each 15 cm wide, with joints staggered from row to row.
    const rows = 4;
    const rowH = 512 / rows;
    for (let r = 0; r < rows; r++) {
      let x = -random() * 300;
      while (x < 512) {
        const len = 220 + random() * 200;
        g.fillStyle = shade(m.color, (random() - 0.5) * 0.09);
        g.fillRect(x, r * rowH, len, rowH);
        g.strokeStyle = 'rgba(0,0,0,0.07)';
        for (let i = 0; i < 9; i++) {
          const y = r * rowH + random() * rowH;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + len, y + (random() - 0.5) * 6);
          g.stroke();
        }
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x + len - 1, r * rowH, 2, rowH);
        x += len;
      }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, r * rowH, 512, 2);
    }
    return { canvas, metres: [1.6, 0.6] };
  }
  if (m.kind === 'tile') {
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${random() > 0.5 ? '255,255,255' : '0,0,0'},0.03)`;
      g.fillRect(random() * 512, random() * 512, 6 + random() * 20, 6 + random() * 20);
    }
    g.strokeStyle = shade(m.color, -0.22);
    g.lineWidth = 8;
    g.strokeRect(0, 0, 512, 512);
    return { canvas, metres: [m.tile ?? 0.6, m.tile ?? 0.6] };
  }
  if (m.kind === 'carpet') {
    for (let i = 0; i < 14000; i++) {
      g.fillStyle = `rgba(${random() > 0.5 ? '255,255,255' : '0,0,0'},0.07)`;
      g.fillRect(random() * 512, random() * 512, 2, 2);
    }
    return { canvas, metres: [1, 1] };
  }
  return { canvas, metres: [1, 1] };
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** The 3D material for a floor finish. Floor slabs are mapped in metres, so patterns come out at real size. */
export function floorMaterial(id: string | undefined): THREE.MeshStandardMaterial {
  const def = FLOOR_MATERIALS.find((m) => m.id === id) ?? FLOOR_MATERIALS[0];
  let material = cache.get(def.id);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color: def.color, roughness: def.kind === 'tile' ? 0.35 : 0.8 });
    if (def.kind !== 'plain' && typeof document !== 'undefined') {
      const { canvas, metres } = paint(def);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1 / metres[0], 1 / metres[1]);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      material.map = texture;
      material.color.set('#ffffff');
    }
    cache.set(def.id, material);
  }
  return material;
}

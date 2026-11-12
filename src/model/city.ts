import { lotSize, type Rect } from './lot';
import type { Lot } from './types';

/**
 * The city around an apartment block, loosely modelled on Manhattan: a grid of
 * long blocks and avenues, towers that get taller toward midtown, a big park,
 * a river along the west side with the harbour beyond, the Empire State
 * Building a few blocks away and the Statue of Liberty on her island.
 *
 * Everything is worked out here as plain numbers so it can be tested; the 3D
 * view (three/City.tsx) turns it into geometry. The same lot always gives the
 * same city.
 */

/** One box of a building: centred on (x, z), standing from y to y + h. */
export interface CityBox {
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
  h: number;
}

export interface CityBuilding {
  /** Masonry (brick or stone with punched windows) or a glass curtain wall. */
  kind: 'masonry' | 'glass';
  tint: string;
  /** The building and its setbacks, bottom first. */
  boxes: CityBox[];
  /** A wooden water tank on the roof, as on many older New York buildings. */
  waterTower?: { x: number; z: number; y: number };
}

export interface Car {
  x: number;
  z: number;
  /** Which way it points: along x or along z. */
  along: 'x' | 'z';
  color: string;
}

export interface CityPlan {
  /** Width of the roads between blocks. */
  street: number;
  /** Raised pavements of the city blocks (not the apartment's own block). */
  blocks: Rect[];
  /** The apartment's own block: paved, level with the lot. */
  home: Rect;
  buildings: CityBuilding[];
  park: Rect;
  parkTrees: { x: number; z: number; size: number }[];
  /** The park's lake. */
  pond: { x: number; z: number; rx: number; rz: number };
  /** The river bank: everything west of this is water. */
  shore: number;
  /** The whole street grid, for the asphalt. */
  extent: Rect;
  /** Centre lines of the avenues (running along z), for their yellow markings. */
  avenues: number[];
  cars: Car[];
  empireState: { x: number; z: number };
  liberty: { x: number; z: number; island: number };
}

/** Distance from a point to the line segment between two others. */
function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const [dx, dz] = [bx - ax, bz - az];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Small repeatable random generator. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const MASONRY = ['#9c5a45', '#8a4b3a', '#b07a5c', '#cfc5ad', '#bdb39c', '#a5a8aa', '#c2a27a', '#d8d0c0', '#7d6a5a'];
const BROWNSTONE = ['#7a5442', '#6d4a3a', '#86604a', '#8f5a45', '#a07258'];
const GLASS = ['#9fb7c8', '#7f9bb0', '#b8c7cf', '#8aa3a0', '#a7b0bd'];
const CARS = ['#f2c230', '#f2c230', '#f2c230', '#1f2937', '#e5e7eb', '#9ca3af', '#7f1d1d', '#1e3a8a', '#374151', '#d1d5db'];

const STREET = 20;
/** How far the city reaches from the apartment, east and west, north and south. */
const REACH = { east: 1000, west: 720, north: 1250, south: 760 };

export const EMPIRE_STATE_FOOTPRINT = { w: 130, d: 57 };

export function planCity(lot: Lot): CityPlan {
  const random = seeded(1931);
  const { width, depth } = lotSize(lot);
  const { x: cx, y: cz } = lot.centre;
  // The apartment's block is the lot plus a pavement; every block is at least that big.
  const bw = Math.max(EMPIRE_STATE_FOOTPRINT.w + 16, width + 16);
  const bd = Math.max(84, depth + 16);
  const px = bw + STREET;
  const pz = bd + STREET;
  const iWest = -Math.max(3, Math.round(REACH.west / px));
  const iEast = Math.max(3, Math.round(REACH.east / px));
  const jNorth = -Math.max(6, Math.round(REACH.north / pz));
  const jSouth = Math.max(3, Math.round(REACH.south / pz));
  const blockAt = (i: number, j: number): Rect => {
    const x = cx + i * px;
    const z = cz + j * pz;
    return { minX: x - bw / 2, maxX: x + bw / 2, minY: z - bd / 2, maxY: z + bd / 2 };
  };

  // Landmarks: the Empire State Building two avenues west and several streets north,
  // the park to the north-east, and the statue out in the water to the south-west.
  const esbCell = [iWest + 1, jNorth + 3] as const;
  const parkCells = { i0: 1, i1: Math.min(iEast - 1, 3), j0: jNorth + 1, j1: jNorth + 3 };
  const parkFrom = blockAt(parkCells.i0, parkCells.j0);
  const parkTo = blockAt(parkCells.i1, parkCells.j1);
  const park = { minX: parkFrom.minX, maxX: parkTo.maxX, minY: parkFrom.minY, maxY: parkTo.maxY };
  const inPark = (i: number, j: number) => i >= parkCells.i0 && i <= parkCells.i1 && j >= parkCells.j0 && j <= parkCells.j1;
  const shore = cx + (iWest - 0.5) * px - 6;

  const esbBlock = blockAt(...esbCell);
  const empireState = { x: (esbBlock.minX + esbBlock.maxX) / 2, z: (esbBlock.minY + esbBlock.maxY) / 2 };
  // Out in the water off the west bank, where the default view of the apartment block can see her.
  const liberty = { x: shore - 380, z: cz - 700, island: 80 };

  const blocks: Rect[] = [];
  const buildings: CityBuilding[] = [];
  for (let i = iWest; i <= iEast; i++) {
    for (let j = jNorth; j <= jSouth; j++) {
      if (i === 0 && j === 0) continue; // the apartment's own block
      if (inPark(i, j)) continue;
      const block = blockAt(i, j);
      blocks.push(block);
      if (i === esbCell[0] && j === esbCell[1]) continue; // the Empire State Building has this block to itself
      // Taller toward midtown (around the Empire State Building) and lower next to the apartment.
      const fromEsb = Math.hypot(block.minX + bw / 2 - empireState.x, block.minY + bd / 2 - empireState.z);
      const boost = 1 + 1.1 * Math.max(0, 1 - fromEsb / 650);
      const near = Math.abs(i) <= 1 && Math.abs(j) <= 1;
      const inSightline = distanceToSegment(block.minX + bw / 2, block.minY + bd / 2, cx, cz, empireState.x, empireState.z) < 160;
      // South-east of the apartment, where the view of it starts from, is a quarter of low brownstone rows.
      const brownstones = i >= 0 && j >= 0 && i <= 3 && j <= 3;
      const rows = bd >= 60 ? 2 : 1;
      const rowDepth = (bd - 4) / rows;
      for (let r = 0; r < rows; r++) {
        let x = block.minX + 2;
        while (x < block.maxX - 12) {
          const roll = random();
          const tall = roll > 0.965 && !near && !brownstones;
          const w = Math.min(block.maxX - 2 - x, tall ? 30 + random() * 20 : brownstones ? 7 + random() * 6 : 14 + random() * 26);
          if (w < 10) break;
          let h = (12 + Math.pow(random(), 2.4) * 120) * boost;
          if (tall) h = 180 + random() * 140;
          if (near) h = Math.min(h, 40);
          if (brownstones) h = 11 + random() * 9;
          // Keep the blocks right around the Empire State Building lower, so it stands clear of its neighbours,
          // and those between it and the apartment, so it can be seen from there.
          h = Math.min(h, fromEsb < 260 ? 150 : inSightline ? 120 : 330);
          const d = rowDepth - 1 - random() * 4;
          const z = r === 0 ? block.minY + 2 + d / 2 : block.maxY - 2 - d / 2;
          const bx = x + w / 2;
          const glass = h > 90 && random() < 0.6;
          const tint = glass
            ? GLASS[Math.floor(random() * GLASS.length)]
            : brownstones
              ? BROWNSTONE[Math.floor(random() * BROWNSTONE.length)]
              : MASONRY[Math.floor(random() * MASONRY.length)];
          const boxes: CityBox[] = [];
          if (h > 70 && random() < 0.6) {
            // Setbacks, as the zoning rules made New York's towers step back as they rise.
            const steps = [0.55, 0.8, 1];
            const shrink = [1, 0.84, 0.66];
            let y = 0;
            steps.forEach((s, k) => {
              const top = h * s;
              boxes.push({ x: bx, z, w: w * shrink[k], d: d * shrink[k], y, h: top - y });
              y = top;
            });
          } else {
            boxes.push({ x: bx, z, w, d, y: 0, h });
          }
          const building: CityBuilding = { kind: glass ? 'glass' : 'masonry', tint, boxes };
          const top = boxes[boxes.length - 1];
          if (!glass && !brownstones && h < 80 && random() < 0.4) {
            building.waterTower = { x: top.x + (random() - 0.5) * top.w * 0.5, z: top.z + (random() - 0.5) * top.d * 0.5, y: top.y + top.h };
          }
          buildings.push(building);
          x += w + (random() < 0.15 ? 3 + random() * 6 : 0);
        }
      }
    }
  }

  const extent = { minX: shore, maxX: blockAt(iEast, 0).maxX + STREET, minY: blockAt(0, jNorth).minY - STREET, maxY: blockAt(0, jSouth).maxY + STREET };

  // Avenues run north–south between the columns of blocks; streets run east–west.
  const avenues: number[] = [];
  for (let i = iWest; i < iEast; i++) avenues.push(cx + (i + 0.5) * px);
  const streets: number[] = [];
  for (let j = jNorth - 1; j <= jSouth; j++) streets.push(cz + (j + 0.5) * pz);
  const inside = (x: number, z: number, r: Rect, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minY - pad && z < r.maxY + pad;
  const cars: Car[] = [];
  const color = () => CARS[Math.floor(random() * CARS.length)];
  for (const ax of avenues) {
    for (let k = 0; k < 26; k++) {
      const z = extent.minY + random() * (extent.maxY - extent.minY);
      const x = ax + [-6.5, -3, 3, 6.5][Math.floor(random() * 4)];
      if (!inside(x, z, park, 2)) cars.push({ x, z, along: 'z', color: color() });
    }
  }
  for (const sz of streets) {
    for (let k = 0; k < 10; k++) {
      const x = extent.minX + 10 + random() * (extent.maxX - extent.minX - 10);
      const z = sz + (random() < 0.5 ? -3.5 : 3.5);
      if (!inside(x, z, park, 2)) cars.push({ x, z, along: 'x', color: color() });
    }
  }

  const pond = { x: park.minX + (park.maxX - park.minX) * 0.62, z: park.minY + (park.maxY - park.minY) * 0.45, rx: (park.maxX - park.minX) * 0.16, rz: (park.maxY - park.minY) * 0.14 };
  const parkTrees: CityPlan['parkTrees'] = [];
  for (let tries = 0; tries < 4000 && parkTrees.length < 380; tries++) {
    const x = park.minX + 6 + random() * (park.maxX - park.minX - 12);
    const z = park.minY + 6 + random() * (park.maxY - park.minY - 12);
    if (Math.hypot((x - pond.x) / (pond.rx + 6), (z - pond.z) / (pond.rz + 6)) < 1) continue;
    // Open lawns between the groves.
    if (Math.sin(x * 0.05) * Math.cos(z * 0.06) > 0.35) continue;
    parkTrees.push({ x, z, size: 0.8 + random() * 0.7 });
  }

  return {
    street: STREET,
    blocks,
    home: blockAt(0, 0),
    buildings,
    park,
    parkTrees,
    pond,
    shore,
    extent,
    avenues,
    cars,
    empireState,
    liberty,
  };
}

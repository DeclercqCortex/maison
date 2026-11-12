import type { FurnitureStyle } from '../catalog/kinds';

/** All lengths are in metres. Plan coordinates: x to the right, y down the page. */
export type Vec2 = { x: number; y: number };

export type Units = 'metric' | 'imperial';

export interface Wall {
  id: string;
  a: Vec2;
  b: Vec2;
  thickness: number;
  height: number;
  /** A low glass balustrade (a balcony or deck edge) rather than a full wall. */
  railing?: boolean;
}

/** Height of a balcony railing. */
export const RAILING_HEIGHT = 1.05;

export type OpeningType = 'door' | 'window' | 'archway';

/** A hole in a wall: a door, a window, or an open archway. */
export interface Opening {
  id: string;
  wallId: string;
  type: OpeningType;
  /** Distance from the wall's start (a) to the centre of the opening. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor. */
  sill: number;
  /** Which side of the wall a door swings into: 1 or -1 along the wall's normal. */
  side: 1 | -1;
  /** Door hinge at the end nearer the wall's end (b) instead of its start (a). */
  hingeAtB: boolean;
}

export type FeatureType = 'stairs' | 'fireplace' | 'column';
export type StairShape = 'straight' | 'L' | 'U' | 'spiral';

/** A fixed object standing on the floor. Stairs lead up to the next floor. */
export interface Feature {
  id: string;
  type: FeatureType;
  /** Centre of the footprint. */
  at: Vec2;
  /** Degrees, clockwise on the page. */
  rotation: number;
  width: number;
  depth: number;
  shape?: StairShape;
}

/** A piece of furniture or decoration from the catalog. */
export interface Item {
  id: string;
  catalogId: string;
  /** Centre of the footprint on the plan. */
  at: Vec2;
  /** Height of the item's base above the floor (wall pieces, things on tables, ceiling lights). */
  elevation: number;
  /** Degrees, clockwise on the plan. The item's front faces local +y. */
  rotation: number;
  /** Overrides the catalog's default colour. */
  color?: string;
}

/**
 * A room's name and finishes, pinned to a point. The room containing the
 * point gets them, so they survive the walls being redrawn around it.
 */
export interface RoomLabel {
  id: string;
  at: Vec2;
  name: string;
  /** Id of a floor finish from the materials list. */
  floorMaterial?: string;
  wallColor?: string;
}

export interface Floor {
  id: string;
  name: string;
  /** 0 is the ground floor, 1 the floor above it, -1 the basement. */
  level: number;
  /** Height of this floor's surface above the ground floor. Derived from the levels. */
  elevation: number;
  wallHeight: number;
  walls: Wall[];
  labels: RoomLabel[];
  openings: Opening[];
  features: Feature[];
  items: Item[];
}

/** The piece of land the house stands on: a rectangle of grassland. */
export interface Lot {
  acres: number;
  /** Width divided by depth: 1 is square, 2 is twice as wide as it is deep. */
  aspect: number;
  /** Middle of the lot on the plan, so the house can sit anywhere on it. */
  centre: Vec2;
  fence: boolean;
}

export type RoofType = 'gable' | 'hip' | 'shed' | 'flat';

/** How the house looks from outside. */
export interface ExteriorStyle {
  roof: { type: RoofType; /** Slope in degrees. */ pitch: number; /** How far the roof sticks out past the walls. */ overhang: number; color: string };
  /** Colour of the outside faces of the walls. */
  siding: string;
}

/** A house stands on its own lot; an apartment is one unit in a block of flats. */
export type ProjectKind = 'house' | 'apartment';

/** The apartment block an apartment belongs to. */
export interface Building {
  /** Floors in the block, 1 to 50. */
  storeys: number;
  /** Which of them the apartment is on, counting the ground floor as 1. */
  floor: number;
  /** Apartments side by side on each floor (the user's one is in the middle). */
  unitsPerFloor: number;
}

export const MAX_STOREYS = 50;
export const defaultBuilding = (): Building => ({ storeys: 12, floor: 8, unitsPerFloor: 3 });

export interface Project {
  version: 2;
  kind: ProjectKind;
  /** Only for apartments. */
  building?: Building;
  name: string;
  units: Units;
  floors: Floor[];
  lot: Lot;
  exterior: ExteriorStyle;
  /** Trees, garden furniture and other things placed on the lot. */
  outdoor: Item[];
  /** How the furniture is drawn: simple low-poly pieces (the default) or realistic textured ones. */
  furnitureStyle?: FurnitureStyle;
}

export const defaultLot = (): Lot => ({ acres: 1, aspect: 1, centre: { x: 0, y: 0 }, fence: true });
export const defaultExterior = (): ExteriorStyle => ({
  roof: { type: 'gable', pitch: 30, overhang: 0.4, color: '#5a4a42' },
  siding: '#f1eee7',
});

export const DEFAULT_WALL_THICKNESS = 0.15;
export const DEFAULT_WALL_HEIGHT = 2.7;

export const OPENING_DEFAULTS: Record<OpeningType, { width: number; height: number; sill: number }> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
  archway: { width: 1.0, height: 2.1, sill: 0 },
};

export const STAIR_SIZES: Record<StairShape, { width: number; depth: number }> = {
  straight: { width: 1.0, depth: 3.0 },
  L: { width: 2.0, depth: 2.4 },
  U: { width: 2.0, depth: 2.6 },
  spiral: { width: 1.8, depth: 1.8 },
};

export const FEATURE_DEFAULTS: Record<FeatureType, { width: number; depth: number; shape?: StairShape }> = {
  stairs: { ...STAIR_SIZES.straight, shape: 'straight' },
  fireplace: { width: 1.4, depth: 0.5 },
  column: { width: 0.3, depth: 0.3 },
};

export const uid = (): string => Math.random().toString(36).slice(2, 10);

export function floorDefaultName(level: number): string {
  if (level === 0) return 'Ground floor';
  if (level > 0) return `Floor ${level}`;
  return level === -1 ? 'Basement' : `Basement ${-level}`;
}

export function emptyFloor(level: number, wallHeight = DEFAULT_WALL_HEIGHT): Floor {
  return {
    id: uid(),
    name: floorDefaultName(level),
    level,
    elevation: 0,
    wallHeight,
    walls: [],
    labels: [],
    openings: [],
    features: [],
    items: [],
  };
}

export function emptyProject(): Project {
  return {
    version: 2, kind: 'house', name: 'My house', units: 'metric', floors: [emptyFloor(0)],
    lot: defaultLot(), exterior: defaultExterior(), outdoor: [],
  };
}

/**
 * Checks data read from storage or a file and brings older versions up to date.
 * Returns null if it is not a Maison project.
 */
export function migrateProject(value: unknown): Project | null {
  const p = value as
    | {
        version?: unknown; kind?: unknown; building?: Partial<Building>; name?: unknown; units?: unknown; floors?: unknown;
        lot?: Lot; exterior?: ExteriorStyle; outdoor?: unknown; furnitureStyle?: unknown;
      }
    | null;
  if (!p || (p.version !== 1 && p.version !== 2)) return null;
  if (typeof p.name !== 'string' || (p.units !== 'metric' && p.units !== 'imperial')) return null;
  if (!Array.isArray(p.floors) || p.floors.length === 0) return null;
  const floors = p.floors as Partial<Floor>[];
  if (!floors.every((f) => f && Array.isArray(f.walls) && Array.isArray(f.labels))) return null;
  // Projects saved before apartments existed are houses.
  const kind: ProjectKind = p.kind === 'apartment' ? 'apartment' : 'house';
  return {
    version: 2,
    kind,
    ...(kind === 'apartment' ? { building: clampBuilding({ ...defaultBuilding(), ...(p.building ?? {}) }) } : {}),
    name: p.name,
    units: p.units,
    floors: floors.map((f, i) => ({
      ...(f as Floor),
      // Version 1 had no levels: floors were stored bottom to top starting at the ground.
      level: typeof f.level === 'number' ? f.level : i,
      openings: Array.isArray(f.openings) ? f.openings : [],
      features: Array.isArray(f.features) ? f.features : [],
      items: Array.isArray(f.items) ? f.items : [],
    })),
    // Plans saved before the exterior existed get the default lot and roof.
    lot: { ...defaultLot(), ...(typeof p.lot === 'object' ? p.lot : {}) },
    exterior: {
      ...defaultExterior(),
      ...(typeof p.exterior === 'object' ? p.exterior : {}),
      roof: { ...defaultExterior().roof, ...(p.exterior?.roof ?? {}) },
    },
    outdoor: Array.isArray(p.outdoor) ? (p.outdoor as Item[]) : [],
    ...(p.furnitureStyle === 'realistic' ? { furnitureStyle: 'realistic' as const } : {}),
  };
}

/** Keeps a building's numbers whole and in range, with the apartment on one of its floors. */
export function clampBuilding(b: Building): Building {
  const whole = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));
  const storeys = whole(b.storeys, 1, MAX_STOREYS);
  return { storeys, floor: whole(b.floor, 1, storeys), unitsPerFloor: whole(b.unitsPerFloor, 1, 5) };
}

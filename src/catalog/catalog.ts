/**
 * The furniture and decoration catalog.
 *
 * Every item is described as a handful of simple solids (boxes, cylinders,
 * spheres), so the whole catalog ships with the app and needs no downloads.
 * An item sits in its own frame: x across its width, y up from its base,
 * z through its depth with the front at +z and the back (the wall side) at -z.
 */
import downloaded from './models.json';

export type Placement = 'floor' | 'wall' | 'ceiling' | 'surface';
export type Category = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'office' | 'lighting' | 'decor' | 'outdoor';

/** The indoor categories, in the order the catalog shows them. Outdoor pieces have their own catalog. */
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'living', label: 'Living' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'office', label: 'Office' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'decor', label: 'Decor' },
];

export interface Part {
  /** 'cone' is a tapered shade or pot, 'spike' comes to a point, 'prism' is a ridged roof (triangle across x, running along z). */
  shape: 'box' | 'cyl' | 'cone' | 'sphere' | 'spike' | 'prism';
  /** Full extent along x, y, z. */
  size: [number, number, number];
  /** Centre of the part. */
  pos: [number, number, number];
  /** 'primary' (the colour the user can change), 'secondary', or a fixed hex colour. */
  color: string;
  rot?: [number, number, number];
  /** Lit from within (lamp shades, bulbs). */
  glow?: boolean;
  glass?: boolean;
  /** A mirror: reflects the room when the view is ray traced. */
  mirror?: boolean;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: Category;
  placement: Placement;
  size: { w: number; d: number; h: number };
  /** Choices for the primary colour; the first is the default. */
  colors: string[];
  secondary: string;
  parts: Part[];
  /** A light source, at height y above the item's base. */
  light?: { y: number; intensity: number };
  /** Lies flat on the floor (rugs, patios): other things may stand on it. */
  flat?: boolean;
  /** The part that other things cannot overlap, when smaller than the whole (a tree's trunk). */
  collide?: { w: number; d: number };
  /** Sub-heading in the garden catalog (Trees, Rocks, ...). */
  group?: string;
  /**
   * A ready-made 3D model file to show instead of `parts`. `scale` enlarges it
   * to real size and `offset` (in the file's own units) centres it on its
   * footprint with its base on the floor.
   */
  model?: { file: string; scale: number; offset: [number, number, number] };
  /** A ready-made preview picture (under public/models), used instead of drawing one. */
  thumb?: string;
}

const P = 'primary';
const S = 'secondary';
const DARK = '#2b2b2e';
const WHITE = '#f6f5f1';
const STEEL = '#b9bec4';
const LEAF = '#4f7d4a';

const FABRICS = ['#8d99ae', '#c9b79c', '#5f7a61', '#a35d4f', '#3d405b', '#d9d6cf'];
const WOODS = ['#a47148', '#6f4e37', '#d7b98e', '#3b2f2f', '#efe9dd'];
const PAINTS = ['#f6f5f1', '#2e2e30', '#9aa5b1', '#5f7a61', '#3d405b'];
const SHADES = ['#f3e9d2', '#ffffff', '#d98f5c', '#5f7a61'];
const FOLIAGE = ['#4f7d4a', '#6a9a4e', '#3f6b4a', '#c58a3a', '#a8552f'];
const BARK = '#5b4636';

type Extra = Partial<Pick<Part, 'rot' | 'glow' | 'glass' | 'mirror'>>;
/** A box resting at height y (its underside), centred on x and z. */
const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, color = P, extra: Extra = {}): Part => ({
  shape: 'box', size: [w, h, d], pos: [x, y + h / 2, z], color, ...extra,
});
const cyl = (dia: number, h: number, x = 0, y = 0, z = 0, color = P, extra: Extra = {}): Part => ({
  shape: 'cyl', size: [dia, h, dia], pos: [x, y + h / 2, z], color, ...extra,
});
/** A tapered shade or pot: narrower at the top. */
const cone = (dia: number, h: number, x = 0, y = 0, z = 0, color = P, extra: Extra = {}): Part => ({
  shape: 'cone', size: [dia, h, dia], pos: [x, y + h / 2, z], color, ...extra,
});
/** A pointed cone (a pine's branches). */
const spike = (dia: number, h: number, x = 0, y = 0, z = 0, color = P): Part => ({
  shape: 'spike', size: [dia, h, dia], pos: [x, y + h / 2, z], color,
});
/** A ridged roof: `w` across, `h` to the ridge, running `d` deep. */
const prism = (w: number, h: number, d: number, x = 0, y = 0, z = 0, color = P): Part => ({
  shape: 'prism', size: [w, h, d], pos: [x, y + h / 2, z], color,
});
/** A ball centred at height y. */
const ball = (dia: number, x: number, y: number, z: number, color: string, extra: Extra = {}): Part => ({
  shape: 'sphere', size: [dia, dia, dia], pos: [x, y, z], color, ...extra,
});
const legs = (w: number, d: number, h: number, t = 0.05, color = S, inset = 0.03): Part[] =>
  [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => box(t, h, t, sx * (w / 2 - inset - t / 2), 0, sz * (d / 2 - inset - t / 2), color)),
  );
const table = (w: number, d: number, h: number, top = 0.04, leg = 0.06): Part[] => [
  box(w, top, d, 0, h - top, 0),
  ...legs(w, d, h - top, leg, P),
];

function sofa(w: number): Part[] {
  const inner = w - 0.32;
  const n = Math.max(1, Math.round(inner / 0.65));
  const cw = inner / n;
  return [
    ...legs(w, 0.9, 0.12, 0.06, DARK),
    box(w, 0.28, 0.9, 0, 0.12, 0),
    box(w, 0.42, 0.2, 0, 0.4, -0.35),
    box(0.16, 0.25, 0.9, -(w - 0.16) / 2, 0.4, 0),
    box(0.16, 0.25, 0.9, (w - 0.16) / 2, 0.4, 0),
    ...Array.from({ length: n }, (_, i) => box(cw - 0.03, 0.1, 0.6, -inner / 2 + cw * (i + 0.5), 0.4, 0.1)),
  ];
}

function bed(w: number, length: number): Part[] {
  const pillows = w > 1.2 ? [-w / 4, w / 4] : [0];
  return [
    box(w, 0.3, length, 0, 0, 0, S),
    box(w - 0.06, 0.2, length - 0.1, 0, 0.3, 0.03, '#f4f1ea'),
    box(w, 0.95, 0.07, 0, 0, -length / 2 + 0.035, S),
    ...pillows.map((x) => box(Math.min(0.6, w * 0.42), 0.1, 0.36, x, 0.5, -length / 2 + 0.32, '#ffffff')),
    box(w - 0.04, 0.04, length * 0.62, 0, 0.5, length * 0.17),
  ];
}

const BOOKS = ['#a35d4f', '#3d405b', '#c9b79c', '#5f7a61', '#d98f5c', '#6f4e37', '#8d99ae'];
function bookshelf(): Part[] {
  const parts = [
    box(0.03, 1.9, 0.3, -0.435, 0, 0),
    box(0.03, 1.9, 0.3, 0.435, 0, 0),
    box(0.9, 1.9, 0.015, 0, 0, -0.1425),
  ];
  for (let i = 0; i < 6; i++) {
    const y = 0.02 + i * 0.37;
    parts.push(box(0.84, 0.025, 0.28, 0, y, 0));
    if (i === 5) break;
    for (let j = 0; j < 7; j++) {
      const thick = 0.045 + 0.012 * ((i + j) % 3);
      parts.push(box(thick, 0.26 - 0.03 * ((i * 2 + j) % 3), 0.2, -0.36 + j * 0.085 + (i % 2) * 0.06, y + 0.025, 0.01, BOOKS[(i * 3 + j) % BOOKS.length]));
    }
  }
  return parts;
}

/** A cabinet body with a worktop, used for kitchen units. */
const unit = (w: number, d = 0.6): Part[] => [
  box(w, 0.1, d - 0.08, 0, 0, -0.04, DARK),
  box(w, 0.76, d - 0.02, 0, 0.1, -0.01),
  box(w + 0.02, 0.04, d + 0.02, 0, 0.86, 0, S),
  box(w * 0.5, 0.015, 0.02, 0, 0.74, d / 2 - 0.01, STEEL),
];

function chair(): Part[] {
  return [
    ...legs(0.45, 0.45, 0.45, 0.04, P),
    box(0.45, 0.04, 0.45, 0, 0.45, 0),
    box(0.04, 0.45, 0.04, -0.185, 0.49, -0.205),
    box(0.04, 0.45, 0.04, 0.185, 0.49, -0.205),
    box(0.45, 0.2, 0.03, 0, 0.72, -0.21),
    box(0.4, 0.03, 0.4, 0, 0.49, 0.01, S),
  ];
}

const plantLeaves = (y: number, spread: number, size: number): Part[] => [
  ball(size, 0, y, 0, LEAF),
  ball(size * 0.8, spread, y - size * 0.15, spread * 0.4, '#5c8f56'),
  ball(size * 0.75, -spread * 0.8, y + size * 0.1, -spread * 0.5, '#456f41'),
  ball(size * 0.7, spread * 0.2, y + size * 0.35, -spread * 0.7, '#5c8f56'),
];

const item = (
  id: string,
  name: string,
  category: Category,
  placement: Placement,
  size: [number, number, number],
  colors: string[],
  secondary: string,
  parts: Part[],
  extra: Partial<Pick<CatalogItem, 'light' | 'flat' | 'collide'>> = {},
): CatalogItem => ({ id, name, category, placement, size: { w: size[0], d: size[1], h: size[2] }, colors, secondary, parts, ...extra });

/** Sub-headings for the built-in garden pieces. */
const BUILT_IN_GROUPS: Record<string, string> = {
  'tree-oak': 'Trees', 'tree-pine': 'Trees', 'tree-young': 'Trees', bush: 'Plants', hedge: 'Plants', flowers: 'Plants',
  rock: 'Rocks', boulder: 'Rocks', 'veg-bed': 'Crops', 'hay-bale': 'Crops', 'fire-pit': 'Camping',
};

const BUILT_IN: CatalogItem[] = [
  // Living room
  item('sofa-2', 'Sofa, 2 seats', 'living', 'floor', [1.6, 0.9, 0.82], FABRICS, DARK, sofa(1.6)),
  item('sofa-3', 'Sofa, 3 seats', 'living', 'floor', [2.3, 0.9, 0.82], FABRICS, DARK, sofa(2.3)),
  item('armchair', 'Armchair', 'living', 'floor', [0.95, 0.9, 0.82], FABRICS, DARK, sofa(0.95)),
  item('coffee-table', 'Coffee table', 'living', 'floor', [1.1, 0.6, 0.42], WOODS, DARK, table(1.1, 0.6, 0.42)),
  item('side-table', 'Side table', 'living', 'floor', [0.45, 0.45, 0.52], WOODS, DARK, table(0.45, 0.45, 0.52, 0.03, 0.04)),
  item('tv-stand', 'TV stand', 'living', 'floor', [1.6, 0.42, 0.5], WOODS, DARK, [
    ...legs(1.6, 0.42, 0.1, 0.05, DARK), box(1.6, 0.4, 0.42, 0, 0.1, 0), box(0.02, 0.34, 0.01, 0, 0.13, 0.212, DARK),
  ]),
  item('tv', 'Television', 'living', 'wall', [1.25, 0.05, 0.72], [DARK], DARK, [
    box(1.25, 0.72, 0.04, 0, 0, 0, '#1c1c1e'), box(1.19, 0.66, 0.006, 0, 0.03, 0.021, '#2f3a4a'),
  ]),
  item('bookshelf', 'Bookshelf', 'living', 'floor', [0.9, 0.3, 1.9], WOODS, DARK, bookshelf()),
  item('rug', 'Rug', 'living', 'floor', [2.0, 1.4, 0.015], FABRICS, '#efe9dd', [
    box(2.0, 0.012, 1.4), box(1.7, 0.015, 1.1, 0, 0, 0, S), box(1.5, 0.017, 0.9),
  ], { flat: true }),
  item('rug-round', 'Round rug', 'living', 'floor', [1.6, 1.6, 0.015], FABRICS, '#efe9dd', [
    cyl(1.6, 0.012), cyl(1.25, 0.015, 0, 0, 0, S), cyl(0.9, 0.017),
  ], { flat: true }),

  // Bedroom
  item('bed-single', 'Single bed', 'bedroom', 'floor', [0.95, 2.05, 0.95], FABRICS, '#a47148', bed(0.95, 2.05)),
  item('bed-double', 'Double bed', 'bedroom', 'floor', [1.45, 2.05, 0.95], FABRICS, '#a47148', bed(1.45, 2.05)),
  item('bed-king', 'King bed', 'bedroom', 'floor', [1.85, 2.1, 0.95], FABRICS, '#a47148', bed(1.85, 2.1)),
  item('nightstand', 'Nightstand', 'bedroom', 'floor', [0.45, 0.4, 0.55], WOODS, STEEL, [
    ...legs(0.45, 0.4, 0.12, 0.04, P), box(0.45, 0.43, 0.4, 0, 0.12, 0), box(0.12, 0.015, 0.02, 0, 0.42, 0.2, S), box(0.12, 0.015, 0.02, 0, 0.24, 0.2, S),
  ]),
  item('wardrobe', 'Wardrobe', 'bedroom', 'floor', [1.2, 0.6, 2.0], WOODS, STEEL, [
    box(1.2, 2.0, 0.6), box(0.008, 1.9, 0.01, 0, 0.05, 0.3, DARK), box(0.02, 0.25, 0.02, -0.06, 0.95, 0.31, S), box(0.02, 0.25, 0.02, 0.06, 0.95, 0.31, S),
  ]),
  item('dresser', 'Dresser', 'bedroom', 'floor', [1.0, 0.45, 0.8], WOODS, STEEL, [
    ...legs(1.0, 0.45, 0.1, 0.05, P), box(1.0, 0.7, 0.45, 0, 0.1, 0),
    ...[0.2, 0.43, 0.66].flatMap((y) => [box(0.94, 0.006, 0.01, 0, y - 0.09, 0.225, DARK), box(0.16, 0.015, 0.02, 0, y, 0.23, S)]),
  ]),

  // Kitchen and dining
  item('cabinet-base', 'Base cabinet', 'kitchen', 'floor', [0.6, 0.6, 0.9], PAINTS, '#d8d5cd', unit(0.6)),
  item('cabinet-sink', 'Sink cabinet', 'kitchen', 'floor', [0.8, 0.6, 1.12], PAINTS, '#d8d5cd', [
    ...unit(0.8), box(0.5, 0.012, 0.36, 0, 0.895, 0.02, '#8f969d'), cyl(0.025, 0.2, 0, 0.9, -0.22, STEEL), box(0.025, 0.025, 0.14, 0, 1.09, -0.16, STEEL),
  ]),
  item('stove', 'Stove', 'kitchen', 'floor', [0.6, 0.6, 0.9], [STEEL, WHITE, DARK], DARK, [
    box(0.6, 0.88, 0.58, 0, 0, -0.01), box(0.6, 0.02, 0.6, 0, 0.88, 0, DARK), box(0.48, 0.42, 0.01, 0, 0.2, 0.285, '#1f1f22'),
    box(0.5, 0.02, 0.03, 0, 0.68, 0.3, S),
    ...[-0.14, 0.14].flatMap((x) => [-0.13, 0.13].map((z) => cyl(0.17, 0.008, x, 0.9, z, '#3a3a3e'))),
  ]),
  item('fridge', 'Fridge', 'kitchen', 'floor', [0.7, 0.7, 1.8], [STEEL, WHITE, DARK], DARK, [
    box(0.7, 1.8, 0.66, 0, 0, -0.02), box(0.69, 0.006, 0.01, 0, 1.2, 0.315, S),
    box(0.02, 0.4, 0.03, -0.28, 0.7, 0.325, S), box(0.02, 0.3, 0.03, -0.28, 1.3, 0.325, S),
  ]),
  item('cabinet-wall', 'Wall cabinet', 'kitchen', 'wall', [0.6, 0.35, 0.7], PAINTS, STEEL, [
    box(0.6, 0.7, 0.35), box(0.006, 0.66, 0.01, 0, 0.02, 0.175, DARK), box(0.015, 0.14, 0.02, -0.05, 0.08, 0.185, S), box(0.015, 0.14, 0.02, 0.05, 0.08, 0.185, S),
  ]),
  item('island', 'Kitchen island', 'kitchen', 'floor', [1.6, 0.9, 0.9], PAINTS, '#d8d5cd', unit(1.6, 0.9)),
  item('dining-table', 'Dining table', 'kitchen', 'floor', [1.6, 0.9, 0.75], WOODS, DARK, table(1.6, 0.9, 0.75, 0.045, 0.07)),
  item('table-round', 'Round table', 'kitchen', 'floor', [1.1, 1.1, 0.75], WOODS, DARK, [
    cyl(1.1, 0.04, 0, 0.71), cyl(0.1, 0.69, 0, 0.02), cyl(0.55, 0.03),
  ]),
  item('chair', 'Dining chair', 'kitchen', 'floor', [0.45, 0.48, 0.92], WOODS, '#d9d6cf', chair()),
  item('stool', 'Bar stool', 'kitchen', 'floor', [0.38, 0.38, 0.75], WOODS, DARK, [
    cyl(0.36, 0.05, 0, 0.7), ...legs(0.36, 0.36, 0.7, 0.03, S, 0.04), cyl(0.3, 0.015, 0, 0.25, 0, S),
  ]),

  // Bathroom
  item('toilet', 'Toilet', 'bathroom', 'floor', [0.4, 0.7, 0.8], [WHITE], WHITE, [
    box(0.4, 0.4, 0.18, 0, 0.4, -0.26), box(0.42, 0.03, 0.2, 0, 0.8 - 0.03, -0.26),
    cyl(0.3, 0.38, 0, 0, 0.02), cyl(0.38, 0.05, 0, 0.38, 0.08), box(0.26, 0.38, 0.22, 0, 0, -0.1),
  ]),
  item('bathtub', 'Bathtub', 'bathroom', 'floor', [0.8, 1.7, 0.75], [WHITE], STEEL, [
    box(0.8, 0.58, 1.7), box(0.66, 0.01, 1.54, 0, 0.575, 0, '#cfe6f1'), cyl(0.03, 0.14, 0, 0.58, -0.78, S), box(0.03, 0.03, 0.12, 0, 0.7, -0.73, S),
  ]),
  item('shower', 'Shower', 'bathroom', 'floor', [0.9, 0.9, 2.0], [WHITE], STEEL, [
    box(0.9, 0.06, 0.9), box(0.9, 1.94, 0.01, 0, 0.06, 0.44, '#bfe0ee', { glass: true }), box(0.01, 1.94, 0.9, 0.44, 0.06, 0, '#bfe0ee', { glass: true }),
    cyl(0.025, 1.9, -0.38, 0.06, -0.38, S), cyl(0.2, 0.02, -0.26, 1.94, -0.26, S),
  ]),
  item('vanity', 'Sink vanity', 'bathroom', 'floor', [0.8, 0.5, 1.0], [...WOODS, WHITE], WHITE, [
    box(0.8, 0.74, 0.48, 0, 0.08, -0.01), box(0.82, 0.04, 0.5, 0, 0.82, 0, S), box(0.42, 0.012, 0.3, 0, 0.855, 0.03, '#dfe7ec'),
    cyl(0.025, 0.14, 0, 0.86, -0.17, STEEL), box(0.008, 0.7, 0.01, 0, 0.1, 0.235, DARK),
  ]),
  item('mirror', 'Mirror', 'bathroom', 'wall', [0.6, 0.04, 0.8], WOODS, '#cfe3ee', [
    box(0.6, 0.8, 0.03), box(0.52, 0.72, 0.008, 0, 0.04, 0.016, S, { mirror: true }),
  ]),

  // Office
  item('desk', 'Desk', 'office', 'floor', [1.4, 0.7, 0.75], WOODS, DARK, [
    box(1.4, 0.04, 0.7, 0, 0.71), box(0.04, 0.71, 0.64, -0.66, 0, 0), box(0.04, 0.71, 0.64, 0.66, 0, 0), box(1.28, 0.3, 0.02, 0, 0.38, -0.3),
  ]),
  item('office-chair', 'Office chair', 'office', 'floor', [0.6, 0.6, 1.0], FABRICS, DARK, [
    cyl(0.56, 0.04, 0, 0.02, 0, S), cyl(0.06, 0.38, 0, 0.06, 0, S), box(0.48, 0.07, 0.46, 0, 0.44, 0.01),
    box(0.44, 0.5, 0.06, 0, 0.5, -0.22), box(0.04, 0.2, 0.3, -0.26, 0.5, 0, S), box(0.04, 0.2, 0.3, 0.26, 0.5, 0, S),
  ]),
  item('filing-cabinet', 'Filing cabinet', 'office', 'floor', [0.45, 0.55, 0.7], [STEEL, WHITE, DARK], DARK, [
    box(0.45, 0.7, 0.55), box(0.41, 0.006, 0.01, 0, 0.36, 0.275, S), box(0.14, 0.015, 0.02, 0, 0.52, 0.28, S), box(0.14, 0.015, 0.02, 0, 0.18, 0.28, S),
  ]),
  item('monitor', 'Computer monitor', 'office', 'surface', [0.55, 0.2, 0.42], [DARK], DARK, [
    box(0.22, 0.015, 0.16), box(0.04, 0.12, 0.03, 0, 0.015, -0.03), box(0.55, 0.32, 0.025, 0, 0.1, 0), box(0.51, 0.28, 0.005, 0, 0.12, 0.014, '#33475b'),
  ]),

  // Lighting
  item('lamp-floor', 'Floor lamp', 'lighting', 'floor', [0.4, 0.4, 1.65], SHADES, DARK, [
    cyl(0.28, 0.03, 0, 0, 0, S), cyl(0.025, 1.4, 0, 0.03, 0, S), cone(0.4, 0.26, 0, 1.39, 0, P, { glow: true }),
  ], { light: { y: 1.45, intensity: 9 } }),
  item('lamp-table', 'Table lamp', 'lighting', 'surface', [0.26, 0.26, 0.45], SHADES, '#6f4e37', [
    cyl(0.14, 0.03, 0, 0, 0, S), cyl(0.05, 0.22, 0, 0.03, 0, S), cone(0.26, 0.2, 0, 0.25, 0, P, { glow: true }),
  ], { light: { y: 0.32, intensity: 5 } }),
  item('light-ceiling', 'Ceiling light', 'lighting', 'ceiling', [0.42, 0.42, 0.12], SHADES, STEEL, [
    cyl(0.42, 0.03, 0, 0.09, 0, S), cyl(0.36, 0.09, 0, 0, 0, P, { glow: true }),
  ], { light: { y: -0.1, intensity: 14 } }),
  item('light-pendant', 'Pendant light', 'lighting', 'ceiling', [0.36, 0.36, 0.8], SHADES, DARK, [
    cyl(0.012, 0.56, 0, 0.24, 0, S), cyl(0.1, 0.02, 0, 0.78, 0, S), cone(0.36, 0.24, 0, 0, 0, P, { glow: true }),
  ], { light: { y: -0.05, intensity: 12 } }),
  item('light-sconce', 'Wall light', 'lighting', 'wall', [0.16, 0.14, 0.26], SHADES, STEEL, [
    box(0.1, 0.16, 0.02, 0, 0.05, -0.06, S), box(0.03, 0.03, 0.08, 0, 0.1, -0.02, S), cone(0.16, 0.18, 0, 0.06, 0.03, P, { glow: true }),
  ], { light: { y: 0.15, intensity: 5 } }),

  // Decor
  item('plant', 'Potted plant', 'decor', 'floor', [0.45, 0.45, 0.8], ['#b9684a', WHITE, DARK, '#8d99ae'], LEAF, [
    cone(0.3, 0.28, 0, 0, 0, P, { rot: [Math.PI, 0, 0] }), ...plantLeaves(0.52, 0.12, 0.34),
  ]),
  item('plant-tall', 'Tall plant', 'decor', 'floor', [0.9, 0.9, 1.7], ['#b9684a', WHITE, DARK, '#8d99ae'], LEAF, [
    cone(0.4, 0.36, 0, 0, 0, P, { rot: [Math.PI, 0, 0] }), cyl(0.05, 0.8, 0, 0.36, 0, '#6f4e37'), ...plantLeaves(1.3, 0.2, 0.55),
  ]),
  item('painting', 'Painting', 'decor', 'wall', [0.8, 0.04, 0.6], ['#5f7a61', '#a35d4f', '#3d405b', '#d98f5c', '#8d99ae'], '#2e2e30', [
    box(0.8, 0.6, 0.03, 0, 0, 0, S), box(0.72, 0.52, 0.008, 0, 0.04, 0.016, '#f4f1ea'), box(0.6, 0.4, 0.008, 0, 0.1, 0.02),
    box(0.14, 0.14, 0.008, 0.14, 0.31, 0.022, '#e9d8a6'),
  ]),
  item('clock', 'Wall clock', 'decor', 'wall', [0.36, 0.05, 0.36], [WHITE, DARK, '#d7b98e'], DARK, [
    { shape: 'cyl', size: [0.36, 0.04, 0.36], pos: [0, 0.18, 0], rot: [Math.PI / 2, 0, 0], color: S },
    { shape: 'cyl', size: [0.31, 0.045, 0.31], pos: [0, 0.18, 0.002], rot: [Math.PI / 2, 0, 0], color: P },
    box(0.012, 0.11, 0.004, 0, 0.18, 0.025, '#c0392b'), box(0.08, 0.012, 0.004, 0.04, 0.174, 0.025, '#555'),
  ]),
  item('vase', 'Vase', 'decor', 'surface', [0.18, 0.18, 0.42], ['#8d99ae', WHITE, '#b9684a', '#3d405b'], LEAF, [
    cyl(0.1, 0.03), ball(0.17, 0, 0.11, 0, P), cyl(0.07, 0.1, 0, 0.16), ball(0.14, 0.02, 0.34, 0, S), ball(0.1, -0.04, 0.3, 0.03, '#d98f5c'),
  ]),
  item('books', 'Stack of books', 'decor', 'surface', [0.26, 0.2, 0.1], BOOKS, '#f4f1ea', [
    box(0.26, 0.035, 0.19), box(0.23, 0.03, 0.17, 0.01, 0.035, 0, '#3d405b'), box(0.2, 0.03, 0.15, -0.01, 0.065, 0.01, '#c9b79c'),
  ]),

  // Outdoors
  item('tree-oak', 'Oak tree', 'outdoor', 'floor', [5, 5, 7], FOLIAGE, BARK, [
    cyl(0.5, 3.2, 0, 0, 0, S), ball(3.6, 0, 4.6, 0, P), ball(2.8, 1.1, 4.0, 0.5, P), ball(2.6, -1.0, 4.3, -0.6, P), ball(2.4, 0.2, 5.6, -0.3, P),
  ], { collide: { w: 0.7, d: 0.7 } }),
  item('tree-pine', 'Pine tree', 'outdoor', 'floor', [3, 3, 7.6], ['#3f6b4a', '#4f7d4a', '#2f5540'], BARK, [
    cyl(0.35, 2, 0, 0, 0, S), spike(3.0, 3.0, 0, 1.4), spike(2.3, 2.6, 0, 3.2), spike(1.6, 2.3, 0, 5.0),
  ], { collide: { w: 0.6, d: 0.6 } }),
  item('tree-young', 'Young tree', 'outdoor', 'floor', [2.4, 2.4, 3.8], FOLIAGE, BARK, [
    cyl(0.16, 2, 0, 0, 0, S), ball(2.0, 0, 2.7, 0, P), ball(1.4, 0.4, 3.0, 0.3, P),
  ], { collide: { w: 0.4, d: 0.4 } }),
  item('bush', 'Bush', 'outdoor', 'floor', [1.3, 1.3, 1.0], FOLIAGE, BARK, [
    ball(1.0, 0, 0.45, 0, P), ball(0.8, 0.22, 0.4, 0.2, P), ball(0.75, -0.25, 0.4, -0.15, P),
  ]),
  item('hedge', 'Hedge', 'outdoor', 'floor', [2.0, 0.6, 1.2], FOLIAGE, BARK, [box(2.0, 1.2, 0.6)]),
  item('rock', 'Rock', 'outdoor', 'floor', [1.0, 0.8, 0.5], ['#8f8c86', '#a9a59c', '#6f6d69'], DARK, [
    { shape: 'sphere', size: [1.0, 0.6, 0.8], pos: [0, 0.18, 0], color: P },
  ]),
  item('boulder', 'Boulder', 'outdoor', 'floor', [2.0, 1.6, 1.2], ['#8f8c86', '#a9a59c', '#6f6d69'], DARK, [
    { shape: 'sphere', size: [2.0, 1.4, 1.6], pos: [0, 0.5, 0], color: P },
    { shape: 'sphere', size: [1.0, 0.8, 0.9], pos: [0.45, 0.3, 0.3], color: P },
  ]),
  item('flowers', 'Flower bed', 'outdoor', 'floor', [1.6, 0.8, 0.45], ['#d9534f', '#e9b44c', '#b784d6', '#f2f2f2', '#e77fa3'], '#5a4636', [
    box(1.6, 0.12, 0.8, 0, 0, 0, S),
    ...[-0.6, -0.3, 0, 0.3, 0.6].flatMap((x, i) => [
      ball(0.2, x, 0.3, i % 2 ? 0.15 : -0.15, P), ball(0.26, x, 0.18, i % 2 ? 0.15 : -0.15, LEAF),
      ball(0.17, x + 0.12, 0.27, i % 2 ? -0.2 : 0.2, P), ball(0.22, x + 0.12, 0.16, i % 2 ? -0.2 : 0.2, LEAF),
    ]),
  ]),
  item('veg-bed', 'Vegetable bed', 'outdoor', 'floor', [2.4, 1.2, 0.5], WOODS, '#4a3a2c', [
    box(2.4, 0.3, 0.06, 0, 0, -0.57), box(2.4, 0.3, 0.06, 0, 0, 0.57), box(0.06, 0.3, 1.2, -1.17, 0, 0), box(0.06, 0.3, 1.2, 1.17, 0, 0),
    box(2.28, 0.24, 1.08, 0, 0, 0, S),
    ...[-0.3, 0, 0.3].flatMap((z) => [-0.9, -0.45, 0, 0.45, 0.9].map((x) => ball(0.26, x, 0.32, z, LEAF))),
  ]),
  item('bench', 'Garden bench', 'outdoor', 'floor', [1.5, 0.55, 0.85], WOODS, DARK, [
    ...legs(1.5, 0.5, 0.42, 0.06, S), box(1.5, 0.05, 0.45, 0, 0.42, 0.02), box(1.5, 0.3, 0.04, 0, 0.55, -0.22),
  ]),
  item('picnic-table', 'Picnic table', 'outdoor', 'floor', [1.8, 1.5, 0.75], WOODS, DARK, [
    box(1.8, 0.05, 0.75, 0, 0.7, 0), box(1.8, 0.04, 0.26, 0, 0.42, -0.6), box(1.8, 0.04, 0.26, 0, 0.42, 0.6),
    box(0.08, 0.7, 0.6, -0.7, 0, 0), box(0.08, 0.7, 0.6, 0.7, 0, 0), box(0.08, 0.06, 1.46, -0.7, 0.36, 0), box(0.08, 0.06, 1.46, 0.7, 0.36, 0),
  ]),
  item('patio', 'Stone patio', 'outdoor', 'floor', [4, 3, 0.05], ['#b9b4a8', '#9a958b', '#c7a98a'], '#8d897f', [
    box(4, 0.04, 3, 0, 0, 0, S),
    ...[-1.5, -0.5, 0.5, 1.5].flatMap((x) => [-1, 0, 1].map((z) => box(0.94, 0.05, 0.94, x, 0, z))),
  ], { flat: true }),
  item('path', 'Garden path', 'outdoor', 'floor', [1.0, 2.0, 0.04], ['#c9bfa8', '#a8a297', '#b98f6a'], '#8d897f', [box(1.0, 0.035, 2.0)], { flat: true }),
  item('driveway', 'Gravel driveway', 'outdoor', 'floor', [3.0, 6.0, 0.04], ['#b5afa3', '#8f8b84', '#c9bfa8'], '#8d897f', [box(3.0, 0.035, 6.0)], { flat: true }),
  item('pond', 'Pond', 'outdoor', 'floor', [4, 4, 0.06], ['#5b8fb0', '#4a7d8c', '#6fa3a0'], '#8f8c86', [
    cyl(4, 0.04, 0, 0, 0, S), cyl(3.6, 0.055),
  ], { flat: true }),
  item('fence', 'Fence section', 'outdoor', 'floor', [2.4, 0.12, 1.1], [...WOODS, WHITE], DARK, [
    box(0.1, 1.1, 0.1, -1.15, 0, 0), box(0.1, 1.1, 0.1, 1.15, 0, 0), box(2.4, 0.08, 0.04, 0, 0.4, 0), box(2.4, 0.08, 0.04, 0, 0.85, 0),
  ]),
  item('shed', 'Garden shed', 'outdoor', 'floor', [3.0, 2.4, 2.9], ['#7a8b6f', '#8b5e3c', '#b9684a', '#d9d6cf', '#5b6770'], '#4a4038', [
    box(2.9, 2.1, 2.3), prism(3.0, 0.75, 2.4, 0, 2.1, 0, S), box(0.8, 1.8, 0.03, -0.5, 0, 1.15, S), box(0.6, 0.5, 0.03, 0.8, 1.1, 1.15, '#bcd6e3'),
  ]),
  item('barn', 'Barn', 'outdoor', 'floor', [8, 6, 6.4], ['#8b3a2f', '#7a6a58', '#4f6b52', '#d9d6cf'], '#4a4038', [
    box(7.9, 3.8, 5.9), prism(8.0, 2.55, 6.0, 0, 3.8, 0, S), box(2.6, 2.8, 0.05, 0, 0, 2.95, '#f1eee7'),
    box(0.1, 2.8, 0.06, 0, 0, 2.97, S), box(1.0, 0.8, 0.05, 0, 3.9, 2.95, '#f1eee7'),
  ]),
  item('well', 'Well', 'outdoor', 'floor', [1.5, 1.5, 2.4], ['#8f8c86', '#a9a59c'], '#6f4e37', [
    cyl(1.3, 0.7), cyl(1.0, 0.71, 0, 0, 0, '#2b3a44'), box(0.1, 1.3, 0.1, -0.6, 0.7, 0, S), box(0.1, 1.3, 0.1, 0.6, 0.7, 0, S),
    prism(1.5, 0.45, 1.0, 0, 1.95, 0, S),
  ]),
  item('mailbox', 'Mailbox', 'outdoor', 'floor', [0.3, 0.5, 1.2], ['#3d405b', '#8b3a2f', DARK, WHITE], '#6f4e37', [
    box(0.08, 1.0, 0.08, 0, 0, 0, S), box(0.22, 0.2, 0.45, 0, 1.0, 0),
  ]),
  item('lamp-post', 'Lamp post', 'outdoor', 'floor', [0.4, 0.4, 3.0], SHADES, DARK, [
    cyl(0.22, 0.12, 0, 0, 0, S), cyl(0.07, 2.5, 0, 0.12, 0, S), cone(0.36, 0.34, 0, 2.6, 0, P, { glow: true, rot: [Math.PI, 0, 0] }),
  ], { light: { y: 2.7, intensity: 40 } }),
  item('fire-pit', 'Fire pit', 'outdoor', 'floor', [1.2, 1.2, 0.4], ['#8f8c86', '#6f6d69'], '#6f4e37', [
    cyl(1.2, 0.3), cyl(0.9, 0.31, 0, 0, 0, '#2a2725'), box(0.6, 0.09, 0.1, 0, 0.3, 0.05, S), box(0.1, 0.09, 0.6, 0.05, 0.3, 0, S),
  ]),
  item('woodpile', 'Woodpile', 'outdoor', 'floor', [1.6, 0.6, 0.9], ['#a47148', '#6f4e37'], '#d7b98e', [
    box(1.6, 0.9, 0.56), ...[-0.6, -0.3, 0, 0.3, 0.6].flatMap((x) => [0.15, 0.45, 0.75].map((y) => box(0.2, 0.2, 0.01, x, y - 0.1, 0.285, S))),
  ]),
  item('hay-bale', 'Hay bale', 'outdoor', 'floor', [1.3, 1.3, 1.3], ['#d8c074', '#c4a85a'], '#b89b4f', [
    { shape: 'cyl', size: [1.3, 1.2, 1.3], pos: [0, 0.65, 0], rot: [Math.PI / 2, 0, 0], color: P },
  ]),
];

/**
 * Models from the Kenney Furniture Kit and Nature Kit and from Poly Haven (all
 * public domain), listed in models.json by `npm run models`. They keep the
 * colours and textures they were made with, so they offer no colour choices.
 */
const DOWNLOADED: CatalogItem[] = (downloaded as Omit<CatalogItem, 'colors' | 'secondary' | 'parts'>[]).map((entry) => ({
  ...entry,
  colors: ['#c9ccd1'],
  secondary: '#c9ccd1',
  parts: [],
}));

/** Everything that can be placed: the built-in pieces first, then the downloaded models. */
export const CATALOG: CatalogItem[] = [
  ...BUILT_IN.map((c) => (c.category === 'outdoor' ? { ...c, group: BUILT_IN_GROUPS[c.id] ?? 'Garden' } : c)),
  ...DOWNLOADED,
];

/** Sub-headings of the garden catalog, in display order. */
export const OUTDOOR_GROUPS = ['Trees', 'Plants', 'Rocks', 'Crops', 'Garden', 'Camping'];

const BY_ID = new Map(CATALOG.map((c) => [c.id, c]));
export const catalogItem = (id: string): CatalogItem | undefined => BY_ID.get(id);

import { recomputeElevations } from './floors';
import {
  emptyFloor,
  OPENING_DEFAULTS,
  type Feature,
  type Floor,
  type Item,
  type Opening,
  type OpeningType,
  type Project,
  type RoomLabel,
  type Wall,
} from './types';

/**
 * A small furnished farmhouse, offered on the welcome screen so there is
 * something to explore straight away: 10 m × 8 m, two floors, on a 1.5 acre lot.
 */
export function sampleProject(): Project {
  let n = 0;
  const id = (prefix: string) => `${prefix}${++n}`;
  const wall = (name: string, ax: number, ay: number, bx: number, by: number, thickness = 0.12): Wall => ({
    id: name, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness, height: 2.7,
  });
  /** `offset` is measured along the wall from where it starts. */
  const opening = (wallId: string, type: OpeningType, offset: number, width?: number, side: 1 | -1 = 1): Opening => ({
    id: id('o'), wallId, type, offset, ...OPENING_DEFAULTS[type], ...(width ? { width } : {}), side, hingeAtB: false,
  });
  const item = (catalogId: string, x: number, y: number, rotation = 0, elevation = 0, color?: string): Item => ({
    id: id('i'), catalogId, at: { x, y }, rotation, elevation, ...(color ? { color } : {}),
  });
  const label = (name: string, x: number, y: number, floorMaterial: string, wallColor?: string): RoomLabel => ({
    id: id('l'), at: { x, y }, name, floorMaterial, ...(wallColor ? { wallColor } : {}),
  });
  // The outside walls run clockwise from the top-left corner, so their starts are known for the offsets below.
  const shell = (p: string): Wall[] => [
    wall(`${p}top`, 0, 0, 10, 0, 0.2),
    wall(`${p}right`, 10, 0, 10, 8, 0.2),
    wall(`${p}bottom`, 10, 8, 0, 8, 0.2),
    wall(`${p}left`, 0, 8, 0, 0, 0.2),
  ];

  // Ground floor: living room on the left, kitchen top right, hall with the stairs bottom right.
  const ground: Floor = {
    ...emptyFloor(0),
    walls: [...shell('g-'), wall('g-mid', 6, 0, 6, 8), wall('g-cross', 6, 4, 10, 4)],
    openings: [
      opening('g-top', 'window', 3, 1.6),
      opening('g-top', 'window', 8),
      opening('g-right', 'window', 2),
      opening('g-bottom', 'door', 2.6, 1.0),
      opening('g-bottom', 'window', 7, 1.8),
      opening('g-left', 'window', 2.5),
      opening('g-left', 'window', 5.5),
      opening('g-mid', 'archway', 2, 1.4),
      opening('g-mid', 'door', 6.3),
      opening('g-cross', 'archway', 1.2),
    ],
    labels: [
      label('Living room', 3, 4, 'oak', '#e8dcc8'),
      label('Kitchen', 8, 2, 'tile-white', '#d9e4dd'),
      label('Hall', 7.5, 6, 'maple'),
    ],
    features: [{ id: id('f'), type: 'stairs', shape: 'straight', at: { x: 9.3, y: 6.2 }, rotation: 0, width: 1, depth: 3 } as Feature],
    items: [
      // Living room
      item('sofa-3', 0.55, 4, 270),
      item('rug', 2.7, 4, 90),
      item('coffee-table', 2.5, 4, 90),
      item('tv-stand', 5.73, 4, 90),
      item('tv', 5.915, 4, 90, 1.1),
      item('bookshelf', 5, 0.25, 0),
      item('lamp-floor', 0.5, 6.3),
      item('plant-tall', 5.3, 7.3),
      item('armchair', 1.6, 6.9, 180, 0, '#5f7a61'),
      item('light-ceiling', 3, 4, 0, 2.58),
      item('painting', 0.12, 1.2, 270, 1.4),
      // Kitchen
      item('fridge', 9.55, 0.55, 90),
      item('cabinet-base', 9.6, 1.25, 90),
      item('cabinet-sink', 9.6, 1.95, 90),
      item('stove', 9.6, 2.75, 90),
      item('cabinet-base', 9.6, 3.4, 90),
      item('table-round', 7.5, 2),
      item('chair', 7.5, 1.1, 0),
      item('chair', 7.5, 2.9, 180),
      item('chair', 8.4, 2, 90),
      item('light-pendant', 7.5, 2, 0, 1.9),
      // Hall
      item('side-table', 6.4, 7.6),
      item('light-ceiling', 7.6, 6, 0, 2.58),
    ],
  };

  // Upper floor: two bedrooms on the left, bathroom top right, landing where the stairs arrive.
  const upper: Floor = {
    ...emptyFloor(1),
    walls: [...shell('u-'), wall('u-mid', 6, 0, 6, 8), wall('u-beds', 0, 4, 6, 4), wall('u-bath', 6, 3, 10, 3)],
    openings: [
      opening('u-top', 'window', 3, 1.6),
      opening('u-top', 'window', 8, 0.8),
      opening('u-bottom', 'window', 7, 1.6),
      opening('u-bottom', 'window', 2.5),
      opening('u-left', 'window', 2),
      opening('u-left', 'window', 6),
      opening('u-right', 'window', 5.5),
      opening('u-mid', 'door', 3.5, 0.8, -1),
      opening('u-mid', 'door', 4.7, 0.9, -1),
      opening('u-bath', 'door', 0.8, 0.8),
    ],
    labels: [
      label('Main bedroom', 3, 2, 'carpet-beige', '#cfdcea'),
      label('Bedroom', 3, 6, 'carpet-blue', '#f3d9cf'),
      label('Bathroom', 8, 1.5, 'tile-grey'),
      label('Landing', 7.5, 5.5, 'maple'),
    ],
    items: [
      item('bed-double', 3, 1.125, 0, 0, '#3d405b'),
      item('nightstand', 1.9, 0.3),
      item('nightstand', 4.1, 0.3),
      item('lamp-table', 1.9, 0.3, 0, 0.55),
      item('wardrobe', 0.4, 3.3, 270),
      item('dresser', 5.71, 1.2, 90),
      item('light-ceiling', 3, 2.2, 0, 2.58),
      item('bed-single', 4.5, 6.875, 180, 0, '#a35d4f'),
      item('desk', 0.45, 5.4, 270),
      item('office-chair', 1.25, 5.4, 90),
      item('monitor', 0.4, 5.4, 270, 0.75),
      item('rug-round', 2.6, 6, 0, 0, '#c9b79c'),
      item('light-ceiling', 3, 6, 0, 2.58),
      item('toilet', 7, 0.45),
      item('vanity', 9.0, 0.35),
      item('mirror', 9.0, 0.12, 0, 1.2),
      item('bathtub', 9.05, 2.4, 90),
      item('plant', 6.6, 7.4),
    ],
  };

  const project: Project = {
    version: 2,
    kind: 'house',
    name: 'Example farmhouse',
    units: 'metric',
    floors: [ground, upper],
    lot: { acres: 1.5, aspect: 1.5, centre: { x: 5, y: 6 }, fence: true },
    exterior: { roof: { type: 'gable', pitch: 32, overhang: 0.5, color: '#5a4a42' }, siding: '#e3d5b8' },
    outdoor: [
      // A path from the front door, with flowers either side of it.
      item('path', 7.4, 9.2),
      item('path', 7.4, 11.2),
      item('path', 7.4, 13.2),
      item('flowers', 5.4, 8.7),
      item('flowers', 3.4, 8.7, 0, 0, '#e9b44c'),
      item('bush', 9.3, 8.9),
      item('lamp-post', 8.6, 11),
      item('mailbox', 8.4, 14.4),
      // Somewhere to sit by the pond.
      item('patio', -4, 4, 90),
      item('picnic-table', -4, 4),
      item('pond', -9, 12),
      item('bench', -5.4, 12, 90),
      item('rock', -6.9, 14.2),
      // Trees and outbuildings around the lot.
      item('tree-oak', -8, -4),
      item('tree-oak', 17, 14, 40),
      item('tree-pine', 16, -5),
      item('tree-pine', 19, -3, 0, 0, '#2f5540'),
      item('tree-young', 2, 14),
      item('tree-young', 13, 3, 0, 0, '#c58a3a'),
      item('shed', 16, 6, 270),
      item('veg-bed', 16, 10.5),
      item('veg-bed', 19, 10.5),
      item('woodpile', 13.6, 7.6, 90),
      item('hay-bale', -14, -8),
      item('hay-bale', -12.2, -8.6, 30),
      item('barn', -20, 2, 90),
    ],
  };
  recomputeElevations(project);
  for (const f of project.floors) f.walls.forEach((w) => (w.height = f.wallHeight));
  return project;
}

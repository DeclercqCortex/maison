import { recomputeElevations } from './floors';
import {
  clampBuilding,
  defaultExterior,
  emptyFloor,
  OPENING_DEFAULTS,
  RAILING_HEIGHT,
  uid,
  type Building,
  type Floor,
  type Opening,
  type OpeningType,
  type Project,
  type RoomLabel,
  type Wall,
} from './types';

/**
 * A new apartment, ready to furnish: a 12 m × 9 m flat with an open living
 * room and kitchen, a bedroom, a bathroom and an entrance hall, and a balcony
 * along the front. The front (the bottom of the plan) looks out of the
 * building; the back opens onto the building's corridor and the sides are
 * shared with the neighbours, so all the windows are at the front.
 */
export function apartmentProject(name: string, building: Building): Project {
  const H = 2.7;
  const wall = (id: string, ax: number, ay: number, bx: number, by: number, thickness = 0.12, railing = false): Wall => ({
    id, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness, height: railing ? RAILING_HEIGHT : H,
    ...(railing ? { railing: true } : {}),
  });
  /** `offset` is measured along the wall from where it starts. */
  const opening = (wallId: string, type: OpeningType, offset: number, width?: number, side: 1 | -1 = 1): Opening => ({
    id: uid(), wallId, type, offset, ...OPENING_DEFAULTS[type], ...(width ? { width } : {}), side, hingeAtB: false,
  });
  const label = (text: string, x: number, y: number, floorMaterial: string): RoomLabel => ({
    id: uid(), at: { x, y }, name: text, floorMaterial,
  });

  const floor: Floor = {
    ...emptyFloor(0),
    name: 'Apartment',
    walls: [
      wall('back', 0, 0, 12, 0, 0.25),
      wall('right', 12, 0, 12, 9, 0.25),
      wall('front', 12, 9, 0, 9, 0.25),
      wall('left', 0, 9, 0, 0, 0.25),
      wall('mid', 7, 0, 7, 9),
      wall('cross', 7, 4, 12, 4),
      wall('bath', 9.5, 0, 9.5, 4),
      // The balcony: a glass railing on three sides, in front of the living room.
      wall('rail-l', 1, 9, 1, 10.8, 0.06, true),
      wall('rail-f', 1, 10.8, 6.5, 10.8, 0.06, true),
      wall('rail-r', 6.5, 10.8, 6.5, 9, 0.06, true),
    ],
    openings: [
      opening('back', 'door', 8.25, 0.95), // front door, from the corridor
      opening('mid', 'door', 2),
      opening('cross', 'door', 1.25, 0.8),
      opening('bath', 'door', 3, 0.8, -1),
      opening('front', 'window', 2.5, 1.8), // bedroom
      opening('front', 'window', 6.2, 1.4),
      { ...opening('front', 'door', 8, 1.0), side: -1 }, // out to the balcony
      opening('front', 'window', 10, 1.4),
    ],
    labels: [
      label('Living room and kitchen', 3.5, 4.5, 'oak'),
      label('Bedroom', 9.5, 6.5, 'carpet-beige'),
      label('Hall', 8.25, 2, 'maple'),
      label('Bathroom', 10.75, 2, 'tile-white'),
      label('Balcony', 3.75, 9.9, 'tile-terracotta'),
    ],
  };

  const project: Project = {
    version: 2,
    kind: 'apartment',
    building: clampBuilding(building),
    name,
    units: 'metric',
    floors: [floor],
    // The grounds around the block, centred on it.
    lot: { acres: 2, aspect: 1.5, centre: { x: 6, y: 10 }, fence: false },
    exterior: { ...defaultExterior(), roof: { ...defaultExterior().roof, type: 'flat' }, siding: '#d9d4ca' },
    outdoor: [],
  };
  recomputeElevations(project);
  return project;
}

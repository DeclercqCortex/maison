import { beforeEach, describe, expect, it } from 'vitest';
import { apartmentProject } from './apartment';
import { towerLayout } from './building';
import { SLAB, tidyFloor } from './floors';
import { detectRooms, isOutdoorRoom, roomName } from './rooms';
import { clampBuilding, emptyProject, migrateProject } from './types';
import { EMPIRE_STATE_FOOTPRINT, planCity, type CityBox } from './city';
import { lotRect, type Rect } from './lot';

describe('apartment', () => {
  const project = apartmentProject('Flat', { storeys: 12, floor: 8, unitsPerFloor: 3 });
  const floor = project.floors[0];

  it('has its five rooms, with the balcony open to the outside', () => {
    const rooms = detectRooms(floor.walls);
    expect(rooms.map((r) => roomName(r, floor.labels)).sort()).toEqual(
      ['Balcony', 'Bathroom', 'Bedroom', 'Hall', 'Living room and kitchen'].sort(),
    );
    const outdoor = rooms.filter((r) => isOutdoorRoom(r, floor.walls)).map((r) => roomName(r, floor.labels));
    expect(outdoor).toEqual(['Balcony']);
  });

  it('keeps every door and window where it was put', () => {
    const before = floor.openings.map((o) => o.offset);
    const copy = structuredClone(floor);
    tidyFloor(copy);
    expect(copy.openings.map((o) => o.offset)).toEqual(before);
  });

  it('railings are low; the other walls are full height', () => {
    for (const w of floor.walls) expect(w.height).toBe(w.railing ? 1.05 : floor.wallHeight);
  });

  it('places the flat on its floor of the block', () => {
    const t = towerLayout(project)!;
    expect(t.storeys).toBe(12);
    expect(t.storeyHeight).toBeCloseTo(floor.wallHeight + SLAB);
    expect(t.base).toBeCloseTo(7 * t.storeyHeight);
    expect(t.height).toBeCloseTo(12 * t.storeyHeight);
    // One flat either side of the user's.
    expect(t.unitWidth).toBeCloseTo(12);
    expect(t.rect.maxX - t.rect.minX).toBeCloseTo(36);
    // The balcony sticks out past the front walls.
    expect(t.rect.maxY).toBeGreaterThan(t.body.maxY);
  });

  it('a house has no block', () => {
    expect(towerLayout(emptyProject())).toBeNull();
  });

  it('keeps the building in range', () => {
    expect(clampBuilding({ storeys: 80, floor: 90, unitsPerFloor: 9 })).toEqual({ storeys: 50, floor: 50, unitsPerFloor: 5 });
    expect(clampBuilding({ storeys: 4, floor: 7, unitsPerFloor: 0 })).toEqual({ storeys: 4, floor: 4, unitsPerFloor: 1 });
  });

  it('survives saving and reopening; older projects open as houses', () => {
    const back = migrateProject(JSON.parse(JSON.stringify(project)))!;
    expect(back.kind).toBe('apartment');
    expect(back.building).toEqual({ storeys: 12, floor: 8, unitsPerFloor: 3 });
    const old = JSON.parse(JSON.stringify(emptyProject()));
    delete old.kind;
    expect(migrateProject(old)!.kind).toBe('house');
    expect(migrateProject(old)!.building).toBeUndefined();
  });
});

describe('project list', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    } as Storage;
  });

  it('saves, lists, copies and deletes projects', async () => {
    const { deleteProject, duplicateProject, listProjects, readProject, writeProject } = await import('../store/persistence');
    writeProject('a', apartmentProject('Flat', { storeys: 20, floor: 3, unitsPerFloor: 2 }), 1000);
    writeProject('h', { ...emptyProject(), name: 'Cottage' }, 2000);
    expect(listProjects().map((p) => p.name)).toEqual(['Cottage', 'Flat']);
    const flat = listProjects().find((p) => p.id === 'a')!;
    expect(flat).toMatchObject({ kind: 'apartment', storeys: 20, aptFloor: 3, rooms: 5 });
    expect(flat.sketch).toMatch(/^M/);
    const copy = duplicateProject('a')!;
    expect(readProject(copy)!.name).toBe('Flat copy');
    deleteProject('a');
    expect(readProject('a')).toBeNull();
    expect(listProjects().map((p) => p.name).sort()).toEqual(['Cottage', 'Flat copy']);
  });
});

describe('city around an apartment', () => {
  const project = apartmentProject('Flat', { storeys: 12, floor: 8, unitsPerFloor: 3 });
  const city = planCity(project.lot);
  const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
  const footprint = (b: CityBox): Rect => ({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minY: b.z - b.d / 2, maxY: b.z + b.d / 2 });
  const esb: Rect = {
    minX: city.empireState.x - EMPIRE_STATE_FOOTPRINT.w / 2, maxX: city.empireState.x + EMPIRE_STATE_FOOTPRINT.w / 2,
    minY: city.empireState.z - EMPIRE_STATE_FOOTPRINT.d / 2, maxY: city.empireState.z + EMPIRE_STATE_FOOTPRINT.d / 2,
  };

  it('is the same every time', () => {
    expect(planCity(project.lot)).toEqual(city);
  });

  it('is a real city: hundreds of buildings, some of them towers', () => {
    expect(city.buildings.length).toBeGreaterThan(300);
    const heights = city.buildings.map((b) => b.boxes.reduce((h, x) => Math.max(h, x.y + x.h), 0));
    expect(Math.max(...heights)).toBeGreaterThan(150);
    // Nothing is taller than the Empire State Building's roof.
    expect(Math.max(...heights)).toBeLessThan(381);
  });

  it('keeps the apartment block, the park and the Empire State Building clear', () => {
    const lot = lotRect(project.lot);
    for (const b of city.buildings) {
      for (const box of b.boxes) {
        const f = footprint(box);
        expect(overlaps(f, lot)).toBe(false);
        expect(overlaps(f, city.home)).toBe(false);
        expect(overlaps(f, city.park)).toBe(false);
        expect(overlaps(f, esb)).toBe(false);
        expect(f.minX).toBeGreaterThan(city.shore);
      }
    }
    // The apartment block itself fits inside its own city block.
    const tower = towerLayout(project)!;
    expect(tower.rect.minX).toBeGreaterThan(city.home.minX);
    expect(tower.rect.maxX).toBeLessThan(city.home.maxX);
    expect(tower.rect.minY).toBeGreaterThan(city.home.minY);
    expect(tower.rect.maxY).toBeLessThan(city.home.maxY);
  });

  it('puts the Statue of Liberty out in the water, and the Empire State Building on land', () => {
    expect(city.liberty.x + city.liberty.island).toBeLessThan(city.shore);
    expect(esb.minX).toBeGreaterThan(city.shore);
    expect(overlaps(esb, city.home)).toBe(false);
  });

  it('keeps cars on the roads, out of the park', () => {
    expect(city.cars.length).toBeGreaterThan(100);
    for (const c of city.cars) expect(overlaps({ minX: c.x, maxX: c.x, minY: c.z, maxY: c.z }, city.park)).toBe(false);
  });
});

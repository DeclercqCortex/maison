import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CATALOG, catalogItem, setCustomItems, type CatalogItem } from './catalog';
import { kindOf, styleOf } from './kinds';
import { counterpart, display, fitInto, inStyle, plantRows } from './style';
import { prepare, type ReadModel } from './importers';
import { emptyProject, migrateProject } from '../model/types';

const size = (w: number, d: number, h: number) => ({ w, d, h });

describe('furniture kinds', () => {
  it('reads kinds from names, whole words only', () => {
    const k = (name: string, s = size(1, 1, 1)) => kindOf({ id: 'x', name, size: s });
    expect(k('Sofa 01')).toBe('sofa');
    expect(k('Mid Century Lounge Chair')).toBe('armchair');
    expect(k('Dining Chair 02')).toBe('chair');
    expect(k('Round Wooden Table 01')).toBe('dining-table');
    expect(k('Portable Cassette Player')).toBeUndefined();
    expect(k('Outdoor Table Chair Set 01')).toBe('picnic-table');
    expect(k('Old Bed Frame')).toBeUndefined();
    expect(k('Gothic Bed 01')).toBe('bed');
    expect(k('Vintage Cabinet 01', size(1, 0.5, 1.9))).toBe('wardrobe');
    expect(k('Modern Wooden Cabinet', size(1.5, 0.5, 0.8))).toBe('dresser');
    expect(k('Industrial Wall Sconce')).toBe('light-sconce');
  });

  it('tells simple pieces from realistic ones', () => {
    expect(styleOf('sofa-3')).toBe('simple');
    expect(styleOf('kenney-furniture-loungeSofa')).toBe('simple');
    expect(styleOf('polyhaven-sofa_01')).toBe('realistic');
    expect(styleOf('custom-abc')).toBe('realistic');
    expect(CATALOG.filter((c) => c.style === 'realistic').length).toBe(275);
  });
});

describe('switching furniture style', () => {
  it('finds a realistic stand-in for the main living, bedroom and dining pieces', () => {
    for (const id of ['sofa-2', 'sofa-3', 'armchair', 'coffee-table', 'bed-single', 'bed-double', 'nightstand', 'dresser',
      'dining-table', 'chair', 'stool', 'desk', 'light-pendant', 'light-sconce', 'plant', 'painting', 'clock']) {
      const stand = counterpart(catalogItem(id)!, 'realistic');
      expect(stand, id).not.toBeNull();
      expect(stand!.style).toBe('realistic');
      expect(stand!.kind).toBe(catalogItem(id)!.kind);
    }
  });

  it('prefers a round table for a round one', () => {
    expect(counterpart(catalogItem('table-round')!, 'realistic')!.name).toMatch(/round/i);
  });

  it('goes back the other way, and leaves pieces with nothing of their kind alone', () => {
    const real = CATALOG.find((c) => c.id.startsWith('polyhaven-') && c.kind === 'sofa')!;
    expect(counterpart(real, 'simple')!.style).toBe('simple');
    expect(counterpart(catalogItem('sofa-3')!, 'simple')).toBeNull(); // already simple
    expect(counterpart(catalogItem('toilet')!, 'realistic')).toBeNull(); // no realistic toilet yet
    expect(display(catalogItem('toilet')!, 'realistic')).toEqual({ as: 'outline' });
  });

  it('keeps wall pieces on the wall', () => {
    const stand = counterpart(catalogItem('painting')!, 'realistic')!;
    expect(stand.placement).toBe('wall');
    expect(fitInto(catalogItem('painting')!.size, stand.size, 'painting').turn).toBe(false);
  });

  it('fits a stand-in inside the space of the piece it replaces', () => {
    for (const c of CATALOG.filter((c) => c.style === 'simple' && c.category !== 'outdoor')) {
      const stand = counterpart(c, 'realistic');
      if (!stand) continue;
      const fit = fitInto(c.size, stand.size, c.kind);
      const [w, d] = fit.turn ? [stand.size.d, stand.size.w] : [stand.size.w, stand.size.d];
      // Within the footprint, unless the stand-in had to be kept from shrinking too far.
      if (fit.x > 0.4) expect(w * fit.x, `${c.id} width`).toBeLessThanOrEqual(c.size.w * 1.001);
      if (fit.z > 0.4) expect(d * fit.z, `${c.id} depth`).toBeLessThanOrEqual(c.size.d * 1.001);
    }
  });

  it('only turns pieces that look the same from every side', () => {
    const chair = fitInto(size(0.95, 0.9, 0.82), size(0.82, 0.99, 1.02), 'armchair');
    expect(chair.turn).toBe(false);
    const table = fitInto(size(1.2, 0.6, 0.4), size(0.6, 1.2, 0.39), 'coffee-table');
    expect(table.turn).toBe(true);
  });

  it('stretches a double bed into a single, rather than shrinking it to a cot', () => {
    const fit = fitInto(size(0.9, 2.0, 0.95), size(1.49, 2.04, 1.53), 'bed');
    expect(fit.x).toBeCloseTo(0.9 / 1.49);
    expect(fit.z).toBeCloseTo(2.0 / 2.04);
  });

  it('includes imported models', () => {
    const mine: CatalogItem = {
      id: 'custom-test', name: 'My toilet', category: 'bathroom', placement: 'floor', size: size(0.4, 0.7, 0.8),
      colors: [], secondary: '', parts: [], style: 'realistic', kind: 'toilet', model: { file: 'custom/x.glb', scale: 1, offset: [0, 0, 0] },
    };
    setCustomItems([mine]);
    expect(catalogItem('custom-test')!.style).toBe('realistic');
    expect(counterpart(catalogItem('toilet')!, 'realistic')!.id).toBe('custom-test');
    setCustomItems([]);
    expect(counterpart(catalogItem('toilet')!, 'realistic')).toBeNull();
  });

  it('is saved with the project', () => {
    expect(migrateProject({ ...emptyProject(), furnitureStyle: 'realistic' })!.furnitureStyle).toBe('realistic');
    expect(migrateProject({ ...emptyProject(), furnitureStyle: 'sparkly' })!.furnitureStyle).toBeUndefined();
  });
});

describe('keeping the two styles apart', () => {
  const STYLES = ['simple', 'realistic'] as const;

  it('lists only one style in each catalog, apart from shared ground surfaces', () => {
    for (const style of STYLES) {
      const listed = CATALOG.filter((c) => inStyle(c, style));
      expect(listed.length).toBeGreaterThan(50);
      for (const c of listed) expect(c.style === style || c.neutral, `${c.name} in ${style}`).toBe(true);
    }
    // The shared ones are flat ground surfaces only.
    for (const c of CATALOG.filter((c) => c.neutral)) {
      expect(c.category).toBe('outdoor');
      expect(c.flat).toBe(true);
    }
  });

  it('never draws a piece from the other style', () => {
    for (const style of STYLES) {
      for (const c of CATALOG) {
        const shown = display(c, style);
        if (shown.as === 'itself') expect(c.style === style || c.neutral, `${c.name} drawn as itself in ${style}`).toBe(true);
        if (shown.as === 'stand-in') expect(shown.def.style, `${c.name}'s stand-in in ${style}`).toBe(style);
      }
    }
  });

  it('fills a flower bed or a hedge with copies of a plant', () => {
    const rows = plantRows('flower', size(2, 0.6, 0.4), size(0.3, 0.3, 0.35));
    expect(rows!.across).toBeGreaterThan(3);
    expect(rows!.deep).toBeGreaterThanOrEqual(1);
    expect(plantRows('sofa', size(2, 1, 1), size(0.5, 0.5, 0.5))).toBeNull();
    expect(plantRows('shrub', size(0.6, 0.6, 0.8), size(0.7, 0.7, 0.9))).toBeNull(); // one bush fills it
  });

  it('swaps garden pieces only for garden pieces', () => {
    for (const style of STYLES) {
      for (const c of CATALOG) {
        const shown = display(c, style);
        if (shown.as === 'stand-in') expect(shown.def.category === 'outdoor', c.name).toBe(c.category === 'outdoor');
      }
    }
    const tree = display(catalogItem('tree-oak')!, 'realistic');
    expect(tree.as).toBe('stand-in');
    const rock = CATALOG.find((c) => c.name === 'Boulder 01')!;
    expect(display(rock, 'simple').as).toBe('stand-in');
    expect(display(catalogItem('flowers')!, 'realistic').as).toBe('stand-in');
  });
});

describe('importing a model', () => {
  // A cabinet drawn in a CAD program: 800 × 450 mm, 750 mm high, with z up.
  const cabinet = (): ReadModel => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(800, 450, 750), new THREE.MeshStandardMaterial());
    mesh.position.set(1000, 2000, 375);
    return { object: mesh, name: 'cabinet', format: 'step', unit: 'mm', zUp: true, triangles: 12 };
  };

  it('sizes it from the file’s units, stands it up and centres it on its footprint', () => {
    const { group, size: s } = prepare(cabinet(), { unit: 'mm', zUp: true, turns: 0, scale: 1 });
    expect(s.w).toBeCloseTo(0.8);
    expect(s.d).toBeCloseTo(0.45);
    expect(s.h).toBeCloseTo(0.75);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    expect(box.min.y).toBeCloseTo(0);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0);
  });

  it('turns it a quarter and scales it', () => {
    const { size: s } = prepare(cabinet(), { unit: 'mm', zUp: true, turns: 1, scale: 2 });
    expect(s.w).toBeCloseTo(0.9);
    expect(s.d).toBeCloseTo(1.6);
    expect(s.h).toBeCloseTo(1.5);
  });
});

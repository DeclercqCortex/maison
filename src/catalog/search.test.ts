import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { searchCatalog, singular, textScore } from './search';

const indoor = CATALOG.filter((c) => c.category !== 'outdoor');
const names = (query: string, items = indoor) => searchCatalog(items, query).map((c) => c.name);

describe('catalog search', () => {
  it('reads plurals as singulars', () => {
    expect(singular('chairs')).toBe('chair');
    expect(singular('benches')).toBe('bench');
    expect(singular('shelves')).toBe('shelf');
    expect(singular('statues')).toBe('statue');
    expect(singular('glass')).toBe('glass');
  });

  it('finds sofas by other names', () => {
    const couches = names('couches');
    expect(couches).toContain('Sofa 01');
    expect(couches).toContain('Glam velvet sofa');
    expect(couches).toContain('Sofa, 3 seats');
    expect(couches).not.toContain('Dining chair');
  });

  it('puts the best matches first', () => {
    const chairs = names('chairs');
    expect(chairs.slice(0, 15).every((n) => /chair/i.test(n))).toBe(true);
  });

  it('finds statues and sculptures', () => {
    const statues = names('statues');
    for (const n of ['Bronze Whale Statue', 'Gothic Statue', 'Marble Bust 01', 'Horse Statue 01']) expect(statues).toContain(n);
    expect(statues).not.toContain('Sofa 01');
    expect(statues).not.toContain('Ceramic Vase 01');
    // A broad word reaches down: decorations include statues and vases.
    expect(names('decorations')).toEqual(expect.arrayContaining(['Gothic Statue', 'Ceramic Vase 01']));
  });

  it('finds Chinese and oriental pieces', () => {
    const chinese = names('chinese');
    for (const n of ['Chinese Sofa', 'Chinese Cabinet', 'Chinese Chandelier', 'Chinese Screen Panels']) expect(chinese).toContain(n);
  });

  it('finds kitchenware, and not circuit boards', () => {
    const kitchen = names('kitchenware');
    for (const n of ['Brass Pan 01', 'Pot Enamel 01', 'Metal Jug', 'Wooden Bowl 01', 'Tea Set 01']) expect(kitchen).toContain(n);
    expect(kitchen).not.toContain('Circuit Board');
  });

  it('needs every word to match', () => {
    const old = names('old wooden chair');
    expect(old.length).toBeGreaterThan(0);
    // The best matches are seats; further down come pieces tagged "chair" (an old settee, say).
    expect(old.slice(0, 5).every((n) => /chair|stool|bench/i.test(n))).toBe(true);
    expect(names('velvet sofa')).toEqual(expect.arrayContaining(['Glam velvet sofa']));
    expect(names('velvet sofa')).not.toContain('Sofa 01');
  });

  it('finds old weapons', () => {
    const weapons = names('weapons');
    for (const n of ['Antique Katana 01', 'Ornate Medieval Mace', 'Kite Shield', 'Wooden Axe']) expect(weapons).toContain(n);
    expect(names('swords')).toEqual(expect.arrayContaining(['Antique Estoc', 'Wooden Handle Saber', 'Antique Katana 01']));
  });

  it('finds things by style and source', () => {
    expect(names('realistic sofa').every((n) => !/^Sofa, /.test(n))).toBe(true);
    expect(names('kenney sofa').length).toBeGreaterThan(0);
  });

  it('scores online models by name and tags', () => {
    expect(textScore('Baluster vase, from a five-piece garniture', ['FSG', 'museum'], 'chinese vase')).toBe(0);
    expect(textScore('Baluster vase, from a five-piece garniture', ['china', 'porcelain'], 'chinese vase')).toBeGreaterThan(0);
    expect(textScore('Pine Tree 01', ['nature', 'trees'], 'plants')).toBeGreaterThan(0);
  });
});

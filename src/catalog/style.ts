import { allCatalog, catalogVersion, type CatalogItem } from './catalog';
import type { FurnitureStyle } from './kinds';

/**
 * Wall pieces only stand in for wall pieces, and ceiling pieces for ceiling
 * pieces. Floor and surface pieces can stand in for each other: both simply
 * stand on something, at the height the piece was placed.
 */
const standsOn = (p: CatalogItem['placement']) => (p === 'surface' ? 'floor' : p);
const samePlacement = (a: CatalogItem, b: CatalogItem) => standsOn(a.placement) === standsOn(b.placement);

/** How different two sizes are: 0 when equal, growing with the ratio either way. */
const mismatch = (a: CatalogItem['size'], b: CatalogItem['size'], turned: boolean) => {
  const [bw, bd] = turned ? [b.d, b.w] : [b.w, b.d];
  return Math.abs(Math.log(a.w / bw)) + Math.abs(Math.log(a.d / bd)) + 1.2 * Math.abs(Math.log(a.h / b.h));
};

let cachedVersion = -1;
const cache = new Map<string, CatalogItem | null>();

/**
 * The piece to show in place of `def` in the given style: the closest-sized
 * piece of the same kind, or null if `def` is already in that style or nothing
 * of its kind exists in it.
 */
export function counterpart(def: CatalogItem, style: FurnitureStyle): CatalogItem | null {
  if (def.style === style || !def.kind) return null;
  if (cachedVersion !== catalogVersion()) {
    cache.clear();
    cachedVersion = catalogVersion();
  }
  const key = `${def.id}>${style}`;
  if (cache.has(key)) return cache.get(key)!;
  let best: CatalogItem | null = null;
  let bestScore = Infinity;
  for (const c of allCatalog()) {
    if (c.style !== style || c.kind !== def.kind || !samePlacement(c, def)) continue;
    const fit = def.placement === 'wall' ? mismatch(def.size, c.size, false) : Math.min(mismatch(def.size, c.size, false), mismatch(def.size, c.size, true));
    // A round piece for a round one, a square one for a square one.
    const score =
      fit +
      (/round/i.test(def.name) !== /round/i.test(c.name) ? 0.8 : 0) -
      // The Khronos pieces are the most detailed models there are: prefer them when the sizes are close.
      (c.id.startsWith('khronos-') ? 0.1 : 0);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  cache.set(key, best);
  return best;
}

/** Whether a piece's kind can be shown in the given style (so the catalog need not list it for that style). */
export const hasCounterpart = (def: CatalogItem, style: FurnitureStyle): boolean =>
  def.style === style || counterpart(def, style) !== null;

/** Kinds that look the same from every side, so a stand-in may be turned a quarter to line up with the space. */
const TURNABLE = new Set(['coffee-table', 'dining-table', 'side-table', 'rug', 'plant', 'plant-tall', 'vase', 'island', 'ottoman', 'stool']);
/** Kinds that can be made a little wider or deeper without looking wrong: beds, tables, cabinets and the like. */
const STRETCHY = new Set([
  'bed', 'rug', 'sofa', 'dining-table', 'coffee-table', 'desk', 'bookshelf', 'wardrobe', 'dresser', 'tv-stand',
  'cabinet-base', 'cabinet-sink', 'cabinet-wall', 'island', 'bathtub', 'shower', 'vanity', 'painting', 'mirror',
]);

/**
 * How to fit a stand-in into the space of the piece it replaces: a quarter
 * turn if it is the same from every side and its long side runs the other
 * way; then a scale that fits the footprint. Beds, tables, cabinets and
 * similar pieces may be stretched in width and depth separately (keeping their
 * height in proportion); everything else keeps its shape and is scaled evenly.
 */
export function fitInto(
  target: CatalogItem['size'],
  piece: CatalogItem['size'],
  kind?: string,
): { turn: boolean; x: number; y: number; z: number } {
  const turn = !!kind && TURNABLE.has(kind) && mismatch(target, piece, true) < mismatch(target, piece, false) && Math.abs(piece.w - piece.d) > 0.05;
  const [w, d] = turn ? [piece.d, piece.w] : [piece.w, piece.d];
  const clamp = (v: number) => Math.max(0.4, Math.min(1.6, v));
  // Never much taller than the piece it replaces.
  const tallest = (target.h * 1.3) / piece.h;
  if (kind && STRETCHY.has(kind)) {
    const x = clamp(target.w / w);
    const z = clamp(target.d / d);
    return { turn, x, z, y: clamp(Math.min(Math.sqrt(x * z), tallest)) };
  }
  // Never wider or deeper than the space it stands in.
  const even = clamp(Math.min(target.w / w, target.d / d, tallest));
  return { turn, x: even, y: even, z: even };
}

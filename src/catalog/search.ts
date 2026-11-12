import type { CatalogItem } from './catalog';
import { KINDS } from './kinds';

/**
 * Searching the catalog by what things are, not just by their exact names:
 * "couches" finds sofas, "statues" finds busts and sculptures, "kitchenware"
 * finds pots, pans, kettles and bowls, "chinese" finds the Chinese and
 * oriental pieces. Every word typed must match; the best matches come first.
 */

/** Words that mean the same thing: typing any of them finds all of them. */
const SYNONYMS: string[][] = [
  ['sofa', 'couch', 'settee', 'loveseat', 'divan', 'chesterfield'],
  ['armchair', 'recliner', 'wingback'],
  ['bed', 'bunk', 'cot'],
  ['statue', 'sculpture', 'statuette', 'figurine', 'idol', 'bust'],
  ['chinese', 'china', 'oriental'],
  ['vase', 'urn', 'amphora'],
  ['rug', 'carpet', 'mat', 'doormat'],
  ['tv', 'television'],
  ['picture', 'painting', 'artwork', 'poster', 'canvas', 'frame'],
  ['clock', 'timepiece'],
  ['toilet', 'wc', 'loo', 'lavatory'],
  ['bath', 'bathtub', 'tub'],
  ['sink', 'basin', 'washbasin', 'vanity'],
  ['book', 'encyclopedia'],
  ['basket', 'wicker', 'rattan'],
  ['wood', 'wooden', 'timber'],
  ['old', 'antique', 'vintage', 'retro', 'classic', 'historic', 'ancient'],
  ['modern', 'contemporary', 'minimal', 'minimalist'],
  ['gothic', 'medieval'],
  ['realistic', 'detailed', 'photoreal', 'photorealistic', 'textured', 'scan', 'scanned'],
  ['simple', 'lowpoly', 'cartoon'],
  ['lamp', 'light', 'lighting'],
  ['plant', 'houseplant', 'potted'],
  ['metal', 'metallic'],
  ['cabinet', 'cupboard'],
  ['shelf', 'shelving', 'bookshelf', 'bookcase'],
  ['dresser', 'commode', 'drawer', 'sideboard', 'credenza'],
  ['wardrobe', 'armoire', 'closet'],
  ['kitchenware', 'cookware', 'utensil'],
  ['decor', 'decoration', 'decorative', 'ornament', 'ornamental'],
  ['sword', 'blade', 'saber', 'sabre', 'katana', 'estoc', 'rapier'],
  ['axe', 'hatchet'],
];

/**
 * Broad words and the things they cover. Typing a broad word finds what it
 * covers, but not the other way round: "decor" finds statues, while "statue"
 * finds only statues.
 */
const COVERS: [string[], string[]][] = [
  [['chair', 'seat', 'seating'], ['chair', 'stool', 'bench', 'armchair', 'ottoman']],
  [['table'], ['desk', 'console']],
  [['cabinet', 'storage', 'furniture'], ['dresser', 'wardrobe', 'chest', 'shelf', 'cabinet']],
  [['lamp', 'light', 'lighting'], ['lantern', 'chandelier', 'sconce', 'pendant', 'candle', 'candlestick', 'candleholder', 'bulb', 'diya']],
  [['statue'], ['buddha', 'bodhisattva', 'monument']],
  [['chinese', 'asian', 'asia'], ['ming', 'qing', 'dynasty', 'jade', 'lacquer', 'dragon', 'buddha', 'bodhisattva', 'chinese', 'china', 'oriental']],
  [['japanese', 'japan'], ['katana', 'samurai', 'oriental']],
  [['decor', 'decoration', 'ornament'], ['statue', 'vase', 'picture', 'clock', 'candle', 'candleholder', 'basket', 'decorative', 'ornate']],
  [['kitchenware', 'kitchen', 'cooking', 'cook'], ['pot', 'pan', 'kettle', 'jug', 'pitcher', 'bowl', 'plate', 'dish', 'cup', 'mug', 'goblet', 'teapot', 'tea', 'cutlery', 'spoon', 'fork', 'knife', 'bottle', 'jar', 'cutting', 'enamel', 'microwave', 'toaster', 'blender', 'stove', 'oven', 'fridge', 'cookware', 'kitchenware']],
  [['tableware', 'dish', 'dishes', 'crockery'], ['plate', 'bowl', 'cup', 'mug', 'goblet', 'cutlery', 'teapot', 'tea', 'dish']],
  [['food'], ['fruit', 'cake', 'bread', 'vegetable', 'apple', 'lemon', 'onion', 'banana', 'croissant']],
  [['vase', 'pottery', 'ceramic'], ['jar', 'vessel', 'pottery', 'ceramic', 'porcelain', 'garniture', 'baluster', 'beaker', 'ewer', 'vase']],
  [['plant', 'greenery', 'foliage'], ['flower', 'fern', 'succulent', 'cactus', 'tree', 'shrub', 'bush', 'botany', 'plant']],
  [['metal'], ['steel', 'iron', 'brass', 'copper', 'bronze', 'aluminium', 'aluminum']],
  [['wood'], ['oak', 'walnut', 'pine']],
  [['weapon', 'arm', 'armour', 'armor', 'medieval'], ['sword', 'dagger', 'knife', 'machete', 'mace', 'axe', 'shield', 'grenade', 'war']],
];

/** Removes a plural ending, so "chairs", "benches" and "shelves" match "chair", "bench" and "shelf". */
export function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ves') && word.length > 4) return word.slice(0, -3) + 'f';
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular);

/** Every word a typed word stands for: itself, its synonyms, and what it covers (with their synonyms). */
const EXPANSIONS = new Map<string, Set<string>>();
const set = (w: string) => {
  if (!EXPANSIONS.has(w)) EXPANSIONS.set(w, new Set([w]));
  return EXPANSIONS.get(w)!;
};
for (const group of SYNONYMS) {
  const g = group.map(singular);
  for (const w of g) g.forEach((x) => set(w).add(x));
}
const synonymsOf = (w: string) => [...(EXPANSIONS.get(w) ?? [w])];
for (const [heads, covered] of COVERS) {
  const all = covered.map(singular).flatMap(synonymsOf);
  for (const h of heads.map(singular)) all.forEach((x) => set(h).add(x));
}
const expand = (w: string): Set<string> => EXPANSIONS.get(w) ?? new Set([w]);

const KIND_LABEL = new Map(KINDS.map((k) => [k.id, k.label]));
const CATEGORY_WORDS: Record<string, string> = {
  living: 'living room lounge', bedroom: 'bedroom', kitchen: 'kitchen dining', bathroom: 'bathroom',
  office: 'office study work', lighting: 'lighting light lamp', decor: 'decor decoration', outdoor: 'garden outdoor yard',
};

/** What a piece can be found by, in three tiers: its name, what it is, and everything else. */
interface Indexed {
  name: string[];
  kind: string[];
  more: string[];
}
const index = new WeakMap<CatalogItem, Indexed>();
function indexOf(c: CatalogItem): Indexed {
  let i = index.get(c);
  if (!i) {
    const source = c.id.startsWith('polyhaven-')
      ? 'poly haven scan'
      : c.id.startsWith('khronos-')
        ? 'khronos wayfair'
        : c.id.startsWith('custom-')
          ? 'mine my imported own'
          : c.id.startsWith('kenney-')
            ? 'kenney'
            : 'built in';
    i = {
      name: words(c.name),
      kind: words(`${c.kind ?? ''} ${c.kind ? KIND_LABEL.get(c.kind) ?? '' : ''}`),
      more: words(`${(c.tags ?? []).join(' ')} ${CATEGORY_WORDS[c.category] ?? ''} ${c.group ?? ''} ${c.style} ${source}`),
    };
    index.set(c, i);
  }
  return i;
}

/** How well one typed word matches a list of words: 3 exactly, 2 as the start of a word, 0 not at all. */
function hit(typed: string, list: string[]): number {
  let best = 0;
  for (const want of expand(typed)) {
    for (const w of list) {
      if (w === want) return want === typed ? 3 : 2.5;
      if (want.length >= 3 && w.startsWith(want)) best = Math.max(best, 2);
    }
  }
  return best;
}

/**
 * How well a piece matches a search, or 0 if it does not. A match on the name
 * counts most, then on what it is, then on its tags and category.
 */
export function searchScore(c: CatalogItem, query: string): number {
  const typed = words(query);
  if (!typed.length) return 1;
  const i = indexOf(c);
  let total = 0;
  for (const t of typed) {
    const s = Math.max(hit(t, i.name) * 3, hit(t, i.kind) * 2, hit(t, i.more));
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** The pieces that match, best first (ties keep their catalog order). */
export function searchCatalog(items: CatalogItem[], query: string): CatalogItem[] {
  if (!words(query).length) return items;
  return items
    .map((c, order) => ({ c, order, score: searchScore(c, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((r) => r.c);
}

/** Matching text that is not a catalog piece (an online model's name and tags), with the same rules. */
export function textScore(name: string, tags: string[], query: string): number {
  const typed = words(query);
  if (!typed.length) return 0;
  const n = words(name);
  const more = words(tags.join(' '));
  let total = 0;
  for (const t of typed) {
    const s = Math.max(hit(t, n) * 3, hit(t, more));
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** Common things to look for, offered as one-click searches. */
export const QUICK_SEARCHES = [
  'Chairs', 'Sofas', 'Beds', 'Tables', 'Cabinets', 'Lamps', 'Statues', 'Chinese', 'Kitchenware', 'Vases', 'Plants', 'Clocks', 'Pictures', 'Rugs',
];

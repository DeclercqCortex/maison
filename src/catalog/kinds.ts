/**
 * What a piece of furniture is (a sofa, a bed, a toilet...), so the same room
 * can be shown in either furniture style: the simple low-poly pieces or the
 * realistic, textured ones. A placed piece is drawn as the closest piece of
 * the same kind in the chosen style, fitted to the space it takes up.
 */

/** The look of a catalog piece. */
export type FurnitureStyle = 'simple' | 'realistic';

/** Every kind, with a name for choosing one when importing a model. */
export const KINDS: { id: string; label: string }[] = [
  { id: 'sofa', label: 'Sofa' },
  { id: 'armchair', label: 'Armchair' },
  { id: 'ottoman', label: 'Footstool or ottoman' },
  { id: 'coffee-table', label: 'Coffee table' },
  { id: 'side-table', label: 'Side table' },
  { id: 'tv-stand', label: 'TV stand' },
  { id: 'tv', label: 'Television' },
  { id: 'bookshelf', label: 'Bookshelf' },
  { id: 'rug', label: 'Rug' },
  { id: 'bed', label: 'Bed' },
  { id: 'nightstand', label: 'Nightstand' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'dresser', label: 'Dresser or sideboard' },
  { id: 'cabinet-base', label: 'Kitchen base cabinet' },
  { id: 'cabinet-sink', label: 'Kitchen sink' },
  { id: 'cabinet-wall', label: 'Kitchen wall cabinet' },
  { id: 'stove', label: 'Stove or oven' },
  { id: 'fridge', label: 'Fridge' },
  { id: 'microwave', label: 'Microwave' },
  { id: 'island', label: 'Kitchen island' },
  { id: 'dining-table', label: 'Dining table' },
  { id: 'chair', label: 'Chair' },
  { id: 'stool', label: 'Stool' },
  { id: 'toilet', label: 'Toilet' },
  { id: 'bathtub', label: 'Bathtub' },
  { id: 'shower', label: 'Shower' },
  { id: 'vanity', label: 'Bathroom sink' },
  { id: 'mirror', label: 'Mirror' },
  { id: 'desk', label: 'Desk' },
  { id: 'office-chair', label: 'Office chair' },
  { id: 'filing-cabinet', label: 'Filing cabinet' },
  { id: 'monitor', label: 'Computer screen' },
  { id: 'lamp-floor', label: 'Floor lamp' },
  { id: 'lamp-table', label: 'Table lamp' },
  { id: 'light-ceiling', label: 'Ceiling light' },
  { id: 'light-pendant', label: 'Pendant light or chandelier' },
  { id: 'light-sconce', label: 'Wall light' },
  { id: 'ceiling-fan', label: 'Ceiling fan' },
  { id: 'plant', label: 'Potted plant' },
  { id: 'plant-tall', label: 'Tall plant' },
  { id: 'painting', label: 'Picture or painting' },
  { id: 'clock', label: 'Clock' },
  { id: 'vase', label: 'Vase' },
  { id: 'books', label: 'Books' },
  { id: 'bench', label: 'Bench' },
  { id: 'picnic-table', label: 'Picnic or garden table' },
  { id: 'planter', label: 'Planter' },
];

/** The built-in pieces' kinds, by catalog id. */
export const BUILT_IN_KINDS: Record<string, string> = {
  'sofa-2': 'sofa', 'sofa-3': 'sofa', armchair: 'armchair', 'coffee-table': 'coffee-table', 'side-table': 'side-table',
  'tv-stand': 'tv-stand', tv: 'tv', bookshelf: 'bookshelf', rug: 'rug', 'rug-round': 'rug',
  'bed-single': 'bed', 'bed-double': 'bed', 'bed-king': 'bed', nightstand: 'nightstand', wardrobe: 'wardrobe', dresser: 'dresser',
  'cabinet-base': 'cabinet-base', 'cabinet-sink': 'cabinet-sink', stove: 'stove', fridge: 'fridge', 'cabinet-wall': 'cabinet-wall',
  island: 'island', 'dining-table': 'dining-table', 'table-round': 'dining-table', chair: 'chair', stool: 'stool',
  toilet: 'toilet', bathtub: 'bathtub', shower: 'shower', vanity: 'vanity', mirror: 'mirror',
  desk: 'desk', 'office-chair': 'office-chair', 'filing-cabinet': 'filing-cabinet', monitor: 'monitor',
  'lamp-floor': 'lamp-floor', 'lamp-table': 'lamp-table', 'light-ceiling': 'light-ceiling', 'light-pendant': 'light-pendant',
  'light-sconce': 'light-sconce', plant: 'plant', 'plant-tall': 'plant-tall', painting: 'painting', clock: 'clock', vase: 'vase',
  books: 'books', bench: 'bench', 'picnic-table': 'picnic-table',
};

type Rule = [RegExp, string | ((size: { w: number; d: number; h: number }) => string | undefined)];

/** Kinds read from a model's name. The first rule that matches wins, so the more particular ones come first. */
const NAME_RULES: Rule[] = [
  [/ceiling fan/, 'ceiling-fan'],
  [/ottoman/, 'ottoman'],
  [/office chair|chair desk|desk chair|swivel/, 'office-chair'],
  [/sofa|couch|settee|day ?bed|loveseat/, 'sofa'],
  [/arm ?chair|lounge.*chair|rocking ?chair|rockingchair|recliner/, 'armchair'],
  [/picnic|outdoor table|garden table/, 'picnic-table'],
  [/bar chair|stool/, 'stool'],
  [/chair/, 'chair'],
  [/coffee table|table coffee|tea table/, 'coffee-table'],
  [/nightstand|night stand|bedside|cabinet bed/, 'nightstand'],
  [/side table/, 'side-table'],
  [/desk/, 'desk'],
  [/cabinet television|tv (stand|unit|cabinet)|media (unit|console)/, 'tv-stand'],
  [/television|\btv\b/, 'tv'],
  [/computer screen|monitor/, 'monitor'],
  [/fridge|refrigerator/, 'fridge'],
  [/stove|oven|cooker|range\b/, 'stove'],
  [/microwave/, 'microwave'],
  [/kitchen sink|sink cabinet/, 'cabinet-sink'],
  [/kitchen cabinet upper|wall cabinet|upper cabinet/, 'cabinet-wall'],
  [/kitchen cabinet|base cabinet/, 'cabinet-base'],
  [/kitchen bar|island/, 'island'],
  [/toilet|\bwc\b/, 'toilet'],
  [/bath ?tub|\bbath\b/, 'bathtub'],
  [/shower/, 'shower'],
  [/bathroom sink|vanity|wash ?basin|sink/, 'vanity'],
  [/mirror/, 'mirror'],
  [/filing/, 'filing-cabinet'],
  [/bookcase|bookshelf|book shelf|shelves|shelf|shelving/, 'bookshelf'],
  [/rug|doormat|carpet/, 'rug'],
  // A bare bed frame, with no mattress, would look broken standing in for a made-up bed.
  [/bed frame/, () => undefined],
  [/\bbed\b|bunk/, 'bed'],
  [/wardrobe|armoire|closet/, 'wardrobe'],
  [/commode|dresser|drawer|chest of drawers|sideboard|credenza|console table/, 'dresser'],
  // A free-standing cabinet: tall ones are wardrobes, low ones sideboards.
  [/cabinet|cupboard/, (s) => (s.h > 1.5 ? 'wardrobe' : 'dresser')],
  // Whole words only: a "portable" radio is not a table.
  [/\btables?\b/, 'dining-table'],
  [/chandelier|pendant|hanging.*lamp|lantern chandelier/, 'light-pendant'],
  [/ceiling (lamp|light)|lamp square ceiling/, 'light-ceiling'],
  [/sconce|wall (lamp|light)|lamp wall/, 'light-sconce'],
  [/floor lamp|lamp .*floor|standing lamp/, 'lamp-floor'],
  [/table lamp|lamp .*table|desk lamp|oil lamp/, 'lamp-table'],
  [/planter/, 'planter'],
  [/plant|fern|ficus|palm/, (s) => (s.h > 1.0 ? 'plant-tall' : 'plant')],
  [/clock/, 'clock'],
  [/picture|painting|frame|poster|artwork/, 'painting'],
  [/vase/, 'vase'],
  [/book/, 'books'],
  [/bench/, 'bench'],
];

/** The kind of a piece, from its catalog id (built-in pieces) or its name. Undefined if it is nothing in particular. */
export function kindOf(def: { id: string; name: string; size: { w: number; d: number; h: number } }): string | undefined {
  if (BUILT_IN_KINDS[def.id]) return BUILT_IN_KINDS[def.id];
  const name = def.name.toLowerCase();
  for (const [pattern, kind] of NAME_RULES) {
    if (pattern.test(name)) return typeof kind === 'string' ? kind : kind(def.size);
  }
  return undefined;
}

/** Realistic pieces: Poly Haven's scanned and textured models, and models the user has imported. */
export function styleOf(id: string): FurnitureStyle {
  return id.startsWith('polyhaven-') || id.startsWith('custom-') || id.startsWith('khronos-') ? 'realistic' : 'simple';
}

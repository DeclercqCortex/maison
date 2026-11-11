// Turns the downloaded Kenney model packs (public/models) into catalog entries.
//
// Every model is measured so it can be given a real-world size, centred on its
// footprint and stood on the floor. The file name decides its catalog name,
// category and where it may be placed. Run with `npm run models` after adding
// or removing model files; the result is written to src/catalog/models.json.
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelBounds, readGlbJson } from './glb.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const round = (v) => Math.round(v * 1000) / 1000;

/** "kitchenCabinetUpper" or "tree_pineTallA" becomes "Kitchen cabinet upper" or "Tree pine tall A". */
function title(file) {
  const words = file
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .split(' ')
    .map((w) => (w.length === 1 ? w.toUpperCase() : w.toLowerCase()));
  const text = words.join(' ');
  return text[0].toUpperCase() + text.slice(1);
}

const first = (rules, name, fallback) => (rules.find(([pattern]) => pattern.test(name)) ?? [null, fallback])[1];

// ---- Furniture Kit: modelled at half size, so everything is doubled. ----
const FURNITURE_SKIP = /^(wall|floor|doorway|stairs|paneling)/; // building parts: Maison draws its own
const FURNITURE_CATEGORY = [
  [/^(bathroom|bathtub|shower|toilet|washer|dryer)/, 'bathroom'],
  [/^(lamp|ceilingFan)/, 'lighting'],
  [/^(kitchen|hood|toaster|stoolBar|table(Cloth|Cross|Glass|Round)?$|tableCrossCloth|chair(Cushion|Rounded|Modern.*)?$)/, 'kitchen'],
  [/^(bed|cabinetBed|pillow|bear)/, 'bedroom'],
  [/^(desk|chairDesk|computer|laptop|books)/, 'office'],
  [/^(plant|pottedPlant|cardboardBox|trashcan)/, 'decor'],
];
const FURNITURE_PLACEMENT = [
  [/^(lampSquareCeiling|ceilingFan)$/, 'ceiling'],
  [/^(bathroomMirror|bathroomCabinet$|lampWall|coatRack$|kitchenCabinetUpper|hood)/, 'wall'],
  [/^(books|computer|laptop|kitchenBlender|kitchenCoffeeMachine|kitchenMicrowave|toaster|radio|lamp(Round|Square)Table|plantSmall|pillow|television|speakerSmall|bear)/, 'surface'],
];
const FURNITURE_LIGHT = [
  [/^lamp(Round|Square)Floor$/, 9],
  [/^lamp(Round|Square)Table$/, 5],
  [/^lampSquareCeiling$/, 14],
  [/^lampWall$/, 5],
];

// ---- Nature Kit: modelled small, and each family needs its own enlargement. ----
const NATURE_SKIP = /^(ground|cliff|bridge|platform|hanging)/; // terrain tiles: the lot has its own ground
const NATURE_SCALE = [
  [/^tree/, 4], [/^canoe/, 4], [/^tent/, 3.5], [/^(fence|statue|sign)/, 3], [/^bed/, 2.6],
  [/^(rock|stone|campfire|log|stump|cactus)/, 2.5], [/^(flower|mushroom|grass|plant|lily|path)/, 2], [/^crop/, 1.6], [/^pot/, 1.5],
];
const NATURE_GROUP = [
  [/^tree/, 'Trees'], [/^(rock|stone)/, 'Rocks'], [/^(flower|plant|grass|mushroom|lily|cactus|stump|log)/, 'Plants'],
  [/^crop/, 'Crops'], [/^(fence|path|sign|statue|pot)/, 'Garden'], [/^(tent|campfire|canoe|bed)/, 'Camping'],
];
const NATURE_FLAT = /^(path|lily|grass|flower|mushroom|crop|plant)/; // low things that never block anything

const entries = [];
for (const kit of ['furniture', 'nature']) {
  const dir = join(root, 'public', 'models', kit);
  for (const fileName of readdirSync(dir).filter((f) => f.endsWith('.glb')).sort()) {
    const name = fileName.replace(/\.glb$/, '');
    if ((kit === 'furniture' ? FURNITURE_SKIP : NATURE_SKIP).test(name)) continue;
    const { min, max } = modelBounds(readGlbJson(join(dir, fileName)));
    const scale = kit === 'furniture' ? 2 : first(NATURE_SCALE, name, 2.5);
    const size = { w: round((max[0] - min[0]) * scale), d: round((max[2] - min[2]) * scale), h: round((max[1] - min[1]) * scale) };
    if (!(size.w > 0 && size.d > 0 && size.h > 0)) continue;

    const entry = {
      id: `kenney-${kit}-${name}`,
      name: title(name),
      category: kit === 'furniture' ? first(FURNITURE_CATEGORY, name, 'living') : 'outdoor',
      placement: kit === 'furniture' ? first(FURNITURE_PLACEMENT, name, 'floor') : 'floor',
      size,
      // Shift that centres the model on its footprint and rests its lowest point on the floor.
      model: {
        file: `${kit}/${fileName}`,
        scale,
        offset: [round(-(min[0] + max[0]) / 2), round(-min[1]), round(-(min[2] + max[2]) / 2)],
      },
    };
    if (kit === 'furniture') {
      if (/^rug/.test(name)) entry.flat = true;
      const intensity = first(FURNITURE_LIGHT, name, 0);
      if (intensity) entry.light = { y: entry.placement === 'ceiling' ? -0.05 : round(size.h * 0.85), intensity };
    } else {
      entry.group = first(NATURE_GROUP, name, 'Garden');
      if (NATURE_FLAT.test(name)) entry.flat = true;
      // Other things may stand under a tree's branches, just not in its trunk.
      if (/^tree/.test(name)) entry.collide = { w: 0.6, d: 0.6 };
    }
    entries.push(entry);
  }
}

writeFileSync(join(root, 'src', 'catalog', 'models.json'), JSON.stringify(entries, null, 1) + '\n');
const count = (kit) => entries.filter((e) => e.id.startsWith(`kenney-${kit}-`)).length;
console.log(`Wrote ${entries.length} catalog entries: ${count('furniture')} furniture, ${count('nature')} nature.`);

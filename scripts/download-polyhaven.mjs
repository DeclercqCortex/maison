// Downloads the indoor models from Poly Haven (polyhaven.com), which are
// public domain (CC0), into public/models/polyhaven. Run with
// `npm run models:download`, then `npm run models` to add them to the catalog.
//
// Only models useful inside a house are fetched, at the smallest texture size
// (1K), with Poly Haven's own preview picture of each for the catalog.
// Models already downloaded are skipped, so it is safe to run again.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'models', 'polyhaven');
// Poly Haven asks API users to identify themselves with a distinct user agent.
const headers = { 'User-Agent': 'Maison-home-builder/0.1 (model download script)' };

/** Categories wanted inside a house, and ones that mark a model as unsuitable even if it also has a wanted one. */
const WANT = ['furniture', 'seating', 'table', 'shelves', 'lighting', 'decorative', 'appliances', 'electronics', 'dishes'];
const ALSO = ['plants', 'trees', 'rocks', 'food', 'containers'];
const SKIP = ['industrial', 'structures', 'buildings', 'rigged', 'tools'];

const json = async (url) => {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

async function save(url, path) {
  if (existsSync(path)) return 0;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  return data.length;
}

const assets = await json('https://api.polyhaven.com/assets?t=models');
const chosen = Object.entries(assets).filter(
  ([, a]) =>
    a.categories.some((c) => [...WANT, ...ALSO].includes(c)) &&
    !a.categories.some((c) => SKIP.includes(c)) &&
    a.categories.some((c) => WANT.includes(c)),
);
console.log(`${chosen.length} indoor models listed on Poly Haven.`);

mkdirSync(target, { recursive: true });
const index = [];
let bytes = 0;
let failed = 0;
let done = 0;

// A few downloads at a time: quick, without hammering the server.
const queue = [...chosen];
async function worker() {
  for (let next = queue.shift(); next; next = queue.shift()) {
    const [id, asset] = next;
    try {
      const files = await json(`https://api.polyhaven.com/files/${id}`);
      const gltf = files.gltf?.['1k']?.gltf;
      if (!gltf) {
        console.log(`  skipped ${asset.name}: no 1K glTF version`);
        continue;
      }
      const dir = join(target, id);
      const main = gltf.url.split('/').pop();
      const saved = [await save(gltf.url, join(dir, main))];
      for (const [path, file] of Object.entries(gltf.include ?? {})) saved.push(await save(file.url, join(dir, path)));
      saved.push(await save(`https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`, join(dir, 'preview.png')));
      // Added up after the awaits: several downloads run at once, and adding across an await loses counts.
      bytes += saved.reduce((a, b) => a + b, 0);
      index.push({ id, name: asset.name, file: `${id}/${main}`, categories: asset.categories, tags: asset.tags });
      done++;
      if (done % 20 === 0) console.log(`  ${done} of ${chosen.length} done`);
    } catch (err) {
      failed++;
      console.log(`  failed ${asset.name}: ${err.message}`);
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

index.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(join(target, 'index.json'), JSON.stringify(index, null, 1) + '\n');
writeFileSync(
  join(target, 'License.txt'),
  'Models from Poly Haven (https://polyhaven.com), licensed CC0 (public domain).\n' +
    'See https://polyhaven.com/license. Credit is not required.\n',
);
console.log(`Downloaded ${index.length} models (${(bytes / 1e6).toFixed(0)} MB new), ${failed} failed.`);

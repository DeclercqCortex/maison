// Lists the Smithsonian's open-access 3D scans that are public domain (CC0)
// in src/catalog/smithsonian.json, so they can be searched from the catalog
// and added on demand. Only this list is fetched, not the models themselves.
//
//   npm run models:smithsonian
//
// The Smithsonian's open-access search needs an api.data.gov key: a free one
// from https://api.data.gov/signup, passed as SI_API_KEY. Without one the
// shared DEMO_KEY is used, which allows only a few requests an hour.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = process.env.SI_API_KEY || 'DEMO_KEY';
const headers = { 'User-Agent': 'Maison-home-builder/0.1 (model index script)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Museums whose scans are of things that could furnish or decorate a home (not fossils, shells or skeletons). */
const SKIP_UNITS = /^(NMNH(?!ANTHRO)|NZP|SERC|STRI)/;

async function json(url) {
  const res = await fetch(url, { headers });
  const body = await res.json();
  if (body.error) throw new Error(`${body.error.code}: ${body.error.message}`);
  return body;
}

// 1. Every open-access record with a 3D scan.
const records = [];
for (let start = 0; ; start += 1000) {
  const page = await json(`https://api.si.edu/openaccess/api/v1.0/search?q=3d_voyager&rows=1000&start=${start}&api_key=${KEY}`);
  records.push(...page.response.rows);
  if (records.length >= page.response.rowCount || !page.response.rows.length) break;
}
console.log(`${records.length} records with 3D scans.`);

const clean = (t) => t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const candidates = [];
for (const r of records) {
  const d = r.content?.descriptiveNonRepeating ?? {};
  if (SKIP_UNITS.test(d.unit_code ?? '')) continue;
  const media = d.online_media?.media ?? [];
  const scans = media.filter((m) => m.type === '3d_voyager' && m.usage?.access === 'CC0');
  if (!scans.length) continue;
  const image = media.find((m) => m.type === 'Images' && m.usage?.access === 'CC0');
  const s = r.content?.indexedStructured ?? {};
  // Words to search by: what it is, where and who it comes from, what it is made of.
  const tags = [...new Set([...(s.object_type ?? []), ...(s.culture ?? []), ...(s.place ?? []), ...(s.topic ?? []), ...(s.date ?? []).map(String)].map((t) => String(t).toLowerCase()))];
  for (const scan of scans) {
    const pkg = scan.content.split('/').pop().replace(/^3d_package:/, '');
    candidates.push({
      pkg,
      title: clean(r.title),
      unit: d.data_source ?? d.unit_code,
      tags,
      thumb: image ? `${image.content}&max=320` : '',
      page: d.record_link ?? `https://3d.si.edu`,
    });
  }
}
console.log(`${candidates.length} public-domain scans of objects.`);

// 2. The 150,000-triangle GLB of each scan, from the Smithsonian's 3D service (no key needed).
const out = [];
for (const [i, c] of candidates.entries()) {
  try {
    const found = await json(`https://3d-api.si.edu/api/v1.0/content/file/search?q=${encodeURIComponent(c.title.slice(0, 120))}&rows=100`);
    const files = found.rows.filter((f) => f.content.model_url === `3d_package:${c.pkg}` && f.content.file_type === 'glb' && f.content.usage === 'Web3D');
    const pick = files.find((f) => f.content.quality === 'Medium') ?? files.find((f) => f.content.quality === 'Low') ?? files[0];
    if (pick) {
      const thumbGlb = files.find((f) => f.content.quality === 'Thumb');
      out.push({ ...c, glb: pick.content.uri, ...(c.thumb ? {} : { thumbGlb: thumbGlb?.content.uri }) });
    }
  } catch (err) {
    console.log(`  skipped ${c.title}: ${err.message}`);
  }
  if (i % 50 === 49) console.log(`  ${i + 1} of ${candidates.length} looked up`);
  await sleep(150);
}
// Scans without a photo of the object cannot be shown in the catalog; leave them out.
const listed = out.filter((e) => e.thumb);
listed.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(join(root, 'src', 'catalog', 'smithsonian.json'), JSON.stringify(listed, null, 1) + '\n');
console.log(`Listed ${listed.length} scans in src/catalog/smithsonian.json.`);

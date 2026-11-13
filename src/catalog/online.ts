import { CATALOG } from './catalog';
import smithsonian from './smithsonian.json';

/**
 * Free, public-domain (CC0) models that can be searched from the catalog and
 * added on demand: every model on Poly Haven (listed live from its website)
 * and the Smithsonian's open-access 3D scans (listed in smithsonian.json by
 * `npm run models:smithsonian`). Nothing is downloaded until a model is added.
 */
export interface OnlineModel {
  /** `polyhaven:<id>` or `smithsonian:<package>`. */
  id: string;
  source: 'Poly Haven' | 'Smithsonian';
  name: string;
  tags: string[];
  thumb: string;
  /** The model's page on its website. */
  page: string;
  credit: string;
}

/** A Smithsonian entry as listed in smithsonian.json. */
interface SmithsonianEntry {
  pkg: string;
  title: string;
  unit: string;
  tags: string[];
  glb: string;
  thumb: string;
  page: string;
}

const HEADERS = { Accept: 'application/json' };

let polyHaven: Promise<OnlineModel[]> | null = null;
/** Poly Haven's whole model list, fetched once (about 0.5 MB of text). Models already in the catalog are left out. */
function polyHavenModels(): Promise<OnlineModel[]> {
  if (!polyHaven) {
    const have = new Set(CATALOG.filter((c) => c.id.startsWith('polyhaven-')).map((c) => c.id.slice('polyhaven-'.length)));
    polyHaven = fetch('https://api.polyhaven.com/assets?t=models', { headers: HEADERS })
      .then((r) => {
        if (!r.ok) throw new Error(`Poly Haven answered ${r.status}`);
        return r.json() as Promise<Record<string, { name: string; categories: string[]; tags: string[]; authors?: Record<string, string> }>>;
      })
      .then((all) =>
        Object.entries(all)
          .filter(([id]) => !have.has(id))
          .map(([id, a]) => ({
            id: `polyhaven:${id}`,
            source: 'Poly Haven' as const,
            name: a.name,
            tags: [...a.categories, ...a.tags],
            thumb: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`,
            page: `https://polyhaven.com/a/${id}`,
            credit: `Poly Haven${a.authors ? `, by ${Object.keys(a.authors).join(' and ')}` : ''} (CC0)`,
          })),
      );
    polyHaven.catch(() => (polyHaven = null));
  }
  return polyHaven;
}

const SMITHSONIAN: OnlineModel[] = (smithsonian as SmithsonianEntry[]).map((e) => ({
  id: `smithsonian:${e.pkg}`,
  source: 'Smithsonian',
  name: e.title,
  tags: [...e.tags, e.unit, 'museum', 'scan'],
  thumb: e.thumb,
  page: e.page,
  credit: `Smithsonian Institution, ${e.unit} (CC0)`,
}));
const SMITHSONIAN_GLB = new Map((smithsonian as SmithsonianEntry[]).map((e) => [`smithsonian:${e.pkg}`, e.glb]));

/** Everything that can be searched online. The Poly Haven part may fail (no connection); the rest still works. */
export async function onlineModels(): Promise<{ models: OnlineModel[]; failed: string[] }> {
  const failed: string[] = [];
  const ph = await polyHavenModels().catch(() => (failed.push('Poly Haven'), [] as OnlineModel[]));
  return { models: [...ph, ...SMITHSONIAN], failed };
}

async function download(url: string, name: string): Promise<File> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not download ${name} (${r.status}).`);
  return new File([await r.blob()], name);
}

/**
 * Downloads a model's files, ready for the importer: a Poly Haven model's
 * glTF with its .bin and textures (at the 1K size), or a Smithsonian scan's
 * GLB (the version made for augmented reality, which is in metres and the
 * right way up: about 100,000 triangles with 2K textures).
 */
export async function downloadOnlineModel(m: OnlineModel, onStatus: (text: string) => void): Promise<File[]> {
  if (m.source === 'Poly Haven') {
    const id = m.id.slice('polyhaven:'.length);
    onStatus('Finding the model files…');
    const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: HEADERS })).json();
    const gltf = files.gltf?.['1k']?.gltf ?? files.gltf?.['2k']?.gltf;
    if (!gltf) throw new Error('This model has no glTF version to download.');
    const parts: [string, string][] = [[gltf.url, gltf.url.split('/').pop()], ...Object.entries(gltf.include ?? {}).map(([path, f]) => [(f as { url: string }).url, path.split('/').pop()!] as [string, string])];
    const out: File[] = [];
    for (const [i, [url, name]] of parts.entries()) {
      onStatus(`Downloading from Poly Haven… (${i + 1} of ${parts.length} files)`);
      out.push(await download(url, name));
    }
    return out;
  }
  const url = SMITHSONIAN_GLB.get(m.id);
  if (!url) throw new Error('This model is no longer listed.');
  onStatus('Downloading the scan from the Smithsonian… (usually 1–3 MB)');
  return [await download(url, `${m.name.slice(0, 60)}.glb`)];
}

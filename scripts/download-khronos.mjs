// Downloads four detailed furniture models made by Wayfair for the Khronos
// glTF sample assets (github.com/KhronosGroup/glTF-Sample-Assets) into
// public/models/khronos, with their licences and credits. Run with
// `npm run models:khronos`, then `npm run models` to add them to the catalog.
// Models already downloaded are skipped.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public', 'models', 'khronos');
const BASE = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models';
const MODELS = ['SheenChair', 'GlamVelvetSofa', 'ChairDamaskPurplegold', 'SheenWoodLeatherSofa'];

mkdirSync(target, { recursive: true });
const credits = [];
for (const name of MODELS) {
  const file = join(target, `${name}.glb`);
  if (!existsSync(file)) {
    const res = await fetch(`${BASE}/${name}/glTF-Binary/${name}.glb`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer());
    writeFileSync(file, data);
    console.log(`  ${name}.glb: ${(data.length / 1e6).toFixed(1)} MB`);
  }
  const meta = await (await fetch(`${BASE}/${name}/metadata.json`)).json();
  const lines = (meta.legal ?? []).map((l) => `  ${l.license} — © ${l.year ?? ''} ${l.owner ?? ''}, by ${l.artist ?? ''}${l.what ? ` (${l.what})` : ''}`);
  credits.push(`${meta.name ?? name} (${name}.glb)\n${lines.join('\n')}`);
}
writeFileSync(
  join(target, 'License.txt'),
  'Models from the Khronos glTF sample assets, https://github.com/KhronosGroup/glTF-Sample-Assets\n' +
    'made by Wayfair. Licences and credits, per model (CC-BY 4.0 requires this credit):\n\n' +
    credits.join('\n\n') +
    '\n\nCC0-1.0: https://creativecommons.org/publicdomain/zero/1.0/\nCC-BY-4.0: https://creativecommons.org/licenses/by/4.0/\n',
);
console.log(`${MODELS.length} models in public/models/khronos.`);

// Writes the static data source of a published viewer: <dir>/index.json (GenerationInfo[]) and
// <dir>/<id>.files.json for every generation directory directly inside <dir>. The id is the directory name,
// which also names a system generation (devos-lab).
// Usage: node scripts/static-index.mjs dist/generations
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, listFiles } from '../server/generations.mjs';

const dir = path.resolve(process.argv[2] ?? 'dist/generations');
const index = [];
for (const name of readdirSync(dir).sort()) {
  const full = path.join(dir, name);
  if (!statSync(full).isDirectory()) continue;
  const { path: _local, modified: _modified, ...info } = describe(full, {});
  if (!info.commit) throw new Error(`${name}: manifest.json has no commit`);
  const hasSource = info.inputs ? info.inputs.some((i) => i.repository && i.commit) : Boolean(info.repository && info.commit);
  index.push({ ...info, id: name, hasSource });
  writeFileSync(path.join(dir, `${name}.files.json`), JSON.stringify(listFiles(full)));
}
writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
for (const g of index) console.log(`${g.id}: ${g.label} (${g.status}, schema ${g.schemaVersion})`);

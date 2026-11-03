// Builds public/catalog/photo-id.json from the shipped catalog: the species the photo-ID edge
// function may suggest, per region. The function loads this file itself, so a request only names
// a region and cannot make the prompt (and its cost) larger. Runs before every build.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogDir = join(root, 'public', 'catalog');
const require = createRequire(import.meta.url);

const SQL = await initSqlJs({ locateFile: (f) => require.resolve(`sql.js/dist/${f}`) });
const db = new SQL.Database(readFileSync(join(catalogDir, 'catalog.sqlite')));
const rows = (sql) => {
  const [res] = db.exec(sql);
  return res ? res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]]))) : [];
};

// Same order and region rules as the app's catalog (src/catalog/catalog.ts): most popular first,
// a species of a sub-region also belongs to its parent region.
const species = rows('SELECT id, scientific_name FROM species ORDER BY popularity DESC, scientific_name');
const regions = rows('SELECT id, name_en, parent_id FROM region ORDER BY sort');
const parentOf = new Map(regions.map((r) => [r.id, r.parent_id]));
const indexOf = new Map(species.map((s, i) => [s.id, i]));
const members = new Map(regions.map((r) => [r.id, new Set()]));
for (const { species_id, region_id } of rows('SELECT species_id, region_id FROM species_region')) {
  const i = indexOf.get(species_id);
  if (i == null) continue;
  members.get(region_id)?.add(i);
  const parent = parentOf.get(region_id);
  if (parent) members.get(parent)?.add(i);
}

const manifest = JSON.parse(readFileSync(join(catalogDir, 'catalog-manifest.json'), 'utf8'));
const index = {
  version: manifest.version,
  species: species.map((s) => [s.id, s.scientific_name]),
  regions: Object.fromEntries(
    regions.map((r) => [r.id, { name: r.name_en, species: [...members.get(r.id)].sort((a, b) => a - b) }]),
  ),
};
writeFileSync(join(catalogDir, 'photo-id.json'), JSON.stringify(index));
console.log(`photo-id.json: ${species.length} species, ${regions.length} regions`);

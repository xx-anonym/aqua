import type { SqlJsStatic } from 'sql.js';

export interface SeedSpecies {
  id: string;
  scientific_name: string;
  common_name_de: string | null;
  common_name_en: string | null;
  category: string;
  group_key: string | null;
  family: string | null;
  description_de: string | null;
  description_en: string | null;
  habitat: string | null;
  lifestyle: string | null;
  max_size_cm: number | null;
  depth_min_m: number | null;
  depth_max_m: number | null;
  iucn_status: string | null;
  popularity: number;
  traits: string[];
  regions: string[];
}

export interface SeedTrait {
  id: string;
  type: string;
  label_de: string;
  label_en: string;
  icon: string;
  applies_to: string;
  sort: number;
}

export interface SeedRegion {
  id: string;
  name_de: string;
  name_en: string;
  parent_id: string | null;
  geometry: unknown;
  sort: number;
}

/** Builds a catalog.sqlite in memory from JSON; used for tests (the real catalog comes from data-pipeline). */
export function buildCatalogBytes(
  SQL: SqlJsStatic,
  schemaSql: string,
  traits: SeedTrait[],
  regions: SeedRegion[],
  species: SeedSpecies[],
  version = 'seed',
): Uint8Array {
  const db = new SQL.Database();
  db.exec(schemaSql);
  db.run('INSERT INTO catalog_meta VALUES (?, ?, ?)', [version, new Date(0).toISOString(), '[]']);
  for (const t of traits) {
    db.run('INSERT INTO trait VALUES (?, ?, ?, ?, ?, ?, ?)', [t.id, t.type, t.label_de, t.label_en, t.icon, t.applies_to, t.sort]);
  }
  for (const r of regions) {
    db.run('INSERT INTO region VALUES (?, ?, ?, ?, ?, ?)', [
      r.id,
      r.name_de,
      r.name_en,
      r.parent_id,
      r.geometry ? JSON.stringify(r.geometry) : null,
      r.sort,
    ]);
  }
  for (const s of species) {
    db.run(
      `INSERT INTO species (id, scientific_name, common_name_de, common_name_en, category, group_key, family,
        description_de, description_en, habitat, lifestyle, max_size_cm, depth_min_m, depth_max_m, iucn_status, popularity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id, s.scientific_name, s.common_name_de, s.common_name_en, s.category, s.group_key, s.family,
        s.description_de, s.description_en, s.habitat, s.lifestyle, s.max_size_cm, s.depth_min_m, s.depth_max_m,
        s.iucn_status, s.popularity,
      ],
    );
    s.traits.forEach((t) => db.run('INSERT INTO species_trait VALUES (?, ?)', [s.id, t]));
    s.regions.forEach((r) => db.run('INSERT INTO species_region VALUES (?, ?)', [s.id, r]));
  }
  const bytes = db.export();
  db.close();
  return bytes;
}

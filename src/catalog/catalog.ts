import type { AppDb } from '../db/appDb';
import type { Category, CatalogMeta, Destination, Region, Species, SpeciesPhoto, Trait, TraitType } from './types';
import { buildSearchIndex, type SearchIndex } from './search';

interface SpeciesRow {
  id: string;
  scientific_name: string;
  common_name_de: string | null;
  common_name_en: string | null;
  category: Category;
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
  is_premium: number;
  popularity: number;
  thumb: string | null;
}

/** In-memory view of the catalog; built once per catalog version (a few hundred to ~2000 rows). */
export class Catalog {
  readonly byId = new Map<string, Species>();
  readonly traitsById = new Map<string, Trait>();
  readonly regionsById = new Map<string, Region>();
  readonly destinationsById = new Map<string, Destination>();
  readonly search: SearchIndex;

  constructor(
    readonly species: Species[],
    readonly traits: Trait[],
    readonly regions: Region[],
    readonly meta: CatalogMeta,
    readonly destinations: Destination[] = [],
  ) {
    species.forEach((s) => this.byId.set(s.id, s));
    traits.forEach((t) => this.traitsById.set(t.id, t));
    regions.forEach((r) => this.regionsById.set(r.id, r));
    destinations.forEach((d) => this.destinationsById.set(d.id, d));
    this.search = buildSearchIndex(species);
  }

  /** Regions that have destinations, each with its countries (in catalog order). */
  destinationGroups(): { region: Region; destinations: Destination[] }[] {
    return this.regionTree()
      .map((region) => ({ region, destinations: this.destinations.filter((d) => d.regionId === region.id) }))
      .filter((g) => g.destinations.length > 0);
  }

  traitsOfType(type: TraitType, category?: Category | null): Trait[] {
    return this.traits.filter((t) => t.type === type && (!category || t.appliesTo.includes(category)));
  }

  /** Top-level regions first, children directly after their parent. */
  regionTree(): Region[] {
    const roots = this.regions.filter((r) => !r.parentId);
    return roots.flatMap((r) => [r, ...this.regions.filter((c) => c.parentId === r.id)]);
  }

  speciesInRegion(regionId: string | null): Species[] {
    return regionId ? this.species.filter((s) => s.regions.includes(regionId)) : this.species;
  }
}

/** Older catalogs (kept in IndexedDB for offline use) may lack newer columns. */
function hasColumn(db: AppDb, table: string, column: string): boolean {
  return db.all<{ name: string }>(`SELECT name FROM cat.pragma_table_info('${table}')`).some((c) => c.name === column);
}

export function loadCatalog(db: AppDb): Catalog {
  const regions: Region[] = db
    .all<{ id: string; name_de: string; name_en: string; parent_id: string | null; geometry: string | null }>(
      'SELECT id, name_de, name_en, parent_id, geometry FROM cat.region ORDER BY sort',
    )
    .map((r) => ({
      id: r.id,
      nameDe: r.name_de,
      nameEn: r.name_en,
      parentId: r.parent_id,
      geometry: r.geometry ? (JSON.parse(r.geometry) as GeoJSON.Polygon) : null,
    }));
  const parentOf = new Map(regions.map((r) => [r.id, r.parentId]));

  const traits: Trait[] = db
    .all<{ id: string; type: TraitType; label_de: string; label_en: string; icon: string; applies_to: string }>(
      'SELECT id, type, label_de, label_en, icon, applies_to FROM cat.trait ORDER BY sort',
    )
    .map((t) => ({
      id: t.id,
      type: t.type,
      labelDe: t.label_de,
      labelEn: t.label_en,
      icon: t.icon,
      appliesTo: t.applies_to.split(',') as Category[],
    }));

  const traitMap = new Map<string, string[]>();
  for (const r of db.all<{ species_id: string; trait_id: string }>('SELECT species_id, trait_id FROM cat.species_trait')) {
    const list = traitMap.get(r.species_id) ?? [];
    list.push(r.trait_id);
    traitMap.set(r.species_id, list);
  }
  const regionMap = new Map<string, Set<string>>();
  for (const r of db.all<{ species_id: string; region_id: string }>('SELECT species_id, region_id FROM cat.species_region')) {
    const set = regionMap.get(r.species_id) ?? new Set<string>();
    set.add(r.region_id);
    const parent = parentOf.get(r.region_id);
    if (parent) set.add(parent);
    regionMap.set(r.species_id, set);
  }

  const species: Species[] = db
    // Most observed first; species without a photo of a living animal (photo_poor, catalogs from
    // 2026-11-10) come after the others, so a list never opens with a dead fish.
    .all<SpeciesRow>(
      `SELECT * FROM cat.species ORDER BY ${hasColumn(db, 'species', 'photo_poor') ? 'photo_poor, ' : ''}popularity DESC, scientific_name`,
    )
    .map((r) => ({
      id: r.id,
      scientificName: r.scientific_name,
      nameDe: r.common_name_de,
      nameEn: r.common_name_en,
      category: r.category,
      group: r.group_key,
      family: r.family,
      descriptionDe: r.description_de,
      descriptionEn: r.description_en,
      habitat: r.habitat,
      lifestyle: r.lifestyle,
      maxSizeCm: r.max_size_cm,
      depthMinM: r.depth_min_m,
      depthMaxM: r.depth_max_m,
      iucn: r.iucn_status,
      isPremium: !!r.is_premium,
      popularity: r.popularity,
      thumb: r.thumb,
      traits: traitMap.get(r.id) ?? [],
      regions: [...(regionMap.get(r.id) ?? [])],
      destinations: [],
    }));

  // Countries per region. Older catalog files (e.g. an offline fallback copy) do not have them yet.
  let destinations: Destination[] = [];
  const destMap = new Map<string, string[]>();
  try {
    destinations = db
      .all<{ id: string; region_id: string; country: string; name_de: string; name_en: string }>(
        'SELECT id, region_id, country, name_de, name_en FROM cat.destination ORDER BY sort',
      )
      .map((d) => ({ id: d.id, regionId: d.region_id, country: d.country, nameDe: d.name_de, nameEn: d.name_en }));
    for (const r of db.all<{ species_id: string; destination_id: string }>('SELECT species_id, destination_id FROM cat.species_destination')) {
      const list = destMap.get(r.species_id) ?? [];
      list.push(r.destination_id);
      destMap.set(r.species_id, list);
    }
  } catch {
    destinations = [];
  }
  for (const s of species) s.destinations = destMap.get(s.id) ?? [];

  const metaRow = db.get<{ version: string; built_at: string; sources: string }>('SELECT * FROM cat.catalog_meta');
  const meta: CatalogMeta = {
    version: metaRow?.version ?? '0',
    builtAt: metaRow?.built_at ?? '',
    sources: metaRow ? JSON.parse(metaRow.sources) : [],
  };
  return new Catalog(species, traits, regions, meta, destinations);
}

export function loadPhotos(db: AppDb, speciesId: string): SpeciesPhoto[] {
  return db
    .all<{ file: string; author: string; license: string; source_url: string; bytes: number }>(
      'SELECT file, author, license, source_url, bytes FROM cat.species_photo WHERE species_id = ? ORDER BY sort',
      [speciesId],
    )
    .map((p) => ({ file: p.file, author: p.author, license: p.license, sourceUrl: p.source_url, bytes: p.bytes }));
}

/** All photo credits, for the licenses screen. */
export function loadAllPhotoCredits(db: AppDb) {
  return db.all<{ species_id: string; scientific_name: string; author: string; license: string; source_url: string }>(
    `SELECT p.species_id, s.scientific_name, p.author, p.license, p.source_url
     FROM cat.species_photo p JOIN cat.species s ON s.id = p.species_id
     ORDER BY s.scientific_name, p.sort`,
  );
}

export function catalogAssetUrl(path: string | null | undefined): string | null {
  return path ? `/catalog/${path}` : null;
}

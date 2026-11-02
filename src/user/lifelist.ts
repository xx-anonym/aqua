import type { AppDb } from '../db/appDb';
import type { Catalog } from '../catalog/catalog';
import type { Category, Species } from '../catalog/types';
import { CATEGORIES } from '../catalog/types';
import { UNIDENTIFIED } from './sightings';

export interface LifeListEntry {
  speciesId: string;
  firstSeen: string;
  count: number;
  lastSeen: string;
  lastSiteName: string | null;
}

/** Derived view `life_list`: computed from all sightings, never stored (spec). */
export function lifeList(db: AppDb): Map<string, LifeListEntry> {
  const rows = db.all<{ species_id: string; seen_at: string; site_name: string | null }>(
    `SELECT g.species_id, g.seen_at, s.name AS site_name
     FROM sighting g
     LEFT JOIN dive d ON d.id = g.dive_id AND d.deleted_at IS NULL
     LEFT JOIN dive_site s ON s.id = d.site_id AND s.deleted_at IS NULL
     WHERE g.deleted_at IS NULL AND g.species_id <> ?
     ORDER BY g.seen_at`,
    [UNIDENTIFIED],
  );
  const map = new Map<string, LifeListEntry>();
  for (const r of rows) {
    const e = map.get(r.species_id);
    if (!e) {
      map.set(r.species_id, {
        speciesId: r.species_id,
        firstSeen: r.seen_at,
        lastSeen: r.seen_at,
        count: 1,
        lastSiteName: r.site_name,
      });
    } else {
      e.count++;
      e.lastSeen = r.seen_at;
      if (r.site_name) e.lastSiteName = r.site_name;
    }
  }
  return map;
}

export interface Progress {
  seen: number;
  total: number;
}

export function progressOf(species: Species[], seen: Map<string, unknown>): Progress {
  return { seen: species.filter((s) => seen.has(s.id)).length, total: species.length };
}

export interface ProgressReport {
  overall: Progress;
  byCategory: Record<Category, Progress>;
  byRegion: { regionId: string; progress: Progress }[];
}

/** Progress overall, per category and per region (e.g. "87 von 412 Arten im Roten Meer"). */
export function progressReport(catalog: Catalog, seen: Map<string, unknown>, regionId: string | null): ProgressReport {
  const scope = catalog.speciesInRegion(regionId);
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, progressOf(scope.filter((s) => s.category === c), seen)]),
  ) as Record<Category, Progress>;
  const byRegion = catalog
    .regionTree()
    .map((r) => ({ regionId: r.id, progress: progressOf(catalog.speciesInRegion(r.id), seen) }));
  return { overall: progressOf(scope, seen), byCategory, byRegion };
}

/** Species seen but not in the catalog any more (e.g. removed in a catalog update). */
export function orphanedSightings(catalog: Catalog, seen: Map<string, unknown>): string[] {
  return [...seen.keys()].filter((id) => !catalog.byId.has(id));
}

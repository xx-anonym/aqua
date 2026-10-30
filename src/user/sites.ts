import type { AppDb } from '../db/appDb';
import type { Region } from '../catalog/types';
import { pointInPolygon } from '../lib/geo';
import { softDelete, upsertRow } from './repo';

export interface DiveSite {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  country: string | null;
  region_id: string | null;
  is_private: number;
}

export interface DiveSiteWithStats extends DiveSite {
  dive_count: number;
}

export function listSites(db: AppDb): DiveSiteWithStats[] {
  return db.all<DiveSiteWithStats>(
    `SELECT s.id, s.name, s.lat, s.lng, s.country, s.region_id, s.is_private,
       (SELECT COUNT(*) FROM dive d WHERE d.site_id = s.id AND d.deleted_at IS NULL) AS dive_count
     FROM dive_site s WHERE s.deleted_at IS NULL ORDER BY s.name COLLATE NOCASE`,
  );
}

export function getSite(db: AppDb, id: string): DiveSite | undefined {
  return db.get<DiveSite>(
    'SELECT id, name, lat, lng, country, region_id, is_private FROM dive_site WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
}

/** Leaf region containing the point, used to tag dive sites (and their sightings) with a region. */
export function regionForPoint(regions: Region[], lat: number, lng: number): string | null {
  const hit = regions.find((r) => r.geometry && pointInPolygon(lng, lat, r.geometry));
  return hit?.id ?? null;
}

export interface SiteInput {
  id?: string;
  name: string;
  lat: number | null;
  lng: number | null;
  country: string | null;
  region_id?: string | null;
  is_private: boolean;
}

export function saveSite(db: AppDb, input: SiteInput, regions: Region[]): string {
  const region =
    input.region_id !== undefined
      ? input.region_id
      : input.lat != null && input.lng != null
        ? regionForPoint(regions, input.lat, input.lng)
        : null;
  return db.tx(() => upsertRow(db, 'dive_site', { ...input, region_id: region }));
}

export function deleteSite(db: AppDb, id: string) {
  db.tx(() => {
    softDelete(db, 'dive_site', 'id = ?', [id]);
    db.exec('UPDATE dive SET site_id = NULL, updated_at = ?, dirty = 1 WHERE site_id = ?', [new Date().toISOString(), id]);
  });
}

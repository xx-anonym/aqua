import type { AppDb } from '../db/appDb';
import { nowIso } from '../lib/ids';
import { softDelete, upsertRow } from './repo';

export type IdentifiedBy = 'manual' | 'filter' | 'photo_ai' | 'import';

export interface Sighting {
  id: string;
  dive_id: string | null;
  species_id: string;
  count: number | null;
  photo_uri: string | null;
  note: string | null;
  identified_by: IdentifiedBy;
  seen_at: string;
}

export interface SightingWithContext extends Sighting {
  dive_no: number | null;
  dive_date: string | null;
  site_name: string | null;
}

export interface SightingInput {
  id?: string;
  dive_id?: string | null;
  species_id: string;
  count?: number | null;
  photo_uri?: string | null;
  note?: string | null;
  identified_by?: IdentifiedBy;
  seen_at?: string;
}

const COLS = 'g.id, g.dive_id, g.species_id, g.count, g.photo_uri, g.note, g.identified_by, g.seen_at';

export function hasSighting(db: AppDb, speciesId: string): boolean {
  return !!db.get('SELECT 1 FROM sighting WHERE species_id = ? AND deleted_at IS NULL LIMIT 1', [speciesId]);
}

/** Adds a sighting; `isFirst` tells the UI to celebrate a new species in the life list. */
export function addSighting(db: AppDb, input: SightingInput): { id: string; isFirst: boolean } {
  return db.tx(() => {
    const isFirst = !hasSighting(db, input.species_id);
    const id = upsertRow(db, 'sighting', {
      ...input,
      identified_by: input.identified_by ?? 'manual',
      seen_at: input.seen_at ?? nowIso(),
    });
    return { id, isFirst };
  });
}

export function updateSighting(db: AppDb, input: SightingInput & { id: string }) {
  db.tx(() => upsertRow(db, 'sighting', input));
}

export function deleteSighting(db: AppDb, id: string) {
  db.tx(() => softDelete(db, 'sighting', 'id = ?', [id]));
}

export function sightingsForSpecies(db: AppDb, speciesId: string): SightingWithContext[] {
  return db.all<SightingWithContext>(
    `SELECT ${COLS}, d.dive_no, d.date AS dive_date, s.name AS site_name
     FROM sighting g
     LEFT JOIN dive d ON d.id = g.dive_id AND d.deleted_at IS NULL
     LEFT JOIN dive_site s ON s.id = d.site_id
     WHERE g.species_id = ? AND g.deleted_at IS NULL
     ORDER BY g.seen_at DESC`,
    [speciesId],
  );
}

export function sightingsForDive(db: AppDb, diveId: string): Sighting[] {
  return db.all<Sighting>(
    `SELECT ${COLS} FROM sighting g WHERE g.dive_id = ? AND g.deleted_at IS NULL ORDER BY g.seen_at`,
    [diveId],
  );
}

export function recentSightings(db: AppDb, limit = 20): SightingWithContext[] {
  return db.all<SightingWithContext>(
    `SELECT ${COLS}, d.dive_no, d.date AS dive_date, s.name AS site_name
     FROM sighting g
     LEFT JOIN dive d ON d.id = g.dive_id
     LEFT JOIN dive_site s ON s.id = d.site_id
     WHERE g.deleted_at IS NULL ORDER BY g.seen_at DESC LIMIT ?`,
    [limit],
  );
}

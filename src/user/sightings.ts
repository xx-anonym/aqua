import type { AppDb } from '../db/appDb';
import { nowIso } from '../lib/ids';
import { restoreDeleted, softDelete, upsertRow } from './repo';

export type IdentifiedBy = 'manual' | 'filter' | 'photo_ai' | 'import';

/**
 * species_id of a sighting that could not be identified yet ("unbestimmt"): the description is in
 * the note, ideally with a photo. Assigning a species later replaces it. Not a catalog id, so it
 * never counts for the life list or statistics.
 */
export const UNIDENTIFIED = '_unidentified';
export const isUnidentified = (s: { species_id: string }) => s.species_id === UNIDENTIFIED;

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

export function getSighting(db: AppDb, id: string): Sighting | null {
  return db.get<Sighting>(`SELECT ${COLS} FROM sighting g WHERE g.id = ? AND g.deleted_at IS NULL`, [id]) ?? null;
}

export function hasSighting(db: AppDb, speciesId: string): boolean {
  return !!db.get('SELECT 1 FROM sighting WHERE species_id = ? AND deleted_at IS NULL LIMIT 1', [speciesId]);
}

/** Adds a sighting; `isFirst` tells the UI to celebrate a new species in the life list. */
export function addSighting(db: AppDb, input: SightingInput): { id: string; isFirst: boolean } {
  return db.tx(() => {
    const isFirst = input.species_id !== UNIDENTIFIED && !hasSighting(db, input.species_id);
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

/** Gives an unidentified (or misidentified) sighting its species; `isFirst` → celebrate. */
export function assignSpecies(db: AppDb, id: string, speciesId: string, via: IdentifiedBy): { isFirst: boolean } {
  return db.tx(() => {
    const isFirst = !hasSighting(db, speciesId);
    upsertRow(db, 'sighting', { id, species_id: speciesId, identified_by: via });
    return { isFirst };
  });
}

/** Sightings still waiting for a species, newest first. */
export function unidentifiedSightings(db: AppDb): SightingWithContext[] {
  return db.all<SightingWithContext>(
    `SELECT ${COLS}, d.dive_no, d.date AS dive_date, s.name AS site_name
     FROM sighting g
     LEFT JOIN dive d ON d.id = g.dive_id AND d.deleted_at IS NULL
     LEFT JOIN dive_site s ON s.id = d.site_id AND s.deleted_at IS NULL
     WHERE g.species_id = ? AND g.deleted_at IS NULL ORDER BY g.seen_at DESC`,
    [UNIDENTIFIED],
  );
}

/** Returns the stamp for restoreSighting(). */
export function deleteSighting(db: AppDb, id: string): string {
  return db.tx(() => softDelete(db, 'sighting', 'id = ?', [id]));
}

export function restoreSighting(db: AppDb, id: string, deletedAt: string) {
  db.tx(() => restoreDeleted(db, 'sighting', deletedAt, 'id = ?', [id]));
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

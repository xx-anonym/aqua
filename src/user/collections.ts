import type { AppDb } from '../db/appDb';
import { stableId } from '../lib/ids';
import { softDelete, upsertRow } from './repo';

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  is_shared: number;
  item_count: number;
}

export function listCollections(db: AppDb): Collection[] {
  return db.all<Collection>(
    `SELECT c.id, c.name, c.description, c.is_shared,
       (SELECT COUNT(*) FROM collection_item i WHERE i.collection_id = c.id AND i.deleted_at IS NULL) AS item_count
     FROM collection c WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC`,
  );
}

export function getCollection(db: AppDb, id: string): Collection | undefined {
  return listCollections(db).find((c) => c.id === id);
}

export function collectionSpeciesIds(db: AppDb, collectionId: string): string[] {
  return db
    .all<{ species_id: string }>(
      'SELECT species_id FROM collection_item WHERE collection_id = ? AND deleted_at IS NULL ORDER BY created_at',
      [collectionId],
    )
    .map((r) => r.species_id);
}

export function collectionsContaining(db: AppDb, speciesId: string): string[] {
  return db
    .all<{ collection_id: string }>(
      'SELECT collection_id FROM collection_item WHERE species_id = ? AND deleted_at IS NULL',
      [speciesId],
    )
    .map((r) => r.collection_id);
}

export function saveCollection(db: AppDb, input: { id?: string; name: string; description?: string | null }): string {
  return db.tx(() => upsertRow(db, 'collection', input));
}

export function deleteCollection(db: AppDb, id: string) {
  db.tx(() => {
    softDelete(db, 'collection', 'id = ?', [id]);
    softDelete(db, 'collection_item', 'collection_id = ?', [id]);
  });
}

export function addToCollection(db: AppDb, collectionId: string, speciesId: string) {
  db.tx(() =>
    upsertRow(db, 'collection_item', {
      id: stableId('collection_item', collectionId, speciesId),
      collection_id: collectionId,
      species_id: speciesId,
    }),
  );
}

export function removeFromCollection(db: AppDb, collectionId: string, speciesId: string) {
  db.tx(() => softDelete(db, 'collection_item', 'id = ?', [stableId('collection_item', collectionId, speciesId)]));
}

export function favoriteIds(db: AppDb): Set<string> {
  return new Set(
    db.all<{ species_id: string }>('SELECT species_id FROM favorite WHERE deleted_at IS NULL').map((r) => r.species_id),
  );
}

export function isFavorite(db: AppDb, speciesId: string): boolean {
  return !!db.get('SELECT 1 FROM favorite WHERE species_id = ? AND deleted_at IS NULL', [speciesId]);
}

export function toggleFavorite(db: AppDb, speciesId: string): boolean {
  const id = stableId('favorite', speciesId);
  const fav = isFavorite(db, speciesId);
  db.tx(() => {
    if (fav) softDelete(db, 'favorite', 'id = ?', [id]);
    else upsertRow(db, 'favorite', { id, species_id: speciesId });
  });
  return !fav;
}

/** Read-only share link: the album travels inside the URL, no server needed. */
export function shareUrl(origin: string, name: string, speciesIds: string[]): string {
  const params = new URLSearchParams({ n: name, s: speciesIds.join(',') });
  return `${origin}/shared?${params.toString()}`;
}

import type { SqlValue } from 'sql.js';
import type { AppDb } from '../db/appDb';
import type { SyncTable } from '../db/migrations';
import { newId, nowIso } from '../lib/ids';

export type Values = Record<string, SqlValue | boolean | undefined>;

function clean(values: object): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(values) as [string, SqlValue | boolean | undefined][]) {
    if (v === undefined) continue;
    out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return out;
}

function currentUserId(db: AppDb): string | null {
  return db.get<{ value: string }>("SELECT value FROM kv WHERE key = 'user_id'")?.value ?? null;
}

/**
 * Inserts or revives a row. Every write stamps updated_at and marks the row dirty
 * so the sync engine pushes it; deleted_at is cleared (re-adding a favorite revives it).
 * Use inside db.tx() for multi-row writes.
 */
export function upsertRow(db: AppDb, table: SyncTable, values: object): string {
  const id = (values as { id?: string }).id ?? newId();
  const now = nowIso();
  const existing = db.get<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [id]);
  const data = clean({ ...values, id, updated_at: now, deleted_at: null, dirty: 1 });
  if (existing) {
    const cols = Object.keys(data).filter((c) => c !== 'id');
    db.exec(`UPDATE ${table} SET ${cols.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`, prefixed(data));
  } else {
    const withMeta = { ...data, created_at: now, user_id: currentUserId(db) };
    const cols = Object.keys(withMeta);
    db.exec(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')})`,
      prefixed(withMeta),
    );
  }
  return id;
}

/**
 * Marks rows deleted (kept for sync). Returns the deletion stamp, which restoreDeleted() uses
 * to bring back exactly the rows of this deletion; pass `at` to share one stamp across tables.
 */
export function softDelete(db: AppDb, table: SyncTable, where: string, params: SqlValue[], at = nowIso()): string {
  db.exec(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL AND (${where})`, [
    at,
    at,
    ...params,
  ]);
  return at;
}

/** Undoes softDelete() for the rows deleted at `deletedAt`; a newer updated_at wins on sync. */
export function restoreDeleted(db: AppDb, table: SyncTable, deletedAt: string, where: string, params: SqlValue[]) {
  // Must be strictly newer than the deletion, also when undone within the same millisecond.
  const now = nowIso();
  const at = now > deletedAt ? now : new Date(Date.parse(deletedAt) + 1).toISOString();
  db.exec(`UPDATE ${table} SET deleted_at = NULL, updated_at = ?, dirty = 1 WHERE deleted_at = ? AND (${where})`, [
    at,
    deletedAt,
    ...params,
  ]);
}

function prefixed(values: Record<string, SqlValue>): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const [k, v] of Object.entries(values)) out[`:${k}`] = v;
  return out;
}

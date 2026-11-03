import type { SqlValue } from 'sql.js';
import type { AppDb } from '../db/appDb';
import { SYNC_TABLES, type SyncTable } from '../db/migrations';

export type RemoteRow = Record<string, unknown>;

/** What the sync engine needs from the server; Supabase in production, an in-memory fake in tests. */
export interface Remote {
  upsert(table: SyncTable, rows: RemoteRow[]): Promise<void>;
  /** Rows of the signed-in user changed after `cursor` (server time), oldest first. */
  pull(table: SyncTable, cursor: string | null, limit: number): Promise<RemoteRow[]>;
}

const BOOL_COLS = new Set(['is_private', 'is_shared']);
const JSON_COLS = new Set(['types', 'samples']);
const TIME_COLS = new Set(['created_at', 'updated_at', 'deleted_at', 'seen_at']);
const LOCAL_ONLY = new Set(['dirty']);
const PAGE = 500;

const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

function toRemote(row: Record<string, SqlValue>): RemoteRow {
  const out: RemoteRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (LOCAL_ONLY.has(k)) continue;
    if (BOOL_COLS.has(k)) out[k] = v == null ? null : !!v;
    else if (JSON_COLS.has(k)) out[k] = typeof v === 'string' ? JSON.parse(v) : v;
    else out[k] = v;
  }
  return out;
}

function toLocal(row: RemoteRow, columns: string[]): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const c of columns) {
    if (LOCAL_ONLY.has(c)) continue;
    const v = row[c];
    if (v === undefined) continue;
    if (BOOL_COLS.has(c)) out[c] = v == null ? null : v ? 1 : 0;
    else if (JSON_COLS.has(c)) out[c] = v == null ? '[]' : JSON.stringify(v);
    else if (TIME_COLS.has(c)) out[c] = iso(v);
    else out[c] = v as SqlValue;
  }
  out.dirty = 0;
  return out;
}

const columnsCache = new WeakMap<AppDb, Map<string, string[]>>();
function columnsOf(db: AppDb, table: string): string[] {
  let map = columnsCache.get(db);
  if (!map) columnsCache.set(db, (map = new Map()));
  if (!map.has(table)) map.set(table, db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name));
  return map.get(table)!;
}

export function getKv(db: AppDb, key: string): string | null {
  return db.get<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])?.value ?? null;
}

export function setKv(db: AppDb, key: string, value: string | null) {
  if (value == null) db.exec('DELETE FROM kv WHERE key = ?', [key]);
  else db.exec('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

export function pendingChanges(db: AppDb, userId: string | null): number {
  return SYNC_TABLES.reduce(
    (n, t) =>
      n +
      (db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t} WHERE dirty = 1 AND (user_id IS NULL OR user_id = ?)`, [userId])?.n ?? 0),
    0,
  );
}

/** Rows created before signing in belong to nobody yet; they are adopted by the first account. */
export function adoptLocalRows(db: AppDb, userId: string) {
  db.tx(() => {
    for (const t of SYNC_TABLES) db.exec(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`, [userId]);
    setKv(db, 'user_id', userId);
  });
}

const isSyncTable = (t: string): t is SyncTable => (SYNC_TABLES as readonly string[]).includes(t);

/**
 * Makes `next` (null = signed out) the account whose data this device shows, so one account
 * never sees another's dives, sightings or albums on a shared device.
 * Rows of the previous account leave the working tables: synced ones are on the server and come
 * back with the next sync, unsynced ones wait in parked_row until that account signs in again.
 * Rows recorded while signed out are adopted by the account that signs in.
 * Returns the photo uris of removed rows, so their cached copies can be dropped as well.
 */
export function switchAccount(db: AppDb, next: string | null): string[] {
  const previous = getKv(db, 'user_id');
  if (previous === next) return [];
  const photos: string[] = [];
  db.tx(() => {
    if (previous) {
      photos.push(
        ...db
          .all<{ photo_uri: string }>("SELECT photo_uri FROM sighting WHERE user_id = ? AND photo_uri LIKE 'sb:%'", [previous])
          .map((r) => r.photo_uri),
      );
      for (const t of SYNC_TABLES) {
        for (const row of db.all<Record<string, SqlValue>>(`SELECT * FROM ${t} WHERE user_id = ? AND dirty = 1`, [previous])) {
          db.exec('INSERT OR REPLACE INTO parked_row (tbl, id, user_id, data) VALUES (?, ?, ?, ?)', [t, row.id, previous, JSON.stringify(row)]);
        }
        db.exec(`DELETE FROM ${t} WHERE user_id = ?`, [previous]);
        setKv(db, `cursor:${t}`, null);
      }
      setKv(db, 'last_sync', null);
    }
    if (next) {
      for (const p of db.all<{ tbl: string; data: string }>('SELECT tbl, data FROM parked_row WHERE user_id = ?', [next])) {
        if (!isSyncTable(p.tbl)) continue;
        const known = new Set(columnsOf(db, p.tbl));
        const row = JSON.parse(p.data) as Record<string, SqlValue>;
        const cols = Object.keys(row).filter((c) => known.has(c));
        db.exec(
          `INSERT OR REPLACE INTO ${p.tbl} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c]),
        );
      }
      db.exec('DELETE FROM parked_row WHERE user_id = ?', [next]);
      for (const t of SYNC_TABLES) db.exec(`UPDATE ${t} SET user_id = ? WHERE user_id IS NULL`, [next]);
    }
    setKv(db, 'user_id', next);
  });
  db.changed();
  return photos;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/**
 * Two-way sync. Push: every dirty row of the user. Pull: rows changed on the server since the
 * last cursor. Conflict rule: the newer updated_at wins (enforced by a trigger on the server, which
 * also caps times from the future at its own clock),
 * deletions travel as deleted_at, so offline edits on any device are never lost silently.
 */
export async function syncOnce(db: AppDb, remote: Remote, userId: string): Promise<SyncResult> {
  let pushed = 0;
  let pulled = 0;

  for (const table of SYNC_TABLES) {
    const rows = db.all<Record<string, SqlValue>>(`SELECT * FROM ${table} WHERE dirty = 1 AND user_id = ?`, [userId]);
    for (let i = 0; i < rows.length; i += PAGE) {
      const chunk = rows.slice(i, i + PAGE);
      await remote.upsert(table, chunk.map(toRemote));
      // Only clear the flag if the row was not edited again while the request was in flight.
      db.tx(() => {
        for (const r of chunk) db.exec(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at = ?`, [r.id, r.updated_at]);
      });
      pushed += chunk.length;
    }
  }

  for (const table of SYNC_TABLES) {
    const columns = columnsOf(db, table);
    let cursor = getKv(db, `cursor:${table}`);
    for (;;) {
      const rows = await remote.pull(table, cursor, PAGE);
      if (!rows.length) break;
      db.tx(() => {
        for (const r of rows) {
          const local = db.get<{ updated_at: string; dirty: number }>(`SELECT updated_at, dirty FROM ${table} WHERE id = ?`, [r.id as string]);
          const remoteUpdated = iso(r.updated_at)!;
          // An unsynced local edit that is newer stays and will be pushed. Otherwise the server's
          // row is the merged result: it also replaces local times from a clock that ran ahead.
          if (local && local.dirty && local.updated_at > remoteUpdated) continue;
          const data = toLocal(r, columns);
          const cols = Object.keys(data);
          db.exec(
            `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            cols.map((c) => data[c]),
          );
          pulled++;
        }
        cursor = rows[rows.length - 1].synced_at as string;
        setKv(db, `cursor:${table}`, cursor);
      });
      if (rows.length < PAGE) break;
    }
  }
  setKv(db, 'last_sync', new Date().toISOString());
  db.changed();
  return { pushed, pulled };
}

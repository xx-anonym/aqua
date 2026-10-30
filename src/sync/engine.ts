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

export function forgetUser(db: AppDb) {
  db.tx(() => {
    setKv(db, 'user_id', null);
    for (const t of SYNC_TABLES) setKv(db, `cursor:${t}`, null);
    setKv(db, 'last_sync', null);
  });
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/**
 * Two-way sync. Push: every dirty row of the user. Pull: rows changed on the server since the
 * last cursor. Conflict rule: the newer updated_at wins (also enforced by a trigger on the server),
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
          if (local && local.updated_at > remoteUpdated) continue; // local edit is newer; it will be pushed
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

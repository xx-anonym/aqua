import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { migrateUserDb } from './migrations';

export type Params = SqlValue[] | Record<string, SqlValue>;
export type Row = Record<string, SqlValue>;

/**
 * Wraps two sql.js databases: the writable user database (main schema, persisted to
 * IndexedDB) and the read-only species catalog attached as schema `cat`.
 * Both live in the same Emscripten file system, so ATTACH works by file name.
 */
export class AppDb {
  private listeners = new Set<() => void>();
  private version = 0;
  /** Incremented whenever the catalog is swapped, so catalog caches can be rebuilt. */
  catalogVersion = 0;

  constructor(
    private readonly SQL: SqlJsStatic,
    public user: Database,
    private catalog: Database,
  ) {
    migrateUserDb(this.user);
    this.attachCatalog();
  }

  static create(SQL: SqlJsStatic, catalogBytes: Uint8Array, userBytes?: Uint8Array | null): AppDb {
    const catalog = new SQL.Database(catalogBytes);
    const user = userBytes ? new SQL.Database(userBytes) : new SQL.Database();
    return new AppDb(SQL, user, catalog);
  }

  private attachCatalog() {
    const filename = (this.catalog as unknown as { filename: string }).filename;
    this.user.run('ATTACH ? AS cat', [filename]);
  }

  all<T = Row>(sql: string, params: Params = []): T[] {
    const stmt = this.user.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  get<T = Row>(sql: string, params: Params = []): T | undefined {
    return this.all<T>(sql, params)[0];
  }

  /** Executes a write and notifies subscribers (UI re-queries, persistence, sync). */
  run(sql: string, params: Params = []) {
    this.user.run(sql, params);
    this.changed();
  }

  /** Runs several writes atomically and notifies once. */
  tx<T>(fn: () => T): T {
    this.user.run('BEGIN');
    try {
      const result = fn();
      this.user.run('COMMIT');
      this.changed();
      return result;
    } catch (e) {
      this.user.run('ROLLBACK');
      throw e;
    }
  }

  /** Raw write without notification, for use inside tx(). */
  exec(sql: string, params: Params = []) {
    this.user.run(sql, params);
  }

  /** Serialises the user database. sql.js closes and reopens it, so the catalog is re-attached. */
  exportUser(): Uint8Array {
    const bytes = this.user.export();
    this.attachCatalog();
    return bytes;
  }

  replaceCatalog(bytes: Uint8Array) {
    this.user.run('DETACH cat');
    this.catalog.close();
    this.catalog = new this.SQL.Database(bytes);
    this.attachCatalog();
    this.catalogVersion++;
    this.changed();
  }

  /** Replaces all user data, e.g. when restoring a backup. */
  replaceUser(bytes: Uint8Array) {
    this.user.close();
    this.user = new this.SQL.Database(bytes);
    migrateUserDb(this.user);
    this.attachCatalog();
    this.changed();
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getVersion() {
    return this.version;
  }

  changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
}

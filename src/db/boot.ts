import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { AppDb } from './appDb';
import { idb } from './idb';
import { requestPersistentStorage } from '../lib/install';

const CATALOG_URL = '/catalog/catalog.sqlite';

async function loadCatalogBytes(): Promise<Uint8Array> {
  try {
    const res = await fetch(CATALOG_URL);
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Keep a copy in IndexedDB as a fallback in case the service worker cache is gone.
    idb.set('kv', 'catalog', bytes).catch(() => undefined);
    return bytes;
  } catch (e) {
    const cached = await idb.get<Uint8Array>('kv', 'catalog');
    if (cached) return cached;
    throw e;
  }
}

let writing: Promise<void> | null = null;
let again = false;

/**
 * Writes the user database to IndexedDB right after a change (the export of a few hundred KB
 * takes milliseconds), so closing the app immediately after saving never loses data.
 * Writes are serialised; changes during a write trigger exactly one follow-up write.
 */
export function persistNow(db: AppDb): Promise<void> {
  if (writing) {
    again = true;
    return writing;
  }
  writing = (async () => {
    try {
      do {
        again = false;
        await idb.set('kv', 'userdb', db.exportUser());
      } while (again);
      void requestPersistentStorage();
    } finally {
      writing = null;
    }
  })();
  return writing;
}

export async function bootDb(): Promise<AppDb> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const [catalogBytes, userBytes] = await Promise.all([
    loadCatalogBytes(),
    idb.get<Uint8Array>('kv', 'userdb').catch(() => undefined),
  ]);
  const db = AppDb.create(SQL, catalogBytes, userBytes);

  let scheduled = false;
  db.subscribe(() => {
    // Coalesce changes made in the same task (e.g. a dive and its sightings) into one write.
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      void persistNow(db);
    });
  });
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => undefined);
  return db;
}

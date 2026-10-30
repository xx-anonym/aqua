import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { AppDb } from './appDb';
import { idb } from './idb';

const CATALOG_URL = '/catalog/catalog.sqlite';
const PERSIST_DELAY_MS = 400;

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

let persistTimer: ReturnType<typeof setTimeout> | undefined;

export async function persistNow(db: AppDb) {
  clearTimeout(persistTimer);
  persistTimer = undefined;
  await idb.set('kv', 'userdb', db.exportUser());
}

export async function bootDb(): Promise<AppDb> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const [catalogBytes, userBytes] = await Promise.all([
    loadCatalogBytes(),
    idb.get<Uint8Array>('kv', 'userdb').catch(() => undefined),
  ]);
  const db = AppDb.create(SQL, catalogBytes, userBytes);

  db.subscribe(() => {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void persistNow(db), PERSIST_DELAY_MS);
  });
  const flush = () => {
    if (persistTimer !== undefined) void persistNow(db);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => undefined);
  return db;
}

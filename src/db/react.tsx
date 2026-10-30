import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { AppDb } from './appDb';

const DbContext = createContext<AppDb | null>(null);

export function DbProvider({ db, children }: { db: AppDb; children: ReactNode }) {
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): AppDb {
  const db = useContext(DbContext);
  if (!db) throw new Error('DbProvider missing');
  return db;
}

/** Re-runs `query` whenever the database changes or one of `deps` changes. */
export function useDbQuery<T>(query: (db: AppDb) => T, deps: unknown[] = []): T {
  const db = useDb();
  const version = useSyncExternalStore(
    (cb) => db.subscribe(cb),
    () => db.getVersion(),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => query(db), [db, version, ...deps]);
}

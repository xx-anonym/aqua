import type { Database } from 'sql.js';

/** Columns every synced user table carries (spec: id, user_id, created_at, updated_at, deleted_at). */
const SYNC_COLS = `
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  dirty INTEGER NOT NULL DEFAULT 1`;

/**
 * Ordered schema migrations for the user database. Each entry runs once; the index
 * is tracked in PRAGMA user_version. Never edit a released migration, append a new one.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE dive_site (${SYNC_COLS},
    name TEXT NOT NULL,
    lat REAL,
    lng REAL,
    country TEXT,
    region_id TEXT,
    is_private INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE dive (${SYNC_COLS},
    dive_no INTEGER,
    date TEXT NOT NULL,
    entry_time TEXT,
    exit_time TEXT,
    max_depth_m REAL,
    avg_depth_m REAL,
    duration_min REAL,
    site_id TEXT,
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual'
  );
  CREATE INDEX dive_date ON dive(date, entry_time);
  CREATE TABLE dive_conditions (${SYNC_COLS},
    dive_id TEXT NOT NULL,
    visibility_m REAL,
    water_temp_c REAL,
    air_temp_c REAL,
    water_type TEXT,
    current TEXT
  );
  CREATE TABLE dive_features (${SYNC_COLS},
    dive_id TEXT NOT NULL,
    types TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE dive_equipment (${SYNC_COLS},
    dive_id TEXT NOT NULL,
    suit TEXT,
    gas TEXT,
    o2_percent REAL,
    tank_volume_l REAL,
    tank_material TEXT,
    pressure_start_bar REAL,
    pressure_end_bar REAL,
    weight_kg REAL
  );
  CREATE TABLE dive_profile (${SYNC_COLS},
    dive_id TEXT NOT NULL,
    samples TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE sighting (${SYNC_COLS},
    dive_id TEXT,
    species_id TEXT NOT NULL,
    count INTEGER,
    photo_uri TEXT,
    note TEXT,
    identified_by TEXT NOT NULL DEFAULT 'manual',
    seen_at TEXT NOT NULL
  );
  CREATE INDEX sighting_species ON sighting(species_id);
  CREATE INDEX sighting_dive ON sighting(dive_id);
  CREATE TABLE collection (${SYNC_COLS},
    name TEXT NOT NULL,
    description TEXT,
    is_shared INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE collection_item (${SYNC_COLS},
    collection_id TEXT NOT NULL,
    species_id TEXT NOT NULL
  );
  CREATE INDEX collection_item_collection ON collection_item(collection_id);
  CREATE TABLE favorite (${SYNC_COLS},
    species_id TEXT NOT NULL
  );
  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT);
  `,
  // Unsynced rows of an account that is not signed in on this device (see switchAccount).
  `
  CREATE TABLE parked_row (
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (tbl, id)
  );
  `,
];

/** Tables that take part in cloud sync, in dependency order (parents first). */
export const SYNC_TABLES = [
  'dive_site',
  'dive',
  'dive_conditions',
  'dive_features',
  'dive_equipment',
  'dive_profile',
  'sighting',
  'collection',
  'collection_item',
  'favorite',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export function migrateUserDb(db: Database) {
  const current = Number(db.exec('PRAGMA user_version')[0]?.values[0][0] ?? 0);
  for (let i = current; i < MIGRATIONS.length; i++) {
    db.run('BEGIN');
    try {
      db.exec(MIGRATIONS[i]);
      db.run(`PRAGMA user_version = ${i + 1}`);
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw e;
    }
  }
}

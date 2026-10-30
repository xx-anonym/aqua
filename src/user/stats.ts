import type { AppDb } from '../db/appDb';

export interface LogStats {
  diveCount: number;
  totalMinutes: number;
  deepestM: number | null;
  countries: number;
  speciesCount: number;
}

export function logStats(db: AppDb): LogStats {
  const d = db.get<{ n: number; minutes: number | null; deepest: number | null }>(
    `SELECT COUNT(*) AS n, SUM(duration_min) AS minutes, MAX(max_depth_m) AS deepest
     FROM dive WHERE deleted_at IS NULL`,
  );
  // SQLite's LOWER() only folds ASCII, so country names are normalised here ("Ägypten" = "ägypten").
  const countries = new Set(
    db
      .all<{ country: string }>(
        `SELECT DISTINCT s.country FROM dive d JOIN dive_site s ON s.id = d.site_id
         WHERE d.deleted_at IS NULL AND s.country IS NOT NULL`,
      )
      .map((r) => r.country.trim().toLocaleLowerCase('de'))
      .filter(Boolean),
  );
  const sp = db.get<{ n: number }>('SELECT COUNT(DISTINCT species_id) AS n FROM sighting WHERE deleted_at IS NULL');
  return {
    diveCount: d?.n ?? 0,
    totalMinutes: d?.minutes ?? 0,
    deepestM: d?.deepest ?? null,
    countries: countries.size,
    speciesCount: sp?.n ?? 0,
  };
}

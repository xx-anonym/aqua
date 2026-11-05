import type { AppDb } from '../db/appDb';
import { fold } from './diveFilter';
import { UNIDENTIFIED } from './sightings';

export interface LogStats {
  diveCount: number;
  totalMinutes: number;
  deepestM: number | null;
  countries: number;
  sites: number;
  speciesCount: number;
}

export function logStats(db: AppDb): LogStats {
  const d = db.get<{ n: number; minutes: number | null; deepest: number | null; sites: number }>(
    `SELECT COUNT(*) AS n, SUM(duration_min) AS minutes, MAX(max_depth_m) AS deepest, COUNT(DISTINCT site_id) AS sites
     FROM dive WHERE deleted_at IS NULL`,
  );
  // SQLite's LOWER() only folds ASCII, so country names are normalised here like in the logbook
  // filter ("Ägypten" = "ägypten" = "Agypten").
  const countries = new Set(
    db
      .all<{ country: string }>(
        `SELECT DISTINCT s.country FROM dive d JOIN dive_site s ON s.id = d.site_id
         WHERE d.deleted_at IS NULL AND s.country IS NOT NULL`,
      )
      .map((r) => fold(r.country.trim()))
      .filter(Boolean),
  );
  const sp = db.get<{ n: number }>('SELECT COUNT(DISTINCT species_id) AS n FROM sighting WHERE deleted_at IS NULL AND species_id <> ?', [
    UNIDENTIFIED,
  ]);
  return {
    diveCount: d?.n ?? 0,
    totalMinutes: d?.minutes ?? 0,
    deepestM: d?.deepest ?? null,
    countries: countries.size,
    sites: d?.sites ?? 0,
    speciesCount: sp?.n ?? 0,
  };
}

// ---- Statistics page (src/screens/logbook/StatsScreen.tsx)

export interface YearCount {
  year: string;
  count: number;
}

/** Dives per year from the first to the last year with a dive; years without dives count 0. */
export function divesPerYear(db: AppDb): YearCount[] {
  const rows = db.all<{ year: string; n: number }>(
    `SELECT substr(date, 1, 4) AS year, COUNT(*) AS n FROM dive WHERE deleted_at IS NULL GROUP BY year ORDER BY year`,
  );
  if (!rows.length) return [];
  const counts = new Map(rows.map((r) => [r.year, r.n]));
  const out: YearCount[] = [];
  for (let y = Number(rows[0].year); y <= Number(rows[rows.length - 1].year); y++) out.push({ year: String(y), count: counts.get(String(y)) ?? 0 });
  return out;
}

export interface DepthBin {
  /** Lower bound in metres (inclusive); `toM` null is the open last bin. */
  fromM: number;
  toM: number | null;
  count: number;
}

/** Maximum depths in 10 m bins up to 40 m and one bin beyond; empty bins after the deepest are left out. */
export function depthBins(db: AppDb): DepthBin[] {
  const depths = db.all<{ d: number }>('SELECT max_depth_m AS d FROM dive WHERE deleted_at IS NULL AND max_depth_m IS NOT NULL').map((r) => r.d);
  if (!depths.length) return [];
  const bins: DepthBin[] = [0, 10, 20, 30, 40].map((fromM) => ({ fromM, toM: fromM === 40 ? null : fromM + 10, count: 0 }));
  for (const d of depths) bins[Math.min(4, Math.floor(d / 10))].count++;
  let last = bins.length - 1;
  while (last > 0 && bins[last].count === 0) last--;
  return bins.slice(0, last + 1);
}

export interface SpeciesStep {
  /** Day the species count went up (first sighting of at least one species). */
  date: string;
  total: number;
}

/** Number of species seen so far, per day a new species was added (for a cumulative line). */
export function speciesOverTime(db: AppDb): SpeciesStep[] {
  const firsts = db.all<{ day: string; n: number }>(
    `SELECT day, COUNT(*) AS n FROM (
       SELECT species_id, MIN(substr(seen_at, 1, 10)) AS day FROM sighting
       WHERE deleted_at IS NULL AND species_id <> ? GROUP BY species_id
     ) GROUP BY day ORDER BY day`,
    [UNIDENTIFIED],
  );
  let total = 0;
  return firsts.map((r) => ({ date: r.day, total: (total += r.n) }));
}

export interface SightingSite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  dives: number;
  species: number;
}

/** Dive sites with coordinates where species were seen, with the number of dives and species. */
export function sightingSites(db: AppDb): SightingSite[] {
  return db.all<SightingSite>(
    `SELECT s.id, s.name, s.lat, s.lng, COUNT(DISTINCT d.id) AS dives, COUNT(DISTINCT g.species_id) AS species
     FROM dive_site s
     JOIN dive d ON d.site_id = s.id AND d.deleted_at IS NULL
     JOIN sighting g ON g.dive_id = d.id AND g.deleted_at IS NULL AND g.species_id <> ?
     WHERE s.deleted_at IS NULL AND s.lat IS NOT NULL AND s.lng IS NOT NULL
     GROUP BY s.id ORDER BY species DESC`,
    [UNIDENTIFIED],
  );
}

/** Averages over the dives that have the value. */
export function diveAverages(db: AppDb): { depthM: number | null; minutes: number | null } {
  const r = db.get<{ depth: number | null; minutes: number | null }>(
    'SELECT AVG(max_depth_m) AS depth, AVG(duration_min) AS minutes FROM dive WHERE deleted_at IS NULL',
  );
  return { depthM: r?.depth ?? null, minutes: r?.minutes ?? null };
}

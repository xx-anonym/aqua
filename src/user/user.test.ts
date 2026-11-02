import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from '../test/testDb';
import type { AppDb } from '../db/appDb';
import { loadCatalog } from '../catalog/catalog';
import { deleteDive, durationFromTimes, getDive, lastEquipment, listDives, nextDiveNo, restoreDive, saveDive } from './dives';
import {
  addSighting,
  assignSpecies,
  deleteSighting,
  getSighting,
  restoreSighting,
  sightingsForDive,
  sightingsForSpecies,
  UNIDENTIFIED,
  unidentifiedSightings,
  updateSighting,
} from './sightings';
import { lifeList, progressReport } from './lifelist';
import { addToCollection, collectionSpeciesIds, deleteCollection, favoriteIds, removeFromCollection, saveCollection, toggleFavorite } from './collections';
import { listSites, regionForPoint, saveSite } from './sites';
import { logStats } from './stats';

let db: AppDb;
beforeEach(async () => {
  db = await createTestDb();
});

describe('dives', () => {
  it('creates a dive with all detail sections and reads it back', () => {
    const id = saveDive(db, {
      dive_no: nextDiveNo(db),
      date: '2026-05-01',
      entry_time: '09:10',
      exit_time: '10:02',
      max_depth_m: 24.5,
      avg_depth_m: 12,
      duration_min: 52,
      site_id: null,
      rating: 4,
      notes: 'Schildkröte am Riffdach',
      conditions: { visibility_m: 25, water_temp_c: 26, water_type: 'salt', current: 'light' },
      features: ['reef', 'drift'],
      equipment: { suit: '3mm', gas: 'nitrox', o2_percent: 32, tank_volume_l: 12, pressure_start_bar: 200, pressure_end_bar: 60 },
    });
    const dive = getDive(db, id)!;
    expect(dive.dive_no).toBe(1);
    expect(dive.conditions?.water_temp_c).toBe(26);
    expect(dive.features).toEqual(['reef', 'drift']);
    expect(dive.equipment?.gas).toBe('nitrox');
    expect(nextDiveNo(db)).toBe(2);
  });

  it('numbers dives consecutively and keeps manual numbers', () => {
    saveDive(db, { dive_no: 41, date: '2026-01-01' } as never);
    expect(nextDiveNo(db)).toBe(42);
  });

  it('offers the last equipment as a template', () => {
    saveDive(db, { dive_no: 1, date: '2026-01-01', equipment: { suit: '5mm', weight_kg: 6 } } as never);
    saveDive(db, { dive_no: 2, date: '2026-01-03', equipment: { suit: '3mm', weight_kg: 4 } } as never);
    saveDive(db, { dive_no: 3, date: '2026-01-02' } as never);
    expect(lastEquipment(db)?.suit).toBe('3mm');
  });

  it('updates and soft-deletes a dive together with its sightings', () => {
    const id = saveDive(db, { dive_no: 1, date: '2026-01-01', conditions: { water_temp_c: 20 } } as never);
    addSighting(db, { dive_id: id, species_id: 'chromis-chromis' });
    saveDive(db, { id, dive_no: 1, date: '2026-01-02', conditions: null } as never);
    expect(getDive(db, id)!.date).toBe('2026-01-02');
    expect(getDive(db, id)!.conditions).toBeNull();
    deleteDive(db, id);
    expect(getDive(db, id)).toBeNull();
    expect(listDives(db)).toHaveLength(0);
    expect(sightingsForDive(db, id)).toHaveLength(0);
    // Soft delete keeps the row for sync.
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM dive WHERE deleted_at IS NOT NULL')!.n).toBe(1);
  });

  it('restores a deleted dive with exactly the sightings deleted with it', async () => {
    const id = saveDive(db, { dive_no: 1, date: '2026-01-01', conditions: { water_temp_c: 20 } } as never);
    const keep = addSighting(db, { dive_id: id, species_id: 'chromis-chromis' }).id;
    const goneBefore = addSighting(db, { dive_id: id, species_id: 'pterois-miles' }).id;
    deleteSighting(db, goneBefore);
    await new Promise((r) => setTimeout(r, 5)); // distinct deletion stamps
    const stamp = deleteDive(db, id);
    db.exec('UPDATE dive SET dirty = 0');
    restoreDive(db, id, stamp);
    expect(getDive(db, id)!.conditions?.water_temp_c).toBe(20);
    expect(sightingsForDive(db, id).map((s) => s.id)).toEqual([keep]);
    const row = db.get<{ dirty: number; deleted_at: string | null; updated_at: string }>('SELECT dirty, deleted_at, updated_at FROM dive WHERE id = ?', [id])!;
    expect(row.dirty).toBe(1);
    expect(row.deleted_at).toBeNull();
    expect(row.updated_at > stamp).toBe(true);
  });

  it('computes duration across midnight', () => {
    expect(durationFromTimes('23:40', '00:25')).toBe(45);
    expect(durationFromTimes('10:00', null)).toBeNull();
  });

  it('marks every write dirty with timestamps for sync', () => {
    const id = saveDive(db, { dive_no: 1, date: '2026-01-01' } as never);
    const row = db.get<{ dirty: number; created_at: string; updated_at: string }>('SELECT * FROM dive WHERE id = ?', [id])!;
    expect(row.dirty).toBe(1);
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });
});

describe('sightings and life list', () => {
  it('detects the first sighting of a species', () => {
    expect(addSighting(db, { species_id: 'pterois-miles' }).isFirst).toBe(true);
    expect(addSighting(db, { species_id: 'pterois-miles' }).isFirst).toBe(false);
    expect(sightingsForSpecies(db, 'pterois-miles')).toHaveLength(2);
  });

  it('deletes and restores a single sighting', async () => {
    const { id } = addSighting(db, { species_id: 'chelonia-mydas' });
    const stamp = deleteSighting(db, id);
    expect(sightingsForSpecies(db, 'chelonia-mydas')).toHaveLength(0);
    expect(lifeList(db).has('chelonia-mydas')).toBe(false);
    await new Promise((r) => setTimeout(r, 2));
    restoreSighting(db, id, stamp);
    expect(sightingsForSpecies(db, 'chelonia-mydas')).toHaveLength(1);
  });

  it('records unidentified sightings outside the life list and assigns them later', () => {
    const dive = saveDive(db, { dive_no: 1, date: '2026-03-01' } as never);
    const { id, isFirst } = addSighting(db, { species_id: UNIDENTIFIED, dive_id: dive, note: 'gelber Fisch, blaue Punkte' });
    expect(isFirst).toBe(false);
    expect(lifeList(db).size).toBe(0);
    expect(logStats(db).speciesCount).toBe(0);
    expect(unidentifiedSightings(db).map((s) => [s.id, s.dive_no, s.note])).toEqual([[id, 1, 'gelber Fisch, blaue Punkte']]);
    expect(assignSpecies(db, id, 'chaetodon-auriga', 'manual').isFirst).toBe(true);
    expect(unidentifiedSightings(db)).toHaveLength(0);
    expect(lifeList(db).has('chaetodon-auriga')).toBe(true);
    expect(getSighting(db, id)?.note).toBe('gelber Fisch, blaue Punkte');
  });

  it('edits a sighting', () => {
    const { id } = addSighting(db, { species_id: 'chelonia-mydas', count: 1 });
    updateSighting(db, { id, species_id: 'chelonia-mydas', count: 3, note: 'zwei Jungtiere' });
    expect(getSighting(db, id)).toMatchObject({ count: 3, note: 'zwei Jungtiere' });
    expect(sightingsForSpecies(db, 'chelonia-mydas')).toHaveLength(1);
  });

  it('allows sightings without a dive', () => {
    addSighting(db, { species_id: 'chelonia-mydas', seen_at: '2026-02-01T10:00:00Z' });
    expect(lifeList(db).get('chelonia-mydas')?.count).toBe(1);
  });

  it('derives first sighting, count and last site', () => {
    const catalog = loadCatalog(db);
    const site = saveSite(db, { name: 'Elphinstone', lat: 25.31, lng: 34.86, country: 'Ägypten', is_private: true }, catalog.regions);
    const dive = saveDive(db, { dive_no: 1, date: '2026-03-01', site_id: site } as never);
    addSighting(db, { species_id: 'pterois-miles', seen_at: '2026-01-01T10:00:00Z' });
    addSighting(db, { species_id: 'pterois-miles', dive_id: dive, seen_at: '2026-03-01T10:00:00Z' });
    const entry = lifeList(db).get('pterois-miles')!;
    expect(entry.firstSeen).toBe('2026-01-01T10:00:00Z');
    expect(entry.count).toBe(2);
    expect(entry.lastSiteName).toBe('Elphinstone');
  });

  it('reports progress overall, per category and per region', () => {
    const catalog = loadCatalog(db);
    addSighting(db, { species_id: 'pterois-miles' });
    addSighting(db, { species_id: 'chromis-chromis' });
    addSighting(db, { species_id: 'posidonia-oceanica' });
    const seen = lifeList(db);
    const all = progressReport(catalog, seen, null);
    expect(all.overall).toEqual({ seen: 3, total: 34 });
    expect(all.byCategory.fish.seen).toBe(2);
    const med = progressReport(catalog, seen, 'mediterranean');
    expect(med.overall.seen).toBe(3);
    const redSea = all.byRegion.find((r) => r.regionId === 'red-sea')!;
    expect(redSea.progress.seen).toBe(1);
  });
});

describe('collections and favorites', () => {
  it('toggles favorites idempotently with stable ids', () => {
    expect(toggleFavorite(db, 'pterois-miles')).toBe(true);
    expect(favoriteIds(db).has('pterois-miles')).toBe(true);
    expect(toggleFavorite(db, 'pterois-miles')).toBe(false);
    expect(toggleFavorite(db, 'pterois-miles')).toBe(true);
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM favorite')!.n).toBe(1);
  });

  it('manages albums and their species', () => {
    const id = saveCollection(db, { name: 'Wunschliste' });
    addToCollection(db, id, 'mobula-alfredi');
    addToCollection(db, id, 'mobula-alfredi');
    addToCollection(db, id, 'cheilinus-undulatus');
    expect(collectionSpeciesIds(db, id)).toEqual(['mobula-alfredi', 'cheilinus-undulatus']);
    removeFromCollection(db, id, 'mobula-alfredi');
    expect(collectionSpeciesIds(db, id)).toEqual(['cheilinus-undulatus']);
    deleteCollection(db, id);
    expect(collectionSpeciesIds(db, id)).toEqual([]);
  });
});

describe('dive sites and statistics', () => {
  it('assigns a region from coordinates', async () => {
    const catalog = loadCatalog(db);
    expect(regionForPoint(catalog.regions, 27.2, 33.9)).toBe('red-sea'); // Hurghada
    expect(regionForPoint(catalog.regions, 43.2, 5.3)).toBe('mediterranean'); // Marseille
    expect(regionForPoint(catalog.regions, 4.2, 73.4)).toBe('central-indian-ocean'); // Malé
    expect(regionForPoint(catalog.regions, -8.3, 115.6)).toBe('southeast-asia'); // Bali
    expect(regionForPoint(catalog.regions, -16.9, 146.0)).toBe('australia'); // Cairns
    expect(regionForPoint(catalog.regions, -17.5, -149.8)).toBe('pacific-islands'); // Tahiti
    expect(regionForPoint(catalog.regions, 7.5, 134.5)).toBe('pacific-islands'); // Palau
    expect(regionForPoint(catalog.regions, 54.0, 10.0)).toBeNull(); // Baltic Sea
  });

  it('computes logbook statistics', () => {
    const catalog = loadCatalog(db);
    const a = saveSite(db, { name: 'A', lat: null, lng: null, country: 'Ägypten', is_private: true }, catalog.regions);
    const b = saveSite(db, { name: 'B', lat: null, lng: null, country: 'ägypten ', is_private: true }, catalog.regions);
    const c = saveSite(db, { name: 'C', lat: null, lng: null, country: 'Malediven', is_private: true }, catalog.regions);
    saveDive(db, { dive_no: 1, date: '2026-01-01', site_id: a, duration_min: 50, max_depth_m: 18 } as never);
    saveDive(db, { dive_no: 2, date: '2026-01-02', site_id: b, duration_min: 61, max_depth_m: 31.2 } as never);
    saveDive(db, { dive_no: 3, date: '2026-01-03', site_id: c, duration_min: 45 } as never);
    addSighting(db, { species_id: 'pterois-miles' });
    addSighting(db, { species_id: 'pterois-miles' });
    addSighting(db, { species_id: 'mobula-alfredi' });
    expect(logStats(db)).toEqual({ diveCount: 3, totalMinutes: 156, deepestM: 31.2, countries: 2, speciesCount: 2 });
    expect(listSites(db).find((s) => s.id === a)?.dive_count).toBe(1);
  });
});

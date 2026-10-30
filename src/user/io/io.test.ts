import { describe, expect, it, beforeEach } from 'vitest';
import { createTestDb } from '../../test/testDb';
import type { AppDb } from '../../db/appDb';
import { loadCatalog, type Catalog } from '../../catalog/catalog';
import { getDive, listDives, saveDive } from '../dives';
import { addSighting, sightingsForDive } from '../sightings';
import { saveSite, listSites } from '../sites';
import { exportCsv, parseCsvDives, parseCsvRows } from './csv';
import { exportUddf, parseUddf } from './uddf';
import { parseSubsurface } from './subsurface';
import { detectFormat, findDuplicates, importDives, parseDiveFile } from './importer';

let db: AppDb;
let catalog: Catalog;

beforeEach(async () => {
  db = await createTestDb();
  catalog = loadCatalog(db);
});

function seedDive() {
  const site = saveSite(db, { name: 'Elphinstone; Nord', lat: 25.31, lng: 34.86, country: 'Ägypten', is_private: true }, catalog.regions);
  const id = saveDive(db, {
    dive_no: 7,
    date: '2026-05-01',
    entry_time: '09:10',
    exit_time: '10:02',
    max_depth_m: 24.5,
    avg_depth_m: 12.3,
    duration_min: 52,
    site_id: site,
    rating: 4,
    notes: 'Hai "gesehen"\nzweite Zeile',
    conditions: { visibility_m: 25, water_temp_c: 26, air_temp_c: 30, water_type: 'salt', current: 'light' },
    features: ['reef', 'drift'],
    equipment: { suit: '3mm', gas: 'nitrox', o2_percent: 32, tank_volume_l: 12, pressure_start_bar: 200, pressure_end_bar: 60, weight_kg: 4 },
    profile: [
      { t: 0, d: 0, temp: 27 },
      { t: 600, d: 18.2, temp: 26 },
      { t: 1500, d: 24.5, temp: 26 },
      { t: 3120, d: 0, temp: 26.5 },
    ],
  });
  addSighting(db, { dive_id: id, species_id: 'carcharhinus-amblyrhynchos' });
  return id;
}

describe('CSV', () => {
  it('quotes fields with separators, quotes and newlines', () => {
    seedDive();
    const csv = exportCsv(db, catalog);
    expect(csv.startsWith('﻿')).toBe(true);
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    const header = rows[0];
    expect(rows[1][header.indexOf('site')]).toBe('Elphinstone; Nord');
    expect(rows[1][header.indexOf('notes')]).toBe('Hai "gesehen"\nzweite Zeile');
    expect(rows[1][header.indexOf('species')]).toBe('Carcharhinus amblyrhynchos');
  });

  it('round-trips through import into an empty logbook', async () => {
    seedDive();
    const csv = exportCsv(db, catalog);
    const fresh = await createTestDb();
    const dives = parseCsvDives(csv);
    expect(dives[0]).toMatchObject({ dive_no: 7, date: '2026-05-01', entry_time: '09:10', max_depth_m: 24.5, rating: 4 });
    importDives(fresh, catalog, dives);
    const d = getDive(fresh, listDives(fresh)[0].id)!;
    expect(d.equipment).toMatchObject({ gas: 'nitrox', o2_percent: 32, pressure_start_bar: 200 });
    expect(d.features).toEqual(['reef', 'drift']);
    expect(sightingsForDive(fresh, d.id).map((s) => s.species_id)).toEqual(['carcharhinus-amblyrhynchos']);
    expect(listSites(fresh)[0]).toMatchObject({ name: 'Elphinstone; Nord', region_id: 'red-sea' });
  });

  it('reads foreign CSV with German headers, comma delimiter and dd.mm.yyyy', () => {
    const csv = 'Nr,Datum,Zeit,Tiefe,Dauer,Tauchplatz\n1,03.04.2026,14:05,"18,5",45:30,Hausriff\n';
    const [d] = parseCsvDives(csv);
    expect(d).toMatchObject({ dive_no: 1, date: '2026-04-03', entry_time: '14:05', max_depth_m: 18.5, site: { name: 'Hausriff' } });
    expect(d.duration_min).toBeCloseTo(45.5);
  });
});

describe('UDDF', () => {
  it('exports and re-imports a dive with profile, gas and site', () => {
    seedDive();
    const xml = exportUddf(db);
    expect(detectFormat('log.uddf', xml)).toBe('uddf');
    const [d] = parseUddf(xml);
    expect(d).toMatchObject({
      dive_no: 7,
      date: '2026-05-01',
      entry_time: '09:10',
      max_depth_m: 24.5,
      avg_depth_m: 12.3,
      duration_min: 52,
      rating: 4,
      site: { name: 'Elphinstone; Nord', lat: 25.31, lng: 34.86, country: 'Ägypten' },
    });
    expect(d.conditions).toMatchObject({ water_temp_c: 26, air_temp_c: 30, visibility_m: 25 });
    expect(d.equipment).toMatchObject({ gas: 'nitrox', o2_percent: 32, tank_volume_l: 12, pressure_start_bar: 200, pressure_end_bar: 60 });
    expect(d.profile).toHaveLength(4);
    expect(d.profile[2]).toEqual({ t: 1500, d: 24.5, temp: 26 });
    expect(d.notes).toBe('Hai "gesehen"\nzweite Zeile');
  });
});

const SSRF = `<divelog program='subsurface' version='3'>
<divesites>
<site uuid='4a5b6c7d' name='Blue Hole' gps='29.367000 34.990000'>
<geo cat='2' origin='0' value='Egypt'/>
</site>
</divesites>
<dives>
<trip date='2026-03-01' time='08:00:00' location='Dahab'>
<dive number='12' rating='5' tags='Wall, Reef' divesiteid='4a5b6c7d' date='2026-03-02' time='08:31:00' duration='47:20 min'>
  <notes>Kaiserfische</notes>
  <cylinder size='11.1 l' workpressure='207.0 bar' description='AL80' o2='28.0%' start='205.0 bar' end='70.0 bar' />
  <weightsystem weight='5.0 kg' description='belt' />
  <divecomputer model='Shearwater Peregrine' deviceid='1234'>
  <depth max='31.2 m' mean='16.4 m' />
  <temperature water='24.0 C' />
  <sample time='0:10 min' depth='2.1 m' temp='25.0 C' />
  <sample time='10:00 min' depth='31.2 m' />
  <sample time='47:20 min' depth='0.0 m' temp='24.0 C' />
  </divecomputer>
</dive>
</trip>
</dives>
</divelog>`;

describe('Subsurface', () => {
  it('parses dive, site, cylinder and samples', () => {
    expect(detectFormat('export.ssrf', SSRF)).toBe('subsurface');
    const [d] = parseSubsurface(SSRF);
    expect(d).toMatchObject({
      dive_no: 12,
      date: '2026-03-02',
      entry_time: '08:31',
      max_depth_m: 31.2,
      avg_depth_m: 16.4,
      rating: 5,
      notes: 'Kaiserfische',
      site: { name: 'Blue Hole', lat: 29.367, lng: 34.99, country: 'Egypt' },
      features: ['reef', 'wall'],
    });
    expect(d.duration_min).toBeCloseTo(47.33, 1);
    expect(d.equipment).toMatchObject({ gas: 'nitrox', o2_percent: 28, tank_volume_l: 11.1, pressure_start_bar: 205, weight_kg: 5 });
    expect(d.profile.map((p) => p.t)).toEqual([10, 600, 2840]);
  });
});

describe('duplicate detection', () => {
  it('flags dives with the same date and a start time within 5 minutes', () => {
    importDives(db, catalog, parseDiveFile('export.ssrf', SSRF));
    const again = parseDiveFile('export.ssrf', SSRF);
    expect(findDuplicates(db, again)).toEqual([true]);
    const shifted = [{ ...again[0], entry_time: '08:34' }, { ...again[0], entry_time: '09:00' }, { ...again[0], date: '2026-03-03' }];
    expect(findDuplicates(db, shifted)).toEqual([true, false, false]);
  });

  it('reuses existing sites by name and continues numbering', () => {
    importDives(db, catalog, parseDiveFile('a.ssrf', SSRF));
    const second = parseDiveFile('a.ssrf', SSRF).map((d) => ({ ...d, dive_no: null, date: '2026-03-05' }));
    importDives(db, catalog, second);
    expect(listSites(db)).toHaveLength(1);
    expect(listDives(db).map((d) => d.dive_no)).toEqual([13, 12]);
    expect(getDive(db, listDives(db)[1].id)!.profile).toHaveLength(3);
  });
});

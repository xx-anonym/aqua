import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { AppDb } from '../db/appDb';
import { loadCatalog, loadPhotos } from './catalog';
import { searchSpecies } from './search';

const DIR = join(__dirname, '../../public/catalog');

/** Invariants of the shipped catalog.sqlite produced by data-pipeline. */
describe('shipped catalog', async () => {
  const SQL = await initSqlJs();
  const db = AppDb.create(SQL, new Uint8Array(readFileSync(join(DIR, 'catalog.sqlite'))));
  const catalog = loadCatalog(db);
  const isSeed = catalog.meta.version === 'seed';

  it('has species in every category and region', () => {
    expect(catalog.species.length).toBeGreaterThan(isSeed ? 30 : 300);
    for (const c of ['fish', 'creature', 'coral_sponge_plant'] as const) {
      expect(catalog.species.some((s) => s.category === c)).toBe(true);
    }
    for (const r of catalog.regions) expect(catalog.speciesInRegion(r.id).length, r.id).toBeGreaterThan(0);
  });

  it('only uses known traits that fit the category', () => {
    for (const s of catalog.species) {
      for (const t of s.traits) {
        const trait = catalog.traitsById.get(t);
        expect(trait, `${s.id}: ${t}`).toBeDefined();
        expect(trait!.appliesTo, `${s.id}: ${t}`).toContain(s.category);
      }
    }
  });

  it.skipIf(isSeed)('has an openly licensed photo with credit and a thumbnail for every species', () => {
    for (const s of catalog.species) {
      const photos = loadPhotos(db, s.id);
      expect(photos.length, s.id).toBeGreaterThan(0);
      for (const p of photos) {
        expect(['cc0', 'cc-by']).toContain(p.license);
        expect(p.author.length, s.id).toBeGreaterThan(0);
        expect(p.sourceUrl).toMatch(/^https:\/\//);
        expect(existsSync(join(DIR, p.file)), p.file).toBe(true);
      }
      expect(existsSync(join(DIR, s.thumb!)), s.thumb!).toBe(true);
      expect(s.traits.length, s.id).toBeGreaterThan(3);
      expect(s.descriptionDe, s.id).toBeTruthy();
    }
  });

  it.skipIf(isSeed)('finds well-known species by German name', () => {
    expect(searchSpecies(catalog.search, 'Rotfeuerfisch')[0]?.scientificName).toMatch(/^Pterois/);
    expect(searchSpecies(catalog.search, 'Riffmanta')[0]?.scientificName).toBe('Mobula alfredi');
  });

  it('lists its sources', () => {
    if (!isSeed) expect(catalog.meta.sources.map((s) => s.name).join()).toMatch(/iNaturalist.*WoRMS.*GBIF.*FishBase/);
  });
});

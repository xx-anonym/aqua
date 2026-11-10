import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { AppDb } from '../db/appDb';
import { loadCatalog, loadPhotos } from './catalog';
import { searchSpecies } from './search';
import { parseIndex, regionCandidates } from '../../supabase/functions/identify/logic';

const DIR = join(__dirname, '../../public/catalog');
// The photos are their own Vercel project (catalog-images/README.md).
const IMAGES = join(__dirname, '../../catalog-images');

/** Invariants of the shipped catalog.sqlite produced by data-pipeline. */
describe('shipped catalog', async () => {
  const SQL = await initSqlJs();
  const db = AppDb.create(SQL, new Uint8Array(readFileSync(join(DIR, 'catalog.sqlite'))));
  const catalog = loadCatalog(db);
  const isSeed = catalog.meta.version === 'seed';

  it('ships the photo-ID candidate index of this catalog (scripts/photo-id-index.mjs, run before every build)', () => {
    const index = parseIndex(JSON.parse(readFileSync(join(DIR, 'photo-id.json'), 'utf8')))!;
    expect(index.version).toBe(catalog.meta.version);
    // The index lists the most observed first. The app's own order differs only in showing species
    // without a photo of a living animal last – for the photo ID they count like any other.
    const byPopularity = (list: typeof catalog.species) =>
      [...list].sort((a, b) => b.popularity - a.popularity || (a.scientificName < b.scientificName ? -1 : 1)).map((s) => s.id);
    expect(regionCandidates(index, null)!.map((c) => c.id)).toEqual(byPopularity(catalog.species));
    for (const r of catalog.regions) {
      expect(regionCandidates(index, r.id)!.map((c) => c.id), r.id).toEqual(byPopularity(catalog.speciesInRegion(r.id)));
    }
  });

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

  // Image addresses carry the first 10 hex digits of the file's SHA-1 (?v=…), so a replaced photo
  // never comes out of a cache under its old address.
  const expectFingerprinted = (address: string) => {
    const [file, v] = address.split('?v=');
    expect(existsSync(join(IMAGES, file)), file).toBe(true);
    expect(v, address).toBe(createHash('sha1').update(readFileSync(join(IMAGES, file))).digest('hex').slice(0, 10));
  };

  it.skipIf(isSeed)('has an openly licensed photo with credit and a thumbnail for every species', () => {
    for (const s of catalog.species) {
      const photos = loadPhotos(db, s.id);
      expect(photos.length, s.id).toBeGreaterThan(0);
      for (const p of photos) {
        expect(['cc0', 'cc-by']).toContain(p.license);
        expect(p.author.length, s.id).toBeGreaterThan(0);
        expect(p.sourceUrl).toMatch(/^https:\/\//);
        expectFingerprinted(p.file);
      }
      expectFingerprinted(s.thumb!);
      expect(s.traits.length, s.id).toBeGreaterThan(3);
      expect(s.descriptionDe, s.id).toBeTruthy();
    }
  });

  it.skipIf(isSeed)('finds well-known species by German name', () => {
    expect(searchSpecies(catalog.search, 'Rotfeuerfisch')[0]?.scientificName).toMatch(/^Pterois/);
    expect(searchSpecies(catalog.search, 'Riffmanta')[0]?.scientificName).toBe('Mobula alfredi');
  });

  it.skipIf(isSeed)('offers countries per region, each listing only species of its region', () => {
    const egypt = catalog.destinationsById.get('red-sea:EG');
    expect(egypt?.nameDe).toBe('Ägypten');
    expect(catalog.species.filter((s) => s.destinations.includes('red-sea:EG')).length).toBeGreaterThan(150);
    expect(catalog.destinationGroups().map((g) => g.region.id)).toEqual(expect.arrayContaining(['red-sea', 'mediterranean', 'southeast-asia']));
    for (const s of catalog.species) {
      for (const d of s.destinations) expect(s.regions, `${s.id} in ${d}`).toContain(catalog.destinationsById.get(d)!.regionId);
    }
  });

  it('lists its sources', () => {
    if (!isSeed) expect(catalog.meta.sources.map((s) => s.name).join()).toMatch(/iNaturalist.*WoRMS.*GBIF.*FishBase/);
  });
});

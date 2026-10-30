import { describe, expect, it, beforeAll } from 'vitest';
import { createTestCatalog } from '../test/testDb';
import type { Catalog } from './catalog';
import { searchSpecies, normalize } from './search';
import { applyFilter, emptyFilter, activeCount } from './filter';
import { similarSpecies, compareTraits } from './similar';

let catalog: Catalog;
beforeAll(async () => {
  catalog = await createTestCatalog();
});

describe('catalog loading', () => {
  it('loads species with traits and regions incl. parent regions', () => {
    expect(catalog.species).toHaveLength(34);
    const lionfish = catalog.byId.get('pterois-miles')!;
    expect(lionfish.nameDe).toBe('Indischer Rotfeuerfisch');
    expect(lionfish.traits).toContain('color-red');
    expect(lionfish.regions).toEqual(expect.arrayContaining(['red-sea', 'indo-pacific', 'mediterranean']));
  });

  it('orders species by popularity', () => {
    expect(catalog.species[0].id).toBe('pterois-miles');
  });

  it('filters traits by category', () => {
    const shapes = catalog.traitsOfType('body_shape', 'coral_sponge_plant').map((t) => t.id);
    expect(shapes).toContain('shape-plate');
    expect(shapes).not.toContain('shape-eel');
  });

  it('builds the region tree with children after parents', () => {
    const ids = catalog.regionTree().map((r) => r.id);
    expect(ids.indexOf('indo-pacific')).toBeLessThan(ids.indexOf('red-sea'));
  });
});

describe('search', () => {
  it('normalizes umlauts and ß', () => {
    expect(normalize('Mönchsfisch')).toBe(normalize('Moenchsfisch'));
    expect(normalize('Weiß')).toBe('weiss');
  });

  it('finds by German, English, scientific name and family', () => {
    expect(searchSpecies(catalog.search, 'Rotfeuerfisch')[0].id).toBe('pterois-miles');
    expect(searchSpecies(catalog.search, 'grey reef')[0].id).toBe('carcharhinus-amblyrhynchos');
    expect(searchSpecies(catalog.search, 'Cheilinus')[0].id).toBe('cheilinus-undulatus');
    expect(searchSpecies(catalog.search, 'Chaetodontidae').map((s) => s.id)).toEqual(
      expect.arrayContaining(['chaetodon-auriga', 'chaetodon-semilarvatus']),
    );
  });

  it('tolerates typos', () => {
    expect(searchSpecies(catalog.search, 'Rotfeurfisch')[0]?.id).toBe('pterois-miles');
    expect(searchSpecies(catalog.search, 'Napolen')[0]?.id).toBe('cheilinus-undulatus');
    expect(searchSpecies(catalog.search, 'Monchsfisch')[0]?.id).toBe('chromis-chromis');
  });

  it('returns nothing for an empty query or nonsense', () => {
    expect(searchSpecies(catalog.search, '  ')).toEqual([]);
    expect(searchSpecies(catalog.search, 'xyzqwv')).toEqual([]);
  });
});

describe('trait filter', () => {
  it('combines options of one type with OR', () => {
    const f = emptyFilter('fish');
    f.traits.color = ['color-silver', 'color-green'];
    const ids = applyFilter(catalog.species, f).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['caranx-sexfasciatus', 'cheilinus-undulatus', 'thalassoma-pavo']));
    expect(ids).not.toContain('pterois-miles');
  });

  it('combines different types with AND', () => {
    const f = emptyFilter('fish');
    f.traits.color = ['color-silver', 'color-green'];
    f.traits.social = ['social-school'];
    const ids = applyFilter(catalog.species, f).map((s) => s.id).sort();
    expect(ids).toEqual(['bolbometopon-muricatum', 'caranx-sexfasciatus', 'diplodus-vulgaris']);
    expect(activeCount(f)).toBe(3);
  });

  it('filters by region including parent regions', () => {
    const f = emptyFilter();
    f.regions = ['mediterranean'];
    const med = applyFilter(catalog.species, f);
    expect(med.every((s) => s.regions.includes('mediterranean'))).toBe(true);
    f.regions = ['indo-pacific'];
    expect(applyFilter(catalog.species, f).map((s) => s.id)).toContain('amphiprion-bicinctus');
  });

  it('filters by depth overlap and size', () => {
    const f = emptyFilter();
    f.depth = ['40+'];
    f.size = ['xs'];
    // No species in the seed is both smaller than 10 cm and found below 40 m.
    expect(applyFilter(catalog.species, f)).toEqual([]);
    f.depth = ['0-10'];
    expect(applyFilter(catalog.species, f).map((s) => s.id)).toEqual(
      expect.arrayContaining(['chromodoris-quadricolor', 'stenopus-hispidus']),
    );
  });
});

describe('similar species', () => {
  it('suggests species of the same category with shared traits', () => {
    const auriga = catalog.byId.get('chaetodon-auriga')!;
    const similar = similarSpecies(catalog, auriga).map((x) => x.species.id);
    expect(similar[0]).toBe('chaetodon-semilarvatus');
    expect(similar.every((id) => catalog.byId.get(id)!.category === 'fish')).toBe(true);
  });

  it('highlights differing traits', () => {
    const a = catalog.byId.get('amphiprion-bicinctus')!;
    const b = catalog.byId.get('amphiprion-ocellaris')!;
    const color = compareTraits(a, b).find((c) => c.type === 'color')!;
    expect(color.shared).toEqual(['color-orange', 'color-white']);
    expect(color.onlyB).toEqual(['color-black']);
  });
});

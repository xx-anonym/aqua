import { describe, expect, it } from 'vitest';
import type { DiveListItem } from './dives';
import { diveCountries, diveYears, emptyDiveFilter, filterDives, isFilterActive } from './diveFilter';

const dive = (id: string, date: string, site: string | null, country: string | null, notes: string | null = null, no = 1) =>
  ({ id, date, dive_no: no, site_name: site, country, notes, sighting_count: 0 }) as unknown as DiveListItem;

const dives = [
  dive('a', '2026-05-02', 'Ras Mohammed', 'Ägypten', 'Starke Strömung', 12),
  dive('b', '2025-10-01', 'Elphinstone', 'Agypten', null, 7),
  dive('c', '2025-03-14', 'Hausriff', 'Malediven', 'Mantas!', 3),
];

describe('logbook search and filters', () => {
  it('lists years newest first and each country once (accents and case merged)', () => {
    expect(diveYears(dives)).toEqual(['2026', '2025']);
    expect(diveCountries(dives)).toEqual(['Ägypten', 'Malediven']);
  });

  it('filters by year and country', () => {
    expect(filterDives(dives, { ...emptyDiveFilter(), year: '2025' }).map((d) => d.id)).toEqual(['b', 'c']);
    // "Agypten" without umlaut is the same country
    expect(filterDives(dives, { ...emptyDiveFilter(), country: 'Ägypten' }).map((d) => d.id)).toEqual(['a', 'b']);
    expect(filterDives(dives, { query: '', year: '2025', country: 'Malediven' }).map((d) => d.id)).toEqual(['c']);
  });

  it('searches site, country, notes, dive number and species, all words must match', () => {
    const species = new Map([['c', 'Mantarochen Mobula alfredi'], ['a', 'Napoleon-Lippfisch']]);
    const q = (query: string) => filterDives(dives, { ...emptyDiveFilter(), query }, species).map((d) => d.id);
    expect(q('ras')).toEqual(['a']);
    expect(q('agypten')).toEqual(['a', 'b']);
    expect(q('strömung')).toEqual(['a']);
    expect(q('#7')).toEqual(['b']);
    expect(q('mobula')).toEqual(['c']);
    expect(q('napoleon ras')).toEqual(['a']);
    expect(q('napoleon malediven')).toEqual([]);
    expect(isFilterActive(emptyDiveFilter())).toBe(false);
    expect(isFilterActive({ ...emptyDiveFilter(), query: '  ' })).toBe(false);
    expect(isFilterActive({ ...emptyDiveFilter(), year: '2025' })).toBe(true);
  });
});

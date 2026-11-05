import type { DiveListItem } from './dives';

/** Search and filters of the logbook list. */
export interface DiveFilter {
  /** Words that must all appear in the dive site, country, notes, dive number or species seen. */
  query: string;
  year: string | null;
  country: string | null;
}

export const emptyDiveFilter = (): DiveFilter => ({ query: '', year: null, country: null });

/** Lower case without accents, so "ägypten" finds "Ägypten" and "Agypten". */
export const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('de');

export const diveYears = (dives: Pick<DiveListItem, 'date'>[]) =>
  [...new Set(dives.map((d) => d.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));

/** Countries of the dive sites, each once (differences in case and accents merged). */
export function diveCountries(dives: Pick<DiveListItem, 'country'>[]): string[] {
  const byKey = new Map<string, string>();
  for (const d of dives) {
    const c = d.country?.trim();
    if (c && !byKey.has(fold(c))) byKey.set(fold(c), c);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

export const isFilterActive = (f: DiveFilter) => !!(f.query.trim() || f.year || f.country);

/**
 * Dives matching the filter. `extraText` adds searchable text per dive id, such as the names of
 * the species seen on it and the notes of its sightings.
 */
export function filterDives<T extends DiveListItem>(dives: T[], f: DiveFilter, extraText: Map<string, string> = new Map()): T[] {
  const words = fold(f.query).split(/\s+/).filter(Boolean);
  const country = f.country ? fold(f.country) : null;
  return dives.filter((d) => {
    if (f.year && !d.date.startsWith(f.year)) return false;
    if (country && fold(d.country ?? '') !== country) return false;
    if (!words.length) return true;
    const text = fold([d.dive_no != null ? `#${d.dive_no}` : '', d.site_name, d.country, d.notes, extraText.get(d.id)].filter(Boolean).join(' '));
    return words.every((w) => text.includes(w));
  });
}

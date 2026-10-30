import type { Species } from './types';

/**
 * Typo-tolerant search over German, English and scientific names plus family.
 * sql.js ships without FTS5, so this is a small in-memory trigram index instead;
 * for a catalog of a few thousand species it answers in well under a millisecond.
 */

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Treat "ae"/"oe"/"ue" like the umlaut-stripped form, so "Moench" finds "Mönch".
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (const word of text.split(' ')) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

interface Entry {
  species: Species;
  fields: { text: string; weight: number }[];
  grams: Set<string>;
}

export interface SearchIndex {
  entries: Entry[];
}

export function buildSearchIndex(species: Species[]): SearchIndex {
  return {
    entries: species.map((s) => {
      const fields = [
        { text: normalize(s.nameDe ?? ''), weight: 1 },
        { text: normalize(s.nameEn ?? ''), weight: 0.95 },
        { text: normalize(s.scientificName), weight: 0.95 },
        { text: normalize(s.family ?? ''), weight: 0.6 },
      ].filter((f) => f.text);
      const grams = new Set<string>();
      fields.forEach((f) => trigrams(f.text).forEach((g) => grams.add(g)));
      return { species: s, fields, grams };
    }),
  };
}

function fieldScore(query: string, text: string): number {
  if (text === query) return 100;
  if (text.startsWith(query)) return 90;
  if (text.split(' ').some((w) => w.startsWith(query))) return 80;
  if (text.includes(query)) return 70;
  return 0;
}

/** Returns species ordered by relevance; empty query returns an empty list. */
export function searchSpecies(index: SearchIndex, rawQuery: string, limit = 50): Species[] {
  const query = normalize(rawQuery);
  if (!query) return [];
  const qGrams = trigrams(query);
  const minOverlap = query.length <= 3 ? 1 : 0.5;
  const scored: { s: Species; score: number }[] = [];

  for (const e of index.entries) {
    let best = 0;
    for (const f of e.fields) best = Math.max(best, fieldScore(query, f.text) * f.weight);
    if (best === 0 && query.length >= 3) {
      let hits = 0;
      qGrams.forEach((g) => {
        if (e.grams.has(g)) hits++;
      });
      const overlap = hits / qGrams.size;
      if (overlap >= minOverlap) best = 60 * overlap;
    }
    if (best > 0) scored.push({ s: e.species, score: best + Math.min(e.species.popularity, 10000) / 100000 });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}

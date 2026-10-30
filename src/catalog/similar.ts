import type { Catalog } from './catalog';
import type { Species, TraitType } from './types';
import { TRAIT_TYPES } from './types';

/** Jaccard similarity of trait sets, nudged up for the same family or group. */
export function similarity(a: Species, b: Species): number {
  if (a.category !== b.category) return 0;
  const setA = new Set(a.traits);
  const shared = b.traits.filter((t) => setA.has(t)).length;
  const union = new Set([...a.traits, ...b.traits]).size || 1;
  let score = shared / union;
  if (a.family && a.family === b.family) score += 0.15;
  else if (a.group && a.group === b.group) score += 0.05;
  return score;
}

export function similarSpecies(catalog: Catalog, target: Species, limit = 6): { species: Species; score: number }[] {
  return catalog.species
    .filter((s) => s.id !== target.id)
    .map((s) => ({ species: s, score: similarity(target, s) }))
    .filter((x) => x.score >= 0.25)
    .sort((x, y) => y.score - x.score || y.species.popularity - x.species.popularity)
    .slice(0, limit);
}

export interface TraitComparison {
  type: TraitType;
  shared: string[];
  onlyA: string[];
  onlyB: string[];
}

/** Per trait type: what both share and what differs, for the side-by-side view. */
export function compareTraits(a: Species, b: Species): TraitComparison[] {
  return TRAIT_TYPES.map((type) => {
    const ofType = (s: Species) => s.traits.filter((t) => typeOf(t) === type);
    const ta = ofType(a);
    const tb = ofType(b);
    return {
      type,
      shared: ta.filter((t) => tb.includes(t)),
      onlyA: ta.filter((t) => !tb.includes(t)),
      onlyB: tb.filter((t) => !ta.includes(t)),
    };
  }).filter((c) => c.shared.length || c.onlyA.length || c.onlyB.length);
}

const PREFIX_TO_TYPE: Record<string, TraitType> = {
  color: 'color',
  pattern: 'pattern',
  shape: 'body_shape',
  behav: 'behavior',
  social: 'social',
};

export function typeOf(traitId: string): TraitType {
  return PREFIX_TO_TYPE[traitId.split('-')[0]] ?? 'behavior';
}

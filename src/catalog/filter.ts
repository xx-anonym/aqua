import type { Category, Species, TraitType } from './types';
import { TRAIT_TYPES } from './types';

export type DepthBucket = '0-10' | '10-20' | '20-40' | '40+';
export type SizeBucket = 'xs' | 's' | 'm' | 'l';

export const DEPTH_BUCKETS: { id: DepthBucket; min: number; max: number }[] = [
  { id: '0-10', min: 0, max: 10 },
  { id: '10-20', min: 10, max: 20 },
  { id: '20-40', min: 20, max: 40 },
  { id: '40+', min: 40, max: Infinity },
];

export const SIZE_BUCKETS: { id: SizeBucket; min: number; max: number }[] = [
  { id: 'xs', min: 0, max: 10 },
  { id: 's', min: 10, max: 30 },
  { id: 'm', min: 30, max: 100 },
  { id: 'l', min: 100, max: Infinity },
];

export interface SpeciesFilter {
  category: Category | null;
  regions: string[];
  /** Countries within a region ("red-sea:EG"); used instead of regions, not together with them. */
  destinations: string[];
  traits: Record<TraitType, string[]>;
  depth: DepthBucket[];
  size: SizeBucket[];
}

export function emptyFilter(category: Category | null = null): SpeciesFilter {
  return {
    category,
    regions: [],
    destinations: [],
    traits: { color: [], pattern: [], body_shape: [], behavior: [], social: [] },
    depth: [],
    size: [],
  };
}

/** Number of active criteria (category excluded), shown on the filter button. */
export function activeCount(f: SpeciesFilter): number {
  return f.regions.length + f.destinations.length + TRAIT_TYPES.reduce((n, t) => n + f.traits[t].length, 0) + f.depth.length + f.size.length;
}

function overlapsDepth(s: Species, bucket: { min: number; max: number }) {
  if (s.depthMinM == null && s.depthMaxM == null) return false;
  const min = s.depthMinM ?? 0;
  const max = s.depthMaxM ?? min;
  return min < bucket.max && max >= bucket.min;
}

function inSize(s: Species, bucket: { min: number; max: number }) {
  return s.maxSizeCm != null && s.maxSizeCm >= bucket.min && s.maxSizeCm < bucket.max;
}

/**
 * Within one criterion the selected options are combined with OR,
 * different criteria are combined with AND (spec: "innerhalb eines Filtertyps ODER, zwischen Typen UND").
 */
export function matchesFilter(s: Species, f: SpeciesFilter): boolean {
  if (f.category && s.category !== f.category) return false;
  if (f.regions.length && !f.regions.some((r) => s.regions.includes(r))) return false;
  if (f.destinations.length && !f.destinations.some((d) => s.destinations.includes(d))) return false;
  for (const type of TRAIT_TYPES) {
    const selected = f.traits[type];
    if (selected.length && !selected.some((t) => s.traits.includes(t))) return false;
  }
  if (f.depth.length && !DEPTH_BUCKETS.filter((b) => f.depth.includes(b.id)).some((b) => overlapsDepth(s, b))) return false;
  if (f.size.length && !SIZE_BUCKETS.filter((b) => f.size.includes(b.id)).some((b) => inSize(s, b))) return false;
  return true;
}

export function applyFilter(species: Species[], f: SpeciesFilter): Species[] {
  return species.filter((s) => matchesFilter(s, f));
}

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * A "place" is what the settings and pickers store: a region id ("red-sea") or a destination id
 * ("red-sea:EG"). Returns the matching part of a filter.
 */
export function placeFilter(place: string | null): Pick<SpeciesFilter, 'regions' | 'destinations'> {
  if (!place) return { regions: [], destinations: [] };
  return place.includes(':') ? { regions: [], destinations: [place] } : { regions: [place], destinations: [] };
}

/** Region of a place (a destination belongs to the region before the colon). */
export function regionOfPlace(place: string | null): string | null {
  return place ? place.split(':')[0] : null;
}

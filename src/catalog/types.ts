export type Category = 'fish' | 'creature' | 'coral_sponge_plant';
export const CATEGORIES: Category[] = ['fish', 'creature', 'coral_sponge_plant'];

export type TraitType = 'color' | 'pattern' | 'body_shape' | 'behavior' | 'social';
export const TRAIT_TYPES: TraitType[] = ['color', 'pattern', 'body_shape', 'behavior', 'social'];

export interface Species {
  id: string;
  scientificName: string;
  nameDe: string | null;
  nameEn: string | null;
  category: Category;
  group: string | null;
  family: string | null;
  descriptionDe: string | null;
  descriptionEn: string | null;
  habitat: string | null;
  lifestyle: string | null;
  maxSizeCm: number | null;
  depthMinM: number | null;
  depthMaxM: number | null;
  iucn: string | null;
  isPremium: boolean;
  popularity: number;
  thumb: string | null;
  traits: string[];
  /** Leaf regions plus their parents (e.g. red-sea and indo-pacific). */
  regions: string[];
  /** Countries within a region where the species has been observed, e.g. "red-sea:EG". */
  destinations: string[];
}

export interface Trait {
  id: string;
  type: TraitType;
  labelDe: string;
  labelEn: string;
  icon: string;
  appliesTo: Category[];
}

export interface Region {
  id: string;
  nameDe: string;
  nameEn: string;
  parentId: string | null;
  geometry: GeoJSON.Polygon | null;
}

/** A country within a region (e.g. Egypt in the Red Sea), for "only what lives where I dive". */
export interface Destination {
  /** "<region id>:<ISO country code>", e.g. "red-sea:EG" */
  id: string;
  regionId: string;
  country: string;
  nameDe: string;
  nameEn: string;
}

export interface SpeciesPhoto {
  file: string;
  author: string;
  license: string;
  sourceUrl: string;
  bytes: number;
}

export interface CatalogSource {
  name: string;
  url: string;
  license: string;
  usage: string;
}

export interface CatalogMeta {
  version: string;
  builtAt: string;
  sources: CatalogSource[];
}

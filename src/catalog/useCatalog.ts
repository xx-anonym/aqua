import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb } from '../db/react';
import type { AppDb } from '../db/appDb';
import { loadCatalog, type Catalog } from './catalog';
import type { Destination, Region, Species, Trait } from './types';

const cache = new WeakMap<AppDb, { version: number; catalog: Catalog }>();

export function getCatalog(db: AppDb): Catalog {
  const hit = cache.get(db);
  if (hit && hit.version === db.catalogVersion) return hit.catalog;
  const catalog = loadCatalog(db);
  cache.set(db, { version: db.catalogVersion, catalog });
  return catalog;
}

/** The in-memory catalog, rebuilt only when the catalog file itself changes. */
export function useCatalog(): Catalog {
  const db = useDb();
  useSyncExternalStore(
    (cb) => db.subscribe(cb),
    () => db.catalogVersion,
  );
  return getCatalog(db);
}

export type Lang = 'de' | 'en';

export function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language?.startsWith('en') ? 'en' : 'de';
}

export function speciesName(s: Species, lang: Lang): string {
  return (lang === 'en' ? s.nameEn || s.nameDe : s.nameDe || s.nameEn) || s.scientificName;
}

export function speciesDescription(s: Species, lang: Lang): string | null {
  return lang === 'en' ? s.descriptionEn || s.descriptionDe : s.descriptionDe || s.descriptionEn;
}

export const traitLabel = (t: Trait, lang: Lang) => (lang === 'en' ? t.labelEn : t.labelDe);
export const regionName = (r: Region, lang: Lang) => (lang === 'en' ? r.nameEn : r.nameDe);
export const destinationName = (d: Destination, lang: Lang) => (lang === 'en' ? d.nameEn : d.nameDe);

/** Label of a region or destination id, e.g. "Rotes Meer" or "Ägypten · Rotes Meer". */
export function placeName(catalog: Catalog, place: string, lang: Lang): string {
  const d = catalog.destinationsById.get(place);
  if (d) {
    const region = catalog.regionsById.get(d.regionId);
    return region ? `${destinationName(d, lang)} · ${regionName(region, lang)}` : destinationName(d, lang);
  }
  const r = catalog.regionsById.get(place);
  return r ? regionName(r, lang) : place;
}

/** Dive sites near a point from the PADI Dive Guide, via our serverless function (api/divesites.ts). */
export interface DirectorySite {
  id: number;
  name: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2 */
  country: string | null;
  maxDepthM: number | null;
  types: string[];
  url: string;
  distanceKm: number;
}

export class DirectoryError extends Error {
  constructor(readonly code: 'offline' | 'failed' | 'too_large') {
    super(code);
  }
}

export const DIRECTORY_RADIUS_KM = 30;
/** Same limit as MAX_SPAN_DEG in api/divesites.ts. */
export const DIRECTORY_MAX_SPAN_DEG = 4;

export interface MapArea {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface DirectoryResult {
  sites: DirectorySite[];
  /** Sites PADI lists for the query; more than `sites.length` means only part is shown. */
  total: number;
}

async function query(params: string): Promise<DirectoryResult> {
  if (!navigator.onLine) throw new DirectoryError('offline');
  let res: Response;
  try {
    res = await fetch(`/api/divesites?${params}`);
  } catch {
    throw new DirectoryError(navigator.onLine ? 'failed' : 'offline');
  }
  if (!res.ok) throw new DirectoryError('failed');
  const body = (await res.json()) as { sites?: DirectorySite[]; total?: number };
  const sites = body.sites ?? [];
  return { sites, total: Math.max(body.total ?? 0, sites.length) };
}

/** Sites around a point (the pin or the current position). */
export function nearbyDiveSites(lat: number, lng: number, km = DIRECTORY_RADIUS_KM): Promise<DirectoryResult> {
  return query(`lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}&km=${km}`);
}

/** Whether a map area is small enough to be searched. */
export const areaSearchable = (a: MapArea) =>
  a.north - a.south <= DIRECTORY_MAX_SPAN_DEG && a.east - a.west <= DIRECTORY_MAX_SPAN_DEG;

/** Sites inside the visible map area. Rounded outwards to 0.01° so nearby views share the CDN cache. */
export function diveSitesInArea(a: MapArea): Promise<DirectoryResult> {
  if (!areaSearchable(a)) return Promise.reject(new DirectoryError('too_large'));
  const up = (v: number) => (Math.ceil(v * 100) / 100).toFixed(2);
  const down = (v: number) => (Math.floor(v * 100) / 100).toFixed(2);
  // The map can be panned past the date line (longitudes beyond ±180): shift the view back.
  const shift = Math.round((a.east + a.west) / 2 / 360) * 360;
  const n = Math.min(85, a.north);
  const s = Math.max(-85, a.south);
  const e = Math.min(180, a.east - shift);
  const w = Math.max(-180, a.west - shift);
  return query(`n=${up(n)}&s=${down(s)}&e=${up(e)}&w=${down(w)}`);
}

/** "ANCIENT SITE CIOVO NORTH" → "Ancient Site Ciovo North"; mixed-case names stay as they are. */
export function tidySiteName(name: string): string {
  if (name !== name.toUpperCase() || !/[A-Z]{2}/.test(name)) return name;
  return name.toLowerCase().replace(/(^|[\s\-(/'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Country name in the UI language, e.g. "EG" → "Ägypten". */
export function countryName(code: string | null, lang: string): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

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
  constructor(readonly code: 'offline' | 'failed') {
    super(code);
  }
}

export const DIRECTORY_RADIUS_KM = 30;

export async function nearbyDiveSites(lat: number, lng: number, km = DIRECTORY_RADIUS_KM): Promise<DirectorySite[]> {
  if (!navigator.onLine) throw new DirectoryError('offline');
  let res: Response;
  try {
    res = await fetch(`/api/divesites?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}&km=${km}`);
  } catch {
    throw new DirectoryError(navigator.onLine ? 'failed' : 'offline');
  }
  if (!res.ok) throw new DirectoryError('failed');
  const body = (await res.json()) as { sites?: DirectorySite[] };
  return body.sites ?? [];
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

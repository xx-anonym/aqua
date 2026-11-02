// Nearby dive sites from the PADI Dive Guide, for "Tauchplatz anlegen" in the app.
//
//   GET /api/divesites?lat=27.25&lng=33.84&km=30          around a point (pin or current position)
//   GET /api/divesites?n=27.6&s=26.9&e=34.2&w=33.6        inside a map area (at most MAX_SPAN_DEG wide)
//
// Asks PADI for the sites inside a box around the point: one request for names and details, one
// for the coordinates (the PADI site loads them the same way). Only on demand, one point at a time;
// the app stores just the site the user picks. Responses are cached by the CDN for a day, and the
// input is rounded to about 1 km so neighbouring requests share the cache.
// Used with permission for this private, non-commercial app.

const PADI = 'https://travel.padi.com/api/v2/travel/';
const MAX_SITES = 100;
/** Largest map area that can be searched, in degrees per side (roughly 450 km). */
export const MAX_SPAN_DEG = 4;

export interface DirectorySite {
  id: number;
  name: string;
  lat: number;
  lng: number;
  /** ISO 3166-1 alpha-2, derived from the country part of the PADI link */
  country: string | null;
  maxDepthM: number | null;
  types: string[];
  url: string;
  distanceKm: number;
}

interface PadiListItem {
  id: number;
  title?: string;
  travelUrl?: string;
  maximumDepth?: { METERS?: { value?: number } } | null;
  types?: string[] | null;
}

interface PadiPin {
  id: number;
  latitude: number;
  longitude: number;
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;

/** Box of ±km around a point, as PADI expects it ("lat,lng"). */
export function boundsAround(lat: number, lng: number, km: number): { top_right: string; bottom_left: string } {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  const clampLat = (v: number) => Math.max(-85, Math.min(85, v));
  const clampLng = (v: number) => Math.max(-180, Math.min(180, v));
  return {
    top_right: `${round(clampLat(lat + dLat), 4)},${round(clampLng(lng + dLng), 4)}`,
    bottom_left: `${round(clampLat(lat - dLat), 4)},${round(clampLng(lng - dLng), 4)}`,
  };
}

type Box = { top_right: string; bottom_left: string };

/** Map area from the query (n, s, e, w), or a message why it cannot be searched. */
export function areaFromQuery(q: URLSearchParams): { box: Box; lat: number; lng: number } | { error: string } | null {
  if (!['n', 's', 'e', 'w'].some((k) => q.has(k))) return null;
  const [n, s, e, w] = ['n', 's', 'e', 'w'].map((k) => round(Number(q.get(k) ?? NaN), 2));
  if (![n, s, e, w].every(Number.isFinite) || n <= s || e <= w || Math.abs(n) > 85 || Math.abs(s) > 85 || Math.abs(e) > 180 || Math.abs(w) > 180) {
    return { error: 'invalid area' };
  }
  // + 0.05: the app rounds the visible area outwards to 0.01°
  if (n - s > MAX_SPAN_DEG + 0.05 || e - w > MAX_SPAN_DEG + 0.05) return { error: 'area too large' };
  return { box: { top_right: `${n},${e}`, bottom_left: `${s},${w}` }, lat: (n + s) / 2, lng: (e + w) / 2 };
}

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(and|the|of)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// PADI links that do not follow the English country name
const SLUG_ALIASES: Record<string, string> = {
  usa: 'US',
  'united-states-america': 'US',
  uk: 'GB',
  'great-britain': 'GB',
  england: 'GB',
  scotland: 'GB',
  bonaire: 'BQ',
  saba: 'BQ',
  'sint-eustatius': 'BQ',
  'british-virgin-islands': 'VG',
  'us-virgin-islands': 'VI',
  micronesia: 'FM',
  'south-korea': 'KR',
  'czech-republic': 'CZ',
  'east-timor': 'TL',
  'ivory-coast': 'CI',
  myanmar: 'MM',
  burma: 'MM',
  'hong-kong': 'HK',
  macau: 'MO',
  'saint-lucia': 'LC',
  'saint-kitts-nevis': 'KN',
  'saint-vincent-grenadines': 'VC',
  'saint-martin': 'MF',
  'sint-maarten': 'SX',
};
let slugToCode: Map<string, string> | null = null;

/** "egypt" → "EG", using the English country names known to the runtime (CLDR). */
export function countryFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  if (!slugToCode) {
    slugToCode = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        let name: string | undefined;
        try {
          name = names.of(code);
        } catch {
          continue;
        }
        if (name && name !== code) slugToCode.set(slugify(name), code);
      }
    }
  }
  const key = slugify(slug);
  return SLUG_ALIASES[key] ?? slugToCode.get(key) ?? null;
}

/** Joins PADI's list (names) and map pins (coordinates); sorted by distance from the point. */
export function mergePadi(list: PadiListItem[], pins: PadiPin[], lat: number, lng: number): DirectorySite[] {
  const at = new Map(pins.map((p) => [p.id, p]));
  const sites: DirectorySite[] = [];
  for (const item of list) {
    const pin = at.get(item.id);
    const name = item.title?.trim();
    if (!pin || !name || !Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) continue;
    const path = item.travelUrl ?? '';
    const slug = path.split('/').filter(Boolean)[1];
    const depth = item.maximumDepth?.METERS?.value;
    sites.push({
      id: item.id,
      name,
      lat: round(pin.latitude, 5),
      lng: round(pin.longitude, 5),
      country: countryFromSlug(slug),
      maxDepthM: typeof depth === 'number' && depth > 0 ? Math.round(depth) : null,
      types: Array.isArray(item.types) ? item.types.filter((t) => typeof t === 'string') : [],
      url: path.startsWith('/') ? `https://www.padi.com${path}` : 'https://www.padi.com/dive-sites/',
      distanceKm: round(distanceKm(lat, lng, pin.latitude, pin.longitude), 1),
    });
  }
  return sites.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, MAX_SITES);
}

async function padi<T>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${PADI}${path}?${new URLSearchParams(params)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`PADI ${res.status}`);
  return (await res.json()) as T;
}

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  let box: Box;
  let lat: number;
  let lng: number;
  const area = areaFromQuery(q);
  if (area && 'error' in area) return Response.json(area, { status: 400 });
  if (area) {
    ({ box, lat, lng } = area);
  } else {
    lat = round(Number(q.get('lat') ?? NaN), 2);
    lng = round(Number(q.get('lng') ?? NaN), 2);
    const km = Math.max(2, Math.min(60, Math.round(Number(q.get('km')) || 30)));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
      return Response.json({ error: 'lat/lng or n/s/e/w required' }, { status: 400 });
    }
    box = boundsAround(lat, lng, km);
  }
  try {
    const [list, pins] = await Promise.all([
      padi<{ count?: number; results?: PadiListItem[] }>('dive-guide/world/all/dive-sites/', { ...box, page_size: '100' }),
      padi<PadiPin[]>('dsl/dive-sites/map/', box),
    ]);
    const sites = mergePadi(list.results ?? [], Array.isArray(pins) ? pins : [], lat, lng);
    // total: how many PADI lists in the area; more than shown means "zoom in for the rest".
    return Response.json(
      { source: 'PADI', sites, total: Math.max(list.count ?? 0, sites.length) },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

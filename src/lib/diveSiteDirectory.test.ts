import { describe, expect, it } from 'vitest';
import { allowRequest, areaFromQuery, boundsAround, countryFromSlug, distanceKm, isCanonicalQuery, mergePadi, RATE_LIMIT } from '../../api/divesites';
import { areaSearchable, countryName, tidySiteName } from './diveSiteDirectory';

describe('PADI dive site lookup', () => {
  it('builds a box around the point', () => {
    const b = boundsAround(27.25, 33.84, 30);
    const [tLat, tLng] = b.top_right.split(',').map(Number);
    const [bLat, bLng] = b.bottom_left.split(',').map(Number);
    expect(tLat - 27.25).toBeCloseTo(0.2695, 3);
    expect(27.25 - bLat).toBeCloseTo(0.2695, 3);
    expect(tLng).toBeGreaterThan(33.84 + 0.29); // wider in longitude away from the equator
    expect(bLng).toBeLessThan(33.84 - 0.29);
  });

  it('joins names and coordinates, sorted by distance', () => {
    const list = [
      { id: 1, title: 'Careless Reef', travelUrl: '/dive-site/egypt/careless-reef/', maximumDepth: { METERS: { value: 60 } }, types: ['Reef', 'Wall'] },
      { id: 2, title: 'El Mina wreck', travelUrl: '/dive-site/egypt/el-mina-wreck/', maximumDepth: null, types: ['Wreck'] },
      { id: 3, title: 'No pin', travelUrl: '/dive-site/egypt/no-pin/' },
    ];
    const pins = [
      { id: 1, latitude: 27.348, longitude: 33.837 },
      { id: 2, latitude: 27.2252, longitude: 33.8472 },
      { id: 9, latitude: 27.3, longitude: 33.9 },
    ];
    const sites = mergePadi(list, pins, 27.25, 33.84);
    expect(sites.map((s) => s.name)).toEqual(['El Mina wreck', 'Careless Reef']);
    expect(sites[1]).toMatchObject({ country: 'EG', maxDepthM: 60, types: ['Reef', 'Wall'], url: 'https://www.padi.com/dive-site/egypt/careless-reef/' });
    expect(sites[1].distanceKm).toBeCloseTo(10.9, 0);
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
  });

  it('maps PADI country links to ISO codes', () => {
    expect(countryFromSlug('egypt')).toBe('EG');
    expect(countryFromSlug('turks-and-caicos-islands')).toBe('TC');
    expect(countryFromSlug('bonaire')).toBe('BQ');
    expect(countryFromSlug('atlantis')).toBeNull();
  });

  it('tidies all-caps names and names countries in the UI language', () => {
    expect(tidySiteName('ANCIENT SITE CIOVO NORTH')).toBe('Ancient Site Ciovo North');
    expect(tidySiteName('El Mina wreck')).toBe('El Mina wreck');
    expect(countryName('EG', 'de')).toBe('Ägypten');
    expect(countryName(null, 'de')).toBe('');
  });

  it('accepts map areas up to the size limit', () => {
    const ok = areaFromQuery(new URLSearchParams('n=27.6&s=26.9&e=34.2&w=33.6'));
    expect(ok).toMatchObject({ box: { top_right: '27.6,34.2', bottom_left: '26.9,33.6' } });
    expect((ok as { lat: number }).lat).toBeCloseTo(27.25, 2);
    expect(areaFromQuery(new URLSearchParams('n=30&s=20&e=40&w=30'))).toEqual({ error: 'area too large' });
    expect(areaFromQuery(new URLSearchParams('n=20&s=30&e=34&w=33'))).toEqual({ error: 'invalid area' });
    expect(areaFromQuery(new URLSearchParams('lat=27&lng=33'))).toBeNull();
    expect(areaSearchable({ north: 27.6, south: 26.9, east: 34.2, west: 33.6 })).toBe(true);
    expect(areaSearchable({ north: 40, south: 20, east: 40, west: 30 })).toBe(false);
  });

  it('answers only the query spelling the app uses, so every request can come from the CDN cache', () => {
    const ok = (q: string) => isCanonicalQuery(new URLSearchParams(q));
    expect(ok('lat=27.25&lng=33.84&km=30')).toBe(true);
    expect(ok('n=27.60&s=-26.90&e=34.20&w=-180.00')).toBe(true);
    expect(ok('lat=27.2501&lng=33.84&km=30')).toBe(false); // more decimals
    expect(ok('lat=27.25&lng=33.84&km=30&x=1')).toBe(false); // extra parameter
    expect(ok('lat=27.25&lat=27.26&lng=33.84')).toBe(false); // repeated
    expect(ok('n=27.6&s=26.9&e=34.2')).toBe(false); // incomplete area
    expect(ok('lat=27.25&lng=33.84&km=2.5')).toBe(false);
    expect(ok('')).toBe(false);
  });

  it('limits requests per minute and address', () => {
    const t = 1_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) expect(allowRequest('1.2.3.4', t + i)).toBe(true);
    expect(allowRequest('1.2.3.4', t + 100)).toBe(false);
    expect(allowRequest('5.6.7.8', t + 100)).toBe(true);
    expect(allowRequest('1.2.3.4', t + 60_000)).toBe(true);
  });
});

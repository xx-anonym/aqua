import type { ProfileSample } from '../dives';
import { num, type ImportedDive } from './types';

/** "52:30 min" -> minutes; "1:05:00" -> minutes. */
function minutes(v: string | null): number | null {
  if (!v) return null;
  const m = v.match(/(\d+):(\d{2})(?::(\d{2}))?/);
  if (!m) return num(v);
  return m[3] ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 60 : Number(m[1]) + Number(m[2]) / 60;
}

/** Subsurface XML (.ssrf / .xml), as written by Subsurface 4.x/5.x/6.x. */
export function parseSubsurface(xml: string): ImportedDive[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Subsurface: invalid XML');

  const sites = new Map<string, ImportedDive['site']>();
  for (const s of Array.from(doc.querySelectorAll('divesites > site'))) {
    const [lat, lng] = (s.getAttribute('gps') ?? '').trim().split(/\s+/).map(Number);
    const country = Array.from(s.querySelectorAll('geo')).find((g) => g.getAttribute('cat') === '2')?.getAttribute('value') ?? null;
    sites.set(s.getAttribute('uuid')?.trim() ?? '', {
      name: s.getAttribute('name') ?? 'Unbenannt',
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      country,
    });
  }

  return Array.from(doc.getElementsByTagName('dive')).map((dive) => {
    const dc = dive.getElementsByTagName('divecomputer')[0] ?? dive;
    const depth = dc.getElementsByTagName('depth')[0] ?? dive.getElementsByTagName('depth')[0];
    const temp = dc.getElementsByTagName('temperature')[0] ?? dive.getElementsByTagName('temperature')[0];
    const cyl = dive.getElementsByTagName('cylinder')[0];
    const weight = dive.getElementsByTagName('weightsystem')[0];
    const profile: ProfileSample[] = [];
    let lastTemp: number | undefined;
    for (const s of Array.from(dc.getElementsByTagName('sample'))) {
      const t = minutes(s.getAttribute('time'));
      const d = num(s.getAttribute('depth'));
      const tc = num(s.getAttribute('temp'));
      if (tc != null) lastTemp = tc;
      if (t != null && d != null) profile.push({ t: Math.round(t * 60), d, ...(tc != null ? { temp: tc } : {}) });
    }
    const o2 = num(cyl?.getAttribute('o2'));
    const rating = num(dive.getAttribute('rating'));
    const time = dive.getAttribute('time')?.slice(0, 5) ?? null;
    const water = num(temp?.getAttribute('water')) ?? lastTemp ?? null;
    const air = num(temp?.getAttribute('air'));
    const notes = dive.getElementsByTagName('notes')[0]?.textContent?.trim() || null;
    const tags = (dive.getAttribute('tags') ?? '').toLowerCase();
    const features = (['wreck', 'cave', 'drift', 'night', 'reef', 'wall', 'shore', 'boat', 'training'] as const).filter((x) => tags.includes(x));
    return {
      dive_no: num(dive.getAttribute('number')),
      date: dive.getAttribute('date') ?? '1970-01-01',
      entry_time: time,
      exit_time: null,
      max_depth_m: num(depth?.getAttribute('max')) ?? (profile.length ? Math.max(...profile.map((p) => p.d)) : null),
      avg_depth_m: num(depth?.getAttribute('mean')),
      duration_min: minutes(dive.getAttribute('duration')),
      rating: rating && rating > 0 ? Math.min(5, Math.round(rating)) : null,
      notes,
      site: sites.get(dive.getAttribute('divesiteid')?.trim() ?? '') ?? null,
      conditions: water != null || air != null ? { water_temp_c: water, air_temp_c: air } : null,
      equipment:
        cyl || weight
          ? {
              gas: o2 == null || Math.abs(o2 - 21) < 0.5 ? 'air' : 'nitrox',
              o2_percent: o2,
              tank_volume_l: num(cyl?.getAttribute('size')),
              pressure_start_bar: num(cyl?.getAttribute('start')),
              pressure_end_bar: num(cyl?.getAttribute('end')),
              weight_kg: num(weight?.getAttribute('weight')),
            }
          : null,
      features: [...features],
      profile,
    };
  });
}

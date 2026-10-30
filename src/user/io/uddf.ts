import type { AppDb } from '../../db/appDb';
import { getDive, listDives, type ProfileSample } from '../dives';
import { listSites } from '../sites';
import { num, type ImportedDive } from './types';

const K = 273.15;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (name: string, value: unknown) => (value == null || value === '' ? '' : `<${name}>${esc(String(value))}</${name}>`);

/** UDDF 3.2 (SI units: m, s, K, Pa, m³). */
export function exportUddf(db: AppDb, version = '0.1.0'): string {
  const dives = listDives(db)
    .slice()
    .reverse()
    .map((d) => getDive(db, d.id)!);
  const sites = listSites(db);
  const mixes = new Map<string, number>();
  for (const d of dives) {
    const o2 = d.equipment?.gas === 'air' || !d.equipment?.o2_percent ? 21 : d.equipment.o2_percent;
    if (d.equipment) mixes.set(`mix_${o2}`, o2);
  }
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<uddf version="3.2.3" xmlns="http://www.streit.cc/uddf/3.2/">');
  out.push(`<generator><name>Aqua</name><type>logbook</type>${tag('version', version)}${tag('datetime', new Date().toISOString().slice(0, 19))}</generator>`);
  if (mixes.size) {
    out.push('<gasdefinitions>');
    for (const [id, o2] of mixes) out.push(`<mix id="${id}">${tag('name', o2 === 21 ? 'Air' : `EAN${o2}`)}${tag('o2', o2 / 100)}<he>0</he></mix>`);
    out.push('</gasdefinitions>');
  }
  if (sites.length) {
    out.push('<divesite>');
    for (const s of sites) {
      out.push(
        `<site id="site_${s.id}">${tag('name', s.name)}<geography>${tag('location', s.country)}${tag('latitude', s.lat)}${tag('longitude', s.lng)}</geography></site>`,
      );
    }
    out.push('</divesite>');
  }
  out.push('<profiledata><repetitiongroup id="rg_all">');
  for (const d of dives) {
    out.push(`<dive id="dive_${d.id}">`);
    out.push('<informationbeforedive>');
    out.push(tag('divenumber', d.dive_no));
    out.push(tag('datetime', `${d.date}T${d.entry_time ?? '00:00'}:00`));
    if (d.site_id) out.push(`<link ref="site_${d.site_id}"/>`);
    if (d.conditions?.air_temp_c != null) out.push(tag('airtemperature', (d.conditions.air_temp_c + K).toFixed(2)));
    out.push('</informationbeforedive>');
    const e = d.equipment;
    if (e) {
      const o2 = e.gas === 'air' || !e.o2_percent ? 21 : e.o2_percent;
      out.push('<tankdata>');
      out.push(`<link ref="mix_${o2}"/>`);
      if (e.tank_volume_l != null) out.push(tag('tankvolume', e.tank_volume_l / 1000));
      if (e.pressure_start_bar != null) out.push(tag('tankpressurebegin', e.pressure_start_bar * 1e5));
      if (e.pressure_end_bar != null) out.push(tag('tankpressureend', e.pressure_end_bar * 1e5));
      out.push('</tankdata>');
    }
    if (d.profile.length) {
      out.push('<samples>');
      for (const p of d.profile) {
        out.push(`<waypoint>${tag('divetime', p.t)}${tag('depth', p.d)}${p.temp != null ? tag('temperature', (p.temp + K).toFixed(2)) : ''}</waypoint>`);
      }
      out.push('</samples>');
    }
    out.push('<informationafterdive>');
    out.push(tag('greatestdepth', d.max_depth_m));
    out.push(tag('averagedepth', d.avg_depth_m));
    if (d.duration_min != null) out.push(tag('diveduration', Math.round(d.duration_min * 60)));
    if (d.conditions?.water_temp_c != null) out.push(tag('lowesttemperature', (d.conditions.water_temp_c + K).toFixed(2)));
    out.push(tag('visibility', d.conditions?.visibility_m));
    if (d.rating) out.push(`<rating>${tag('ratingvalue', d.rating * 2)}</rating>`);
    if (d.notes) out.push(`<notes>${tag('para', d.notes)}</notes>`);
    out.push('</informationafterdive>');
    out.push('</dive>');
  }
  out.push('</repetitiongroup></profiledata>');
  out.push('</uddf>');
  return out.join('\n');
}

// ------------------------------------------------------------------ import

const child = (el: Element | null | undefined, name: string): Element | null =>
  el ? Array.from(el.children).find((c) => c.localName === name) ?? null : null;
const desc = (el: Element | Document, name: string): Element[] => Array.from(el.getElementsByTagNameNS('*', name));
const text = (el: Element | null | undefined, name: string) => child(el, name)?.textContent?.trim() ?? null;

function splitDateTime(v: string | null): { date: string | null; time: string | null } {
  const m = v?.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/);
  return { date: m?.[1] ?? null, time: m?.[2] ?? null };
}

export function parseUddf(xml: string): ImportedDive[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('UDDF: invalid XML');

  const sites = new Map<string, ImportedDive['site']>();
  for (const s of desc(doc, 'site')) {
    const geo = child(s, 'geography');
    sites.set(s.getAttribute('id') ?? '', {
      name: text(s, 'name') ?? 'Unbenannt',
      lat: num(text(geo, 'latitude')),
      lng: num(text(geo, 'longitude')),
      country: text(geo, 'location') ?? text(child(geo, 'address'), 'country'),
    });
  }
  const mixO2 = new Map<string, number>();
  for (const m of desc(doc, 'mix')) {
    const o2 = num(text(m, 'o2'));
    if (o2 != null) mixO2.set(m.getAttribute('id') ?? '', o2 <= 1 ? o2 * 100 : o2);
  }

  return desc(doc, 'dive').map((dive) => {
    const before = child(dive, 'informationbeforedive');
    const after = child(dive, 'informationafterdive');
    const { date, time } = splitDateTime(text(before, 'datetime'));
    const siteRef = Array.from(before?.children ?? [])
      .filter((c) => c.localName === 'link')
      .map((l) => l.getAttribute('ref') ?? '')
      .find((r) => sites.has(r));
    const tank = child(dive, 'tankdata');
    const mixRef = Array.from(tank?.children ?? []).find((c) => c.localName === 'link')?.getAttribute('ref') ?? '';
    const o2 = mixO2.get(mixRef) ?? null;
    const profile: ProfileSample[] = desc(dive, 'waypoint')
      .map((w) => {
        const temp = num(text(w, 'temperature'));
        return {
          t: num(text(w, 'divetime')) ?? 0,
          d: num(text(w, 'depth')) ?? 0,
          ...(temp != null ? { temp: Math.round((temp - K) * 10) / 10 } : {}),
        };
      })
      .sort((a, b) => a.t - b.t);
    const lowest = num(text(after, 'lowesttemperature'));
    const air = num(text(before, 'airtemperature'));
    const durationS = num(text(after, 'diveduration')) ?? (profile.length ? profile[profile.length - 1].t : null);
    const ratingValue = num(text(child(after, 'rating'), 'ratingvalue'));
    const pBegin = num(text(tank, 'tankpressurebegin'));
    const pEnd = num(text(tank, 'tankpressureend'));
    const vol = num(text(tank, 'tankvolume'));
    const notes = child(after, 'notes');
    const maxFromProfile = profile.length ? Math.max(...profile.map((p) => p.d)) : null;
    return {
      dive_no: num(text(before, 'divenumber')),
      date: date ?? '1970-01-01',
      entry_time: time,
      exit_time: null,
      max_depth_m: num(text(after, 'greatestdepth')) ?? maxFromProfile,
      avg_depth_m: num(text(after, 'averagedepth')),
      duration_min: durationS != null ? Math.round(durationS / 6) / 10 : null,
      rating: ratingValue ? Math.min(5, Math.max(1, Math.round(ratingValue / 2))) : null,
      notes: notes ? desc(notes, 'para').map((p) => p.textContent?.trim()).filter(Boolean).join('\n') || notes.textContent?.trim() || null : null,
      site: siteRef ? sites.get(siteRef)! : null,
      conditions:
        lowest != null || air != null || text(after, 'visibility')
          ? {
              water_temp_c: lowest != null ? Math.round((lowest - K) * 10) / 10 : null,
              air_temp_c: air != null ? Math.round((air - K) * 10) / 10 : null,
              visibility_m: num(text(after, 'visibility')),
            }
          : null,
      equipment: tank
        ? {
            gas: o2 == null || Math.abs(o2 - 21) < 0.5 ? 'air' : 'nitrox',
            o2_percent: o2,
            tank_volume_l: vol != null ? Math.round(vol * 1000 * 10) / 10 : null,
            pressure_start_bar: pBegin != null ? Math.round(pBegin / 1e5) : null,
            pressure_end_bar: pEnd != null ? Math.round(pEnd / 1e5) : null,
          }
        : null,
      features: [],
      profile,
    };
  });
}

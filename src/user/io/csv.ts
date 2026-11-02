import type { AppDb } from '../../db/appDb';
import type { Catalog } from '../../catalog/catalog';
import { getDive, listDives, type DiveType } from '../dives';
import { getSite } from '../sites';
import { sightingsForDive, isUnidentified } from '../sightings';
import { num, type ImportedDive } from './types';

export const CSV_COLUMNS = [
  'dive_no', 'date', 'entry_time', 'exit_time', 'duration_min', 'max_depth_m', 'avg_depth_m', 'site', 'country', 'lat', 'lng',
  'rating', 'visibility_m', 'water_temp_c', 'air_temp_c', 'water_type', 'current', 'types', 'suit', 'gas', 'o2_percent',
  'tank_volume_l', 'tank_material', 'pressure_start_bar', 'pressure_end_bar', 'weight_kg', 'species', 'notes',
] as const;

function cell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon-separated with BOM, so spreadsheet apps with German locale open it directly. */
export function exportCsv(db: AppDb, catalog: Catalog): string {
  const rows = listDives(db)
    .slice()
    .reverse()
    .map((item) => {
      const d = getDive(db, item.id)!;
      const site = d.site_id ? getSite(db, d.site_id) : undefined;
      const species = sightingsForDive(db, d.id).map((s) =>
        isUnidentified(s) ? `unbestimmt${s.note ? ` (${s.note})` : ''}` : (catalog.byId.get(s.species_id)?.scientificName ?? s.species_id),
      );
      const values: Record<(typeof CSV_COLUMNS)[number], unknown> = {
        dive_no: d.dive_no,
        date: d.date,
        entry_time: d.entry_time,
        exit_time: d.exit_time,
        duration_min: d.duration_min,
        max_depth_m: d.max_depth_m,
        avg_depth_m: d.avg_depth_m,
        site: site?.name,
        country: site?.country,
        lat: site?.lat,
        lng: site?.lng,
        rating: d.rating,
        visibility_m: d.conditions?.visibility_m,
        water_temp_c: d.conditions?.water_temp_c,
        air_temp_c: d.conditions?.air_temp_c,
        water_type: d.conditions?.water_type,
        current: d.conditions?.current,
        types: d.features.join(','),
        suit: d.equipment?.suit,
        gas: d.equipment?.gas,
        o2_percent: d.equipment?.o2_percent,
        tank_volume_l: d.equipment?.tank_volume_l,
        tank_material: d.equipment?.tank_material,
        pressure_start_bar: d.equipment?.pressure_start_bar,
        pressure_end_bar: d.equipment?.pressure_end_bar,
        weight_kg: d.equipment?.weight_kg,
        species: species.join(', '),
        notes: d.notes,
      };
      return CSV_COLUMNS.map((c) => cell(values[c])).join(';');
    });
  return '﻿' + [CSV_COLUMNS.join(';'), ...rows].join('\r\n') + '\r\n';
}

export function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Header aliases (lower-case) for files from other apps and dive computers. */
const ALIASES: Record<string, string[]> = {
  dive_no: ['dive_no', 'dive number', 'divenumber', 'nr', 'no', 'number', 'tauchgang', 'tg', '#'],
  date: ['date', 'datum', 'dive date'],
  entry_time: ['entry_time', 'time', 'start time', 'starttime', 'zeit', 'uhrzeit', 'einstieg'],
  exit_time: ['exit_time', 'ausstieg', 'end time'],
  duration_min: ['duration_min', 'duration', 'dauer', 'tauchzeit', 'bottom time', 'dive time', 'duration [min]'],
  max_depth_m: ['max_depth_m', 'max depth', 'maxdepth', 'max. depth', 'depth', 'tiefe', 'maximaltiefe', 'max depth [m]'],
  avg_depth_m: ['avg_depth_m', 'avg depth', 'average depth', 'mean depth', 'durchschnittstiefe'],
  site: ['site', 'location', 'dive site', 'divesite', 'tauchplatz', 'ort'],
  country: ['country', 'land'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'lon', 'longitude'],
  rating: ['rating', 'bewertung'],
  visibility_m: ['visibility_m', 'visibility', 'sicht'],
  water_temp_c: ['water_temp_c', 'water temp', 'water temperature', 'wassertemperatur', 'temp', 'min temp'],
  air_temp_c: ['air_temp_c', 'air temp', 'air temperature', 'lufttemperatur'],
  water_type: ['water_type'],
  current: ['current', 'strömung'],
  types: ['types', 'tags', 'dive type'],
  suit: ['suit', 'anzug'],
  gas: ['gas'],
  o2_percent: ['o2_percent', 'o2', 'o2 %', 'oxygen'],
  tank_volume_l: ['tank_volume_l', 'tank volume', 'cylinder size', 'flasche'],
  tank_material: ['tank_material'],
  pressure_start_bar: ['pressure_start_bar', 'start pressure', 'startdruck'],
  pressure_end_bar: ['pressure_end_bar', 'end pressure', 'enddruck'],
  weight_kg: ['weight_kg', 'weight', 'blei'],
  species: ['species', 'arten'],
  notes: ['notes', 'notizen', 'comments', 'bemerkungen'],
};

function normDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function normTime(v: string | undefined): string | null {
  const m = v?.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function normDuration(v: string | undefined): number | null {
  if (!v) return null;
  const hms = v.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hms) return hms[3] ? Number(hms[1]) * 60 + Number(hms[2]) + Number(hms[3]) / 60 : Number(hms[1]) + Number(hms[2]) / 60;
  return num(v);
}

export function parseCsvDives(text: string): ImportedDive[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (key: string) => header.findIndex((h) => ALIASES[key].includes(h));
  const idx = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)])) as Record<string, number>;
  if (idx.date < 0) throw new Error('CSV: no date column');
  const get = (r: string[], key: string) => (idx[key] >= 0 ? r[idx[key]]?.trim() || undefined : undefined);

  return rows.slice(1).flatMap((r) => {
    const date = normDate(get(r, 'date') ?? '');
    if (!date) return [];
    const siteName = get(r, 'site');
    const types = (get(r, 'types') ?? '').split(/[,|]/).map((x) => x.trim()).filter(Boolean) as DiveType[];
    const conditions = {
      visibility_m: num(get(r, 'visibility_m')),
      water_temp_c: num(get(r, 'water_temp_c')),
      air_temp_c: num(get(r, 'air_temp_c')),
      water_type: (get(r, 'water_type') as never) ?? null,
      current: (get(r, 'current') as never) ?? null,
    };
    const equipment = {
      suit: (get(r, 'suit') as never) ?? null,
      gas: (get(r, 'gas') as never) ?? null,
      o2_percent: num(get(r, 'o2_percent')),
      tank_volume_l: num(get(r, 'tank_volume_l')),
      tank_material: (get(r, 'tank_material') as never) ?? null,
      pressure_start_bar: num(get(r, 'pressure_start_bar')),
      pressure_end_bar: num(get(r, 'pressure_end_bar')),
      weight_kg: num(get(r, 'weight_kg')),
    };
    const rating = num(get(r, 'rating'));
    return [
      {
        dive_no: num(get(r, 'dive_no')),
        date,
        entry_time: normTime(get(r, 'entry_time')),
        exit_time: normTime(get(r, 'exit_time')),
        max_depth_m: num(get(r, 'max_depth_m')),
        avg_depth_m: num(get(r, 'avg_depth_m')),
        duration_min: normDuration(get(r, 'duration_min')),
        rating: rating && rating >= 1 && rating <= 5 ? Math.round(rating) : null,
        notes: get(r, 'notes') ?? null,
        site: siteName
          ? { name: siteName, lat: num(get(r, 'lat')), lng: num(get(r, 'lng')), country: get(r, 'country') ?? null }
          : null,
        conditions: Object.values(conditions).some((v) => v != null) ? conditions : null,
        equipment: Object.values(equipment).some((v) => v != null) ? equipment : null,
        features: types,
        profile: [],
        species: (get(r, 'species') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      },
    ];
  });
}

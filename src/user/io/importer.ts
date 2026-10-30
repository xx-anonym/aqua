import type { AppDb } from '../../db/appDb';
import type { Catalog } from '../../catalog/catalog';
import { writeDive } from '../dives';
import { upsertRow } from '../repo';
import { regionForPoint } from '../sites';
import { nowIso } from '../../lib/ids';
import { parseCsvDives } from './csv';
import { parseSubsurface } from './subsurface';
import type { ImportedDive } from './types';
import { parseUddf } from './uddf';

export type ImportFormat = 'uddf' | 'subsurface' | 'csv';

export function detectFormat(fileName: string, text: string): ImportFormat | null {
  const head = text.slice(0, 2000).toLowerCase();
  if (head.includes('<uddf')) return 'uddf';
  if (head.includes('<divelog') || head.includes("program='subsurface'") || head.includes('program="subsurface"')) return 'subsurface';
  if (/\.(csv|tsv|txt)$/i.test(fileName)) return 'csv';
  if (/\.uddf$/i.test(fileName)) return 'uddf';
  if (/\.(ssrf|xml)$/i.test(fileName)) return 'subsurface';
  return null;
}

export function parseDiveFile(fileName: string, text: string): ImportedDive[] {
  const format = detectFormat(fileName, text);
  if (format === 'uddf') return parseUddf(text);
  if (format === 'subsurface') return parseSubsurface(text);
  if (format === 'csv') return parseCsvDives(text);
  throw new Error('unsupported');
}

const toMinutes = (t: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** A dive counts as duplicate if one exists on the same date with a start time within 5 minutes. */
export function findDuplicates(db: AppDb, dives: ImportedDive[]): boolean[] {
  const existing = db.all<{ date: string; entry_time: string | null }>('SELECT date, entry_time FROM dive WHERE deleted_at IS NULL');
  return dives.map((d) =>
    existing.some((e) => {
      if (e.date !== d.date) return false;
      const a = toMinutes(e.entry_time);
      const b = toMinutes(d.entry_time);
      return a == null || b == null ? a === b : Math.abs(a - b) <= 5;
    }),
  );
}

/** Writes the selected dives; sites are matched by name (case-insensitive) or created. */
export function importDives(db: AppDb, catalog: Catalog, dives: ImportedDive[]): number {
  return db.tx(() => {
    const siteIds = new Map<string, string>();
    for (const s of db.all<{ id: string; name: string }>('SELECT id, name FROM dive_site WHERE deleted_at IS NULL')) {
      siteIds.set(s.name.trim().toLowerCase(), s.id);
    }
    let maxNo = db.get<{ n: number | null }>('SELECT MAX(dive_no) AS n FROM dive WHERE deleted_at IS NULL')?.n ?? 0;
    const bySci = new Map(catalog.species.map((s) => [s.scientificName.toLowerCase(), s.id]));
    const sorted = [...dives].sort((a, b) => `${a.date}${a.entry_time}`.localeCompare(`${b.date}${b.entry_time}`));
    for (const d of sorted) {
      let siteId: string | null = null;
      if (d.site) {
        const key = d.site.name.trim().toLowerCase();
        siteId = siteIds.get(key) ?? null;
        if (!siteId) {
          siteId = upsertRow(db, 'dive_site', {
            name: d.site.name.trim(),
            lat: d.site.lat,
            lng: d.site.lng,
            country: d.site.country,
            is_private: 1,
            region_id: d.site.lat != null && d.site.lng != null ? regionForPoint(catalog.regions, d.site.lat, d.site.lng) : null,
          });
          siteIds.set(key, siteId);
        }
      }
      const diveNo = d.dive_no ?? ++maxNo;
      maxNo = Math.max(maxNo, diveNo);
      const id = writeDive(db, {
        dive_no: diveNo,
        date: d.date,
        entry_time: d.entry_time,
        exit_time: d.exit_time,
        max_depth_m: d.max_depth_m,
        avg_depth_m: d.avg_depth_m,
        duration_min: d.duration_min,
        site_id: siteId,
        rating: d.rating,
        notes: d.notes,
        source: 'import',
        conditions: d.conditions,
        equipment: d.equipment,
        features: d.features,
        profile: d.profile.length ? d.profile : undefined,
      });
      for (const name of d.species ?? []) {
        const speciesId = bySci.get(name.toLowerCase()) ?? (catalog.byId.has(name) ? name : null);
        if (speciesId) {
          upsertRow(db, 'sighting', {
            dive_id: id,
            species_id: speciesId,
            identified_by: 'import',
            seen_at: d.entry_time ? new Date(`${d.date}T${d.entry_time}:00`).toISOString() : `${d.date}T12:00:00.000Z`,
          });
        }
      }
    }
    return sorted.length;
  });
}

export function downloadText(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const exportFileName = (ext: string) => `aqua-logbuch-${nowIso().slice(0, 10)}.${ext}`;

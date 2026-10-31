import type { AppDb } from '../db/appDb';
import { restoreDeleted, softDelete, upsertRow } from './repo';

export type WaterType = 'salt' | 'fresh' | 'brackish';
export type Current = 'none' | 'light' | 'moderate' | 'strong';
export type Suit = 'none' | 'shorty' | '3mm' | '5mm' | '7mm' | 'drysuit';
export type Gas = 'air' | 'nitrox' | 'trimix';
export type TankMaterial = 'steel' | 'aluminium';

export const WATER_TYPES: WaterType[] = ['salt', 'fresh', 'brackish'];
export const CURRENTS: Current[] = ['none', 'light', 'moderate', 'strong'];
export const SUITS: Suit[] = ['none', 'shorty', '3mm', '5mm', '7mm', 'drysuit'];
export const GASES: Gas[] = ['air', 'nitrox', 'trimix'];
export const TANK_MATERIALS: TankMaterial[] = ['steel', 'aluminium'];
export const DIVE_TYPES = [
  'reef', 'wall', 'wreck', 'cave', 'drift', 'night', 'blackwater', 'muck', 'shore', 'boat', 'snorkel', 'freedive', 'training',
] as const;
export type DiveType = (typeof DIVE_TYPES)[number];

export interface Dive {
  id: string;
  dive_no: number | null;
  date: string;
  entry_time: string | null;
  exit_time: string | null;
  max_depth_m: number | null;
  avg_depth_m: number | null;
  duration_min: number | null;
  site_id: string | null;
  rating: number | null;
  notes: string | null;
  source: 'manual' | 'import';
}

export interface DiveConditions {
  visibility_m: number | null;
  water_temp_c: number | null;
  air_temp_c: number | null;
  water_type: WaterType | null;
  current: Current | null;
}

export interface DiveEquipment {
  suit: Suit | null;
  gas: Gas | null;
  o2_percent: number | null;
  tank_volume_l: number | null;
  tank_material: TankMaterial | null;
  pressure_start_bar: number | null;
  pressure_end_bar: number | null;
  weight_kg: number | null;
}

export interface ProfileSample {
  /** seconds since entry */
  t: number;
  /** depth in metres */
  d: number;
  /** water temperature in °C, optional */
  temp?: number;
}

export interface DiveInput extends Omit<Dive, 'id' | 'source'> {
  id?: string;
  source?: Dive['source'];
  conditions?: Partial<DiveConditions> | null;
  features?: DiveType[];
  equipment?: Partial<DiveEquipment> | null;
  profile?: ProfileSample[] | null;
}

export interface DiveListItem extends Dive {
  site_name: string | null;
  country: string | null;
  sighting_count: number;
}

export interface DiveFull extends Dive {
  site_name: string | null;
  conditions: DiveConditions | null;
  features: DiveType[];
  equipment: DiveEquipment | null;
  profile: ProfileSample[];
}

const DIVE_COLS =
  'id, dive_no, date, entry_time, exit_time, max_depth_m, avg_depth_m, duration_min, site_id, rating, notes, source';

export function listDives(db: AppDb): DiveListItem[] {
  return db.all<DiveListItem>(
    `SELECT d.${DIVE_COLS.split(', ').join(', d.')}, s.name AS site_name, s.country AS country,
       (SELECT COUNT(*) FROM sighting g WHERE g.dive_id = d.id AND g.deleted_at IS NULL) AS sighting_count
     FROM dive d LEFT JOIN dive_site s ON s.id = d.site_id
     WHERE d.deleted_at IS NULL
     ORDER BY d.date DESC, COALESCE(d.entry_time, '') DESC, d.dive_no DESC`,
  );
}

export function getDive(db: AppDb, id: string): DiveFull | null {
  const dive = db.get<Dive & { site_name: string | null }>(
    `SELECT d.${DIVE_COLS.split(', ').join(', d.')}, s.name AS site_name
     FROM dive d LEFT JOIN dive_site s ON s.id = d.site_id WHERE d.id = ? AND d.deleted_at IS NULL`,
    [id],
  );
  if (!dive) return null;
  const conditions = db.get<DiveConditions>(
    'SELECT visibility_m, water_temp_c, air_temp_c, water_type, current FROM dive_conditions WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  const features = db.get<{ types: string }>('SELECT types FROM dive_features WHERE id = ? AND deleted_at IS NULL', [id]);
  const equipment = db.get<DiveEquipment>(
    `SELECT suit, gas, o2_percent, tank_volume_l, tank_material, pressure_start_bar, pressure_end_bar, weight_kg
     FROM dive_equipment WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  const profile = db.get<{ samples: string }>('SELECT samples FROM dive_profile WHERE id = ? AND deleted_at IS NULL', [id]);
  return {
    ...dive,
    conditions: conditions ?? null,
    features: features ? (JSON.parse(features.types) as DiveType[]) : [],
    equipment: equipment ?? null,
    profile: profile ? (JSON.parse(profile.samples) as ProfileSample[]) : [],
  };
}

export function nextDiveNo(db: AppDb): number {
  const row = db.get<{ n: number | null }>('SELECT MAX(dive_no) AS n FROM dive WHERE deleted_at IS NULL');
  return (row?.n ?? 0) + 1;
}

/** Equipment of the most recent dive that has any, as a template for a new dive. */
export function lastEquipment(db: AppDb): DiveEquipment | null {
  return (
    db.get<DiveEquipment>(
      `SELECT e.suit, e.gas, e.o2_percent, e.tank_volume_l, e.tank_material, e.pressure_start_bar, e.pressure_end_bar, e.weight_kg
       FROM dive_equipment e JOIN dive d ON d.id = e.dive_id
       WHERE e.deleted_at IS NULL AND d.deleted_at IS NULL
       ORDER BY d.date DESC, COALESCE(d.entry_time, '') DESC LIMIT 1`,
    ) ?? null
  );
}

function hasValues(o: object | null | undefined): o is object {
  return !!o && Object.values(o).some((v) => v !== null && v !== undefined && v !== '');
}

/** Writes a dive with its 1:1 detail rows (which share the dive id). Inside a transaction. */
export function writeDive(db: AppDb, input: DiveInput): string {
  const { conditions, features, equipment, profile, ...dive } = input;
  const id = upsertRow(db, 'dive', { ...dive, source: dive.source ?? 'manual' });
  if (hasValues(conditions)) upsertRow(db, 'dive_conditions', { id, dive_id: id, ...conditions });
  else softDelete(db, 'dive_conditions', 'id = ?', [id]);
  if (features?.length) upsertRow(db, 'dive_features', { id, dive_id: id, types: JSON.stringify(features) });
  else softDelete(db, 'dive_features', 'id = ?', [id]);
  if (hasValues(equipment)) upsertRow(db, 'dive_equipment', { id, dive_id: id, ...equipment });
  else softDelete(db, 'dive_equipment', 'id = ?', [id]);
  if (profile?.length) upsertRow(db, 'dive_profile', { id, dive_id: id, samples: JSON.stringify(profile) });
  else if (profile !== undefined) softDelete(db, 'dive_profile', 'id = ?', [id]);
  return id;
}

export function saveDive(db: AppDb, input: DiveInput): string {
  return db.tx(() => writeDive(db, input));
}

const DIVE_DETAIL_TABLES = ['dive_conditions', 'dive_features', 'dive_equipment', 'dive_profile'] as const;

/** Soft-deletes the dive, its detail rows and its sightings; returns the stamp for restoreDive(). */
export function deleteDive(db: AppDb, id: string): string {
  return db.tx(() => {
    const at = softDelete(db, 'dive', 'id = ?', [id]);
    for (const t of DIVE_DETAIL_TABLES) softDelete(db, t, 'id = ?', [id], at);
    softDelete(db, 'sighting', 'dive_id = ?', [id], at);
    return at;
  });
}

/** Undo for deleteDive(). Sightings that had been deleted on their own before stay deleted. */
export function restoreDive(db: AppDb, id: string, deletedAt: string) {
  db.tx(() => {
    restoreDeleted(db, 'dive', deletedAt, 'id = ?', [id]);
    for (const t of DIVE_DETAIL_TABLES) restoreDeleted(db, t, deletedAt, 'id = ?', [id]);
    restoreDeleted(db, 'sighting', deletedAt, 'dive_id = ?', [id]);
  });
}

/** Duration from entry and exit time (HH:MM), handling dives past midnight. */
export function durationFromTimes(entry: string | null, exit: string | null): number | null {
  if (!entry || !exit) return null;
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  let d = toMin(exit) - toMin(entry);
  if (d < 0) d += 24 * 60;
  return d;
}

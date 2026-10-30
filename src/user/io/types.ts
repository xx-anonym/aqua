import type { DiveConditions, DiveEquipment, DiveType, ProfileSample } from '../dives';

/** A dive read from a file, before it is matched against existing dives and sites. */
export interface ImportedDive {
  dive_no: number | null;
  date: string; // YYYY-MM-DD
  entry_time: string | null; // HH:MM
  exit_time: string | null;
  max_depth_m: number | null;
  avg_depth_m: number | null;
  duration_min: number | null;
  rating: number | null;
  notes: string | null;
  site: { name: string; lat: number | null; lng: number | null; country: string | null } | null;
  conditions: Partial<DiveConditions> | null;
  equipment: Partial<DiveEquipment> | null;
  features: DiveType[];
  profile: ProfileSample[];
  /** Scientific names or catalog ids from our own CSV export. */
  species?: string[];
}

export const num = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

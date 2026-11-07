import type { AppDb } from '../db/appDb';
import type { LifeListEntry } from './lifelist';

/*
 * The start page (src/screens/start/StartScreen.tsx): the own logbook at a glance.
 */

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * "Heute vor einem Jahr": own dives exactly one or more years before `today` (YYYY-MM-DD), the
 * most recent first. Only the exact day counts – a small surprise, not a permanent guest. A dive
 * on 29 February turns up on the 28th in years without that day.
 */
export function anniversaries<T extends { date: string }>(dives: T[], today: string): { dive: T; years: number }[] {
  const year = Number(today.slice(0, 4));
  const md = today.slice(5);
  return dives
    .filter((d) => {
      if (d.date >= today) return false;
      const dmd = d.date.slice(5);
      return dmd === md || (dmd === '02-29' && md === '02-28' && !isLeap(year));
    })
    .map((dive) => ({ dive, years: year - Number(dive.date.slice(0, 4)) }))
    .filter((a) => a.years > 0)
    .sort((a, b) => a.years - b.years);
}

/** Species seen for the first time on or after `since` (YYYY-MM-DD), the newest first. */
export function firstSightingsSince(seen: Map<string, LifeListEntry>, since: string): LifeListEntry[] {
  return [...seen.values()].filter((e) => e.firstSeen.slice(0, 10) >= since).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));
}

/** The catalog region of a dive site (set when it has coordinates), for "12 von 412 Arten im Roten Meer". */
export function regionOfSite(db: AppDb, siteId: string | null): string | null {
  if (!siteId) return null;
  return db.get<{ region_id: string | null }>('SELECT region_id FROM dive_site WHERE id = ? AND deleted_at IS NULL', [siteId])?.region_id ?? null;
}

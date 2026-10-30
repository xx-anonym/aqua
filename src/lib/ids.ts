import { v4, v5 } from 'uuid';

const NAMESPACE = '6f2b1c9e-6b7a-4d0e-9a51-3c1f0b8e2d47';

export const newId = () => v4();

/**
 * Deterministic ids for rows that must be unique per user and content (favorites,
 * album entries). Two devices adding the same favorite produce the same id, so sync
 * merges them instead of creating duplicates.
 */
export const stableId = (...parts: string[]) => v5(parts.join(':'), NAMESPACE);

export const nowIso = () => new Date().toISOString();

/** Local date as YYYY-MM-DD. */
export function todayLocal(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeLocal(d = new Date()): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

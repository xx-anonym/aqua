import { useSyncExternalStore } from 'react';
import { cachedPhotoCount, cachedThumbCount, downloadPhotoPack, downloadThumbnails, type CatalogManifest } from './offline';
import { requestPersistentStorage } from './install';

/**
 * The whole offline pack (grid thumbnails, then the large photos) as one download that runs on
 * in the background: the first-start offer and the profile page show the same progress, and
 * closing the offer or leaving the page does not stop it.
 */
export interface PackJob {
  running: boolean;
  done: number;
  total: number;
  /** Set once a run has ended: how many files could not be loaded. */
  failed: number | null;
}

let job: PackJob = { running: false, done: 0, total: 0, failed: null };
let current: Promise<number> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<PackJob>) {
  job = { ...job, ...next };
  listeners.forEach((l) => l());
}

export function usePackJob(): PackJob {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => job,
  );
}

/** Whether every thumbnail and photo of the pack is on this device already. */
export async function packComplete(manifest: CatalogManifest, thumbs: (string | null)[]): Promise<boolean> {
  if (!('caches' in window)) return true;
  const [photos, thumbsHave] = await Promise.all([cachedPhotoCount(manifest), cachedThumbCount(thumbs)]);
  return photos >= manifest.photos.length && thumbsHave >= thumbs.filter(Boolean).length;
}

/** Loads what is missing; a second call while one runs joins it. Resolves with the failed count. */
export function downloadPack(manifest: CatalogManifest, thumbs: (string | null)[]): Promise<number> {
  if (current) return current;
  void requestPersistentStorage();
  const thumbTotal = thumbs.filter(Boolean).length;
  const total = thumbTotal + manifest.photos.length;
  set({ running: true, done: 0, total, failed: null });
  current = (async () => {
    let failed = 0;
    try {
      failed += await downloadThumbnails(thumbs, (done) => set({ done }));
      failed += await downloadPhotoPack(manifest, (done) => set({ done: thumbTotal + done }));
    } catch {
      failed = Math.max(1, failed);
    }
    set({ running: false, failed });
    current = null;
    return failed;
  })();
  return current;
}

/** Mobile data or the data saver is on: then the pack is only loaded when asked for right now. */
export function onMeteredConnection(): boolean {
  const c = (navigator as { connection?: { type?: string; saveData?: boolean } }).connection;
  return !!c && (c.type === 'cellular' || c.saveData === true);
}

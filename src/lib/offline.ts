/** Offline photo pack: full-size catalog photos in the Cache Storage the service worker serves from. */
export const IMAGE_CACHE = 'catalog-images';

export interface CatalogManifest {
  version: string;
  built_at: string;
  species: number;
  database_bytes: number;
  photos: { file: string; bytes: number }[];
  photo_bytes: number;
}

export async function fetchManifest(): Promise<CatalogManifest | null> {
  try {
    const res = await fetch('/catalog/catalog-manifest.json', { cache: 'no-cache' });
    return res.ok ? ((await res.json()) as CatalogManifest) : null;
  } catch {
    return null;
  }
}

const urlOf = (file: string) => new URL(`/catalog/${file}`, location.origin).href;

export async function cachedPhotoCount(manifest: CatalogManifest): Promise<number> {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(IMAGE_CACHE);
  const keys = new Set((await cache.keys()).map((r) => r.url));
  return manifest.photos.filter((p) => keys.has(urlOf(p.file))).length;
}

/** Downloads every missing photo (6 in parallel). Already cached files are skipped, so this also updates. */
export async function downloadPhotoPack(
  manifest: CatalogManifest,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  const cache = await caches.open(IMAGE_CACHE);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const wanted = new Set(manifest.photos.map((p) => urlOf(p.file)));
  // Remove photos that are no longer part of the catalog (after a catalog update).
  await Promise.all([...have].filter((u) => !wanted.has(u)).map((u) => cache.delete(u)));
  const todo = [...wanted].filter((u) => !have.has(u));
  let done = manifest.photos.length - todo.length;
  onProgress(done, manifest.photos.length);
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < todo.length && !signal?.aborted) {
      const url = todo[next++];
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
        else failed++;
      } catch {
        failed++;
      }
      onProgress(++done, manifest.photos.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return failed;
}

export async function removePhotoPack() {
  if ('caches' in window) await caches.delete(IMAGE_CACHE);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const est = await navigator.storage?.estimate?.();
  return est ? { usage: est.usage ?? 0, quota: est.quota ?? 0 } : null;
}

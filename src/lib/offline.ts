/** Offline photo pack: full-size catalog photos in the Cache Storage the service worker serves from. */
export const IMAGE_CACHE = 'catalog-images';
export const THUMB_CACHE = 'catalog-thumbs';

export interface CatalogManifest {
  version: string;
  built_at: string;
  species: number;
  database_bytes: number;
  photos: { file: string; bytes: number }[];
  photo_bytes: number;
  /** All grid thumbnails together (catalogs before 2026-11-03 do not list it). */
  thumb_bytes?: number;
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

async function fillCache(cacheName: string, urls: string[], concurrency: number, onDone?: (done: number, total: number) => void): Promise<number> {
  const cache = await caches.open(cacheName);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = urls.filter((u) => !have.has(u));
  let next = 0;
  let failed = 0;
  let done = urls.length - todo.length;
  onDone?.(done, urls.length);
  const worker = async () => {
    while (next < todo.length) {
      const url = todo[next++];
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
        else failed++;
      } catch {
        failed++;
      }
      onDone?.(++done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return failed;
}

const thumbUrls = (thumbs: (string | null)[]) => thumbs.filter((t): t is string => !!t).map(urlOf);

/** How many grid thumbnails are already on this device (viewed ones are cached automatically). */
export async function cachedThumbCount(thumbs: (string | null)[]): Promise<number> {
  if (!('caches' in window)) return 0;
  const have = new Set((await (await caches.open(THUMB_CACHE)).keys()).map((r) => r.url));
  return thumbUrls(thumbs).filter((u) => have.has(u)).length;
}

/**
 * Loads all grid thumbnails (~9 MB), so species lists show pictures offline. Only on request
 * (profile, before a trip): mobile data is not spent without the user knowing.
 */
export async function downloadThumbnails(thumbs: (string | null)[], onProgress?: (done: number, total: number) => void): Promise<number> {
  if (!('caches' in window)) return 0;
  return fillCache(THUMB_CACHE, thumbUrls(thumbs), 6, onProgress);
}

/** Deletes the offline pictures: the photo pack and the cached thumbnails. */
export async function removePhotoPack() {
  if ('caches' in window) await Promise.all([caches.delete(IMAGE_CACHE), caches.delete(THUMB_CACHE)]);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const est = await navigator.storage?.estimate?.();
  return est ? { usage: est.usage ?? 0, quota: est.quota ?? 0 } : null;
}

const TIDIED_KEY = 'aqua-image-caches-tidied';

/** First 10 hex digits of the SHA-1 of a file – the ?v= fingerprint the catalog build adds. */
export async function fingerprint(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 10);
}

/**
 * Catalog images are cached "cache first": once seen, a thumbnail came from the cache for good –
 * also after a catalog update had replaced the photo under the same name. Since catalog
 * 2026.11.07 every image address carries a fingerprint of its file (?v=…), so a replaced photo
 * has a new address. Copies cached under an older address are sorted out once per catalog
 * version: still the same file (same fingerprint) – moved to the current address, so an offline
 * photo pack survives the update; otherwise deleted.
 *
 * `addresses` are the catalog's image addresses relative to /catalog/ (thumbs and photos).
 */
export async function tidyImageCaches(addresses: string[], version: string): Promise<{ moved: number; deleted: number }> {
  const result = { moved: 0, deleted: 0 };
  if (!('caches' in window) || !globalThis.crypto?.subtle) return result;
  try {
    if (localStorage.getItem(TIDIED_KEY) === version) return result;
  } catch {
    // Private mode: tidy every start; cheap when nothing is left to do.
  }
  const current = new Map<string, string>();
  for (const a of addresses) {
    const u = new URL(`/catalog/${a}`, location.origin);
    current.set(u.pathname, u.href);
  }
  for (const name of [THUMB_CACHE, IMAGE_CACHE]) {
    if (!(await caches.has(name))) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const url = new URL(request.url);
      const now = current.get(url.pathname);
      if (now === url.href) continue;
      const want = now ? new URL(now).searchParams.get('v') : null;
      const res = want ? await cache.match(request) : undefined;
      if (now && res && (await fingerprint(await res.clone().arrayBuffer())) === want) {
        await cache.put(now, res);
        result.moved++;
      } else {
        result.deleted++;
      }
      await cache.delete(request);
    }
  }
  try {
    localStorage.setItem(TIDIED_KEY, version);
  } catch {
    // see above
  }
  return result;
}

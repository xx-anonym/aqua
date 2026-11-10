/*
 * Pages load their code on first visit (React.lazy). After a new version went online, the files of
 * the version still running on a device are gone from the server, and opening such a page failed
 * with "Importing a module script failed" – the error page instead of the logbook. Then the app
 * reloads once and comes back as the new version. A second failure within 20 s shows the error
 * page as before, so a real problem cannot turn into a reload loop.
 */

const KEY = 'aqua-chunk-reload-at';
/** A reload was started in this page load (the error page may be drawn more than once meanwhile). */
let reloading = false;

/** True for errors of loading a page's code (Safari, Chrome and Firefox word them differently). */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  );
}

const DEEP_KEY = 'aqua-chunk-deep-reload';

/**
 * Second step, when a plain reload did not help (seen in Safari on a Mac, with every file fine on
 * the server): the browser's own copies are the suspect. Takes the service worker and its code
 * cache away and reloads – the app then comes fresh from the network. Once per tab.
 */
async function reloadWithoutCaches(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations().catch(() => [])) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('workbox-precache')).map((n) => caches.delete(n)));
    }
  } finally {
    location.reload();
  }
}

/** What the browser knows about the code files it loaded – for the report when all recovery failed. */
export function chunkDiagnosis(): string {
  try {
    const sw = navigator.serviceWorker?.controller ? 'SW aktiv' : 'kein SW';
    const files = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => /\/assets\/.*\.js/.test(e.name))
      .slice(-8)
      .map((e) => `${e.name.split('/').pop()}:${(e as { responseStatus?: number }).responseStatus ?? '?'}/${e.transferSize}`);
    return `${sw}; online ${navigator.onLine}; ${files.join(', ')}`;
  } catch {
    return 'keine Diagnose';
  }
}

/**
 * Reloads the page unless that was just tried; true when it reloads. The first time a plain
 * reload, the second time (within the same tab) without service worker and code cache.
 */
export function reloadForNewVersion(now = Date.now()): boolean {
  if (reloading) return true;
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0;
    if (now - last < 20_000) {
      if (sessionStorage.getItem(DEEP_KEY)) return false;
      sessionStorage.setItem(DEEP_KEY, '1');
      reloading = true;
      void reloadWithoutCaches();
      return true;
    }
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false; // without storage there is no loop guard: show the error page instead
  }
  reloading = true;
  location.reload();
  return true;
}

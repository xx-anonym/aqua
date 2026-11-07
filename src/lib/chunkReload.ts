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

/** Reloads the page unless that was just tried; true when it reloads. */
export function reloadForNewVersion(now = Date.now()): boolean {
  if (reloading) return true;
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0;
    if (now - last < 20_000) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false; // without storage there is no loop guard: show the error page instead
  }
  reloading = true;
  location.reload();
  return true;
}

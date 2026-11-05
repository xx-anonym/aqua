/** Shortest time the start screen stays up, counted from page start, so it never just flickers. */
const MIN_VISIBLE_MS = 900;
/** One cross-fade of 0.35 s into the app: see index.html. */
const FADE_MS = 350;

/** Fades out the start screen from index.html (no-op when it is already gone, e.g. in tests). */
export function hideSplash(immediately = false): void {
  const el = document.getElementById('splash');
  if (!el || el.dataset.state) return;
  el.dataset.state = 'leaving-soon';
  const wait = immediately ? 0 : Math.max(0, MIN_VISIBLE_MS - performance.now());
  setTimeout(() => {
    el.dataset.state = 'leaving';
    // Removing on a timer instead of transitionend also covers disabled transitions.
    setTimeout(() => el.remove(), FADE_MS + 50);
  }, wait);
}

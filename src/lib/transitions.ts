/**
 * Page transitions (View Transitions) only where they run cleanly. In Safari – on the iPhone that
 * is every browser and the installed app – the screen flashed black for a moment when a species
 * opened and again on the way back, so it gets the plain page change.
 */
export function smoothTransitions(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints): boolean {
  if (typeof document === 'undefined' || !('startViewTransition' in document)) return false;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  return !ios && !safari;
}

export const SMOOTH_TRANSITIONS = smoothTransitions();

import { useEffect, useRef } from 'react';

/*
 * The back gesture (Android back button, swiping back in Safari, the browser's back button) closes
 * an open sheet or full-screen view instead of leaving the page – a half-filled sighting was gone
 * otherwise.
 *
 * Each open overlay gets its own history entry with the same URL; its depth (1 for the first,
 * 2 for one opened on top of it) is kept in history.state.aquaOverlay. "Back" lands on the entry
 * below, and the overlay whose depth is now above the current one closes. An overlay closed another
 * way (✕, backdrop, Escape, saving) takes its entry off again, so that one "back" afterwards still
 * leaves the page. When a link inside an overlay navigates away, the router's new entry lies on top
 * of the overlay's; that left-behind entry is skipped on the way back.
 */

let open = 0;
let listening = false;
/**
 * An overlay that just closed and is about to take its entry off the history. When another one
 * opens in the same moment (a picker closes, the sighting form opens), that one takes the entry
 * over instead: going back and pushing at once raced, and the new overlay closed right away.
 */
let release: { depth: number; timer: number } | null = null;

const depthOf = (state: unknown) => (state as { aquaOverlay?: number } | null)?.aquaOverlay ?? 0;

function skipLeftBehindEntries() {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', (e) => {
    // An overlay entry without its overlay (it was left by navigating): go one step further back.
    if (depthOf(e.state) > open) window.history.back();
  });
}

/** Closes the calling overlay on "back"; call once in the overlay component. */
export function useBackToClose(onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    skipLeftBehindEntries();
    const depth = ++open;
    let pushed = false;
    let closedByBack = false;
    let timer = 0;
    if (release && release.depth === depth) {
      // Take over the entry of the overlay that just closed at this depth.
      window.clearTimeout(release.timer);
      release = null;
      pushed = true;
    } else {
      // Deferred: React's StrictMode mounts twice in development, and an entry pushed and taken
      // off right away would race with the second one.
      timer = window.setTimeout(() => {
        window.history.pushState({ ...((window.history.state as object | null) ?? {}), aquaOverlay: depth }, '');
        pushed = true;
      }, 0);
    }
    const onPop = (e: PopStateEvent) => {
      if (pushed && !closedByBack && depthOf(e.state) < depth) {
        closedByBack = true;
        close.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      open--;
      if (!pushed || closedByBack) return;
      // Checked a moment later: a navigation out of the overlay pushes the router's entry first, and
      // that one must stay; an overlay opening right now takes the entry over (see `release`).
      const t = window.setTimeout(() => {
        if (release?.timer === t) release = null;
        if (depthOf(window.history.state) === depth) window.history.back();
      }, 0);
      release = { depth, timer: t };
    };
  }, []);
}

/*
 * Haptic feedback: a short click on taps that choose or confirm something: the + button and the
 * tab bar, segmented switches and filter chips, saving, favourites, albums, ratings, photo ID and
 * the identification wizard. Elements opt in with data-haptic; switches, chips and tabs are
 * covered by HAPTIC_SELECTOR. Plain list rows and links that only open a page stay quiet.
 *
 * Android: a short vibration through the browser's Vibration API.
 *
 * iPhone: Safari has no Vibration API, but the iOS on/off switch (<input type="checkbox" switch>)
 * clicks haptically when it is flipped. Since iOS 26.5 only a real touch on the switch or its
 * <label> does that; a switch flipped by script stays silent. So every haptic element gets an
 * invisible <label> with a switch on top: the finger hits the label, the iPhone clicks, and the
 * click is passed on to the element. A trick, not an official API: if Apple removes it, only the
 * click is missing. Same approach as in OpernLog (src/haptik.js), where it works on iOS 27.
 */

/** Elements that give haptic feedback. */
export const HAPTIC_SELECTOR = '[data-haptic], .segmented > button, .chip, .tabbar .tab, .tab-plus > button';

/** iPhone and iPad (iPadOS presents itself as a Mac with a touch screen). */
export const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isDisabled = (el: Element) => (el as HTMLButtonElement).disabled === true;

function addSurface(el: HTMLElement) {
  if (el.querySelector(':scope > .haptic-surface')) return;
  const surface = document.createElement('label');
  surface.className = 'haptic-surface';
  surface.setAttribute('aria-hidden', 'true');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.setAttribute('switch', '');
  toggle.tabIndex = -1;
  surface.appendChild(toggle);
  // The finger hits the label. The label keeps its click to itself; the browser then flips the
  // switch (that is when the iPhone clicks), and only afterwards a click goes to the element, at
  // the finger's position. Passing the click on at once could let the element re-render or close
  // its sheet before the switch flips, and the iPhone would stay silent.
  toggle.addEventListener('click', (e) => e.stopPropagation());
  surface.addEventListener('click', (e) => {
    e.stopPropagation();
    const at = { clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
    setTimeout(() => {
      if (!el.isConnected || isDisabled(el)) return;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...at }));
    }, 0);
  });
  el.appendChild(surface);
}

function surfacesIn(node: Node) {
  if (!(node instanceof Element)) return;
  if (node.matches(HAPTIC_SELECTOR)) addSurface(node as HTMLElement);
  node.querySelectorAll<HTMLElement>(HAPTIC_SELECTOR).forEach(addSurface);
}

/**
 * Once at start. iPhone: puts the switch surface on every haptic element, also on those React
 * renders later or whose content it replaces. Android: vibrates on taps on haptic elements.
 */
export function setupHaptics(root: HTMLElement = document.body) {
  if (isIos()) {
    surfacesIn(root);
    new MutationObserver((changes) => {
      for (const change of changes) {
        change.addedNodes.forEach(surfacesIn);
        // React may replace a button's content (e.g. its text), which removes the surface.
        const owner = change.target instanceof Element ? change.target.closest<HTMLElement>(HAPTIC_SELECTOR) : null;
        if (owner) addSurface(owner);
      }
    }).observe(root, { childList: true, subtree: true });
    return;
  }
  if (typeof navigator.vibrate !== 'function') return;
  root.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target.closest(HAPTIC_SELECTOR) : null;
      if (!target || isDisabled(target)) return;
      try {
        navigator.vibrate(10);
      } catch {
        // No vibration, nothing else.
      }
    },
    true,
  );
}

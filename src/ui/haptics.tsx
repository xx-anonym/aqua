import { useEffect, useRef } from 'react';

/*
 * Haptic feedback: a short click where a confirmation helps (save a sighting or dive, favourite,
 * album, rating, dive site), not on ordinary navigation. Those buttons carry data-haptic.
 *
 * Android: a short vibration through the browser's Vibration API.
 *
 * iPhone: Safari has no Vibration API, but the iOS on/off switch (<input type="checkbox" switch>)
 * clicks haptically when it is flipped. Since iOS 26.5 only a real touch on the switch or its
 * <label> does that; a switch flipped by script stays silent. So every data-haptic button holds an
 * invisible <label> with a switch (<Haptic />): the finger hits the label, the iPhone clicks, and
 * the click is passed on to the button. A trick, not an official API: if Apple removes it, only
 * the click is missing. Same approach as in OpernLog (src/haptik.js), where it works on iOS 27.
 */

/** iPhone and iPad (iPadOS presents itself as a Mac with a touch screen). */
export const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Android: vibrate briefly on every tap on a [data-haptic] element. Once at start. */
export function setupHaptics() {
  if (isIos() || typeof navigator.vibrate !== 'function') return;
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-haptic]') : null;
      if (!target || (target as HTMLButtonElement).disabled) return;
      try {
        navigator.vibrate(10);
      } catch {
        // No vibration, nothing else.
      }
    },
    true,
  );
}

/**
 * Invisible switch surface for the iPhone; render it as the last child of a [data-haptic]
 * button. Elsewhere it renders nothing.
 */
export function Haptic() {
  const ref = useRef<HTMLLabelElement>(null);
  const ios = isIos();

  useEffect(() => {
    const surface = ref.current;
    if (!surface) return;
    const toggle = surface.querySelector('input')!;
    toggle.setAttribute('switch', '');
    // The finger hits the label. The label keeps its click to itself; the browser then flips the
    // switch (that is when the iPhone clicks), and only afterwards a click goes to the button, at
    // the finger's position. Passing the click on at once could let the button re-render or
    // close its sheet before the switch flips, and the iPhone would stay silent.
    const keepToggleClick = (e: Event) => e.stopPropagation();
    const passOn = (e: MouseEvent) => {
      e.stopPropagation();
      const target = surface.parentElement;
      const at = { clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
      setTimeout(() => {
        if (!target || !target.isConnected || (target as HTMLButtonElement).disabled) return;
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...at }));
      }, 0);
    };
    toggle.addEventListener('click', keepToggleClick);
    surface.addEventListener('click', passOn);
    return () => {
      toggle.removeEventListener('click', keepToggleClick);
      surface.removeEventListener('click', passOn);
    };
  }, [ios]);

  if (!ios) return null;
  return (
    <label ref={ref} className="haptic-surface" aria-hidden="true">
      <input type="checkbox" tabIndex={-1} />
    </label>
  );
}

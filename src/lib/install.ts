import { useSyncExternalStore } from 'react';

/*
 * Installing the web app, and keeping its data.
 *
 * On the iPhone, Safari deletes the storage of a website that was not opened for seven days of
 * browsing – the logbook of someone without an account included. An app on the home screen is
 * exempt. Other browsers may clear storage when the device runs low; storage marked persistent is
 * kept. Hence the hint to install (src/ui/DeviceNotice.tsx) and the request for persistent storage
 * after the first change.
 */

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Called once at startup: Chrome on Android offers installing only through this early event. */
export function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // the app's own hint offers it instead of the browser's mini bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** The browser's install dialog, where it offers one (Chrome on Android), else null. */
export function useInstallPrompt(): (() => Promise<boolean>) | null {
  const event = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred,
  );
  if (!event) return null;
  return async () => {
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
  };
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export type DevicePlatform = 'ios' | 'android' | 'other';

export function devicePlatform(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints): DevicePlatform {
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

let asked = false;

/**
 * Asks the browser to keep the app's data even when storage runs low. Most browsers decide on
 * their own (installed apps get it); Firefox asks the user, which is why this waits for the first
 * change instead of running at startup. Once per session.
 */
export async function requestPersistentStorage(): Promise<void> {
  if (asked) return;
  asked = true;
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch {
    // Not supported – nothing to do.
  }
}

import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './icons/Icon';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

let registrationRef: ServiceWorkerRegistration | undefined;

export type UpdateCheck = 'available' | 'current' | 'offline' | 'unsupported';

/** Manual check from the profile screen; a found update also shows the banner. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const reg = registrationRef ?? (await navigator.serviceWorker?.getRegistration().catch(() => undefined));
  if (!reg) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  if (reg.waiting) return 'available';
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  if (reg.waiting) return 'available';
  const installing = reg.installing;
  if (!installing) return 'current';
  // The new version is still downloading: wait until it is ready (or gives up).
  return new Promise<UpdateCheck>((resolve) => {
    const timer = setTimeout(() => resolve('current'), 30_000);
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        clearTimeout(timer);
        resolve('available');
      } else if (installing.state === 'redundant') {
        clearTimeout(timer);
        resolve('current');
      }
    });
  });
}

/**
 * Installed iOS web apps are usually resumed rather than restarted, so a new version would
 * only arrive after the app is closed completely. We look for updates on start, whenever the
 * app comes back to the foreground and every 30 minutes, and offer a reload instead of forcing
 * one (a forced reload could drop a half-filled form or a sign-in code being typed).
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      registrationRef = registration;
      let last = 0;
      const check = () => {
        if (!navigator.onLine || Date.now() - last < MIN_GAP_MS) return;
        last = Date.now();
        void registration.update().catch(() => undefined);
      };
      setInterval(check, CHECK_EVERY_MS);
      // iOS reports a resumed home-screen app through different events depending on version.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
      window.addEventListener('pageshow', check);
      window.addEventListener('online', check);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span>{t('update.available')}</span>
      <button
        className="btn small primary"
        onClick={() => {
          void updateServiceWorker(true);
          // Fallback when no service worker controls the page yet (first visit): reload plainly.
          setTimeout(() => location.reload(), 1500);
        }}
      >
        <Icon name="sync" />
        {t('update.reload')}
      </button>
    </div>
  );
}

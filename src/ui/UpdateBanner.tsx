import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './icons/Icon';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;

let registrationRef: ServiceWorkerRegistration | undefined;
let showBanner: ((show: boolean) => void) | undefined;

export type UpdateCheck = 'available' | 'current' | 'pending' | 'offline' | 'unsupported';
export interface UpdateResult {
  result: UpdateCheck;
  /** Version on the server, when it differs from the running one. */
  version?: string;
}

/** Build that is deployed right now (public/version.json, written at build time). */
async function deployedBuild(): Promise<{ version: string; build: string } | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as { version: string; build: string }) : null;
  } catch {
    return null;
  }
}

/** Resolves true once a new service worker is installed and waiting (false after `ms`). */
function waitForWaiting(reg: ServiceWorkerRegistration, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (reg.waiting) resolve(true);
      else if (Date.now() - started >= ms) resolve(false);
      else setTimeout(tick, 400);
    };
    tick();
  });
}

/**
 * Manual check from the profile screen. Asks the server which build is deployed, so the answer
 * does not depend on when the browser reports a new service worker (Safari does so late).
 * A newer build that is still downloading returns 'pending'; the banner appears once it is ready.
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (!navigator.onLine) return { result: 'offline' };
  const reg = registrationRef ?? (await navigator.serviceWorker?.getRegistration().catch(() => undefined));
  const deployed = await deployedBuild();
  if (deployed && deployed.build === __APP_BUILD__) return { result: 'current' };
  const newer = deployed ? { version: deployed.version } : {};
  if (!reg) return deployed ? { result: 'pending', ...newer } : { result: 'unsupported' };
  if (!reg.waiting) {
    try {
      await reg.update();
    } catch {
      return deployed ? { result: 'pending', ...newer } : { result: 'offline' };
    }
  }
  if (await waitForWaiting(reg, 4000)) {
    showBanner?.(true);
    return { result: 'available', ...newer };
  }
  if (!deployed) return { result: 'current' };
  // Still downloading: keep watching and show the banner when the new version is ready.
  void waitForWaiting(reg, 120_000).then((ready) => ready && showBanner?.(true));
  return { result: 'pending', ...newer };
}

/** Activates a waiting service worker and reloads into the new version. */
function activateWaiting(reg: ServiceWorkerRegistration | undefined): boolean {
  const waiting = reg?.waiting;
  if (!waiting) return false;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(() => location.reload(), 3000);
  return true;
}

/**
 * Last resort when an update does not arrive: drops the service worker and its precache and
 * loads everything fresh from the server. User data lives in IndexedDB and is not touched.
 */
export async function forceReload(): Promise<void> {
  const regs = (await navigator.serviceWorker?.getRegistrations().catch(() => [])) ?? [];
  await Promise.all(regs.map((r) => r.unregister()));
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('workbox-precache')).map((n) => caches.delete(n)));
  }
  location.reload();
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
    needRefresh: [needRefresh, setNeedRefresh],
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

  showBanner = setNeedRefresh;
  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span>{t('update.available')}</span>
      <button
        className="btn small primary"
        onClick={() => {
          // Activate the waiting worker directly (works even if workbox-window missed it).
          if (activateWaiting(registrationRef)) return;
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

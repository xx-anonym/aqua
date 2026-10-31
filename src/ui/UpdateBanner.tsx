import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Icon } from './icons/Icon';

const CHECK_EVERY_MS = 30 * 60 * 1000;

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
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined);
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
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

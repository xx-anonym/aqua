import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDbQuery } from '../db/react';
import { devicePlatform, isStandalone, useInstallPrompt } from '../lib/install';
import { useSync } from '../sync/syncManager';
import { Sheet } from './components';
import { Icon } from './icons/Icon';

const SIGN_IN_KEY = 'aqua-signin-reminder-dismissed-at';
const INSTALL_KEY = 'aqua-install-hint-dismissed-at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

const readDismissed = (key: string) => {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};

function useSnooze(key: string) {
  const [dismissedAt, setDismissedAt] = useState(() => readDismissed(key));
  const snooze = () => {
    const now = Date.now();
    try {
      localStorage.setItem(key, String(now));
    } catch {
      // Private mode: hidden for this session only.
    }
    setDismissedAt(now);
  };
  return [Date.now() - dismissedAt < SNOOZE_MS, snooze] as const;
}

/**
 * One slim line at the top of the main screens, at most one hint at a time:
 * - signed out with entries: they exist only on this device (losing the phone loses them);
 * - on a phone in the browser: install the app (on the iPhone, Safari deletes the data of sites not
 *   opened for seven days; an app on the home screen is exempt).
 * Each can be put off for two weeks.
 */
export function DeviceNotice() {
  const { t } = useTranslation();
  const status = useSync((s) => s.status);
  const checked = useSync((s) => s.authChecked);
  const entries = useDbQuery(
    (d) =>
      d.get<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM dive WHERE deleted_at IS NULL) + (SELECT COUNT(*) FROM sighting WHERE deleted_at IS NULL) AS n`,
      )?.n ?? 0,
  );
  const [signInSnoozed, snoozeSignIn] = useSnooze(SIGN_IN_KEY);
  const [installSnoozed, snoozeInstall] = useSnooze(INSTALL_KEY);
  const [howTo, setHowTo] = useState(false);
  const install = useInstallPrompt();
  const platform = devicePlatform();
  const unsaved = status === 'signedOut' && checked && entries > 0;

  if (unsaved && !signInSnoozed) {
    return (
      <div className="notice warn notice-line" role="note">
        <Icon name="cloud" />
        <span className="grow">{t('deviceNotice.unsaved', { count: entries })}</span>
        <Link className="btn small primary" to="/profile">
          {t('deviceNotice.signIn')}
        </Link>
        <button type="button" className="icon-btn" onClick={snoozeSignIn} aria-label={t('deviceNotice.later')} title={t('deviceNotice.later')}>
          <Icon name="close" />
        </button>
      </div>
    );
  }

  if (platform === 'other' || isStandalone() || installSnoozed) return null;
  return (
    <>
      <div className="notice notice-line" role="note">
        <Icon name="download" />
        <span className="grow">{t(platform === 'ios' ? 'deviceNotice.installIos' : 'deviceNotice.install')}</span>
        <button
          type="button"
          className="btn small primary"
          onClick={() => (install ? void install().then((ok) => ok && snoozeInstall()) : setHowTo(true))}
        >
          {install ? t('deviceNotice.installNow') : t('deviceNotice.howTo')}
        </button>
        <button type="button" className="icon-btn" onClick={snoozeInstall} aria-label={t('deviceNotice.later')} title={t('deviceNotice.later')}>
          <Icon name="close" />
        </button>
      </div>
      {howTo && (
        <Sheet title={t('install.title')} onClose={() => setHowTo(false)}>
          <p>{t(platform === 'ios' ? 'install.whyIos' : 'install.why')}</p>
          <ol className="install-steps">
            {platform === 'ios' ? (
              <>
                <li>
                  {t('install.ios1')} <Icon name="share" />
                </li>
                <li>{t('install.ios2')}</li>
                <li>{t('install.ios3')}</li>
              </>
            ) : (
              <>
                <li>{t('install.android1')}</li>
                <li>{t('install.android2')}</li>
              </>
            )}
          </ol>
          {platform === 'ios' && unsaved && (
            <div className="notice warn">
              <p style={{ margin: '0 0 10px' }}>{t('install.separateStorage', { count: entries })}</p>
              <Link className="btn small primary" to="/profile" onClick={() => setHowTo(false)}>
                {t('deviceNotice.signIn')}
              </Link>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

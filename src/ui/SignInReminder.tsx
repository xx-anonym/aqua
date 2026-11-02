import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDbQuery } from '../db/react';
import { useSync } from '../sync/syncManager';
import { Icon } from './icons/Icon';

const KEY = 'aqua-signin-reminder-dismissed-at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

const readDismissed = () => {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};

/**
 * Without an account, dives and sightings exist only on this device: deleting the app or losing
 * the phone loses them. Shown while signed out and there is something to lose; "Später" hides it
 * for two weeks.
 */
export function SignInReminder() {
  const { t } = useTranslation();
  const status = useSync((s) => s.status);
  const checked = useSync((s) => s.authChecked);
  const entries = useDbQuery(
    (d) =>
      d.get<{ n: number }>(
        `SELECT (SELECT COUNT(*) FROM dive WHERE deleted_at IS NULL) + (SELECT COUNT(*) FROM sighting WHERE deleted_at IS NULL) AS n`,
      )?.n ?? 0,
  );
  const [dismissedAt, setDismissedAt] = useState(readDismissed);

  if (status !== 'signedOut' || !checked || entries === 0 || Date.now() - dismissedAt < SNOOZE_MS) return null;

  const snooze = () => {
    const now = Date.now();
    try {
      localStorage.setItem(KEY, String(now));
    } catch {
      // Private mode: hide for this session only.
    }
    setDismissedAt(now);
  };

  return (
    <div className="notice warn stack" role="note" style={{ gap: 8, marginBottom: 16 }}>
      <strong>{t('signInReminder.title')}</strong>
      <span>{t('signInReminder.text', { count: entries })}</span>
      <div className="row">
        <Link className="btn small primary" to="/profile">
          <Icon name="cloud" />
          {t('signInReminder.signIn')}
        </Link>
        <button type="button" className="btn small outline" onClick={snooze}>
          {t('signInReminder.later')}
        </button>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reportError } from '../lib/errorLog';
import { Icon } from './icons/Icon';

/**
 * Shown instead of a page that failed while drawing (the router catches the error, so it never
 * reaches window.onerror): reports it and offers a way out. The tab bar stays.
 */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  useEffect(() => reportError('render', error), [error]);
  return (
    <div className="page">
      <div className="empty" role="alert">
        <Icon name="close" />
        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{t('routeError.title')}</div>
        <div className="small" style={{ marginTop: 6 }}>
          {t('routeError.text')}
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn primary" onClick={() => location.reload()}>
            {t('routeError.reload')}
          </button>
          <Link className="btn" to="/" reloadDocument>
            {t('routeError.home')}
          </Link>
        </div>
      </div>
    </div>
  );
}

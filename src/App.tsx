import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { bootDb } from './db/boot';
import type { AppDb } from './db/appDb';
import { DbProvider } from './db/react';
import { useSettings } from './settings/settings';
import { FeedbackProvider } from './ui/feedback';
import { UpdateBanner } from './ui/UpdateBanner';
import { hideSplash } from './ui/splash';
import { router } from './router';
import { initCloud } from './sync/syncManager';
import { getCatalog } from './catalog/useCatalog';
import { warmThumbnails } from './lib/offline';

function useApplySettings() {
  const theme = useSettings((s) => s.theme);
  const language = useSettings((s) => s.language);
  const { i18n } = useTranslation();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [i18n, language]);
}

export function App() {
  const [db, setDb] = useState<AppDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  useApplySettings();

  useEffect(() => {
    bootDb()
      .then((d) => {
        initCloud(d);
        setDb(d);
        // Background: make species grids work offline (thumbnails are not precached).
        setTimeout(() => void warmThumbnails(getCatalog(d).species.map((s) => s.thumb)).catch(() => undefined), 4000);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (error) hideSplash(true);
    else if (db) hideSplash();
  }, [db, error]);

  if (error) {
    return (
      <div className="loading" role="alert">
        <strong>{t('boot.error')}</strong>
        <span className="small">{error}</span>
        <button className="btn primary" onClick={() => location.reload()}>
          {t('boot.retry')}
        </button>
      </div>
    );
  }
  if (!db) {
    return (
      <div className="loading" aria-busy="true">
        <div className="spinner" />
        <span>{t('boot.loading')}</span>
      </div>
    );
  }
  return (
    <DbProvider db={db}>
      <FeedbackProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
        <UpdateBanner />
      </FeedbackProvider>
    </DbProvider>
  );
}

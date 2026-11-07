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
import { tidyImageCaches } from './lib/offline';

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
        // A few seconds after start, when the first screen is up: sort out stale cached images.
        window.setTimeout(() => {
          const version = d.get<{ version: string }>('SELECT version FROM cat.catalog_meta')?.version ?? '';
          const addresses = d
            .all<{ a: string }>('SELECT thumb AS a FROM cat.species WHERE thumb IS NOT NULL UNION ALL SELECT file FROM cat.species_photo')
            .map((r) => r.a);
          void tidyImageCaches(addresses, version).catch(() => undefined);
        }, 4000);
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

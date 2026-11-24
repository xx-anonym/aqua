import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCatalog, useLang } from '../catalog/useCatalog';
import { formatBytes } from '../lib/format';
import { devicePlatform, isStandalone } from '../lib/install';
import { fetchManifest, type CatalogManifest } from '../lib/offline';
import { downloadPack, onMeteredConnection, packComplete, usePackJob } from '../lib/offlinePack';
import { Sheet } from './components';
import { useFeedback } from './feedback';
import { Icon } from './icons/Icon';

const KEY = 'aqua-offline-pack';
type Answer = 'accepted' | 'declined';

function readAnswer(): Answer | null {
  try {
    return localStorage.getItem(KEY) as Answer | null;
  } catch {
    return null;
  }
}

function writeAnswer(answer: Answer) {
  try {
    localStorage.setItem(KEY, answer);
  } catch {
    // Private mode: the offer may come again next time.
  }
}

/** Pages where the offer would get in the way: sign-in coming back, a shared album, the dive editor. */
const BUSY_PAGES = /^\/(profile|shared|logbook\/new|logbook\/[^/]+\/edit|sighting\/new)/;

/**
 * On the first start: offers to load the whole offline pack (all pictures), since there is often
 * no network at dive sites. Asked once; "Später" points to the profile, where it stays available.
 * After a yes, an interrupted download continues quietly on the next start (not on mobile data).
 *
 * In Safari on the iPhone the offer waits for the installed app: it keeps its own storage, so
 * pictures loaded in the browser tab would not be there.
 */
export function OfflineOffer() {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const { toast } = useFeedback();
  const { pathname } = useLocation();
  const job = usePackJob();
  const [manifest, setManifest] = useState<CatalogManifest | null>(null);
  const [offer, setOffer] = useState(false);
  const [started, setStarted] = useState(false);
  const thumbs = useMemo(() => catalog.species.map((s) => s.thumb), [catalog]);

  const start = (m: CatalogManifest) => {
    writeAnswer('accepted');
    void downloadPack(m, thumbs).then((failed) => toast(failed ? `${t('offerPack.done')} (${failed} ✕)` : t('offerPack.done')));
  };

  useEffect(() => {
    const answer = readAnswer();
    if (answer === 'declined' || !('caches' in window) || !navigator.onLine) return;
    if (devicePlatform() === 'ios' && !isStandalone()) return;
    let stop = false;
    // A moment after the start, so the first page draws without competing downloads.
    const timer = window.setTimeout(async () => {
      const m = await fetchManifest();
      if (!m || stop || (await packComplete(m, thumbs)) || stop) return;
      setManifest(m);
      if (answer === 'accepted') {
        if (!onMeteredConnection()) start(m);
      } else setOffer(true);
    }, 1500);
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per start
  }, []);

  if (!manifest || !offer || BUSY_PAGES.test(pathname)) return null;

  const close = () => {
    if (!started) writeAnswer('declined');
    setOffer(false);
  };
  const size = formatBytes(manifest.photo_bytes + (manifest.thumb_bytes ?? 0), lang);
  const percent = job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <Sheet
      title={t('offerPack.title')}
      onClose={close}
      footer={
        started ? (
          <button type="button" className="btn primary block" onClick={close}>
            {job.running ? t('offerPack.background') : t('common.close')}
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={close}>
              {t('offerPack.later')}
            </button>
            <button
              type="button"
              className="btn primary block"
              data-haptic
              onClick={() => {
                setStarted(true);
                start(manifest);
              }}
            >
              <Icon name="offline" />
              {t('offerPack.load', { size })}
            </button>
          </>
        )
      }
    >
      <div className="stack">
        <p style={{ margin: 0 }}>{t('offerPack.text', { size })}</p>
        {started ? (
          <>
            <div className="progress" role="progressbar" aria-label={t('offerPack.title')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <div style={{ width: `${percent}%` }} />
            </div>
            <div className="small muted">
              {job.running ? t('offerPack.progress', { done: job.done, total: job.total }) : t('offerPack.done')}
              {job.running && <> · {t('offerPack.useMeanwhile')}</>}
            </div>
          </>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {onMeteredConnection() ? t('offerPack.metered') : t('offerPack.wifi')} {t('offerPack.laterHint')}
          </p>
        )}
      </div>
    </Sheet>
  );
}

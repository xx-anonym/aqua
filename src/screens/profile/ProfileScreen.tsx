import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCatalog, useLang } from '../../catalog/useCatalog';
import { persistNow } from '../../db/boot';
import { useDb } from '../../db/react';
import { formatBytes, formatDateTime } from '../../lib/format';
import { nowIso } from '../../lib/ids';
import {
  cachedPhotoCount,
  cachedThumbCount,
  downloadPhotoPack,
  downloadThumbnails,
  fetchManifest,
  removePhotoPack,
  storageEstimate,
  type CatalogManifest,
} from '../../lib/offline';
import { useSettings, type Language, type Theme } from '../../settings/settings';
import { fetchOAuthProviders, type OAuthProvider } from '../../sync/cloud';
import { sendSignInEmail, signInWithProvider, signOut, syncNow, useSync, verifyCode } from '../../sync/syncManager';
import { exportCsv } from '../../user/io/csv';
import { downloadText, exportFileName } from '../../user/io/importer';
import { exportUddf } from '../../user/io/uddf';
import { Field, PageHeader } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { checkForUpdate, forceReload } from '../../ui/UpdateBanner';
import { PlaceSelect } from '../../ui/PlaceSelect';

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Google's multi-colour "G", as recommended for sign-in buttons. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

function AccountCard() {
  const { t } = useTranslation();
  const lang = useLang();
  const { toast } = useFeedback();
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  // A sign-in link opened from the mail app lands here in the browser, not in the installed app.
  const [cameFromLink] = useState(() => /[?&#](code|error_code|error)=/.test(location.search + location.hash));

  useEffect(() => {
    void fetchOAuthProviders().then(setProviders);
  }, []);

  if (sync.status === 'disabled') return <p className="muted">{t('profile.cloudUnavailable')}</p>;

  const send = async () => {
    setBusy(true);
    try {
      await sendSignInEmail(email.trim());
      setStep('code');
      setCode('');
      setCodeError(false);
    } catch (err) {
      toast(String((err as Error).message));
    } finally {
      setBusy(false);
    }
  };

  if (sync.status === 'signedOut') {
    return (
      <div className="stack">
        {cameFromLink && (
          <p className="notice warn small" role="alert" style={{ margin: 0 }}>
            {t('profile.linkInBrowser')}
          </p>
        )}
        <p className="muted small" style={{ margin: 0 }}>
          {t('profile.notSignedIn')}
        </p>
        {providers.map((p) => (
          <button
            key={p}
            className="btn outline"
            style={{ background: 'var(--surface)' }}
            onClick={() => signInWithProvider(p).catch((e) => toast(e.message))}
          >
            {p === 'google' ? <GoogleLogo /> : <Icon name="profile" />}
            {t('profile.signInWith', { provider: p === 'google' ? 'Google' : 'Apple' })}
          </button>
        ))}
        {providers.length > 0 && (
          <div className="small muted" style={{ textAlign: 'center' }}>
            {t('profile.orEmail')}
          </div>
        )}
        {step === 'email' ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Field label={t('profile.email')}>
              <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <button className="btn primary" type="submit" disabled={busy || !email.includes('@')}>
              <Icon name="mail" />
              {t('profile.sendLink')}
            </button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setCodeError(false);
              try {
                await verifyCode(email.trim(), code);
              } catch {
                setCodeError(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="notice small" style={{ margin: 0 }} aria-live="polite">
              {t('profile.codeSent', { email: email.trim() })}
            </p>
            <Field label={t('profile.code')}>
              <input
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-invalid={codeError}
                style={{ fontSize: '1.4rem', letterSpacing: '0.3em', textAlign: 'center' }}
              />
            </Field>
            {codeError && (
              <p className="notice warn small" role="alert" style={{ margin: 0 }}>
                {t('profile.codeInvalid')}
              </p>
            )}
            <button className="btn primary" type="submit" disabled={busy || code.length < 6}>
              <Icon name="check" />
              {t('profile.verify')}
            </button>
            <div className="row">
              <button type="button" className="btn small outline" disabled={busy} onClick={() => void send()}>
                {t('profile.resend')}
              </button>
              <button type="button" className="btn small outline" onClick={() => setStep('email')}>
                {t('profile.changeEmail')}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      <div style={{ fontWeight: 650 }}>{t('profile.signedInAs', { email: sync.email })}</div>
      <div className="small muted" aria-live="polite">
        {sync.status === 'syncing'
          ? t('profile.syncing')
          : sync.lastSync
            ? t('profile.lastSync', { date: formatDateTime(sync.lastSync, lang) })
            : t('profile.neverSynced')}
        {sync.pending > 0 && ` · ${t('profile.pendingChanges', { count: sync.pending })}`}
      </div>
      {sync.status === 'error' && (
        <p className="notice warn small" role="alert" style={{ margin: 0 }}>
          {t('profile.syncError', { message: sync.error })}
        </p>
      )}
      <div className="row">
        <button className="btn primary" onClick={() => syncNow()} disabled={sync.status === 'syncing'}>
          <Icon name="sync" />
          {t('profile.syncNow')}
        </button>
        <button
          className="btn outline"
          onClick={() => {
            if (confirm(t('profile.signOutConfirm'))) void signOut();
          }}
        >
          <Icon name="logout" />
          {t('profile.signOut')}
        </button>
      </div>
    </div>
  );
}

function OfflineCard() {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const { toast } = useFeedback();
  const [manifest, setManifest] = useState<CatalogManifest | null>(null);
  const [cached, setCached] = useState(0);
  const [thumbsCached, setThumbsCached] = useState(0);
  const [progress, setProgress] = useState<{ kind: 'thumbs' | 'photos'; done: number; total: number } | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const thumbs = catalog.species.map((s) => s.thumb);
  const thumbTotal = thumbs.filter(Boolean).length;

  const refresh = async (m = manifest) => {
    if (m) setCached(await cachedPhotoCount(m));
    setThumbsCached(await cachedThumbCount(thumbs));
    setStorage(await storageEstimate());
  };

  useEffect(() => {
    void fetchManifest().then((m) => {
      setManifest(m);
      void refresh(m);
    });
    return () => abort.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadThumbs = async () => {
    const failed = await downloadThumbnails(thumbs, (done, total) => setProgress({ kind: 'thumbs', done, total }));
    setProgress(null);
    await refresh();
    toast(failed ? `${t('profile.downloaded')} (${failed} ✕)` : t('profile.downloaded'));
  };

  const download = async () => {
    if (!manifest) return;
    abort.current = new AbortController();
    const failed = await downloadPhotoPack(manifest, (done, total) => setProgress({ kind: 'photos', done, total }), abort.current.signal);
    setProgress(null);
    await refresh();
    toast(failed ? `${t('profile.downloaded')} (${failed} ✕)` : t('profile.downloaded'));
  };

  const total = manifest?.photos.length ?? 0;
  const complete = total > 0 && cached >= total;
  const thumbsComplete = thumbTotal > 0 && thumbsCached >= thumbTotal;
  const bar = (kind: 'thumbs' | 'photos') =>
    progress?.kind === kind && (
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
        <div style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
      </div>
    );
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        {t('profile.offlineIntro')}
      </p>
      <div className="small">{t('profile.catalogVersion', { version: catalog.meta.version, count: catalog.species.length })}</div>

      <div className="stack" style={{ gap: 8 }}>
        <div>
          <strong>{t('profile.thumbsTitle')}</strong>
          <div className="small muted">
            {t('profile.thumbsStatus', {
              cached: thumbsCached,
              total: thumbTotal,
              size: manifest?.thumb_bytes ? formatBytes(manifest.thumb_bytes, lang) : '–',
            })}
          </div>
        </div>
        {bar('thumbs')}
        {!thumbsComplete && (
          <button className="btn outline" onClick={downloadThumbs} disabled={!!progress || !navigator.onLine} style={{ alignSelf: 'flex-start' }}>
            <Icon name="offline" />
            {progress?.kind === 'thumbs'
              ? t('profile.downloading', { done: progress.done, total: progress.total })
              : t('profile.thumbsDownload')}
          </button>
        )}
      </div>

      {manifest && total > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <div>
            <strong>{t('profile.photosTitle')}</strong>
            <div className="small muted">{t('profile.photosStatus', { cached, total, size: formatBytes(manifest.photo_bytes, lang) })}</div>
          </div>
          {bar('photos')}
          {!complete && (
            <button className="btn primary" onClick={download} disabled={!!progress || !navigator.onLine} style={{ alignSelf: 'flex-start' }}>
              <Icon name="offline" />
              {progress?.kind === 'photos'
                ? t('profile.downloading', { done: progress.done, total: progress.total })
                : cached > 0
                  ? t('profile.update')
                  : t('profile.download', { size: formatBytes(manifest.photo_bytes, lang) })}
            </button>
          )}
        </div>
      )}

      {(cached > 0 || thumbsCached > 0) && !progress && (
        <button
          className="btn ghost"
          style={{ alignSelf: 'flex-start' }}
          onClick={async () => {
            await removePhotoPack();
            await refresh();
            toast(t('profile.removed'));
          }}
        >
          <Icon name="trash" />
          {t('profile.remove')}
        </button>
      )}
      {storage && storage.quota > 0 && (
        <div className="small muted">
          {t('profile.storage', { used: formatBytes(storage.usage, lang), quota: formatBytes(storage.quota, lang) })}
        </div>
      )}
    </div>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const [checking, setChecking] = useState(false);
  const [updatePending, setUpdatePending] = useState(false);
  const { toast } = useFeedback();
  const settings = useSettings();
  const restoreInput = useRef<HTMLInputElement>(null);

  const backup = () => {
    const bytes = db.exportUser();
    const blob = new Blob([bytes], { type: 'application/vnd.sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aqua-sicherung-${nowIso().slice(0, 10)}.sqlite`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const restore = async (file: File | undefined) => {
    if (!file || !confirm(t('profile.restoreConfirm'))) return;
    try {
      db.replaceUser(new Uint8Array(await file.arrayBuffer()));
      await persistNow(db);
      toast(t('profile.restored'));
    } catch (e) {
      toast(t('import.error', { message: (e as Error).message }));
    }
  };

  return (
    <div className="page">
      <PageHeader title={t('profile.title')} back />

      <h2 className="section-title" style={{ marginTop: 0 }}>
        {t('profile.account')}
      </h2>
      <div className="card">
        <AccountCard />
      </div>

      <h2 className="section-title">{t('profile.offlinePackage')}</h2>
      <div className="card">
        <OfflineCard />
      </div>

      <h2 className="section-title">{t('profile.units')}</h2>
      <div className="card stack">
        <Field label={t('profile.depthUnit')}>
          <Segmented label={t('profile.depthUnit')} value={settings.depthUnit} options={[['m', 'm'], ['ft', 'ft']]} onChange={(v) => settings.set({ depthUnit: v })} />
        </Field>
        <Field label={t('profile.tempUnit')}>
          <Segmented label={t('profile.tempUnit')} value={settings.tempUnit} options={[['c', '°C'], ['f', '°F']]} onChange={(v) => settings.set({ tempUnit: v })} />
        </Field>
        <Field label={t('profile.pressureUnit')}>
          <Segmented label={t('profile.pressureUnit')} value={settings.pressureUnit} options={[['bar', 'bar'], ['psi', 'psi']]} onChange={(v) => settings.set({ pressureUnit: v })} />
        </Field>
      </div>

      <h2 className="section-title">{t('profile.appearance')}</h2>
      <div className="card stack">
        <Field label={t('profile.theme')}>
          <Segmented<Theme>
            label={t('profile.theme')}
            value={settings.theme}
            options={(['system', 'light', 'dark'] as Theme[]).map((v) => [v, t(`profile.themes.${v}`)])}
            onChange={(v) => settings.set({ theme: v })}
          />
        </Field>
        <Field label={t('profile.language')}>
          <Segmented<Language> label={t('profile.language')} value={settings.language} options={[['de', 'Deutsch'], ['en', 'English']]} onChange={(v) => settings.set({ language: v })} />
        </Field>
        <Field label={t('profile.defaultRegion')}>
          <PlaceSelect label={t('profile.defaultRegion')} value={settings.region} onChange={(place) => settings.set({ region: place })} />
        </Field>
      </div>

      <h2 className="section-title">{t('profile.data')}</h2>
      <div className="list">
        <button className="list-item" onClick={() => downloadText(exportFileName('csv'), exportCsv(db, catalog), 'text/csv;charset=utf-8')}>
          <Icon name="download" />
          <div className="grow title">{t('profile.exportCsv')}</div>
        </button>
        <button className="list-item" onClick={() => downloadText(exportFileName('uddf'), exportUddf(db), 'application/xml')}>
          <Icon name="download" />
          <div className="grow title">{t('profile.exportUddf')}</div>
        </button>
        <Link className="list-item" to="/logbook/import">
          <Icon name="upload" />
          <div className="grow title">{t('logbook.import')}</div>
          <Icon name="chevron" />
        </Link>
        <button className="list-item" onClick={backup}>
          <Icon name="download" />
          <div className="grow title">{t('profile.backup')}</div>
        </button>
        <button className="list-item" onClick={() => restoreInput.current?.click()}>
          <Icon name="upload" />
          <div className="grow title">{t('profile.restore')}</div>
        </button>
        <input ref={restoreInput} type="file" aria-label={t('profile.restore')} accept=".sqlite,application/octet-stream,application/vnd.sqlite3" className="sr-only" onChange={(e) => restore(e.target.files?.[0])} />
      </div>

      <h2 className="section-title">{t('profile.about')}</h2>
      <div className="list">
        <Link className="list-item" to="/profile/credits">
          <Icon name="info" />
          <div className="grow title">{t('profile.credits')}</div>
          <Icon name="chevron" />
        </Link>
        <button
          className="list-item"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            try {
              const { result, version } = await checkForUpdate();
              setUpdatePending(result === 'pending');
              toast(t(`update.${result}`, { version: version ?? '' }));
            } finally {
              setChecking(false);
            }
          }}
        >
          <Icon name="sync" />
          <div className="grow title">{checking ? t('update.checking') : t('update.check')}</div>
        </button>
        {updatePending && (
          <button className="list-item" onClick={() => void forceReload()}>
            <Icon name="download" />
            <div className="grow">
              <div className="title">{t('update.force')}</div>
              <div className="sub">{t('update.forceHint')}</div>
            </div>
          </button>
        )}
      </div>
      <p className="small muted">
        {t('profile.aboutText')} {t('profile.version', { version: __APP_VERSION__ })} ·{' '}
        {t('profile.build', { build: __APP_BUILD__, date: formatDateTime(__APP_BUILT_AT__, lang) })}
      </p>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { regionName, useCatalog, useLang } from '../../catalog/useCatalog';
import { persistNow } from '../../db/boot';
import { useDb } from '../../db/react';
import { formatBytes, formatDateTime } from '../../lib/format';
import { nowIso } from '../../lib/ids';
import {
  cachedPhotoCount,
  downloadPhotoPack,
  fetchManifest,
  removePhotoPack,
  storageEstimate,
  type CatalogManifest,
} from '../../lib/offline';
import { useSettings, type Language, type Theme } from '../../settings/settings';
import { oauthProviders } from '../../sync/cloud';
import { sendMagicLink, signInWithProvider, signOut, syncNow, useSync, verifyCode } from '../../sync/syncManager';
import { exportCsv } from '../../user/io/csv';
import { downloadText, exportFileName } from '../../user/io/importer';
import { exportUddf } from '../../user/io/uddf';
import { Field, PageHeader } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function AccountCard() {
  const { t } = useTranslation();
  const lang = useLang();
  const { toast } = useFeedback();
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sync.status === 'disabled') return <p className="muted">{t('profile.cloudUnavailable')}</p>;

  if (sync.status === 'signedOut') {
    return (
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>
          {t('profile.notSignedIn')}
        </p>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await sendMagicLink(email.trim());
              setSent(true);
              toast(t('profile.linkSent'));
            } catch (err) {
              toast(String((err as Error).message));
            } finally {
              setBusy(false);
            }
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
        {sent && (
          <form
            className="row"
            style={{ flexWrap: 'nowrap' }}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await verifyCode(email.trim(), code.trim());
              } catch (err) {
                toast(String((err as Error).message));
              }
            }}
          >
            <input className="input" inputMode="numeric" autoComplete="one-time-code" placeholder={t('profile.code')} aria-label={t('profile.code')} value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn outline" type="submit" disabled={code.trim().length < 6}>
              {t('profile.verify')}
            </button>
          </form>
        )}
        {oauthProviders.map((p) => (
          <button key={p} className="btn outline" onClick={() => signInWithProvider(p).catch((e) => toast(e.message))}>
            {t('profile.signInWith', { provider: p === 'google' ? 'Google' : 'Apple' })}
          </button>
        ))}
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
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refresh = async (m = manifest) => {
    if (m) setCached(await cachedPhotoCount(m));
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

  const download = async () => {
    if (!manifest) return;
    abort.current = new AbortController();
    const failed = await downloadPhotoPack(manifest, (d, total) => setProgress([d, total]), abort.current.signal);
    setProgress(null);
    await refresh();
    toast(failed ? `${t('profile.downloaded')} (${failed} ✕)` : t('profile.downloaded'));
  };

  const total = manifest?.photos.length ?? 0;
  const complete = total > 0 && cached >= total;
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        {t('profile.offlineIntro')}
      </p>
      <div className="small">{t('profile.catalogVersion', { version: catalog.meta.version, count: catalog.species.length })}</div>
      {manifest && (
        <div className="small">
          {t('profile.photosStatus', { cached, total, size: formatBytes(manifest.photo_bytes, lang) })}
        </div>
      )}
      {progress && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress[1]} aria-valuenow={progress[0]}>
          <div style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} />
        </div>
      )}
      <div className="row">
        {manifest && total > 0 && (
          <button className="btn primary" onClick={download} disabled={!!progress || complete || !navigator.onLine}>
            <Icon name="offline" />
            {progress
              ? t('profile.downloading', { done: progress[0], total: progress[1] })
              : cached > 0 && !complete
                ? t('profile.update')
                : t('profile.download', { size: formatBytes(manifest.photo_bytes, lang) })}
          </button>
        )}
        {cached > 0 && !progress && (
          <button
            className="btn outline"
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
      </div>
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
      <PageHeader title={t('profile.title')} />

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
          <select className="input" value={settings.region ?? ''} onChange={(e) => settings.set({ region: e.target.value || null })}>
            <option value="">{t('filter.allRegions')}</option>
            {catalog.regionTree().map((r) => (
              <option key={r.id} value={r.id}>
                {r.parentId ? '— ' : ''}
                {regionName(r, lang)}
              </option>
            ))}
          </select>
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
        <input ref={restoreInput} type="file" accept=".sqlite,application/octet-stream,application/vnd.sqlite3" className="sr-only" onChange={(e) => restore(e.target.files?.[0])} />
      </div>

      <h2 className="section-title">{t('profile.about')}</h2>
      <div className="list">
        <Link className="list-item" to="/profile/credits">
          <Icon name="info" />
          <div className="grow title">{t('profile.credits')}</div>
          <Icon name="chevron" />
        </Link>
      </div>
      <p className="small muted">
        {t('profile.aboutText')} {t('profile.version', { version: __APP_VERSION__ })}
      </p>
    </div>
  );
}

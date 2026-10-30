import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb } from '../../db/react';
import { formatDate } from '../../lib/format';
import { formatDepth, formatDuration } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { findDuplicates, importDives, parseDiveFile } from '../../user/io/importer';
import type { ImportedDive } from '../../user/io/types';
import { PageHeader } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';

export default function ImportScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const depthUnit = useSettings((s) => s.depthUnit);
  const [dives, setDives] = useState<ImportedDive[]>([]);
  const [dupes, setDupes] = useState<boolean[]>([]);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = parseDiveFile(file.name, await file.text());
      const d = findDuplicates(db, parsed);
      setDives(parsed);
      setDupes(d);
      setSelected(d.map((x) => !x));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === 'unsupported' ? t('import.unsupported') : t('import.error', { message: msg }));
      setDives([]);
    } finally {
      setBusy(false);
    }
  };

  const count = selected.filter(Boolean).length;
  const run = () => {
    const n = importDives(db, catalog, dives.filter((_, i) => selected[i]));
    toast(t('import.done', { count: n }));
    navigate('/logbook');
  };

  return (
    <div className="page">
      <PageHeader title={t('import.title')} back="/logbook" />
      <p className="muted">{t('import.intro')}</p>
      <label className="btn primary block">
        <Icon name="upload" />
        {t('import.choose')}
        <input
          type="file"
          accept=".uddf,.xml,.ssrf,.csv,.txt,application/xml,text/csv"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {busy && <p aria-live="polite">{t('import.parsing')}</p>}
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}
      {dives.length > 0 && (
        <>
          <h3 className="section-title">{t('import.found', { count: dives.length })}</h3>
          <div className="list">
            {dives.map((d, i) => (
              <label key={i} className="list-item" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selected[i]}
                  onChange={(e) => setSelected((s) => s.map((x, j) => (j === i ? e.target.checked : x)))}
                  style={{ width: 24, height: 24 }}
                />
                <div className="grow">
                  <div className="title">
                    {d.dive_no ? `#${d.dive_no} · ` : ''}
                    {formatDate(d.date, lang)} {d.entry_time ?? ''}
                  </div>
                  <div className="sub">
                    {[
                      d.site?.name,
                      d.max_depth_m != null ? formatDepth(d.max_depth_m, depthUnit, lang) : null,
                      d.duration_min != null ? formatDuration(d.duration_min) : null,
                      d.profile.length ? t('import.withProfile') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {dupes[i] && (
                    <div className="small" style={{ color: 'var(--accent)', fontWeight: 650 }}>
                      {t('import.duplicate')}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
          <button className="btn primary block" style={{ marginTop: 16 }} disabled={!count} onClick={run}>
            <Icon name="check" />
            {t('import.importSelected', { count })}
          </button>
        </>
      )}
    </div>
  );
}

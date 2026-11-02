import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLang, useCatalog } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { formatDate } from '../../lib/format';
import { formatDepth, formatDuration } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { listDives } from '../../user/dives';
import { exportCsv } from '../../user/io/csv';
import { downloadText, exportFileName } from '../../user/io/importer';
import { exportUddf } from '../../user/io/uddf';
import { logStats } from '../../user/stats';
import { unidentifiedSightings, type SightingWithContext } from '../../user/sightings';
import { AddSightingSheet, SightingThumb } from '../sighting/AddSightingSheet';
import { EmptyState, PageHeader, Sheet, Stars } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { SignInReminder } from '../../ui/SignInReminder';

export default function LogbookScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const { toast } = useFeedback();
  const depthUnit = useSettings((s) => s.depthUnit);
  const dives = useDbQuery((d) => listDives(d));
  const stats = useDbQuery((d) => logStats(d));
  const [exportOpen, setExportOpen] = useState(false);
  const unidentified = useDbQuery((d) => unidentifiedSightings(d));
  const [editing, setEditing] = useState<SightingWithContext | null>(null);

  const doExport = (kind: 'csv' | 'uddf') => {
    if (kind === 'csv') downloadText(exportFileName('csv'), exportCsv(db, catalog), 'text/csv;charset=utf-8');
    else downloadText(exportFileName('uddf'), exportUddf(db), 'application/xml');
    setExportOpen(false);
    toast(t('logbook.exported'));
  };

  return (
    <div className="page">
      <PageHeader
        title={t('logbook.title')}
        actions={
          <>
            <Link className="icon-btn" to="/logbook/sites" aria-label={t('logbook.sites')} title={t('logbook.sites')}>
              <Icon name="map" />
            </Link>
            <Link className="icon-btn" to="/logbook/import" aria-label={t('logbook.import')} title={t('logbook.import')}>
              <Icon name="upload" />
            </Link>
            <button className="icon-btn" onClick={() => setExportOpen(true)} aria-label={t('logbook.export')} title={t('logbook.export')} disabled={!dives.length}>
              <Icon name="download" />
            </button>
          </>
        }
      />
      <SignInReminder />
      <div className="stats" aria-label={t('logbook.statsLabel')}>
        <div className="stat">
          <div className="value">{stats.diveCount}</div>
          <div className="label">{t('logbook.stats.dives')}</div>
        </div>
        <div className="stat">
          <div className="value">{formatDuration(stats.totalMinutes)}</div>
          <div className="label">{t('logbook.stats.time')}</div>
        </div>
        <div className="stat">
          <div className="value">{formatDepth(stats.deepestM, depthUnit, lang)}</div>
          <div className="label">{t('logbook.stats.deepest')}</div>
        </div>
        <div className="stat">
          <div className="value">{stats.countries}</div>
          <div className="label">{t('logbook.stats.countries')}</div>
        </div>
        <div className="stat">
          <div className="value">{stats.speciesCount}</div>
          <div className="label">{t('logbook.stats.species')}</div>
        </div>
      </div>

      <div className="row" style={{ margin: '16px 0' }}>
        <Link className="btn primary" to="/logbook/new">
          <Icon name="plus" />
          {t('logbook.newDive')}
        </Link>
      </div>

      {unidentified.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {t('logbook.unidentified', { count: unidentified.length })}
          </h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            {t('logbook.unidentifiedHint')}
          </p>
          <div className="list">
            {unidentified.map((s) => (
              <button key={s.id} type="button" className="list-item" onClick={() => setEditing(s)}>
                <div className="list-thumb">
                  <SightingThumb photoUri={s.photo_uri} species={null} />
                </div>
                <div className="grow">
                  <div className="title">{s.note || t('sighting.unidentified')}</div>
                  <div className="sub">
                    {formatDate(s.seen_at, lang)} · {s.dive_id ? `#${s.dive_no ?? '–'} · ${s.site_name ?? t('dive.noSite')}` : t('sighting.withoutDive')}
                  </div>
                </div>
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </section>
      )}
      {editing && <AddSightingSheet species={null} sighting={editing} onClose={() => setEditing(null)} />}

      {dives.length === 0 ? (
        <EmptyState icon="logbook" title={t('logbook.empty')}>
          {t('logbook.emptyHint')}
        </EmptyState>
      ) : (
        <div className="list">
          {dives.map((d) => (
            <Link key={d.id} to={`/logbook/${d.id}`} className="list-item">
              <div className="dive-no">{d.dive_no ?? '–'}</div>
              <div className="grow">
                <div className="title">{d.site_name ?? t('dive.noSite')}</div>
                <div className="sub">
                  {formatDate(d.date, lang)}
                  {d.max_depth_m != null && ` · ${formatDepth(d.max_depth_m, depthUnit, lang)}`}
                  {d.duration_min != null && ` · ${formatDuration(d.duration_min)}`}
                  {d.sighting_count > 0 && ` · ${t('logbook.speciesSeen', { count: d.sighting_count })}`}
                </div>
                <Stars value={d.rating} />
              </div>
              <Icon name="chevron" />
            </Link>
          ))}
        </div>
      )}

      {exportOpen && (
        <Sheet title={t('logbook.export')} onClose={() => setExportOpen(false)}>
          <div className="stack">
            <button className="btn outline block" onClick={() => doExport('csv')}>
              <Icon name="download" />
              {t('logbook.exportCsv')}
            </button>
            <button className="btn outline block" onClick={() => doExport('uddf')}>
              <Icon name="download" />
              {t('logbook.exportUddf')}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

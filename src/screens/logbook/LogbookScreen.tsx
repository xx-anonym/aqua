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

/** Dives grouped by year, newest year first (the list is already sorted by date). */
function byYear<T extends { date: string }>(dives: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const d of dives) {
    const year = d.date.slice(0, 4);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(d);
  }
  return [...groups];
}

export default function LogbookScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const { toast } = useFeedback();
  const depthUnit = useSettings((s) => s.depthUnit);
  const dives = useDbQuery((d) => listDives(d));
  const stats = useDbQuery((d) => logStats(d));
  const [menuOpen, setMenuOpen] = useState(false);
  const unidentified = useDbQuery((d) => unidentifiedSightings(d));
  const [editing, setEditing] = useState<SightingWithContext | null>(null);

  const doExport = (kind: 'csv' | 'uddf') => {
    if (kind === 'csv') downloadText(exportFileName('csv'), exportCsv(db, catalog), 'text/csv;charset=utf-8');
    else downloadText(exportFileName('uddf'), exportUddf(db), 'application/xml');
    setMenuOpen(false);
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
            <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label={t('logbook.more')} title={t('logbook.more')} aria-haspopup="dialog">
              <Icon name="more" />
            </button>
          </>
        }
      />
      <SignInReminder />
      {dives.length > 0 && (
        <div className="stats" role="group" aria-label={t('logbook.statsLabel')}>
          {(
            [
              [stats.diveCount, 'dives'],
              [stats.totalMinutes ? formatDuration(stats.totalMinutes) : '–', 'time'],
              [formatDepth(stats.deepestM, depthUnit, lang), 'deepest'],
              [stats.sites, 'sites'],
              [stats.countries, 'countries'],
              [stats.speciesCount, 'species'],
            ] as const
          ).map(([value, key]) => (
            <div className="stat" key={key}>
              <div className="value">{value}</div>
              <div className="label">{t(`logbook.stats.${key}`)}</div>
            </div>
          ))}
        </div>
      )}

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
        byYear(dives).map(([year, group]) => (
          <section key={year} aria-label={year}>
            <h3 className="list-group-title">
              <span>{year}</span>
              <span className="small muted">{t('logbook.yearCount', { count: group.length })}</span>
            </h3>
            <div className="list">
              {group.map((d) => (
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
          </section>
        ))
      )}

      {menuOpen && (
        <Sheet title={t('logbook.more')} onClose={() => setMenuOpen(false)}>
          <div className="list">
            <Link className="list-item" to="/logbook/import" onClick={() => setMenuOpen(false)}>
              <Icon name="upload" />
              <div className="grow">
                <div className="title">{t('logbook.import')}</div>
                <div className="sub">{t('logbook.importHint')}</div>
              </div>
              <Icon name="chevron" />
            </Link>
            {dives.length > 0 && (
              <>
                <button className="list-item" onClick={() => doExport('csv')}>
                  <Icon name="download" />
                  <div className="grow">
                    <div className="title">{t('logbook.exportCsv')}</div>
                    <div className="sub">{t('logbook.exportHint')}</div>
                  </div>
                </button>
                <button className="list-item" onClick={() => doExport('uddf')}>
                  <Icon name="download" />
                  <div className="grow">
                    <div className="title">{t('logbook.exportUddf')}</div>
                  </div>
                </button>
              </>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

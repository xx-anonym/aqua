import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLang, useCatalog } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { formatDate } from '../../lib/format';
import { formatDepth, formatDuration, formatDurationShort } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { listDives } from '../../user/dives';
import { diveCountries, diveYears, emptyDiveFilter, filterDives, isFilterActive, type DiveFilter } from '../../user/diveFilter';
import { useSessionState } from '../../lib/sessionState';
import { exportCsv } from '../../user/io/csv';
import { downloadText, exportFileName } from '../../user/io/importer';
import { exportUddf } from '../../user/io/uddf';
import { logStats } from '../../user/stats';
import { unidentifiedSightings, type SightingWithContext } from '../../user/sightings';
import { AddSightingSheet, SightingThumb } from '../sighting/AddSightingSheet';
import { EmptyState, PageHeader, Sheet, Stars } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { DeviceNotice } from '../../ui/DeviceNotice';

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
  const [filter, setFilter] = useSessionState<DiveFilter>('logbook.filter', emptyDiveFilter);
  const sightingRows = useDbQuery((d) =>
    d.all<{ dive_id: string; species_id: string; note: string | null }>(
      'SELECT dive_id, species_id, note FROM sighting WHERE deleted_at IS NULL AND dive_id IS NOT NULL',
    ),
  );
  // Searchable text per dive: names of the species seen on it and the notes of its sightings.
  const sightingText = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of sightingRows) {
      const sp = catalog.byId.get(r.species_id);
      const words = [sp?.nameDe, sp?.nameEn, sp?.scientificName, r.note].filter(Boolean).join(' ');
      map.set(r.dive_id, `${map.get(r.dive_id) ?? ''} ${words}`);
    }
    return map;
  }, [sightingRows, catalog]);
  const shown = useMemo(() => filterDives(dives, filter, sightingText), [dives, filter, sightingText]);
  const years = useMemo(() => diveYears(dives), [dives]);
  const countries = useMemo(() => diveCountries(dives), [dives]);
  const filtering = isFilterActive(filter);

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
      <DeviceNotice />
      {dives.length > 0 && (
        // The key figures as one line; the page behind it has all of them and the charts.
        <Link className="stats-line" to="/logbook/stats" aria-label={`${t('logbook.statsLabel')}: ${t('logbook.allStats')}`}>
          {(
            [
              [stats.diveCount, 'dives'],
              [stats.totalMinutes ? formatDurationShort(stats.totalMinutes) : '–', 'time'],
              [stats.speciesCount, 'species'],
            ] as const
          ).map(([value, key]) => (
            <span className="stat-mini" key={key}>
              <strong>{value}</strong>
              <span>{t(`logbook.stats.${key}`)}</span>
            </span>
          ))}
          <Icon name="chevron" />
        </Link>
      )}

      {dives.length > 1 && (
        <div className="logbook-filter" role="search">
          <label className="search">
            <Icon name="search" />
            <input
              className="input"
              type="search"
              value={filter.query}
              placeholder={t('logbook.searchPlaceholder')}
              aria-label={t('logbook.search')}
              onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            />
          </label>
          <div className="filter-pills">
            <select
              className={`pill-select${filter.year ? ' on' : ''}`}
              aria-label={t('logbook.year')}
              value={filter.year ?? ''}
              onChange={(e) => setFilter({ ...filter, year: e.target.value || null })}
            >
              <option value="">{t('logbook.allYears')}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            {countries.length > 0 && (
              <select
                className={`pill-select${filter.country ? ' on' : ''}`}
                aria-label={t('logbook.country')}
                value={filter.country ?? ''}
                onChange={(e) => setFilter({ ...filter, country: e.target.value || null })}
              >
                <option value="">{t('logbook.allCountries')}</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
          {filtering && (
            <div className="row spread small filter-count" aria-live="polite">
              <span className="muted">{t('logbook.filtered', { shown: shown.length, total: dives.length })}</span>
              <button type="button" className="btn small ghost" onClick={() => setFilter(emptyDiveFilter())} data-haptic>
                {t('logbook.resetFilter')}
              </button>
            </div>
          )}
        </div>
      )}

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
          <div className="stack" style={{ alignItems: 'center', marginTop: 14 }}>
            <Link className="btn primary" to="/logbook/new" data-haptic>
              <Icon name="plus" />
              {t('logbook.newDive')}
            </Link>
            <Link className="btn outline" to="/logbook/import">
              <Icon name="upload" />
              {t('logbook.import')}
            </Link>
          </div>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon="search" title={t('logbook.noMatches')} />
      ) : (
        byYear(shown).map(([year, group]) => (
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

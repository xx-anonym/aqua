import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLang } from '../../catalog/useCatalog';
import { useDbQuery } from '../../db/react';
import { formatDate } from '../../lib/format';
import { depthToUnit, formatDepth, formatDurationShort, unitLabel } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { depthBins, diveAverages, divesPerYear, logStats, sightingSites, speciesOverTime, type DepthBin } from '../../user/stats';
import { ColumnChart, StepLineChart } from '../../ui/charts';
import { EmptyState, PageHeader } from '../../ui/components';
import { SitesMap } from '../../ui/maps';

/** Statistics of the logbook: key figures, dives per year, depth distribution, species over time, map. */
export default function StatsScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const depthUnit = useSettings((s) => s.depthUnit);
  const stats = useDbQuery((d) => logStats(d));
  const averages = useDbQuery((d) => diveAverages(d));
  const years = useDbQuery((d) => divesPerYear(d));
  const bins = useDbQuery((d) => depthBins(d));
  const species = useDbQuery((d) => speciesOverTime(d));
  const sites = useDbQuery((d) => sightingSites(d));
  const today = new Date().toISOString().slice(0, 10);

  const unit = unitLabel(depthUnit);
  const binLabel = (b: DepthBin) => {
    const v = (m: number) => Math.round(depthToUnit(m, depthUnit));
    return b.toM == null ? `${v(b.fromM)}+` : `${v(b.fromM)}–${v(b.toM)}`;
  };
  const mapSites = useMemo(
    () =>
      sites.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        subtitle: `${t('statistics.siteSpecies', { count: s.species })} · ${t('sites.dives', { count: s.dives })}`,
      })),
    [sites, t],
  );

  if (!stats.diveCount && !species.length) {
    return (
      <div className="page">
        <PageHeader title={t('statistics.title')} back="/logbook" />
        <EmptyState icon="logbook" title={t('logbook.empty')}>
          {t('logbook.emptyHint')}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={t('statistics.title')} back="/logbook" />
      <div className="stats" role="group" aria-label={t('logbook.statsLabel')}>
        {(
          [
            [stats.diveCount, t('logbook.stats.dives')],
            [stats.totalMinutes ? formatDurationShort(stats.totalMinutes) : '–', t('logbook.stats.time')],
            [stats.speciesCount, t('logbook.stats.species')],
            [formatDepth(stats.deepestM, depthUnit, lang), t('logbook.stats.deepest')],
            [formatDepth(averages.depthM, depthUnit, lang), t('statistics.avgDepth')],
            [formatDurationShort(averages.minutes), t('statistics.avgTime')],
          ] as const
        ).map(([value, label]) => (
          <div className="stat" key={label}>
            <div className="value">{value}</div>
            <div className="label">{label}</div>
          </div>
        ))}
      </div>

      {years.length > 0 && (
        <section className="card chart-card">
          <h2>{t('statistics.divesPerYear')}</h2>
          <ColumnChart
            title={t('statistics.divesPerYear')}
            data={years.map((y) => ({ key: y.year, label: y.year, value: y.count }))}
            describe={(c) => t('statistics.divesInYear', { year: c.label, count: c.value })}
            head={[t('statistics.year'), t('statistics.dives')]}
          />
        </section>
      )}

      {bins.length > 0 && (
        <section className="card chart-card">
          <h2>{t('statistics.depth')}</h2>
          <ColumnChart
            title={t('statistics.depth')}
            data={bins.map((b) => ({ key: String(b.fromM), label: binLabel(b), value: b.count }))}
            describe={(c) => t('statistics.divesInRange', { range: `${c.label} ${unit}`, count: c.value })}
            head={[t('statistics.depthRange', { unit }), t('statistics.dives')]}
          />
        </section>
      )}

      {species.length > 0 && (
        <section className="card chart-card">
          <h2>{t('statistics.speciesOverTime')}</h2>
          <p className="small muted">{t('statistics.speciesHint')}</p>
          <StepLineChart
            title={t('statistics.speciesOverTime')}
            data={species.map((s) => ({ date: s.date, value: s.total }))}
            until={today > species[species.length - 1].date ? today : species[species.length - 1].date}
            describe={(s) => t('statistics.speciesUntil', { date: formatDate(s.date, lang), count: s.value })}
            formatDate={(iso) => formatDate(iso, lang)}
            head={[t('statistics.date'), t('statistics.species')]}
          />
        </section>
      )}

      <section className="card chart-card">
        <h2>{t('statistics.map')}</h2>
        {mapSites.length ? (
          <>
            <p className="small muted">{t('statistics.mapHint')}</p>
            <SitesMap sites={mapSites} />
            {!navigator.onLine && <p className="small muted">{t('sites.offlineMap')}</p>}
          </>
        ) : (
          <p className="small muted">{t('statistics.noMapSites')}</p>
        )}
      </section>
    </div>
  );
}

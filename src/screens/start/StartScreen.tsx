import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { regionName, speciesName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDbQuery } from '../../db/react';
import { relativeDay, shortDate } from '../../lib/format';
import { todayLocal } from '../../lib/ids';
import { formatDepth, formatDuration } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { listDives } from '../../user/dives';
import { anniversaries, firstSightingsSince, regionOfSite } from '../../user/home';
import { lifeList, progressOf } from '../../user/lifelist';
import { sightingsForDive, unidentifiedSightings } from '../../user/sightings';
import { DeviceNotice } from '../../ui/DeviceNotice';
import { PageHeader, ProgressBar, SpeciesThumb } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';

/**
 * The start page: the own logbook at a glance – the last dive, what still needs a species, a dive
 * on this day in earlier years, the progress in the region of the last dive and the newest
 * species. Without entries: the ways in. Identifying by photo or traits, which left the tab bar
 * for this page, has its own card here (and stays in the + menu).
 */
export default function StartScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const depthUnit = useSettings((s) => s.depthUnit);
  const settingsRegion = useSettings((s) => s.region);
  const today = todayLocal();
  const dives = useDbQuery((d) => listDives(d));
  const seen = useDbQuery((d) => lifeList(d));
  const unidentified = useDbQuery((d) => unidentifiedSightings(d));
  const last = dives[0] ?? null;
  const lastSpecies = useDbQuery((d) => (last ? sightingsForDive(d, last.id).map((s) => s.species_id) : []), [last?.id]);
  const lastRegion = useDbQuery((d) => regionOfSite(d, last?.site_id ?? null), [last?.site_id]);
  const regionId = lastRegion ?? settingsRegion;
  const onThisDay = useMemo(() => anniversaries(dives, today), [dives, today]);
  const year = today.slice(0, 4);
  const newThisYear = useMemo(() => firstSightingsSince(seen, `${year}-01-01`), [seen, year]);
  const progress = useMemo(() => progressOf(catalog.speciesInRegion(regionId), seen), [catalog, regionId, seen]);
  const region = regionId ? catalog.regionsById.get(regionId) : undefined;
  const newest = useMemo(() => firstSightingsSince(seen, '0000-01-01').slice(0, 8), [seen]);

  const identifyCard = (
    <Link className="card start-identify" to="/identify" data-haptic>
      <span className="start-icon">
        <Icon name="identify" />
      </span>
      <span className="grow">
        <strong>{t('start.identify')}</strong>
        <span className="small muted">{t('start.identifyHint')}</span>
      </span>
      <Icon name="chevron" />
    </Link>
  );

  if (!dives.length && !seen.size) {
    return (
      <div className="page">
        <PageHeader title={t('start.title')} />
        <DeviceNotice />
        <section className="card start-welcome">
          <h2>{t('start.welcome')}</h2>
          <p className="muted">{t('start.welcomeText')}</p>
          <div className="stack" style={{ gap: 8 }}>
            <Link className="btn primary" to="/logbook/new" data-haptic>
              <Icon name="plus" />
              {t('start.firstDive')}
            </Link>
            <Link className="btn" to="/logbook/import">
              <Icon name="download" />
              {t('start.importDives')}
            </Link>
            <Link className="btn" to="/discover">
              <Icon name="discover" />
              {t('start.discover')}
            </Link>
          </div>
        </section>
        {identifyCard}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={t('start.title')} />
      <DeviceNotice />

      {onThisDay.map(({ dive, years }) => (
        <Link key={dive.id} className="card start-memory" to={`/logbook/${dive.id}`}>
          <span className="kicker">
            <Icon name="calendar" />
            {t('start.onThisDay', { count: years })}
          </span>
          <strong>{dive.site_name ?? t('dive.noSite')}</strong>
          <span className="small muted">
            {[`#${dive.dive_no ?? '–'}`, dive.country, dive.sighting_count ? t('logbook.speciesSeen', { count: dive.sighting_count }) : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </Link>
      ))}

      {last && (
        <section aria-labelledby="start-last">
          <h2 className="section-title" id="start-last">
            {t('start.lastDive')}
          </h2>
          <Link className="card start-dive" to={`/logbook/${last.id}`}>
            <span className="start-dive-head">
              <span className="dive-no">{last.dive_no ?? '–'}</span>
              <span className="grow">
                <strong>{last.site_name ?? t('dive.noSite')}</strong>
                <span className="small muted">
                  {[
                    relativeDay(last.date, lang, today),
                    last.max_depth_m != null ? formatDepth(last.max_depth_m, depthUnit, lang) : null,
                    last.duration_min != null ? formatDuration(last.duration_min) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Icon name="chevron" />
            </span>
            {lastSpecies.length > 0 && (
              <span className="start-thumbs" aria-label={t('logbook.speciesSeen', { count: lastSpecies.length })}>
                {lastSpecies.slice(0, 5).map((id, i) => {
                  const sp = catalog.byId.get(id);
                  return sp ? (
                    <span className="thumb" key={`${id}-${i}`}>
                      <SpeciesThumb species={sp} alt={speciesName(sp, lang)} />
                    </span>
                  ) : null;
                })}
                {lastSpecies.length > 5 && <span className="more">+{lastSpecies.length - 5}</span>}
              </span>
            )}
          </Link>
        </section>
      )}

      {unidentified.length > 0 && (
        <Link className="notice warn start-todo" to="/logbook">
          <Icon name="search" />
          <span className="grow">{t('start.unidentified', { count: unidentified.length })}</span>
          <Icon name="chevron" />
        </Link>
      )}

      {seen.size > 0 && (
        <section aria-labelledby="start-progress">
          <h2 className="section-title" id="start-progress">
            {t('start.progress')}
          </h2>
          <Link className="card start-progress" to="/collection">
            <span className="start-figures">
              <span>
                <strong>{seen.size}</strong>
                <span className="small muted">{t('start.speciesSeen', { count: seen.size })}</span>
              </span>
              <span>
                <strong>{newThisYear.length}</strong>
                <span className="small muted">{t('start.newIn', { year })}</span>
              </span>
            </span>
            <ProgressBar
              seen={progress.seen}
              total={progress.total}
              label={region ? regionName(region, lang) : t('start.inCatalog')}
            />
          </Link>
          {newest.length > 0 && (
            <>
              <h3 className="small muted start-subtitle">{t('start.newest')}</h3>
              <div className="start-newest">
                {newest.map((e) => {
                  const sp = catalog.byId.get(e.speciesId);
                  return sp ? (
                    <Link key={e.speciesId} to={`/species/${sp.id}`} className="start-species">
                      <span className="thumb">
                        <SpeciesThumb species={sp} />
                      </span>
                      <span className="name">{speciesName(sp, lang)}</span>
                      <span className="small muted">{shortDate(e.firstSeen, lang, year)}</span>
                    </Link>
                  ) : null;
                })}
              </div>
            </>
          )}
        </section>
      )}

      <h2 className="section-title">{t('start.more')}</h2>
      {identifyCard}
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { speciesName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { formatDate } from '../../lib/format';
import { formatDepth, formatDuration, formatNumber, formatPressure, formatTemp } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { deleteDive, getDive } from '../../user/dives';
import { getSite } from '../../user/sites';
import { deleteSighting, sightingsForDive } from '../../user/sightings';
import { EmptyState, PageHeader, SpeciesThumb, Stars } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { AddSightingSheet } from '../sighting/AddSightingSheet';
import { SpeciesPickerSheet } from '../sighting/SpeciesPickerSheet';
import { ProfileChart } from './ProfileChart';

export default function DiveDetailScreen() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const units = useSettings();
  const dive = useDbQuery((d) => getDive(d, id), [id]);
  const site = useDbQuery((d) => (dive?.site_id ? getSite(d, dive.site_id) : undefined), [dive?.site_id]);
  const sightings = useDbQuery((d) => sightingsForDive(d, id), [id]);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<{ species: Species; via: 'manual' | 'filter' } | null>(null);

  if (!dive) {
    return (
      <div className="page">
        <PageHeader title={t('dive.notFound')} back="/logbook" />
        <EmptyState icon="logbook" title={t('dive.notFound')} />
      </div>
    );
  }

  const remove = () => {
    if (!confirm(t('dive.confirmDelete'))) return;
    deleteDive(db, dive.id);
    toast(t('dive.deleted'));
    navigate('/logbook', { replace: true });
  };

  const c = dive.conditions;
  const e = dive.equipment;
  const rows = (pairs: [string, string | null | undefined][]) =>
    pairs.filter(([, v]) => v != null && v !== '' && v !== '–');
  const basics = rows([
    [t('dive.entryTime'), dive.entry_time],
    [t('dive.exitTime'), dive.exit_time],
    [t('dive.duration'), dive.duration_min != null ? formatDuration(dive.duration_min) : null],
    [t('dive.maxDepth'), formatDepth(dive.max_depth_m, units.depthUnit, lang)],
    [t('dive.avgDepth'), formatDepth(dive.avg_depth_m, units.depthUnit, lang)],
  ]);
  const conditions = rows([
    [t('dive.visibility'), c?.visibility_m != null ? formatDepth(c.visibility_m, units.depthUnit, lang) : null],
    [t('dive.waterTemp'), formatTemp(c?.water_temp_c, units.tempUnit, lang)],
    [t('dive.airTemp'), formatTemp(c?.air_temp_c, units.tempUnit, lang)],
    [t('dive.waterType'), c?.water_type ? t(`dive.waterTypes.${c.water_type}`) : null],
    [t('dive.current'), c?.current ? t(`dive.currents.${c.current}`) : null],
  ]);
  const equipment = rows([
    [t('dive.suit'), e?.suit ? t(`dive.suits.${e.suit}`) : null],
    [t('dive.gas'), e?.gas ? `${t(`dive.gases.${e.gas}`)}${e.gas !== 'air' && e.o2_percent ? ` ${formatNumber(e.o2_percent, 0)} %` : ''}` : null],
    [t('dive.tankVolume'), e?.tank_volume_l != null ? `${formatNumber(e.tank_volume_l, 1, lang)} l` : null],
    [t('dive.tankMaterial'), e?.tank_material ? t(`dive.tankMaterials.${e.tank_material}`) : null],
    [t('dive.pressureStart'), formatPressure(e?.pressure_start_bar, units.pressureUnit, lang)],
    [t('dive.pressureEnd'), formatPressure(e?.pressure_end_bar, units.pressureUnit, lang)],
    [t('dive.weight'), e?.weight_kg != null ? `${formatNumber(e.weight_kg, 1, lang)} kg` : null],
  ]);

  const Facts = ({ items }: { items: [string, string | null | undefined][] }) => (
    <div className="facts">
      {items.map(([label, value]) => (
        <div className="fact" key={label}>
          <div className="label">{label}</div>
          <div className="value">{value}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="page">
      <PageHeader
        title={`#${dive.dive_no ?? '–'} · ${dive.site_name ?? t('dive.noSite')}`}
        back="/logbook"
        actions={
          <Link className="icon-btn" to={`/logbook/${dive.id}/edit`} aria-label={t('common.edit')}>
            <Icon name="edit" />
          </Link>
        }
      />
      <div className="row spread">
        <div>
          <div style={{ fontWeight: 750, fontSize: '1.2rem' }}>{formatDate(dive.date, lang)}</div>
          {site && (
            <div className="muted small">
              {[site.country, site.region_id ? catalog.regionsById.get(site.region_id)?.[lang === 'en' ? 'nameEn' : 'nameDe'] : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
        <Stars value={dive.rating} />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {dive.features.map((f) => (
          <span className="tag" key={f}>
            {t(`dive.typeNames.${f}`)}
          </span>
        ))}
        {dive.source === 'import' && <span className="tag">{t('dive.imported')}</span>}
      </div>

      {basics.length > 0 && (
        <>
          <h3 className="section-title">{t('dive.basics')}</h3>
          <Facts items={basics} />
        </>
      )}
      {dive.profile.length > 1 && (
        <>
          <h3 className="section-title">{t('dive.profile')}</h3>
          <ProfileChart samples={dive.profile} />
        </>
      )}
      {conditions.length > 0 && (
        <>
          <h3 className="section-title">{t('dive.conditions')}</h3>
          <Facts items={conditions} />
        </>
      )}
      {equipment.length > 0 && (
        <>
          <h3 className="section-title">{t('dive.equipment')}</h3>
          <Facts items={equipment} />
        </>
      )}

      <div className="row spread">
        <h3 className="section-title">
          {t('dive.sightings')} ({sightings.length})
        </h3>
        <button className="btn small primary" onClick={() => setPicking(true)}>
          <Icon name="plus" />
          {t('dive.addSighting')}
        </button>
      </div>
      {sightings.length > 0 && (
        <div className="list">
          {sightings.map((s) => {
            const sp = catalog.byId.get(s.species_id);
            return (
              <div key={s.id} className="list-item">
                <Link to={`/species/${s.species_id}`} className="row grow" style={{ flexWrap: 'nowrap', textDecoration: 'none', color: 'inherit' }}>
                  <div className="list-thumb">{sp && <SpeciesThumb species={sp} />}</div>
                  <div className="grow">
                    <div className="title">{sp ? speciesName(sp, lang) : s.species_id}</div>
                    <div className="sub">
                      {sp?.scientificName}
                      {s.count ? ` · ${t('sighting.countValue', { count: s.count })}` : ''}
                      {s.note ? ` · ${s.note}` : ''}
                    </div>
                  </div>
                </Link>
                <button
                  className="icon-btn"
                  aria-label={t('sighting.delete')}
                  onClick={() => {
                    deleteSighting(db, s.id);
                    toast(t('sighting.deleted'));
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {dive.notes && (
        <>
          <h3 className="section-title">{t('dive.notes')}</h3>
          <p style={{ whiteSpace: 'pre-wrap' }}>{dive.notes}</p>
        </>
      )}

      <div className="row" style={{ marginTop: 28 }}>
        <Link className="btn outline" to={`/logbook/${dive.id}/edit`}>
          <Icon name="edit" />
          {t('common.edit')}
        </Link>
        <button className="btn danger" onClick={remove}>
          <Icon name="trash" />
          {t('common.delete')}
        </button>
      </div>

      {picking && (
        <SpeciesPickerSheet
          onClose={() => setPicking(false)}
          onPick={(species, via) => {
            setPicking(false);
            setPicked({ species, via });
          }}
        />
      )}
      {picked && (
        <AddSightingSheet species={picked.species} diveId={dive.id} identifiedBy={picked.via} onClose={() => setPicked(null)} />
      )}
    </div>
  );
}

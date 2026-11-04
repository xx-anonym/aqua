import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { catalogAssetUrl, loadPhotos } from '../../catalog/catalog';
import { similarSpecies } from '../../catalog/similar';
import { TRAIT_TYPES } from '../../catalog/types';
import { regionName, speciesDescription, speciesName, traitLabel, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { formatDate, licenseLabel, licenseUrl } from '../../lib/format';
import { formatDepth } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { isFavorite, toggleFavorite } from '../../user/collections';
import { lifeList } from '../../user/lifelist';
import { sightingsForSpecies, type Sighting } from '../../user/sightings';
import { useDeleteSighting } from '../sighting/useDeleteSighting';
import { EmptyState, IucnBadge, PageHeader, SpeciesCard, TraitIcon } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';
import { Haptic } from '../../ui/haptics';
import { RegionMap } from '../../ui/maps';
import { AlbumPickerSheet } from '../collection/AlbumPickerSheet';
import { AddSightingSheet } from '../sighting/AddSightingSheet';

export default function SpeciesScreen() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const depthUnit = useSettings((s) => s.depthUnit);
  const species = catalog.byId.get(id);
  const photos = useMemo(() => (species ? loadPhotos(db, species.id) : []), [db, species]);
  const sightings = useDbQuery((d) => sightingsForSpecies(d, id), [id]);
  const removeSighting = useDeleteSighting();
  const [editing, setEditing] = useState<Sighting | null>(null);
  const favorite = useDbQuery((d) => isFavorite(d, id), [id]);
  const seen = useDbQuery((d) => lifeList(d));
  const [sheet, setSheet] = useState<'sighting' | 'album' | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);

  if (!species) {
    return (
      <div className="page">
        <PageHeader title={t('species.notFound')} back />
        <EmptyState icon="search" title={t('species.notFound')} />
      </div>
    );
  }

  const name = speciesName(species, lang);
  const similar = similarSpecies(catalog, species);
  const leafRegions = species.regions
    .map((r) => catalog.regionsById.get(r))
    .filter((r) => r && r.geometry)
    .map((r) => r!);

  const facts: [string, string][] = [
    [t('species.maxSize'), species.maxSizeCm != null ? `${species.maxSizeCm.toLocaleString(lang)} cm` : '–'],
    [
      t('species.depth'),
      species.depthMinM != null || species.depthMaxM != null
        ? `${formatDepth(species.depthMinM ?? 0, depthUnit, lang)} – ${formatDepth(species.depthMaxM, depthUnit, lang)}`
        : '–',
    ],
    [t('species.habitat'), species.habitat ? t(`habitat.${species.habitat}`, { defaultValue: species.habitat }) : '–'],
    [t('species.lifestyle'), species.lifestyle ? t(`lifestyle.${species.lifestyle}`, { defaultValue: species.lifestyle }) : '–'],
    [t('species.family'), species.family ?? '–'],
  ];

  return (
    <div className="page">
      <PageHeader title={name} back />
      <div
        className="gallery"
        ref={galleryRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPhotoIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {photos.length === 0 ? (
          <figure>
            <div className="placeholder">
              <Icon name="fish" />
            </div>
          </figure>
        ) : (
          photos.map((p, i) => (
            <figure key={p.file}>
              <img src={catalogAssetUrl(p.file)!} alt={t('species.photoAlt', { name, n: i + 1 })} loading={i ? 'lazy' : 'eager'} />
              <figcaption>
                © {p.author} ·{' '}
                {licenseUrl(p.license) ? (
                  <a href={licenseUrl(p.license)} target="_blank" rel="noreferrer">
                    {licenseLabel(p.license)}
                  </a>
                ) : (
                  licenseLabel(p.license)
                )}{' '}
                ·{' '}
                <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                  {t('species.source')}
                </a>
              </figcaption>
            </figure>
          ))
        )}
      </div>
      {photos.length > 1 && (
        <div className="gallery-dots" aria-hidden>
          {photos.map((p, i) => (
            <span key={p.file} className={i === photoIndex ? 'on' : ''} />
          ))}
        </div>
      )}

      <div className="title-block">
        <h2>{name}</h2>
        <div className="sci">{species.scientificName}</div>
        <div className="row" style={{ marginTop: 10 }}>
          <span className="tag">{t(`category.${species.category}`)}</span>
          {seen.has(species.id) && (
            <span className="tag" style={{ background: 'var(--seen)', color: '#fff' }}>
              ✓ {t('species.seen')}
            </span>
          )}
          <IucnBadge status={species.iucn} />
        </div>
      </div>

      <div className="actions-bar">
        <button className="btn primary" onClick={() => setSheet('sighting')}>
          <Icon name="eye" />
          {seen.has(species.id) ? t('species.markSeenAgain') : t('species.markSeen')}
        </button>
        <button className="btn" aria-pressed={favorite} onClick={() => toggleFavorite(db, species.id)} data-haptic>
          <Icon name={favorite ? 'heartFilled' : 'heart'} style={{ color: favorite ? 'var(--accent)' : undefined }} />
          {favorite ? t('species.liked') : t('species.like')}
          <Haptic />
        </button>
        <button className="btn" onClick={() => setSheet('album')}>
          <Icon name="album" />
          {t('species.addToAlbum')}
        </button>
      </div>

      {speciesDescription(species, lang) && <p style={{ marginTop: 18 }}>{speciesDescription(species, lang)}</p>}

      <div className="facts" style={{ marginTop: 12 }}>
        {facts.map(([label, value]) => (
          <div className="fact" key={label}>
            <div className="label">{label}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      {species.traits.length > 0 && (
        <>
          <h3 className="section-title">{t('species.traits')}</h3>
          <div>
            {TRAIT_TYPES.flatMap((type) =>
              species.traits
                .map((id) => catalog.traitsById.get(id))
                .filter((tr) => tr?.type === type)
                .map((tr) => (
                  <span className="trait-pill" key={tr!.id}>
                    <TraitIcon trait={tr!} />
                    {traitLabel(tr!, lang)}
                  </span>
                )),
            )}
          </div>
        </>
      )}

      <h3 className="section-title">{t('species.distribution')}</h3>
      <RegionMap regions={catalog.regions} activeIds={leafRegions.map((r) => r.id)} />
      <p className="small muted">{leafRegions.map((r) => regionName(r, lang)).join(' · ') || '–'}</p>

      <h3 className="section-title">{t('species.mySightings', { count: sightings.length })}</h3>
      {sightings.length === 0 ? (
        <p className="muted">{t('species.noSightings')}</p>
      ) : (
        <div className="list">
          {sightings.map((s) => {
            const body = (
              <>
                <Icon name={s.dive_id ? 'logbook' : 'eye'} />
                <div className="grow">
                  <div className="title">{formatDate(s.seen_at, lang)}</div>
                  <div className="sub">
                    {s.dive_id ? `#${s.dive_no ?? '–'} · ${s.site_name ?? t('dive.noSite')}` : t('sighting.withoutDive')}
                    {s.count ? ` · ${t('sighting.countValue', { count: s.count })}` : ''}
                    {s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
              </>
            );
            return (
              <div key={s.id} className="list-item">
                {s.dive_id ? (
                  <Link to={`/logbook/${s.dive_id}`} className="list-item-main">
                    {body}
                  </Link>
                ) : (
                  <div className="list-item-main">{body}</div>
                )}
                <button className="icon-btn" aria-label={t('sighting.edit')} title={t('sighting.edit')} onClick={() => setEditing(s)}>
                  <Icon name="edit" />
                </button>
                <button className="icon-btn" aria-label={t('sighting.delete')} title={t('sighting.delete')} onClick={() => removeSighting(s.id)}>
                  <Icon name="trash" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {similar.length > 0 && (
        <>
          <h3 className="section-title">{t('species.similar')}</h3>
          <div className="species-grid">
            {similar.map(({ species: s }) => (
              <div key={s.id} className="stack" style={{ gap: 6 }}>
                <SpeciesCard species={s} seen={seen.has(s.id)} to={`/species/${s.id}`} />
                <Link className="btn small outline" to={`/compare/${species.id}/${s.id}`}>
                  <Icon name="compare" />
                  {t('species.compare')}
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {sheet === 'sighting' && <AddSightingSheet species={species} onClose={() => setSheet(null)} />}
      {editing && <AddSightingSheet species={species} sighting={editing} onClose={() => setEditing(null)} />}
      {sheet === 'album' && <AlbumPickerSheet speciesId={species.id} onClose={() => setSheet(null)} />}
    </div>
  );
}

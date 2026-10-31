import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { regionName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb } from '../../db/react';
import { countryName, DIRECTORY_RADIUS_KM, DirectoryError, nearbyDiveSites, tidySiteName, type DirectorySite } from '../../lib/diveSiteDirectory';
import { formatNumber } from '../../lib/units';
import { regionForPoint, saveSite, type DiveSite } from '../../user/sites';
import { Field, Sheet } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { LocationPicker } from '../../ui/maps';

/** Create or edit a dive site: name, country, GPS / pin on the map, private or public. */
export function SiteEditorSheet({
  site,
  onClose,
  onSaved,
}: {
  site?: DiveSite;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const { toast } = useFeedback();
  const [name, setName] = useState(site?.name ?? '');
  const [country, setCountry] = useState(site?.country ?? '');
  const [lat, setLat] = useState<number | null>(site?.lat ?? null);
  const [lng, setLng] = useState<number | null>(site?.lng ?? null);
  const [isPrivate, setPrivate] = useState(site ? !!site.is_private : true);
  const [locating, setLocating] = useState(false);
  const [directory, setDirectory] = useState<
    { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; sites: DirectorySite[]; all: boolean }
  >({ state: 'idle' });
  const region = lat != null && lng != null ? regionForPoint(catalog.regions, lat, lng) : null;

  const locate = (then?: (lat: number, lng: number) => void) => {
    if (!navigator.geolocation) {
      toast(t('sites.gpsError'));
      return false;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocating(false);
        then?.(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        if (then) setDirectory({ state: 'error', message: t('sites.directoryNeedsLocation') });
        else toast(t('sites.gpsError'));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
    return true;
  };

  /** PADI dive sites around the pin, or around the current position when no pin is set yet. */
  const searchDirectory = () => {
    const run = async (a: number, b: number) => {
      setDirectory({ state: 'loading' });
      try {
        setDirectory({ state: 'done', sites: await nearbyDiveSites(a, b), all: false });
      } catch (e) {
        const offline = e instanceof DirectoryError && e.code === 'offline';
        setDirectory({ state: 'error', message: t(offline ? 'sites.directoryOffline' : 'sites.directoryError') });
      }
    };
    if (lat != null && lng != null) void run(lat, lng);
    else if (!locate((a, b) => void run(a, b))) setDirectory({ state: 'error', message: t('sites.directoryNeedsLocation') });
  };

  const pickFromDirectory = (s: DirectorySite) => {
    setName(tidySiteName(s.name));
    setLat(s.lat);
    setLng(s.lng);
    if (s.country) setCountry(countryName(s.country, lang));
    setDirectory({ state: 'idle' });
    toast(t('sites.directoryPicked'));
  };

  const siteFacts = (s: DirectorySite) =>
    [
      t('sites.distanceKm', { km: formatNumber(s.distanceKm, s.distanceKm < 10 ? 1 : 0, lang) }),
      s.maxDepthM ? t('sites.depthTo', { m: s.maxDepthM }) : null,
      s.types
        .slice(0, 3)
        .map((type) => t(`sites.types.${type.replace(/\W+/g, '_')}`, { defaultValue: type }))
        .join(', ') || null,
    ]
      .filter(Boolean)
      .join(' · ');

  const save = () => {
    const id = saveSite(
      db,
      { id: site?.id, name: name.trim(), country: country.trim() || null, lat, lng, is_private: isPrivate },
      catalog.regions,
    );
    toast(t('sites.saved'));
    onSaved?.(id);
    onClose();
  };

  return (
    <Sheet
      title={site ? t('sites.edit') : t('sites.add')}
      onClose={onClose}
      footer={
        <button className="btn primary block" onClick={save} disabled={!name.trim()}>
          <Icon name="check" />
          {t('common.save')}
        </button>
      }
    >
      <div className="stack">
        {!site && (
          <section className="stack" style={{ gap: 8 }} aria-live="polite">
            <button className="btn outline block" type="button" onClick={searchDirectory} disabled={directory.state === 'loading' || locating}>
              <Icon name="search" />
              {t('sites.directory')}
            </button>
            {directory.state === 'idle' && (
              <p className="small muted" style={{ margin: 0 }}>
                {t('sites.directoryHint', { km: DIRECTORY_RADIUS_KM })}
              </p>
            )}
            {(directory.state === 'loading' || locating) && (
              <p className="small muted" style={{ margin: 0 }}>
                {t('sites.directoryLoading')}
              </p>
            )}
            {directory.state === 'error' && (
              <p className="small" style={{ margin: 0 }}>
                {directory.message}
              </p>
            )}
            {directory.state === 'done' &&
              (directory.sites.length === 0 ? (
                <p className="small" style={{ margin: 0 }}>
                  {t('sites.directoryEmpty', { km: DIRECTORY_RADIUS_KM })}
                </p>
              ) : (
                <>
                  <div className="list">
                    {(directory.all ? directory.sites : directory.sites.slice(0, 8)).map((s) => (
                      <button key={s.id} type="button" className="list-item" onClick={() => pickFromDirectory(s)}>
                        <Icon name="pin" />
                        <div className="grow">
                          <div className="title">{tidySiteName(s.name)}</div>
                          <div className="sub">{siteFacts(s)}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {!directory.all && directory.sites.length > 8 && (
                    <button type="button" className="btn small outline" onClick={() => setDirectory({ ...directory, all: true })}>
                      {t('sites.directoryShowAll', { count: directory.sites.length })}
                    </button>
                  )}
                  <p className="small muted" style={{ margin: 0 }}>
                    {t('sites.directorySource')}
                  </p>
                </>
              ))}
          </section>
        )}
        <Field label={`${t('sites.name')} *`}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t('sites.country')}>
          <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
        </Field>
        <button className="btn outline" type="button" onClick={() => locate()} disabled={locating}>
          <Icon name="locate" />
          {t('sites.useGps')}
        </button>
        <LocationPicker
          lat={lat}
          lng={lng}
          onChange={(a, b) => {
            setLat(Math.round(a * 1e5) / 1e5);
            setLng(Math.round(b * 1e5) / 1e5);
          }}
        />
        <p className="small muted" style={{ margin: 0 }}>
          {t('sites.mapHint')}
          <br />
          {lat != null && lng != null
            ? `${t('sites.coordinates')}: ${formatNumber(lat, 5, 'en')}, ${formatNumber(lng, 5, 'en')}`
            : t('sites.noCoordinates')}
          {region && ` · ${regionName(catalog.regionsById.get(region)!, lang)}`}
        </p>
        <div className="segmented" role="radiogroup" aria-label={t('sites.private')}>
          <button type="button" role="radio" aria-checked={isPrivate} onClick={() => setPrivate(true)}>
            {t('sites.private')}
          </button>
          <button type="button" role="radio" aria-checked={!isPrivate} onClick={() => setPrivate(false)}>
            {t('sites.public')}
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t('sites.privateHint')}
        </p>
      </div>
    </Sheet>
  );
}

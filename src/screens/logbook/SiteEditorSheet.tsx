import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { regionName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb } from '../../db/react';
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
  const region = lat != null && lng != null ? regionForPoint(catalog.regions, lat, lng) : null;

  const locate = () => {
    if (!navigator.geolocation) return toast(t('sites.gpsError'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast(t('sites.gpsError'));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

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
        <Field label={`${t('sites.name')} *`}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label={t('sites.country')}>
          <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" />
        </Field>
        <button className="btn outline" type="button" onClick={locate} disabled={locating}>
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
          <button type="button" role="radio" aria-checked={isPrivate} aria-pressed={isPrivate} onClick={() => setPrivate(true)}>
            {t('sites.private')}
          </button>
          <button type="button" role="radio" aria-checked={!isPrivate} aria-pressed={!isPrivate} onClick={() => setPrivate(false)}>
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

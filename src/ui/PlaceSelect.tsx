import { useTranslation } from 'react-i18next';
import { destinationName, regionName, useCatalog, useLang } from '../catalog/useCatalog';

/**
 * Country picker grouped by region ("Rotes Meer" → Ägypten, Israel, …). Empty value = all countries.
 * Native select: on phones this opens the system picker, which handles 70+ entries well.
 */
export function DestinationSelect({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (destinationId: string | null) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  return (
    <select className="input" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t('filter.allDestinations')}</option>
      {catalog.destinationGroups().map(({ region, destinations }) => (
        <optgroup key={region.id} label={regionName(region, lang)}>
          {destinations.map((d) => (
            <option key={d.id} value={d.id}>
              {destinationName(d, lang)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Region or country (settings): each region group starts with the whole region, then its countries. */
export function PlaceSelect({ value, onChange, label }: { value: string | null; onChange: (place: string | null) => void; label: string }) {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const roots = catalog.regions.filter((r) => !r.parentId && !r.geometry);
  return (
    <select className="input" aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{t('filter.allRegions')}</option>
      {roots.map((r) => (
        <option key={r.id} value={r.id}>
          {t('filter.wholeRegion', { region: regionName(r, lang) })}
        </option>
      ))}
      {catalog
        .regionTree()
        .filter((r) => r.geometry)
        .map((region) => (
          <optgroup key={region.id} label={regionName(region, lang)}>
            <option value={region.id}>{t('filter.wholeRegion', { region: regionName(region, lang) })}</option>
            {catalog.destinations
              .filter((d) => d.regionId === region.id)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {destinationName(d, lang)}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
}

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Catalog } from '../../catalog/catalog';
import {
  applyFilter,
  DEPTH_BUCKETS,
  emptyFilter,
  matchesFilter,
  SIZE_BUCKETS,
  toggle,
  type SpeciesFilter,
} from '../../catalog/filter';
import { TRAIT_TYPES, type TraitType } from '../../catalog/types';
import { regionName, useLang } from '../../catalog/useCatalog';
import { Chip, Sheet, TraitChip } from '../../ui/components';
import { DestinationSelect } from '../../ui/PlaceSelect';

/** Icon-chip filter for colour, pattern, shape, behaviour, region, depth and size with a live result count. */
export function FilterSheet({
  catalog,
  filter,
  onChange,
  onClose,
  types = TRAIT_TYPES,
  showRegion = true,
}: {
  catalog: Catalog;
  filter: SpeciesFilter;
  onChange: (f: SpeciesFilter) => void;
  onClose: () => void;
  types?: TraitType[];
  showRegion?: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const count = useMemo(() => applyFilter(catalog.species, filter).length, [catalog, filter]);

  /** How many species would match if this option were the only one chosen for its type. */
  const optionCount = (type: TraitType, traitId: string) => {
    const probe = { ...filter, traits: { ...filter.traits, [type]: [traitId] } };
    return catalog.species.reduce((n, s) => n + (matchesFilter(s, probe) ? 1 : 0), 0);
  };

  return (
    <Sheet
      title={t('filter.title')}
      onClose={onClose}
      footer={
        <>
          <button className="btn outline" onClick={() => onChange({ ...emptyFilter(filter.category) })}>
            {t('filter.reset')}
          </button>
          <button className="btn primary block" onClick={onClose}>
            {t('filter.show', { count })}
          </button>
        </>
      }
    >
      <div className="stack">
        {showRegion && (
          <section>
            <h3 className="section-title" style={{ marginTop: 0 }}>
              {t('filter.region')}
            </h3>
            <div className="chips">
              {catalog.regionTree().map((r) => (
                <Chip
                  key={r.id}
                  icon="globe"
                  selected={filter.regions.includes(r.id)}
                  onToggle={() => onChange({ ...filter, regions: toggle(filter.regions, r.id), destinations: [] })}
                >
                  {regionName(r, lang)}
                </Chip>
              ))}
            </div>
            {catalog.destinations.length > 0 && (
              <div className="field" style={{ marginTop: 14 }}>
                <span>{t('filter.destination')}</span>
                <DestinationSelect
                  label={t('filter.destination')}
                  value={filter.destinations[0] ?? null}
                  onChange={(id) => onChange({ ...filter, destinations: id ? [id] : [], regions: id ? [] : filter.regions })}
                />
                <span className="small muted">{t('filter.destinationHint')}</span>
              </div>
            )}
          </section>
        )}
        {types.map((type) => {
          const traits = catalog.traitsOfType(type, filter.category);
          if (!traits.length) return null;
          return (
            <section key={type}>
              <h3 className="section-title">{t(`traitType.${type}`)}</h3>
              <div className="chips">
                {traits.map((tr) => (
                  <TraitChip
                    key={tr.id}
                    trait={tr}
                    selected={filter.traits[type].includes(tr.id)}
                    count={optionCount(type, tr.id)}
                    onToggle={() =>
                      onChange({ ...filter, traits: { ...filter.traits, [type]: toggle(filter.traits[type], tr.id) } })
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
        <section>
          <h3 className="section-title">{t('filter.depth')}</h3>
          <div className="chips">
            {DEPTH_BUCKETS.map((b) => (
              <Chip key={b.id} icon="ruler" selected={filter.depth.includes(b.id)} onToggle={() => onChange({ ...filter, depth: toggle(filter.depth, b.id) })}>
                {t(`filter.depthBucket.${b.id}`)}
              </Chip>
            ))}
          </div>
        </section>
        <section>
          <h3 className="section-title">{t('filter.size')}</h3>
          <div className="chips">
            {SIZE_BUCKETS.map((b) => (
              <Chip key={b.id} icon="fish" selected={filter.size.includes(b.id)} onToggle={() => onChange({ ...filter, size: toggle(filter.size, b.id) })}>
                {t(`filter.sizeBucket.${b.id}`)}
              </Chip>
            ))}
          </div>
        </section>
        <p className="muted small">{t('filter.logic')}</p>
      </div>
    </Sheet>
  );
}

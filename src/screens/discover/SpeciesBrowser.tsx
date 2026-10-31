import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { activeCount, applyFilter } from '../../catalog/filter';
import { searchSpecies } from '../../catalog/search';
import { CATEGORIES, type Category, type Species } from '../../catalog/types';
import { placeName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDbQuery } from '../../db/react';
import { useSettings } from '../../settings/settings';
import { lifeList } from '../../user/lifelist';
import { EmptyState, SpeciesCard } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';
import { useBrowseState } from './browseState';
import { FilterSheet } from './FilterSheet';

const PAGE = 60;

/**
 * Catalog grid with category tabs, direct search and the trait filter.
 * Used by Discover (links to species pages) and by the sighting picker (onSelect).
 */
export function SpeciesBrowser({
  stateKey,
  linkTo,
  onSelect,
  autoFocus,
}: {
  stateKey: string;
  linkTo?: (s: Species) => string;
  onSelect?: (s: Species, via: 'manual' | 'filter') => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const defaultRegion = useSettings((s) => s.region);
  const { query, filter, setQuery, setFilter } = useBrowseState(stateKey, defaultRegion);
  const seen = useDbQuery((db) => lifeList(db));
  const [showFilter, setShowFilter] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const results = useMemo(() => {
    if (query.trim()) return searchSpecies(catalog.search, query, 100);
    return applyFilter(catalog.species, filter);
  }, [catalog, query, filter]);

  const filtersActive = activeCount(filter);
  const regionLabel =
    filter.destinations.length === 1
      ? placeName(catalog, filter.destinations[0], lang)
      : filter.regions.length === 1
        ? placeName(catalog, filter.regions[0], lang)
        : filter.regions.length > 1
          ? t('filter.regionsCount', { count: filter.regions.length })
          : t('filter.allRegions');

  const setCategory = (c: Category | null) => {
    // Body shapes are category-specific; drop ones that do not apply to the new tab.
    const shapes = filter.traits.body_shape.filter((id) => !c || catalog.traitsById.get(id)?.appliesTo.includes(c));
    setFilter({ ...filter, category: c, traits: { ...filter.traits, body_shape: shapes } });
    setLimit(PAGE);
  };

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">{t('discover.searchLabel')}</span>
          <input
            className="input"
            type="search"
            value={query}
            placeholder={t('discover.searchPlaceholder')}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            autoFocus={autoFocus}
            enterKeyHint="search"
          />
        </label>
        <button
          className="icon-btn"
          style={{ background: filtersActive ? 'var(--primary)' : 'var(--surface)', color: filtersActive ? 'var(--on-primary)' : undefined }}
          onClick={() => setShowFilter(true)}
          aria-label={t('filter.open', { count: filtersActive })}
        >
          <Icon name="filter" />
          {filtersActive > 0 && <span className="badge-count">{filtersActive}</span>}
        </button>
      </div>

      {!query.trim() && (
        <>
          <div className="segmented" role="tablist" aria-label={t('discover.categories')}>
            <button role="tab" aria-selected={filter.category === null} onClick={() => setCategory(null)}>
              {t('category.all')}
            </button>
            {CATEGORIES.map((c) => (
              <button key={c} role="tab" aria-selected={filter.category === c} onClick={() => setCategory(c)}>
                {t(`category.${c}`)}
              </button>
            ))}
          </div>
          <div className="row spread">
            <button className="btn small outline" onClick={() => setShowFilter(true)}>
              <Icon name="globe" />
              {regionLabel}
            </button>
            <span className="muted small" aria-live="polite">
              {t('discover.resultCount', { count: results.length })}
            </span>
          </div>
        </>
      )}
      {query.trim() && (
        <span className="muted small" aria-live="polite">
          {t('discover.searchResults', { count: results.length })}
        </span>
      )}

      {results.length === 0 ? (
        <EmptyState icon="search" title={t('discover.noResults')}>
          {filtersActive > 0 && (
            <button className="btn small outline" style={{ marginTop: 12 }} onClick={() => setShowFilter(true)}>
              {t('discover.adjustFilter')}
            </button>
          )}
        </EmptyState>
      ) : (
        <div className="species-grid">
          {results.slice(0, limit).map((s) => (
            <SpeciesCard
              key={s.id}
              species={s}
              seen={seen.has(s.id)}
              to={linkTo?.(s)}
              onClick={onSelect ? () => onSelect(s, filtersActive > 0 && !query.trim() ? 'filter' : 'manual') : undefined}
            />
          ))}
        </div>
      )}
      {results.length > limit && (
        <button className="btn outline block" onClick={() => setLimit(limit + PAGE)}>
          {t('discover.showMore', { count: results.length - limit })}
        </button>
      )}

      {showFilter && <FilterSheet catalog={catalog} filter={filter} onChange={setFilter} onClose={() => setShowFilter(false)} />}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, type Category } from '../../catalog/types';
import { regionName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { useSettings } from '../../settings/settings';
import { favoriteIds, listCollections, saveCollection } from '../../user/collections';
import { lifeList, progressReport } from '../../user/lifelist';
import { EmptyState, PageHeader, ProgressBar, SpeciesCard } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';
import { SignInReminder } from '../../ui/SignInReminder';

type Tab = 'life' | 'albums' | 'favorites';
type Show = 'all' | 'seen' | 'missing';
const PAGE = 90;

export default function CollectionScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'life';
  const region = useSettings((s) => s.region);
  const setSettings = useSettings((s) => s.set);
  const [category, setCategory] = useState<Category | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [limit, setLimit] = useState(PAGE);
  const seen = useDbQuery((d) => lifeList(d));
  const favorites = useDbQuery((d) => favoriteIds(d));
  const albums = useDbQuery((d) => listCollections(d));
  const [newAlbum, setNewAlbum] = useState('');

  const report = useMemo(() => progressReport(catalog, seen, region), [catalog, seen, region]);
  const species = useMemo(
    () =>
      catalog
        .speciesInRegion(region)
        .filter((s) => !category || s.category === category)
        .filter((s) => (show === 'seen' ? seen.has(s.id) : show === 'missing' ? !seen.has(s.id) : true))
        // Seen species first, so the collection fills up from the top.
        .sort((a, b) => Number(seen.has(b.id)) - Number(seen.has(a.id))),
    [catalog, region, category, show, seen],
  );
  const regionLabel = region ? regionName(catalog.regionsById.get(region)!, lang) : t('filter.allRegions');
  const overallShare = report.overall.total ? (report.overall.seen / report.overall.total) * 100 : 0;
  // "<1 %" rather than "0 %" once the first species is seen.
  const overallPct = report.overall.seen > 0 && overallShare < 1 ? '<1' : String(Math.round(overallShare));

  return (
    <div className="page">
      <PageHeader title={t('collection.title')} />
      <SignInReminder />
      <div className="segmented" role="tablist" style={{ marginBottom: 16 }}>
        {(['life', 'albums', 'favorites'] as Tab[]).map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setParams({ tab: x }, { replace: true })}>
            {t(`collection.${x === 'life' ? 'lifeList' : x}`)}
          </button>
        ))}
      </div>

      {tab === 'life' && (
        <>
          <div className="card stack">
            <label className="field">
              <span>{t('filter.region')}</span>
              <select className="input" value={region ?? ''} onChange={(e) => setSettings({ region: e.target.value || null })}>
                <option value="">{t('filter.allRegions')}</option>
                {catalog.regionTree().map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.parentId ? '— ' : ''}
                    {regionName(r, lang)}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="life-hero">
                <span className="count">{report.overall.seen}</span>
                <span className="of">/ {report.overall.total}</span>
                <span className="pct">{overallPct} %</span>
              </div>
              <div className="small muted" style={{ marginBottom: 8 }}>
                {t('collection.heroLabel', { region: regionLabel })}
              </div>
              <div
                className="progress big"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={report.overall.total}
                aria-valuenow={report.overall.seen}
                aria-label={t('collection.progressRegion', { seen: report.overall.seen, total: report.overall.total, region: regionLabel })}
              >
                <div style={{ width: `${overallShare}%` }} />
              </div>
            </div>
            {CATEGORIES.map((c) => (
              <ProgressBar key={c} seen={report.byCategory[c].seen} total={report.byCategory[c].total} label={t(`category.${c}`)} />
            ))}
          </div>
          {!region && (
            <details className="accordion" style={{ marginTop: 12 }}>
              <summary>{t('collection.byRegion')}</summary>
              <div className="accordion-body">
                {report.byRegion.map((r) => (
                  <ProgressBar
                    key={r.regionId}
                    seen={r.progress.seen}
                    total={r.progress.total}
                    label={`${catalog.regionsById.get(r.regionId)?.parentId ? '— ' : ''}${regionName(catalog.regionsById.get(r.regionId)!, lang)}`}
                  />
                ))}
              </div>
            </details>
          )}

          <div className="segmented fit" role="tablist" aria-label={t('discover.categories')} style={{ marginTop: 16 }}>
            <button role="tab" aria-selected={category === null} onClick={() => setCategory(null)}>
              {t('category.all')}
            </button>
            {CATEGORIES.map((c) => (
              <button key={c} role="tab" aria-selected={category === c} onClick={() => setCategory(c)} aria-label={t(`category.${c}`)}>
                {t(`categoryShort.${c}`)}
              </button>
            ))}
          </div>
          <div className="segmented fit" role="radiogroup" aria-label={t('collection.show')} style={{ margin: '8px 0 12px' }}>
            {(['all', 'seen', 'missing'] as Show[]).map((x) => (
              <button key={x} role="radio" aria-checked={show === x} onClick={() => setShow(x)}>
                {t(`collection.show${x === 'all' ? 'All' : x === 'seen' ? 'Seen' : 'Missing'}`)}
              </button>
            ))}
          </div>
          <div className="species-grid">
            {species.slice(0, limit).map((s) => (
              <SpeciesCard key={s.id} species={s} seen={seen.has(s.id)} dimUnseen to={`/species/${s.id}`} />
            ))}
          </div>
          {species.length > limit && (
            <button className="btn outline block" style={{ marginTop: 12 }} onClick={() => setLimit(limit + PAGE)}>
              {t('discover.showMore', { count: species.length - limit })}
            </button>
          )}
        </>
      )}

      {tab === 'albums' && (
        <>
          <form
            className="row"
            style={{ flexWrap: 'nowrap', marginBottom: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newAlbum.trim()) return;
              saveCollection(db, { name: newAlbum.trim() });
              setNewAlbum('');
            }}
          >
            <input className="input" value={newAlbum} onChange={(e) => setNewAlbum(e.target.value)} placeholder={t('album.newPlaceholder')} aria-label={t('album.newName')} />
            <button className="btn primary" type="submit" disabled={!newAlbum.trim()}>
              <Icon name="plus" />
              {t('album.create')}
            </button>
          </form>
          {albums.length === 0 ? (
            <EmptyState icon="album" title={t('album.empty')}>
              {t('album.emptyHint')}
            </EmptyState>
          ) : (
            <div className="list">
              {albums.map((a) => (
                <Link key={a.id} to={`/collection/albums/${a.id}`} className="list-item">
                  <Icon name="album" />
                  <div className="grow">
                    <div className="title">{a.name}</div>
                    <div className="sub">
                      {t('album.speciesCount', { count: a.item_count })}
                      {a.description ? ` · ${a.description}` : ''}
                    </div>
                  </div>
                  <Icon name="chevron" />
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'favorites' &&
        (favorites.size === 0 ? (
          <EmptyState icon="heart" title={t('collection.noFavorites')}>
            {t('collection.noFavoritesHint')}
          </EmptyState>
        ) : (
          <div className="species-grid">
            {[...favorites]
              .map((id) => catalog.byId.get(id))
              .filter((s) => !!s)
              .map((s) => (
                <SpeciesCard key={s!.id} species={s!} seen={seen.has(s!.id)} to={`/species/${s!.id}`} />
              ))}
          </div>
        ))}
    </div>
  );
}

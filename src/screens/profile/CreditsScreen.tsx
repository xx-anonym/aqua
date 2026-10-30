import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loadAllPhotoCredits } from '../../catalog/catalog';
import { useCatalog } from '../../catalog/useCatalog';
import { useDb } from '../../db/react';
import { licenseLabel, licenseUrl } from '../../lib/format';
import { searchSpecies } from '../../catalog/search';
import { PageHeader } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';

export default function CreditsScreen() {
  const { t } = useTranslation();
  const db = useDb();
  const catalog = useCatalog();
  const credits = useMemo(() => loadAllPhotoCredits(db), [db]);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    if (!query.trim()) return credits;
    const ids = new Set(searchSpecies(catalog.search, query, 200).map((s) => s.id));
    const q = query.toLowerCase();
    return credits.filter((c) => ids.has(c.species_id) || c.author.toLowerCase().includes(q));
  }, [credits, catalog, query]);

  return (
    <div className="page">
      <PageHeader title={t('credits.title')} back />
      <h2 className="section-title" style={{ marginTop: 0 }}>
        {t('credits.sources')}
      </h2>
      <div className="list">
        {catalog.meta.sources.map((s) => (
          <a key={s.name} className="list-item" href={s.url} target="_blank" rel="noreferrer">
            <Icon name="globe" />
            <div className="grow">
              <div className="title">{s.name}</div>
              <div className="sub">{s.usage}</div>
              <div className="sub">{s.license}</div>
            </div>
          </a>
        ))}
      </div>

      <h2 className="section-title">
        {t('credits.photos')} ({credits.length})
      </h2>
      <p className="small muted">{t('credits.photosIntro')}</p>
      <label className="search" style={{ display: 'block', marginBottom: 12 }}>
        <Icon name="search" />
        <span className="sr-only">{t('discover.searchLabel')}</span>
        <input className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('discover.searchPlaceholder')} />
      </label>
      <div className="list">
        {visible.slice(0, 300).map((c, i) => (
          <div key={`${c.species_id}-${i}`} className="list-item">
            <div className="grow">
              <div className="title">
                <Link to={`/species/${c.species_id}`}>
                  <i>{c.scientific_name}</i>
                </Link>
              </div>
              <div className="sub">
                © {c.author} ·{' '}
                {licenseUrl(c.license) ? (
                  <a href={licenseUrl(c.license)} target="_blank" rel="noreferrer">
                    {licenseLabel(c.license)}
                  </a>
                ) : (
                  licenseLabel(c.license)
                )}{' '}
                ·{' '}
                <a href={c.source_url} target="_blank" rel="noreferrer">
                  {t('species.source')}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title">{t('credits.software')}</h2>
      <p className="small">{t('credits.softwareText')}</p>
      <p className="small muted">{t('catalogMeta', { version: catalog.meta.version, date: catalog.meta.builtAt.slice(0, 10) })}</p>
    </div>
  );
}

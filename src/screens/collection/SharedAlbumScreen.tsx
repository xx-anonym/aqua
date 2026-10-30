import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { addToCollection, saveCollection } from '../../user/collections';
import { lifeList } from '../../user/lifelist';
import { EmptyState, PageHeader, SpeciesCard } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';

/** Read-only view of an album shared by link (/shared?n=Name&s=id1,id2). */
export default function SharedAlbumScreen() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const db = useDb();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const seen = useDbQuery((d) => lifeList(d));
  const name = params.get('n') || t('album.sharedTitle');
  const species = useMemo(
    () =>
      (params.get('s') ?? '')
        .split(',')
        .map((id) => catalog.byId.get(id.trim()))
        .filter((s) => !!s)
        .map((s) => s!),
    [params, catalog],
  );

  const saveCopy = () => {
    const id = saveCollection(db, { name });
    species.forEach((s) => addToCollection(db, id, s.id));
    toast(t('album.savedCopy'));
    navigate(`/collection/albums/${id}`);
  };

  return (
    <div className="page">
      <PageHeader title={name} back="/collection?tab=albums" />
      <p className="notice small">{t('album.sharedHint')}</p>
      {species.length === 0 ? (
        <EmptyState icon="album" title={t('album.noSpecies')} />
      ) : (
        <>
          <button className="btn primary" style={{ margin: '12px 0' }} onClick={saveCopy}>
            <Icon name="album" />
            {t('album.saveCopy')}
          </button>
          <div className="species-grid">
            {species.map((s) => (
              <SpeciesCard key={s.id} species={s} seen={seen.has(s.id)} to={`/species/${s.id}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import {
  addToCollection,
  collectionSpeciesIds,
  deleteCollection,
  getCollection,
  removeFromCollection,
  saveCollection,
  shareUrl,
} from '../../user/collections';
import { lifeList } from '../../user/lifelist';
import { EmptyState, Field, PageHeader, Sheet, SpeciesCard } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { SpeciesPickerSheet } from '../sighting/SpeciesPickerSheet';

export default function AlbumScreen() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const db = useDb();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const album = useDbQuery((d) => getCollection(d, id), [id]);
  const ids = useDbQuery((d) => collectionSpeciesIds(d, id), [id]);
  const seen = useDbQuery((d) => lifeList(d));
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [removing, setRemoving] = useState(false);

  if (!album) {
    return (
      <div className="page">
        <PageHeader title={t('album.title')} back="/collection?tab=albums" />
        <EmptyState icon="album" title={t('album.noSpecies')} />
      </div>
    );
  }

  const share = async () => {
    const url = shareUrl(location.origin, album.name, ids);
    try {
      if (navigator.share) await navigator.share({ title: album.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast(t('album.shareCopied'));
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={album.name}
        back="/collection?tab=albums"
        actions={
          <>
            <button className="icon-btn" onClick={share} aria-label={t('album.share')} disabled={!ids.length}>
              <Icon name="share" />
            </button>
            <button
              className="icon-btn"
              aria-label={t('album.rename')}
              onClick={() => {
                setName(album.name);
                setDescription(album.description ?? '');
                setEditing(true);
              }}
            >
              <Icon name="edit" />
            </button>
          </>
        }
      />
      {album.description && <p className="muted">{album.description}</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn primary" onClick={() => setPicking(true)}>
          <Icon name="plus" />
          {t('album.addSpecies')}
        </button>
        {ids.length > 0 && (
          <button className="btn outline" aria-pressed={removing} onClick={() => setRemoving(!removing)}>
            <Icon name={removing ? 'check' : 'trash'} />
            {removing ? t('common.done') : t('album.remove')}
          </button>
        )}
      </div>
      {ids.length === 0 ? (
        <EmptyState icon="album" title={t('album.noSpecies')} />
      ) : (
        <div className="species-grid">
          {ids
            .map((sid) => catalog.byId.get(sid))
            .filter((s) => !!s)
            .map((s) =>
              removing ? (
                <SpeciesCard key={s!.id} species={s!} seen={seen.has(s!.id)} onClick={() => removeFromCollection(db, album.id, s!.id)} />
              ) : (
                <SpeciesCard key={s!.id} species={s!} seen={seen.has(s!.id)} to={`/species/${s!.id}`} />
              ),
            )}
        </div>
      )}

      {picking && (
        <SpeciesPickerSheet
          title={t('album.addSpecies')}
          onClose={() => setPicking(false)}
          onPick={(s) => {
            addToCollection(db, album.id, s.id);
            toast(`✓ ${s.scientificName}`);
          }}
        />
      )}
      {editing && (
        <Sheet
          title={t('album.rename')}
          onClose={() => setEditing(false)}
          footer={
            <>
              <button
                className="btn danger"
                data-haptic
                onClick={() => {
                  if (!confirm(t('album.confirmDelete'))) return;
                  deleteCollection(db, album.id);
                  navigate('/collection?tab=albums', { replace: true });
                }}
              >
                <Icon name="trash" />
                {t('album.delete')}
              </button>
              <button
                className="btn primary block"
                disabled={!name.trim()}
                onClick={() => {
                  saveCollection(db, { id: album.id, name: name.trim(), description: description.trim() || null });
                  setEditing(false);
                }}
              >
                {t('common.save')}
              </button>
            </>
          }
        >
          <div className="stack">
            <Field label={t('sites.name')}>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label={t('album.description')}>
              <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}

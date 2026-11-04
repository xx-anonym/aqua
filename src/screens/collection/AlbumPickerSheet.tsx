import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb, useDbQuery } from '../../db/react';
import {
  addToCollection,
  collectionsContaining,
  listCollections,
  removeFromCollection,
  saveCollection,
} from '../../user/collections';
import { Sheet } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';

/** Toggle a species in any album, or create a new album on the spot. */
export function AlbumPickerSheet({ speciesId, onClose }: { speciesId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const db = useDb();
  const albums = useDbQuery((d) => listCollections(d));
  const inAlbums = useDbQuery((d) => collectionsContaining(d, speciesId), [speciesId]);
  const [name, setName] = useState('');

  const create = () => {
    if (!name.trim()) return;
    const id = saveCollection(db, { name: name.trim() });
    addToCollection(db, id, speciesId);
    setName('');
  };

  return (
    <Sheet title={t('album.addTo')} onClose={onClose} footer={<button className="btn primary block" onClick={onClose}>{t('common.done')}</button>}>
      <div className="stack">
        {albums.length > 0 && (
          <div className="list">
            {albums.map((a) => {
              const on = inAlbums.includes(a.id);
              return (
                <button
                  key={a.id}
                  className="list-item"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => (on ? removeFromCollection(db, a.id, speciesId) : addToCollection(db, a.id, speciesId))}
                  data-haptic
                >
                  <Icon name={on ? 'check' : 'album'} style={{ color: on ? 'var(--seen)' : undefined }} />
                  <div className="grow">
                    <div className="title">{a.name}</div>
                    <div className="sub">{t('album.speciesCount', { count: a.item_count })}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <form
          className="row"
          style={{ flexWrap: 'nowrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('album.newPlaceholder')} aria-label={t('album.newName')} />
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            <Icon name="plus" />
            {t('album.create')}
          </button>
        </form>
      </div>
    </Sheet>
  );
}

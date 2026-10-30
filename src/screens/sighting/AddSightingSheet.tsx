import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { speciesName, useLang } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { formatDate } from '../../lib/format';
import { timeLocal, todayLocal } from '../../lib/ids';
import { listDives } from '../../user/dives';
import { savePhoto } from '../../user/photos';
import { addSighting, type IdentifiedBy } from '../../user/sightings';
import { Field, Sheet, SpeciesThumb } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';

/** Records a sighting with optional dive, count, note and own photo. */
export function AddSightingSheet({
  species,
  diveId,
  identifiedBy = 'manual',
  initialPhoto,
  onClose,
  onSaved,
}: {
  species: Species;
  diveId?: string | null;
  identifiedBy?: IdentifiedBy;
  /** Photo used for photo ID, stored with the sighting unless the user removes it. */
  initialPhoto?: Blob | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const { celebrate, toast } = useFeedback();
  const dives = useDbQuery((d) => listDives(d).slice(0, 30));
  const [dive, setDive] = useState<string>(diveId ?? '');
  const selectedDive = dives.find((d) => d.id === dive);
  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState(timeLocal());
  const [count, setCount] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<Blob | null>(initialPhoto ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const photoUri = photo ? await savePhoto(photo) : null;
      const day = selectedDive?.date ?? date;
      const at = selectedDive?.entry_time ?? time;
      const { isFirst } = addSighting(db, {
        species_id: species.id,
        dive_id: dive || null,
        count: count ? Number(count) : null,
        note: note.trim() || null,
        photo_uri: photoUri,
        identified_by: identifiedBy,
        seen_at: new Date(`${day}T${at || '12:00'}:00`).toISOString(),
      });
      if (isFirst) celebrate(species.id);
      else toast(t('sighting.saved'));
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={t('sighting.add')}
      onClose={onClose}
      footer={
        <button className="btn primary block" onClick={save} disabled={saving}>
          <Icon name="check" />
          {t('sighting.save')}
        </button>
      }
    >
      <div className="stack">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <div className="list-thumb">
            <SpeciesThumb species={species} />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{speciesName(species, lang)}</div>
            <div className="muted small" style={{ fontStyle: 'italic' }}>
              {species.scientificName}
            </div>
          </div>
        </div>
        {diveId === undefined && (
          <Field label={t('sighting.dive')}>
            <select className="input" value={dive} onChange={(e) => setDive(e.target.value)}>
              <option value="">{t('sighting.noDive')}</option>
              {dives.map((d) => (
                <option key={d.id} value={d.id}>
                  #{d.dive_no ?? '–'} · {formatDate(d.date, lang)} · {d.site_name ?? t('dive.noSite')}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!selectedDive && (
          <div className="grid-2">
            <Field label={t('sighting.date')}>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label={t('sighting.time')}>
              <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label={t('sighting.count')}>
          <input className="input" type="number" inputMode="numeric" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <Field label={t('sighting.note')}>
          <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Field label={t('sighting.photo')}>
          {initialPhoto && photo === initialPhoto ? (
            <button type="button" className="btn small outline" onClick={() => setPhoto(null)}>
              <Icon name="close" />
              {t('identify.removePhoto')}
            </button>
          ) : (
            <input className="input" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          )}
        </Field>
      </div>
    </Sheet>
  );
}

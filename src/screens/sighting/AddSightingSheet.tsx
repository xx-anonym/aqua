import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { speciesName, useLang } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { formatDate } from '../../lib/format';
import { timeLocal, todayLocal } from '../../lib/ids';
import { useObjectUrl } from '../../lib/useObjectUrl';
import { listDives } from '../../user/dives';
import { deletePhoto, savePhoto, usePhotoUrl } from '../../user/photos';
import { addSighting, hasSighting, UNIDENTIFIED, updateSighting, type IdentifiedBy, type Sighting } from '../../user/sightings';
import { Field, Sheet, SpeciesThumb } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { SpeciesPickerSheet } from './SpeciesPickerSheet';

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const localTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Thumbnail of a sighting: own photo first, then the species picture, else a question mark. */
export function SightingThumb({ photoUri, species }: { photoUri: string | null; species: Species | null }) {
  const url = usePhotoUrl(photoUri);
  if (url) return <img src={url} alt="" />;
  if (species) return <SpeciesThumb species={species} />;
  return (
    <div className="placeholder unknown" aria-hidden="true">
      ?
    </div>
  );
}

/**
 * Records a new sighting or edits an existing one: dive, date, count, note, own photo, species.
 * `species === null` records an unidentified animal ("unbestimmt") that gets its species later.
 */
export function AddSightingSheet({
  species: initialSpecies,
  sighting,
  diveId,
  identifiedBy = 'manual',
  initialPhoto,
  onClose,
  onSaved,
}: {
  species: Species | null;
  /** Edit this sighting instead of creating one. */
  sighting?: Sighting;
  diveId?: string | null;
  identifiedBy?: IdentifiedBy;
  /** Photo used for photo ID, stored with the sighting unless the user removes it. */
  initialPhoto?: Blob | null;
  onClose: () => void;
  onSaved?: (speciesId: string) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const { celebrate, toast } = useFeedback();
  const editing = !!sighting;
  // All dives: a sighting added to an older dive must still get that dive's date.
  const dives = useDbQuery((d) => listDives(d));
  const [species, setSpecies] = useState<Species | null>(initialSpecies);
  const [via, setVia] = useState<IdentifiedBy>(sighting?.identified_by ?? identifiedBy);
  const [picking, setPicking] = useState(false);
  const [dive, setDive] = useState<string>(sighting ? (sighting.dive_id ?? '') : (diveId ?? ''));
  const selectedDive = dives.find((d) => d.id === dive);
  const [date, setDate] = useState(sighting ? localDate(sighting.seen_at) : todayLocal());
  const [time, setTime] = useState(sighting ? localTime(sighting.seen_at) : timeLocal());
  const [count, setCount] = useState(sighting?.count ? String(sighting.count) : '');
  const [note, setNote] = useState(sighting?.note ?? '');
  // Photo: keep the stored one, replace it with a new file, or remove it.
  const [newPhoto, setNewPhoto] = useState<Blob | null>(initialPhoto ?? null);
  const [keepStored, setKeepStored] = useState(!!sighting?.photo_uri);
  const storedUrl = usePhotoUrl(keepStored ? sighting?.photo_uri : null);
  const [saving, setSaving] = useState(false);
  const unknown = species === null;

  const save = async () => {
    setSaving(true);
    try {
      const speciesId = species?.id ?? UNIDENTIFIED;
      const day = selectedDive?.date ?? date;
      const at = selectedDive?.entry_time ?? time;
      const seenAt = new Date(`${day}T${at || '12:00'}:00`).toISOString();
      let photoUri = keepStored ? (sighting?.photo_uri ?? null) : null;
      if (newPhoto) photoUri = await savePhoto(newPhoto);
      const fields = {
        species_id: speciesId,
        dive_id: dive || null,
        count: count ? Number(count) : null,
        note: note.trim() || null,
        photo_uri: photoUri,
        identified_by: via,
        seen_at: seenAt,
      };
      let isFirst = false;
      if (sighting) {
        isFirst = !unknown && speciesId !== sighting.species_id && !hasSighting(db, speciesId);
        updateSighting(db, { id: sighting.id, ...fields });
        if (sighting.photo_uri && sighting.photo_uri !== photoUri) void deletePhoto(sighting.photo_uri);
      } else {
        isFirst = addSighting(db, fields).isFirst;
      }
      if (isFirst) celebrate(speciesId);
      else toast(t('sighting.saved'));
      onSaved?.(speciesId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const newPhotoUrl = useObjectUrl(newPhoto);
  const photoPreview = newPhotoUrl ?? storedUrl;

  return (
    <>
      <Sheet
        title={editing ? t('sighting.edit') : unknown ? t('sighting.unidentifiedTitle') : t('sighting.add')}
        onClose={onClose}
        footer={
          <button className="btn primary block" onClick={save} disabled={saving || (unknown && !note.trim() && !newPhoto && !keepStored)}>
            <Icon name="check" />
            {t('sighting.save')}
          </button>
        }
      >
        <div className="stack">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <div className="list-thumb">
              <SightingThumb photoUri={null} species={species} />
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{species ? speciesName(species, lang) : t('sighting.unidentified')}</div>
              <div className="muted small" style={{ fontStyle: species ? 'italic' : undefined }}>
                {species ? species.scientificName : t('sighting.unknownHint')}
              </div>
              {species && editing && (
                <Link className="small" to={`/species/${species.id}`} onClick={onClose}>
                  {t('sighting.openSpecies')}
                </Link>
              )}
            </div>
          </div>
          {(editing || unknown) && (
            <button type="button" className={`btn ${unknown ? 'primary' : 'outline'}`} onClick={() => setPicking(true)}>
              <Icon name="search" />
              {unknown ? t('sighting.assignSpecies') : t('sighting.changeSpecies')}
            </button>
          )}
          {(editing || diveId === undefined) && (
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
          <Field label={unknown ? t('sighting.description') : t('sighting.note')}>
            <textarea
              className="input"
              value={note}
              placeholder={unknown ? t('sighting.descriptionPlaceholder') : undefined}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Field label={t('sighting.count')}>
            <input className="input" type="number" inputMode="numeric" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
          <Field label={t('sighting.photo')}>
            <div className="stack" style={{ gap: 8 }}>
              {photoPreview && <img className="sighting-photo" src={photoPreview} alt={t('sighting.photo')} />}
              {photoPreview ? (
                <button
                  type="button"
                  className="btn small outline"
                  onClick={() => {
                    setNewPhoto(null);
                    setKeepStored(false);
                  }}
                >
                  <Icon name="close" />
                  {t('sighting.removePhoto')}
                </button>
              ) : (
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  aria-label={t('sighting.photo')}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      setNewPhoto(file);
                      setKeepStored(false);
                    }
                  }}
                />
              )}
            </div>
          </Field>
        </div>
      </Sheet>
      {picking && (
        <SpeciesPickerSheet
          title={unknown ? t('sighting.assignSpecies') : t('sighting.changeSpecies')}
          onClose={() => setPicking(false)}
          onPick={(s, how) => {
            setSpecies(s);
            setVia(how);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

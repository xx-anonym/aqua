import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useLang, type Lang } from '../../catalog/useCatalog';
import { formatDate } from '../../lib/format';
import { usePhotoUrl } from '../../user/photos';
import type { SightingWithContext } from '../../user/sightings';
import { Icon } from '../../ui/icons/Icon';

type PhotoSighting = SightingWithContext & { photo_uri: string };

function caption(s: PhotoSighting, lang: Lang, noDive: string) {
  return [formatDate(s.seen_at, lang), s.dive_id ? `#${s.dive_no ?? '–'} · ${s.site_name ?? noDive}` : null].filter(Boolean).join(' · ');
}

function Thumb({ sighting, onOpen, label }: { sighting: PhotoSighting; onOpen: () => void; label: string }) {
  const url = usePhotoUrl(sighting.photo_uri);
  return (
    <button type="button" className="my-photo" onClick={onOpen} aria-label={label}>
      {url ? <img src={url} alt="" /> : <span className="placeholder" aria-hidden="true" />}
    </button>
  );
}

function Slide({ sighting, text }: { sighting: PhotoSighting; text: string }) {
  const url = usePhotoUrl(sighting.photo_uri);
  return (
    <figure>
      {url ? <img src={url} alt={text} /> : <span className="spinner" aria-hidden="true" />}
      <figcaption>{text}</figcaption>
    </figure>
  );
}

/** Full-screen view of the own photos: swipe between them, close with ✕ or Escape. */
function Lightbox({ photos, start, onClose }: { photos: PhotoSighting[]; start: number; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);

  useEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = start * el.clientWidth;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const next = Math.max(0, Math.min(photos.length - 1, Math.round((el?.scrollLeft ?? 0) / (el?.clientWidth || 1)) + (e.key === 'ArrowRight' ? 1 : -1)));
        el?.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [start, photos.length, onClose]);

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t('species.myPhotos', { count: photos.length })}>
      <div className="lightbox-bar">
        <span>{photos.length > 1 ? `${index + 1} / ${photos.length}` : ''}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')} autoFocus>
          <Icon name="close" />
        </button>
      </div>
      <div
        className="lightbox-track"
        ref={track}
        tabIndex={0}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / (e.currentTarget.clientWidth || 1)))}
      >
        {photos.map((p) => (
          <Slide key={p.id} sighting={p} text={caption(p, lang, t('dive.noSite'))} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

/** Own photos of a species from its sightings, as a strip of thumbnails that open full screen. */
export function MyPhotos({ sightings }: { sightings: SightingWithContext[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState<number | null>(null);
  const photos = sightings.filter((s): s is PhotoSighting => !!s.photo_uri);
  if (!photos.length) return null;
  return (
    <>
      <div className="my-photos" role="list" aria-label={t('species.myPhotos', { count: photos.length })}>
        {photos.map((p, i) => (
          <div role="listitem" key={p.id}>
            <Thumb sighting={p} onOpen={() => setOpen(i)} label={t('species.openPhoto', { text: caption(p, lang, t('dive.noSite')) })} />
          </div>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

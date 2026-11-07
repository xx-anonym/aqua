import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { Sheet } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';
import { SpeciesBrowser } from '../discover/SpeciesBrowser';

// Photo ID and the trait wizard load only when someone wants to identify.
const IdentifyPanel = lazy(() => import('../identify/IdentifyScreen').then((m) => ({ default: m.IdentifyPanel })));

/** How the species was chosen: from the list or search, with the trait filter, or by photo ID. */
export type PickVia = 'manual' | 'filter' | 'photo_ai';

/** "Art unbekannt? Trotzdem notieren" – starts an unidentified sighting. */
export function UnknownSpeciesButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="btn outline block" onClick={onClick} style={{ marginBottom: 12 }} data-haptic>
      <Icon name="eye" />
      {t('sighting.unknownSpecies')}
    </button>
  );
}

/** "Tier bestimmen – per Foto oder Merkmalen": opens identifying in place, or the identify page. */
export function IdentifyButton({ onClick, to }: { onClick?: () => void; to?: string }) {
  const { t } = useTranslation();
  const body = (
    <>
      <Icon name="identify" />
      {t('sighting.identify')}
    </>
  );
  return to ? (
    <Link className="btn block identify-btn" to={to} data-haptic>
      {body}
    </Link>
  ) : (
    <button type="button" className="btn block identify-btn" onClick={onClick} data-haptic>
      {body}
    </button>
  );
}

/**
 * Pick a species via list, search or trait filter (same flow as Discover) – or identify it by photo
 * or traits right here: the result comes back like a picked species (with the photo, if it was
 * the photo ID), so a half-filled form behind the sheet stays as it is.
 */
export function SpeciesPickerSheet({
  onPick,
  onUnknown,
  onClose,
  title,
}: {
  onPick: (s: Species, via: PickVia, photo?: Blob) => void;
  /** Offers to record the animal without a species. */
  onUnknown?: () => void;
  onClose: () => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const [identifying, setIdentifying] = useState(false);
  return (
    <Sheet title={identifying ? t('identify.title') : (title ?? t('sighting.pickSpecies'))} onClose={onClose}>
      {identifying ? (
        <>
          <button type="button" className="btn small ghost back-to-list" onClick={() => setIdentifying(false)} data-haptic>
            <Icon name="back" />
            {t('sighting.backToList')}
          </button>
          <Suspense fallback={<div className="loading"><div className="spinner" /></div>}>
            <IdentifyPanel onPick={(s, via, photo) => onPick(s, via, photo)} />
          </Suspense>
        </>
      ) : (
        <>
          <IdentifyButton onClick={() => setIdentifying(true)} />
          {onUnknown && <UnknownSpeciesButton onClick={onUnknown} />}
          <SpeciesBrowser stateKey="picker" onSelect={onPick} />
        </>
      )}
    </Sheet>
  );
}

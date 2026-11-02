import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { Sheet } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';
import { SpeciesBrowser } from '../discover/SpeciesBrowser';

/** "Art unbekannt? Trotzdem notieren" – starts an unidentified sighting. */
export function UnknownSpeciesButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" className="btn outline block" onClick={onClick} style={{ marginBottom: 12 }}>
      <Icon name="eye" />
      {t('sighting.unknownSpecies')}
    </button>
  );
}

/** Pick a species via list, search or trait filter (same flow as Discover). */
export function SpeciesPickerSheet({
  onPick,
  onUnknown,
  onClose,
  title,
}: {
  onPick: (s: Species, via: 'manual' | 'filter') => void;
  /** Offers to record the animal without a species. */
  onUnknown?: () => void;
  onClose: () => void;
  title?: string;
}) {
  const { t } = useTranslation();
  return (
    <Sheet title={title ?? t('sighting.pickSpecies')} onClose={onClose}>
      {onUnknown && <UnknownSpeciesButton onClick={onUnknown} />}
      <SpeciesBrowser stateKey="picker" onSelect={onPick} />
    </Sheet>
  );
}

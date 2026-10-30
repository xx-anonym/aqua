import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { Sheet } from '../../ui/components';
import { SpeciesBrowser } from '../discover/SpeciesBrowser';

/** Pick a species via list, search or trait filter (same flow as Discover). */
export function SpeciesPickerSheet({
  onPick,
  onClose,
  title,
}: {
  onPick: (s: Species, via: 'manual' | 'filter') => void;
  onClose: () => void;
  title?: string;
}) {
  const { t } = useTranslation();
  return (
    <Sheet title={title ?? t('sighting.pickSpecies')} onClose={onClose}>
      <SpeciesBrowser stateKey="picker" onSelect={onPick} />
    </Sheet>
  );
}

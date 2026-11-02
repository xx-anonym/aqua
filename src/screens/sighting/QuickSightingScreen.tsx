import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { useCatalog } from '../../catalog/useCatalog';
import { PageHeader } from '../../ui/components';
import { SpeciesBrowser } from '../discover/SpeciesBrowser';
import { AddSightingSheet } from './AddSightingSheet';
import { UnknownSpeciesButton } from './SpeciesPickerSheet';

/** Plus button → "Schnelle Sichtung": pick a species via list, search or filter, then save. */
export default function QuickSightingScreen() {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get('species');
  // species null = "Art unbekannt", recorded as unidentified sighting
  const [picked, setPicked] = useState<{ species: Species | null; via: 'manual' | 'filter' } | null>(
    preset && catalog.byId.has(preset) ? { species: catalog.byId.get(preset)!, via: 'manual' } : null,
  );

  return (
    <div className="page">
      <PageHeader title={t('sighting.quickTitle')} back />
      <p className="muted" style={{ marginTop: 0 }}>
        {t('sighting.pickSpecies')}
      </p>
      <UnknownSpeciesButton onClick={() => setPicked({ species: null, via: 'manual' })} />
      <SpeciesBrowser stateKey="quick" onSelect={(species, via) => setPicked({ species, via })} />
      {picked && (
        <AddSightingSheet
          species={picked.species}
          identifiedBy={picked.via}
          onClose={() => setPicked(null)}
          onSaved={(speciesId) => navigate(picked.species ? `/species/${speciesId}` : '/logbook', { replace: !picked.species })}
        />
      )}
    </div>
  );
}

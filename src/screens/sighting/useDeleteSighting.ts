import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDb } from '../../db/react';
import { deleteSighting, restoreSighting } from '../../user/sightings';
import { useFeedback } from '../../ui/feedback';

/** Deletes a sighting right away and offers "Undo" in the toast instead of asking first. */
export function useDeleteSighting() {
  const db = useDb();
  const { toast } = useFeedback();
  const { t } = useTranslation();
  return useCallback(
    (id: string) => {
      const stamp = deleteSighting(db, id);
      toast(t('sighting.deleted'), {
        label: t('common.undo'),
        run: () => {
          restoreSighting(db, id, stamp);
          toast(t('common.restored'));
        },
      });
    },
    [db, toast, t],
  );
}

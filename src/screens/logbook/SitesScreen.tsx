import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { regionName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { deleteSite, listSites, type DiveSite } from '../../user/sites';
import { EmptyState, PageHeader } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { SitesMap } from '../../ui/maps';
import { SiteEditorSheet } from './SiteEditorSheet';

export default function SitesScreen() {
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const { toast } = useFeedback();
  const sites = useDbQuery((d) => listSites(d));
  const [view, setView] = useState<'map' | 'list'>('map');
  const [editing, setEditing] = useState<DiveSite | 'new' | null>(null);
  const mapSites = useMemo(
    () =>
      sites
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({ id: s.id, name: s.name, lat: s.lat!, lng: s.lng!, subtitle: [s.country, t('sites.dives', { count: s.dive_count })].filter(Boolean).join(' · ') })),
    [sites, t],
  );

  return (
    <div className="page">
      <PageHeader
        title={t('sites.title')}
        back="/logbook"
        actions={
          <button className="icon-btn" onClick={() => setEditing('new')} aria-label={t('sites.add')}>
            <Icon name="plus" />
          </button>
        }
      />
      <div className="segmented" role="tablist" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={view === 'map'} onClick={() => setView('map')}>
          {t('sites.map')}
        </button>
        <button role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>
          {t('sites.list')}
        </button>
      </div>
      {view === 'map' && (
        <>
          <SitesMap sites={mapSites} onSelect={(id) => setEditing(sites.find((s) => s.id === id) ?? null)} />
          <p className="small muted">{navigator.onLine ? '' : t('sites.offlineMap')}</p>
        </>
      )}
      {sites.length === 0 ? (
        <EmptyState icon="pin" title={t('sites.empty')}>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setEditing('new')}>
            <Icon name="plus" />
            {t('sites.add')}
          </button>
        </EmptyState>
      ) : (
        view === 'list' && (
          <div className="list">
            {sites.map((s) => (
              <div key={s.id} className="list-item">
                <Icon name="pin" />
                <button className="grow" style={{ all: 'unset', cursor: 'pointer', flex: 1 }} onClick={() => setEditing(s)}>
                  <div className="title">{s.name}</div>
                  <div className="sub">
                    {[
                      s.country,
                      s.region_id ? regionName(catalog.regionsById.get(s.region_id)!, lang) : null,
                      t('sites.dives', { count: s.dive_count }),
                      s.is_private ? t('dive.sitePrivate') : t('sites.public'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </button>
                <button
                  className="icon-btn"
                  aria-label={t('common.delete')}
                  onClick={() => {
                    if (!confirm(t('sites.confirmDelete'))) return;
                    deleteSite(db, s.id);
                    toast(t('sites.deleted'));
                  }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
      {editing && <SiteEditorSheet site={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

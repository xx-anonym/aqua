import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { compareTraits } from '../../catalog/similar';
import type { Species } from '../../catalog/types';
import { speciesName, traitLabel, useCatalog, useLang } from '../../catalog/useCatalog';
import { formatDepth } from '../../lib/units';
import { useSettings } from '../../settings/settings';
import { EmptyState, IucnBadge, PageHeader, SpeciesThumb, TraitIcon } from '../../ui/components';

/** Two similar species side by side; differing traits and facts are highlighted. */
export default function CompareScreen() {
  const { a = '', b = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const depthUnit = useSettings((s) => s.depthUnit);
  const sa = catalog.byId.get(a);
  const sb = catalog.byId.get(b);
  if (!sa || !sb) {
    return (
      <div className="page">
        <PageHeader title={t('compare.title')} back />
        <EmptyState icon="compare" title={t('species.notFound')} />
      </div>
    );
  }

  const comparison = compareTraits(sa, sb);
  const factRows: { label: string; value: (s: Species) => string }[] = [
    { label: t('species.family'), value: (s) => s.family ?? '–' },
    { label: t('species.maxSize'), value: (s) => (s.maxSizeCm != null ? `${s.maxSizeCm} cm` : '–') },
    {
      label: t('species.depth'),
      value: (s) => `${formatDepth(s.depthMinM ?? 0, depthUnit, lang)} – ${formatDepth(s.depthMaxM, depthUnit, lang)}`,
    },
    { label: t('species.habitat'), value: (s) => (s.habitat ? t(`habitat.${s.habitat}`, { defaultValue: s.habitat }) : '–') },
  ];

  const pill = (id: string, diff: boolean) => {
    const tr = catalog.traitsById.get(id);
    if (!tr) return null;
    return (
      <span key={id} className={`trait-pill${diff ? ' diff' : ''}`}>
        <TraitIcon trait={tr} />
        {traitLabel(tr, lang)}
        {diff && <span className="sr-only">({t('compare.differs')})</span>}
      </span>
    );
  };

  return (
    <div className="page">
      <PageHeader title={t('compare.title')} back />
      <div className="compare">
        {[sa, sb].map((s) => (
          <Link key={s.id} to={`/species/${s.id}`} className="species-card">
            <div className="thumb">
              <SpeciesThumb species={s} />
            </div>
            <div className="names">
              <div className="name">{speciesName(s, lang)}</div>
              <div className="sci">{s.scientificName}</div>
            </div>
          </Link>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        {t('compare.legend')}
      </p>

      {comparison.map((c) => (
        <section key={c.type}>
          <h3 className="section-title">{t(`traitType.${c.type}`)}</h3>
          <div className="compare">
            <div>
              {c.shared.map((id) => pill(id, false))}
              {c.onlyA.map((id) => pill(id, true))}
            </div>
            <div>
              {c.shared.map((id) => pill(id, false))}
              {c.onlyB.map((id) => pill(id, true))}
            </div>
          </div>
        </section>
      ))}

      <h3 className="section-title">{t('compare.facts')}</h3>
      {factRows.map((row) => {
        const va = row.value(sa);
        const vb = row.value(sb);
        const diff = va !== vb;
        return (
          <div key={row.label} style={{ marginBottom: 10 }}>
            <div className="small muted" style={{ fontWeight: 650 }}>
              {row.label}
            </div>
            <div className="compare">
              <div className={`fact${diff ? ' diff' : ''}`}>{va}</div>
              <div className={`fact${diff ? ' diff' : ''}`}>{vb}</div>
            </div>
          </div>
        );
      })}
      <div className="compare">
        <IucnBadge status={sa.iucn} />
        <IucnBadge status={sb.iucn} />
      </div>
    </div>
  );
}

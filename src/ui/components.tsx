import { useId, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useViewTransitionState } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Species, Trait } from '../catalog/types';
import { catalogAssetUrl } from '../catalog/catalog';
import { speciesName, traitLabel, useLang } from '../catalog/useCatalog';
import { COLOR_SWATCHES, Icon } from './icons/Icon';
import { ProfileButton } from './ProfileButton';
import { useModalDialog } from './dialog';

export function PageHeader({
  title,
  back,
  onBack,
  actions,
  titleHidden,
}: {
  title: string;
  back?: boolean | string;
  /** Lets editing screens protect unsaved work before using the usual back navigation. */
  onBack?: () => void;
  actions?: ReactNode;
  /** Fades the title out while the page shows the same title large below (it stays for screen readers). */
  titleHidden?: boolean;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const goBack = () => {
    if (onBack) return onBack();
    if (typeof back === 'string') return navigate(back);
    // Pages opened directly (e.g. after the sign-in redirect) have no in-app history to go back to.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    return idx > 0 ? navigate(-1) : navigate('/start');
  };
  // Main screens carry the profile button; detail screens keep the header for their own actions.
  const showProfile = !back && !pathname.startsWith('/profile');
  return (
    <header className={`header${back ? ' with-back' : ''}`}>
      {back && (
        <button className="icon-btn" aria-label={t('common.back')} onClick={goBack}>
          <Icon name="back" />
        </button>
      )}
      <h1 className={titleHidden ? 'faded' : undefined}>{title}</h1>
      {(actions || showProfile) && (
        <div className="header-actions">
          {actions}
          {showProfile && <ProfileButton />}
        </div>
      )}
    </header>
  );
}

/** Name shared by a species tile's photo and the species page's first photo while one turns into the other. */
export const SPECIES_PHOTO_TRANSITION = 'species-photo';

export function SpeciesThumb({ species, alt, transitionName }: { species: Species; alt?: string; transitionName?: string }) {
  const src = catalogAssetUrl(species.thumb);
  return src ? (
    <img src={src} alt={alt ?? ''} loading="lazy" decoding="async" style={transitionName ? { viewTransitionName: transitionName } : undefined} />
  ) : (
    <div className="placeholder">
      <Icon name={species.category === 'coral_sponge_plant' ? 'shape-branching' : species.category === 'creature' ? 'shape-slug' : 'fish'} />
    </div>
  );
}

export function SpeciesCard({
  species,
  seen,
  dimUnseen,
  onClick,
  to,
  morph = true,
}: {
  species: Species;
  seen?: boolean;
  dimUnseen?: boolean;
  onClick?: () => void;
  to?: string;
  /** Off where the page's own large photo already carries the transition (species page). */
  morph?: boolean;
}) {
  const lang = useLang();
  const { t } = useTranslation();
  const name = speciesName(species, lang);
  // While the page of this tile opens, its photo grows into the page's large photo.
  const opening = useViewTransitionState(to ?? '#');
  const body = (
    <>
      <div className="thumb">
        <SpeciesThumb species={species} transitionName={to && morph && opening ? SPECIES_PHOTO_TRANSITION : undefined} />
        {seen && (
          <span className="seen-badge" title={t('species.seen')}>
            <Icon name="check" />
          </span>
        )}
      </div>
      <div className="names">
        <div className="name">{name}</div>
        <div className="sci">{species.scientificName}</div>
      </div>
      <span className="sr-only">{seen ? t('species.seen') : dimUnseen ? t('collection.notSeen') : ''}</span>
    </>
  );
  const cls = `species-card${dimUnseen && !seen ? ' unseen' : ''}`;
  if (to) {
    return (
      <Link to={to} className={cls} viewTransition>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} data-haptic>
      {body}
    </button>
  );
}

export function TraitIcon({ trait }: { trait: Trait }) {
  if (trait.type === 'color') {
    const bg = COLOR_SWATCHES[trait.id] ?? '#999';
    return <span className="swatch" style={{ background: bg }} aria-hidden />;
  }
  return <Icon name={trait.icon} />;
}

export function TraitChip({
  trait,
  selected,
  onToggle,
  count,
}: {
  trait: Trait;
  selected: boolean;
  onToggle: () => void;
  count?: number;
}) {
  const lang = useLang();
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onToggle} disabled={count === 0 && !selected}>
      <TraitIcon trait={trait} />
      {traitLabel(trait, lang)}
      {count !== undefined && <span className="muted small">{count}</span>}
    </button>
  );
}

export function Chip({ selected, onToggle, children, icon }: { selected: boolean; onToggle: () => void; children: ReactNode; icon?: string }) {
  return (
    <button type="button" className="chip" aria-pressed={selected} onClick={onToggle}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useModalDialog(onClose);
  return (
    // A click on the dimmed area (the dialog itself, around the sheet) closes it.
    <dialog
      className="sheet-backdrop"
      aria-labelledby={titleId}
      ref={ref}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet" tabIndex={-1} data-autofocus onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

/** A number with − and + beside it (still typeable), e.g. how many animals were seen. */
export function Stepper({
  value,
  onChange,
  label,
  lessLabel,
  moreLabel,
  min = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  lessLabel: string;
  moreLabel: string;
  min?: number;
}) {
  const n = Number(value) || 0;
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-btn" onClick={() => onChange(String(Math.max(min, n - 1)))} disabled={n <= min} aria-label={lessLabel} data-haptic>
        <Icon name="minus" />
      </button>
      <input className="input" type="number" inputMode="numeric" min={min} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      <button type="button" className="icon-btn" onClick={() => onChange(String(Math.max(min, n + 1)))} aria-label={moreLabel} data-haptic>
        <Icon name="plus" />
      </button>
    </div>
  );
}

export function Accordion({
  title,
  hint,
  children,
  defaultOpen,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="accordion" open={defaultOpen}>
      <summary>
        {title}
        {hint && <span className="summary-hint">{hint}</span>}
      </summary>
      <div className="accordion-body">{children}</div>
    </details>
  );
}

export function ProgressBar({ seen, total, label }: { seen: number; total: number; label: string }) {
  const pct = total ? Math.round((seen / total) * 100) : 0;
  return (
    <div className="progress-row">
      <span className="small" style={{ fontWeight: 650 }}>
        {label}
      </span>
      <span className="small muted">
        {seen} / {total}
      </span>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={seen} aria-label={label}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  const { t } = useTranslation();
  if (!onChange) {
    if (!value) return null;
    return (
      <span className="stars readonly" aria-label={t('dive.ratingValue', { count: value })}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= value ? 'on' : ''}>
            <Icon name="star" />
          </span>
        ))}
      </span>
    );
  }
  return (
    <div className="stars" role="radiogroup" aria-label={t('dive.rating')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={t('dive.ratingValue', { count: i })}
          className={value && i <= value ? 'on' : ''}
          onClick={() => onChange(value === i ? null : i)}
          data-haptic
        >
          <Icon name="star" />
        </button>
      ))}
    </div>
  );
}

const IUCN_COLORS: Record<string, string> = {
  LC: 'var(--iucn-lc)',
  NT: 'var(--iucn-nt)',
  VU: 'var(--iucn-vu)',
  EN: 'var(--iucn-en)',
  CR: 'var(--iucn-cr)',
  EW: '#7f1d1d',
  EX: '#000',
  DD: 'var(--iucn-dd)',
  NE: 'var(--iucn-dd)',
};

export function IucnBadge({ status }: { status: string | null }) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <span className="iucn" style={{ background: IUCN_COLORS[status] ?? 'var(--iucn-dd)' }} title={t('species.iucnTitle')}>
      {status} · {t(`iucn.${status}`, { defaultValue: status })}
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

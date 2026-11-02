import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyFilter, emptyFilter, placeFilter, regionOfPlace, toggle, type SpeciesFilter } from '../../catalog/filter';
import { CATEGORIES, type Species, type TraitType } from '../../catalog/types';
import { regionName, speciesName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDbQuery } from '../../db/react';
import {
  dequeue,
  enqueue,
  identifyPhoto,
  listQueue,
  PhotoIdError,
  queuedBlob,
  type IdentifyResult,
  type QueuedPhoto,
} from '../../identify/photoId';
import { useSettings } from '../../settings/settings';
import { useSync } from '../../sync/syncManager';
import { lifeList } from '../../user/lifelist';
import { Chip, EmptyState, PageHeader, SpeciesCard, SpeciesThumb, TraitChip } from '../../ui/components';
import { Icon } from '../../ui/icons/Icon';
import { DestinationSelect } from '../../ui/PlaceSelect';
import { AddSightingSheet } from '../sighting/AddSightingSheet';
import { useObjectUrl } from '../../lib/useObjectUrl';

function Suggestions({
  result,
  photo,
}: {
  result: IdentifyResult;
  photo: Blob;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const [rejected, setRejected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Species | null>(null);
  const items = result.suggestions.filter((s) => !rejected.includes(s.species_id) && catalog.byId.has(s.species_id));

  return (
    <div className="stack">
      <h3 className="section-title" style={{ margin: '8px 0 0' }}>
        {t('identify.suggestions')}
      </h3>
      {items.length === 0 && <p className="muted">{t('identify.noResult')}</p>}
      {items.map((s) => {
        const sp = catalog.byId.get(s.species_id)!;
        const pct = Math.round(s.confidence * 100);
        return (
          <div key={s.species_id} className="card suggestion">
            <Link to={`/species/${sp.id}`} aria-label={speciesName(sp, lang)}>
              <SpeciesThumb species={sp} />
            </Link>
            <div>
              <div style={{ fontWeight: 750 }}>{speciesName(sp, lang)}</div>
              <div className="muted small" style={{ fontStyle: 'italic' }}>
                {sp.scientificName}
              </div>
              <div className="confidence" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('identify.confidence', { value: pct })}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <div className="small">{t('identify.confidence', { value: pct })}</div>
              {s.reason && <div className="small muted">{s.reason}</div>}
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn small primary" onClick={() => setConfirmed(sp)}>
                  <Icon name="check" />
                  {t('identify.confirm')}
                </button>
                <button className="btn small outline" onClick={() => setRejected((r) => [...r, s.species_id])}>
                  {t('identify.reject')}
                </button>
              </div>
            </div>
          </div>
        );
      })}
      <p className="small muted">{t('identify.noneMatch')}</p>
      {result.used != null && result.limit != null && (
        <p className="small muted">{t('identify.quota', { used: result.used, limit: result.limit })}</p>
      )}
      {confirmed && (
        <AddSightingSheet species={confirmed} identifiedBy="photo_ai" initialPhoto={photo} onClose={() => setConfirmed(null)} />
      )}
    </div>
  );
}

function PhotoIdCard() {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const defaultRegion = useSettings((s) => s.region);
  const syncStatus = useSync((s) => s.status);
  const [region, setRegion] = useState<string | null>(regionOfPlace(defaultRegion));
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [result, setResult] = useState<IdentifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const preview = useObjectUrl(photo);

  const refreshQueue = useCallback(() => void listQueue().then(setQueue), []);
  useEffect(refreshQueue, [refreshQueue]);

  const errorText = (e: unknown) => {
    if (e instanceof PhotoIdError) {
      if (e.code === 'login') return t('identify.loginRequired');
      if (e.code === 'not_configured') return t('identify.notConfigured');
      if (e.code === 'quota') return t('identify.quotaExceeded');
      if (e.code === 'offline') return t('identify.offlineQueued');
      return t('identify.error', { message: e.message });
    }
    return t('identify.error', { message: String(e) });
  };

  const run = async (blob: Blob, regionId: string | null) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await identifyPhoto(catalog, blob, regionId));
      return true;
    } catch (e) {
      if (e instanceof PhotoIdError && e.code === 'offline') {
        await enqueue(blob, regionId);
        refreshQueue();
      }
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const runQueued = async (q: QueuedPhoto) => {
    const blob = await queuedBlob(q.id);
    if (!blob) return dequeue(q.id).then(refreshQueue);
    setPhoto(blob);
    setRegion(q.regionId);
    if (await run(blob, q.regionId)) {
      await dequeue(q.id);
      refreshQueue();
    }
  };

  const pick = (file: File | undefined) => {
    if (!file) return;
    setPhoto(file);
    setResult(null);
    setError(null);
  };

  return (
    <div className="card stack">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Icon name="camera" style={{ width: 28, height: 28, flex: 'none' }} />
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t('identify.photoTitle')}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {t('identify.photoHint')}
          </p>
        </div>
      </div>
      {syncStatus === 'signedOut' && <p className="notice small" style={{ margin: 0 }}>{t('identify.loginRequired')}</p>}
      <label className="field">
        <span>{t('identify.region')}</span>
        <select className="input" value={region ?? ''} onChange={(e) => setRegion(e.target.value || null)}>
          <option value="">{t('identify.anyRegion')}</option>
          {catalog.regionTree().map((r) => (
            <option key={r.id} value={r.id}>
              {r.parentId ? '— ' : ''}
              {regionName(r, lang)}
            </option>
          ))}
        </select>
      </label>
      <div className="stack" style={{ gap: 10 }}>
        <label className="btn primary block">
          <Icon name="camera" />
          {t('identify.takePhoto')}
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <label className="btn outline block">
          <Icon name="image" />
          {t('identify.choosePhoto')}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </div>
      {preview && <img className="photo-preview" src={preview} alt="" />}
      {photo && !result && (
        <button className="btn primary block" disabled={busy} onClick={() => run(photo, region)}>
          {busy ? <span className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} /> : <Icon name="sparkle" />}
          {busy ? t('identify.analysing') : t('identify.analyse')}
        </button>
      )}
      {error && (
        <p className="notice warn small" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      {result && photo && <Suggestions result={result} photo={photo} />}
      {queue.length > 0 && (
        <div className="stack">
          <div className="small" style={{ fontWeight: 650 }}>
            {t('identify.queue', { count: queue.length })}
          </div>
          <div className="row">
            {queue.map((q) => (
              <button key={q.id} className="btn small outline" disabled={busy || !navigator.onLine} onClick={() => runQueued(q)}>
                <Icon name="sparkle" />
                {t('identify.queueRun')} · {new Date(q.createdAt).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STEP_TYPES: TraitType[] = ['color', 'pattern', 'body_shape', 'behavior', 'social'];

/** Guided identification without a photo: region → category → colour → pattern → shape → behaviour. */
function TraitWizard() {
  const { t } = useTranslation();
  const lang = useLang();
  const catalog = useCatalog();
  const defaultRegion = useSettings((s) => s.region);
  const seen = useDbQuery((d) => lifeList(d));
  const [filter, setFilter] = useState<SpeciesFilter>(() => ({ ...emptyFilter(), ...placeFilter(defaultRegion) }));
  const [step, setStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const total = 2 + STEP_TYPES.length;
  const matches = useMemo(() => applyFilter(catalog.species, filter), [catalog, filter]);

  const restart = () => {
    setFilter({ ...emptyFilter(), ...placeFilter(defaultRegion) });
    setStep(0);
    setShowResults(false);
  };

  let body: React.ReactNode;
  if (step === 0) {
    body = (
      <>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {t('identify.stepRegion')}
        </h3>
        <div className="chips">
          {catalog.regionTree().map((r) => (
            <Chip
              key={r.id}
              icon="globe"
              selected={filter.regions.includes(r.id)}
              onToggle={() => setFilter({ ...filter, regions: toggle(filter.regions, r.id), destinations: [] })}
            >
              {regionName(r, lang)}
            </Chip>
          ))}
        </div>
        {catalog.destinations.length > 0 && (
          <div className="field" style={{ marginTop: 14 }}>
            <span>{t('filter.destination')}</span>
            <DestinationSelect
              label={t('filter.destination')}
              value={filter.destinations[0] ?? null}
              onChange={(id) => setFilter({ ...filter, destinations: id ? [id] : [], regions: id ? [] : filter.regions })}
            />
          </div>
        )}
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {t('identify.stepCategory')}
        </h3>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              icon={c === 'fish' ? 'fish' : c === 'creature' ? 'shape-slug' : 'shape-branching'}
              selected={filter.category === c}
              onToggle={() => setFilter({ ...filter, category: filter.category === c ? null : c, traits: { ...filter.traits, body_shape: [] } })}
            >
              {t(`category.${c}`)}
            </Chip>
          ))}
        </div>
      </>
    );
  } else {
    const type = STEP_TYPES[step - 2];
    body = (
      <>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {t(`traitType.${type}`)}
        </h3>
        <div className="chips">
          {catalog.traitsOfType(type, filter.category).map((tr) => (
            <TraitChip
              key={tr.id}
              trait={tr}
              selected={filter.traits[type].includes(tr.id)}
              onToggle={() => setFilter({ ...filter, traits: { ...filter.traits, [type]: toggle(filter.traits[type], tr.id) } })}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="card stack">
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <Icon name="filter" style={{ width: 28, height: 28, flex: 'none' }} />
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t('identify.traitsTitle')}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {t('identify.traitsHint')}
          </p>
        </div>
      </div>
      <div className="step-dots" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <div className="row spread small">
        <span>{t('identify.step', { n: step + 1, total })}</span>
        <strong aria-live="polite">{t('identify.matches', { count: matches.length })}</strong>
      </div>
      {body}
      <div className="row">
        <button className="btn outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
          {t('identify.prev')}
        </button>
        {step < total - 1 && (
          <button className="btn primary" onClick={() => setStep(step + 1)}>
            {t('identify.next')}
          </button>
        )}
        <button className="btn outline" onClick={() => setShowResults(true)} disabled={!matches.length}>
          {t('identify.results')}
        </button>
        <button className="btn outline" onClick={restart}>
          {t('identify.restart')}
        </button>
      </div>
      {showResults &&
        (matches.length === 0 ? (
          <EmptyState icon="search" title={t('discover.noResults')} />
        ) : (
          <div className="species-grid">
            {matches.slice(0, 60).map((s) => (
              <SpeciesCard key={s.id} species={s} seen={seen.has(s.id)} to={`/species/${s.id}`} />
            ))}
          </div>
        ))}
    </div>
  );
}

export default function IdentifyScreen() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <PageHeader title={t('identify.title')} />
      <div className="stack">
        <PhotoIdCard />
        <TraitWizard />
      </div>
    </div>
  );
}

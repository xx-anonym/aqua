import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Species } from '../../catalog/types';
import { speciesName, useCatalog, useLang } from '../../catalog/useCatalog';
import { useDb, useDbQuery } from '../../db/react';
import { todayLocal } from '../../lib/ids';
import {
  depthFromUnit,
  depthToUnit,
  pressureFromUnit,
  pressureToUnit,
  round,
  tempFromUnit,
  tempToUnit,
  unitLabel,
} from '../../lib/units';
import { useSettings } from '../../settings/settings';
import {
  CURRENTS,
  DIVE_TYPES,
  durationFromTimes,
  GASES,
  getDive,
  lastEquipment,
  nextDiveNo,
  SUITS,
  TANK_MATERIALS,
  WATER_TYPES,
  writeDive,
  type DiveEquipment,
  type DiveFull,
  type DiveType,
} from '../../user/dives';
import { softDelete, upsertRow } from '../../user/repo';
import { hasSighting, sightingsForDive } from '../../user/sightings';
import { listSites } from '../../user/sites';
import { Accordion, Chip, EmptyState, Field, PageHeader, SpeciesThumb, Stars } from '../../ui/components';
import { useFeedback } from '../../ui/feedback';
import { Icon } from '../../ui/icons/Icon';
import { SpeciesPickerSheet } from '../sighting/SpeciesPickerSheet';
import { SiteEditorSheet } from './SiteEditorSheet';

type Str = string;
interface Form {
  dive_no: Str;
  date: Str;
  site_id: Str;
  entry_time: Str;
  exit_time: Str;
  max_depth: Str;
  avg_depth: Str;
  duration: Str;
  rating: number | null;
  notes: Str;
  visibility: Str;
  water_temp: Str;
  air_temp: Str;
  water_type: Str;
  current: Str;
  features: DiveType[];
  suit: Str;
  gas: Str;
  o2: Str;
  tank_volume: Str;
  tank_material: Str;
  p_start: Str;
  p_end: Str;
  weight: Str;
}

interface DraftSighting {
  key: string;
  id?: string;
  species_id: string;
  count: Str;
  identified_by: 'manual' | 'filter';
}

const s = (v: number | null | undefined, digits = 1) => (v == null ? '' : String(round(v, digits)));
const n = (v: Str): number | null => {
  if (!v.trim()) return null;
  const x = Number(v.replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};

function toForm(d: DiveFull | null, diveNo: number, u: ReturnType<typeof useSettings.getState>): Form {
  const c = d?.conditions;
  const e = d?.equipment;
  return {
    dive_no: d ? s(d.dive_no, 0) : String(diveNo),
    date: d?.date ?? todayLocal(),
    site_id: d?.site_id ?? '',
    entry_time: d?.entry_time ?? '',
    exit_time: d?.exit_time ?? '',
    max_depth: d?.max_depth_m != null ? s(depthToUnit(d.max_depth_m, u.depthUnit)) : '',
    avg_depth: d?.avg_depth_m != null ? s(depthToUnit(d.avg_depth_m, u.depthUnit)) : '',
    duration: s(d?.duration_min, 0),
    rating: d?.rating ?? null,
    notes: d?.notes ?? '',
    visibility: c?.visibility_m != null ? s(depthToUnit(c.visibility_m, u.depthUnit), 0) : '',
    water_temp: c?.water_temp_c != null ? s(tempToUnit(c.water_temp_c, u.tempUnit)) : '',
    air_temp: c?.air_temp_c != null ? s(tempToUnit(c.air_temp_c, u.tempUnit)) : '',
    water_type: c?.water_type ?? '',
    current: c?.current ?? '',
    features: d?.features ?? [],
    ...equipmentFields(e ?? null, u),
  };
}

function equipmentFields(e: DiveEquipment | null, u: ReturnType<typeof useSettings.getState>) {
  return {
    suit: e?.suit ?? '',
    gas: e?.gas ?? '',
    o2: s(e?.o2_percent, 0),
    tank_volume: s(e?.tank_volume_l),
    tank_material: e?.tank_material ?? '',
    p_start: e?.pressure_start_bar != null ? s(pressureToUnit(e.pressure_start_bar, u.pressureUnit), 0) : '',
    p_end: e?.pressure_end_bar != null ? s(pressureToUnit(e.pressure_end_bar, u.pressureUnit), 0) : '',
    weight: s(e?.weight_kg),
  };
}

const filled = (...values: unknown[]) => values.filter((v) => (Array.isArray(v) ? v.length : v !== '' && v != null)).length;

export default function DiveEditorScreen() {
  const { id } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const db = useDb();
  const catalog = useCatalog();
  const navigate = useNavigate();
  const { toast, celebrate } = useFeedback();
  const units = useSettings();
  const existing = useMemo(() => (id ? getDive(db, id) : null), [db, id]);
  const sites = useDbQuery((d) => listSites(d));
  const [form, setForm] = useState<Form>(() => toForm(existing, nextDiveNo(db), units));
  const [sightings, setSightings] = useState<DraftSighting[]>(() =>
    id
      ? sightingsForDive(db, id).map((x) => ({
          key: x.id,
          id: x.id,
          species_id: x.species_id,
          count: x.count ? String(x.count) : '',
          identified_by: x.identified_by === 'filter' ? 'filter' : 'manual',
        }))
      : [],
  );
  const [picking, setPicking] = useState(false);
  const [siteSheet, setSiteSheet] = useState(false);

  if (id && !existing) {
    return (
      <div className="page">
        <PageHeader title={t('dive.notFound')} back="/logbook" />
        <EmptyState icon="logbook" title={t('dive.notFound')} />
      </div>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key: keyof Form, props: Record<string, unknown> = {}) => (
    <input
      className="input"
      value={form[key] as string}
      onChange={(e) => set(key, e.target.value as never)}
      inputMode={props.type ? undefined : 'decimal'}
      {...props}
    />
  );
  const select = (key: keyof Form, options: readonly string[], labelKey: string) => (
    <select className="input" value={form[key] as string} onChange={(e) => set(key, e.target.value as never)}>
      <option value="">{t('common.none')}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {t(`${labelKey}.${o}`)}
        </option>
      ))}
    </select>
  );

  const applyLastEquipment = () => {
    const e = lastEquipment(db);
    if (!e) return toast(t('dive.noLastEquipment'));
    setForm((f) => ({ ...f, ...equipmentFields(e, units) }));
  };

  const save = (ev: FormEvent) => {
    ev.preventDefault();
    if (!form.date) return;
    const depth = (v: Str) => (n(v) == null ? null : round(depthFromUnit(n(v)!, units.depthUnit), 2));
    const duration = n(form.duration) ?? durationFromTimes(form.entry_time || null, form.exit_time || null);
    const firstSeen: string[] = [];
    const diveId = db.tx(() => {
      const newId = writeDive(db, {
        id: existing?.id,
        dive_no: n(form.dive_no),
        date: form.date,
        entry_time: form.entry_time || null,
        exit_time: form.exit_time || null,
        max_depth_m: depth(form.max_depth),
        avg_depth_m: depth(form.avg_depth),
        duration_min: duration,
        site_id: form.site_id || null,
        rating: form.rating,
        notes: form.notes.trim() || null,
        source: existing?.source ?? 'manual',
        conditions: {
          visibility_m: depth(form.visibility),
          water_temp_c: n(form.water_temp) == null ? null : round(tempFromUnit(n(form.water_temp)!, units.tempUnit), 1),
          air_temp_c: n(form.air_temp) == null ? null : round(tempFromUnit(n(form.air_temp)!, units.tempUnit), 1),
          water_type: (form.water_type || null) as never,
          current: (form.current || null) as never,
        },
        features: form.features,
        equipment: {
          suit: (form.suit || null) as never,
          gas: (form.gas || null) as never,
          o2_percent: form.gas === 'air' ? 21 : n(form.o2),
          tank_volume_l: n(form.tank_volume),
          tank_material: (form.tank_material || null) as never,
          pressure_start_bar: n(form.p_start) == null ? null : round(pressureFromUnit(n(form.p_start)!, units.pressureUnit), 0),
          pressure_end_bar: n(form.p_end) == null ? null : round(pressureFromUnit(n(form.p_end)!, units.pressureUnit), 0),
          weight_kg: n(form.weight),
        },
      });
      // Sightings: remove dropped ones, upsert the rest with the dive's date/time.
      const keep = new Set(sightings.map((x) => x.id).filter(Boolean));
      for (const old of existing ? sightingsForDive(db, existing.id) : []) {
        if (!keep.has(old.id)) softDelete(db, 'sighting', 'id = ?', [old.id]);
      }
      const seenAt = new Date(`${form.date}T${form.entry_time || '12:00'}:00`).toISOString();
      for (const x of sightings) {
        if (!x.id && !hasSighting(db, x.species_id) && !firstSeen.includes(x.species_id)) firstSeen.push(x.species_id);
        upsertRow(db, 'sighting', {
          id: x.id,
          dive_id: newId,
          species_id: x.species_id,
          count: n(x.count),
          identified_by: x.identified_by,
          seen_at: seenAt,
        });
      }
      return newId;
    });
    if (firstSeen.length) celebrate(firstSeen[0]);
    else toast(t('dive.saved'));
    navigate(`/logbook/${diveId}`, { replace: true });
  };

  const addSpecies = (sp: Species, via: 'manual' | 'filter') => {
    setPicking(false);
    setSightings((list) =>
      list.some((x) => x.species_id === sp.id)
        ? list
        : [...list, { key: `${sp.id}-${Date.now()}`, species_id: sp.id, count: '', identified_by: via }],
    );
  };

  const dU = unitLabel(units.depthUnit);
  const tU = unitLabel(units.tempUnit);
  const pU = unitLabel(units.pressureUnit);

  return (
    <form className="page" onSubmit={save}>
      <PageHeader
        title={existing ? t('dive.editTitle') : t('dive.newTitle')}
        back
        actions={
          <button className="btn small primary" type="submit">
            {t('common.save')}
          </button>
        }
      />
      <div className="card stack" style={{ marginBottom: 12 }}>
        <div className="grid-2">
          <Field label={`${t('dive.date')} *`}>
            <input className="input" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
          </Field>
          <Field label={t('dive.number')}>{input('dive_no', { inputMode: 'numeric' })}</Field>
        </div>
        <Field label={`${t('dive.site')} *`}>
          <select
            className="input"
            value={form.site_id}
            required
            onChange={(e) => (e.target.value === '__new' ? setSiteSheet(true) : set('site_id', e.target.value))}
          >
            <option value="">{t('dive.chooseSite')}</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
                {site.country ? ` (${site.country})` : ''}
              </option>
            ))}
            <option value="__new">+ {t('dive.newSite')}</option>
          </select>
        </Field>
      </div>

      <Accordion title={t('dive.basics')} hint={t('dive.sectionHint', { count: filled(form.entry_time, form.exit_time, form.max_depth, form.avg_depth, form.duration) })} defaultOpen>
        <div className="grid-2">
          <Field label={t('dive.entryTime')}>{input('entry_time', { type: 'time' })}</Field>
          <Field label={t('dive.exitTime')}>{input('exit_time', { type: 'time' })}</Field>
          <Field label={`${t('dive.maxDepth')} (${dU})`}>{input('max_depth')}</Field>
          <Field label={`${t('dive.avgDepth')} (${dU})`}>{input('avg_depth')}</Field>
        </div>
        <Field label={t('dive.duration')}>
          {input('duration', {
            inputMode: 'numeric',
            placeholder: durationFromTimes(form.entry_time || null, form.exit_time || null)?.toString() ?? '',
          })}
        </Field>
      </Accordion>

      <Accordion title={t('dive.conditions')} hint={t('dive.sectionHint', { count: filled(form.visibility, form.water_temp, form.air_temp, form.water_type, form.current) })}>
        <div className="grid-2">
          <Field label={`${t('dive.visibility')} (${dU})`}>{input('visibility')}</Field>
          <Field label={`${t('dive.waterTemp')} (${tU})`}>{input('water_temp')}</Field>
          <Field label={`${t('dive.airTemp')} (${tU})`}>{input('air_temp')}</Field>
          <Field label={t('dive.waterType')}>{select('water_type', WATER_TYPES, 'dive.waterTypes')}</Field>
        </div>
        <Field label={t('dive.current')}>{select('current', CURRENTS, 'dive.currents')}</Field>
      </Accordion>

      <Accordion title={t('dive.types')} hint={t('dive.sectionHint', { count: form.features.length })}>
        <div className="chips">
          {DIVE_TYPES.map((type) => (
            <Chip
              key={type}
              selected={form.features.includes(type)}
              onToggle={() =>
                set('features', form.features.includes(type) ? form.features.filter((x) => x !== type) : [...form.features, type])
              }
            >
              {t(`dive.typeNames.${type}`)}
            </Chip>
          ))}
        </div>
      </Accordion>

      <Accordion
        title={t('dive.equipment')}
        hint={t('dive.sectionHint', { count: filled(form.suit, form.gas, form.tank_volume, form.p_start, form.p_end, form.weight) })}
      >
        <button type="button" className="btn small outline" onClick={applyLastEquipment}>
          <Icon name="sync" />
          {t('dive.useLastEquipment')}
        </button>
        <div className="grid-2">
          <Field label={t('dive.suit')}>{select('suit', SUITS, 'dive.suits')}</Field>
          <Field label={t('dive.gas')}>{select('gas', GASES, 'dive.gases')}</Field>
          {form.gas && form.gas !== 'air' && <Field label={t('dive.o2')}>{input('o2', { inputMode: 'numeric' })}</Field>}
          <Field label={t('dive.tankVolume')}>{input('tank_volume')}</Field>
          <Field label={t('dive.tankMaterial')}>{select('tank_material', TANK_MATERIALS, 'dive.tankMaterials')}</Field>
          <Field label={`${t('dive.pressureStart')} (${pU})`}>{input('p_start', { inputMode: 'numeric' })}</Field>
          <Field label={`${t('dive.pressureEnd')} (${pU})`}>{input('p_end', { inputMode: 'numeric' })}</Field>
          <Field label={t('dive.weight')}>{input('weight')}</Field>
        </div>
      </Accordion>

      <Accordion title={t('dive.sightings')} hint={t('dive.sectionHint', { count: sightings.length })} defaultOpen={sightings.length > 0}>
        {sightings.length > 0 && (
          <div className="list">
            {sightings.map((x) => {
              const sp = catalog.byId.get(x.species_id);
              return (
                <div key={x.key} className="list-item">
                  <div className="list-thumb">{sp && <SpeciesThumb species={sp} />}</div>
                  <div className="grow">
                    <div className="title">{sp ? speciesName(sp, lang) : x.species_id}</div>
                    <input
                      className="input"
                      style={{ minHeight: 40, marginTop: 4, maxWidth: 140 }}
                      inputMode="numeric"
                      aria-label={t('sighting.count')}
                      placeholder={t('sighting.count')}
                      value={x.count}
                      onChange={(e) => setSightings((l) => l.map((y) => (y.key === x.key ? { ...y, count: e.target.value } : y)))}
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('sighting.delete')}
                    onClick={() => setSightings((l) => l.filter((y) => y.key !== x.key))}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {!existing && sightings.length > 0 && <p className="small muted" style={{ margin: 0 }}>{t('dive.pendingSightings')}</p>}
        <button type="button" className="btn outline" onClick={() => setPicking(true)}>
          <Icon name="plus" />
          {t('dive.addSighting')}
        </button>
      </Accordion>

      <Accordion title={t('dive.notes')} hint={form.notes ? '✓' : ''}>
        <textarea className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} aria-label={t('dive.notes')} />
      </Accordion>

      <Accordion title={t('dive.rating')} hint={form.rating ? '★'.repeat(form.rating) : ''} defaultOpen>
        <Stars value={form.rating} onChange={(v) => set('rating', v)} />
      </Accordion>

      <button className="btn primary block" type="submit" style={{ marginTop: 8 }}>
        <Icon name="check" />
        {t('common.save')}
      </button>

      {picking && <SpeciesPickerSheet onPick={addSpecies} onClose={() => setPicking(false)} />}
      {siteSheet && (
        <SiteEditorSheet
          onClose={() => setSiteSheet(false)}
          onSaved={(siteId) => set('site_id', siteId)}
        />
      )}
    </form>
  );
}

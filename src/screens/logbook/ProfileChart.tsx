import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileSample } from '../../user/dives';
import { depthToUnit, formatDepth, formatTemp, unitLabel } from '../../lib/units';
import { useSettings } from '../../settings/settings';

const W = 360;
const H = 190;
const M = { top: 10, right: 10, bottom: 26, left: 40 };

function niceStep(max: number, target: number) {
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/**
 * Depth over time for imported dives. One series, one axis: water temperature is shown
 * in the crosshair readout and the table, not on a second y-scale.
 */
export function ProfileChart({ samples }: { samples: ProfileSample[] }) {
  const { t, i18n } = useTranslation();
  const depthUnit = useSettings((s) => s.depthUnit);
  const tempUnit = useSettings((s) => s.tempUnit);
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const lang = i18n.language;

  const geo = useMemo(() => {
    const maxT = Math.max(...samples.map((s) => s.t), 1);
    const maxD = Math.max(...samples.map((s) => depthToUnit(s.d, depthUnit)), 1);
    const step = niceStep(maxD, 4);
    const top = Math.ceil(maxD / step) * step;
    const x = (tt: number) => M.left + (tt / maxT) * (W - M.left - M.right);
    const y = (d: number) => M.top + (depthToUnit(d, depthUnit) / top) * (H - M.top - M.bottom);
    const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.d).toFixed(1)}`).join('');
    const area = `${line}L${x(samples[samples.length - 1].t).toFixed(1)},${M.top}L${x(samples[0].t).toFixed(1)},${M.top}Z`;
    const depthTicks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    const tStep = niceStep(maxT / 60, 5) * 60;
    const timeTicks = Array.from({ length: Math.floor(maxT / tStep) + 1 }, (_, i) => i * tStep);
    return { x, y, line, area, depthTicks, timeTicks, top, maxT };
  }, [samples, depthUnit]);

  const nearest = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    samples.forEach((s, i) => {
      if (Math.abs(geo.x(s.t) - px) < Math.abs(geo.x(samples[best].t) - px)) best = i;
    });
    return best;
  };

  const onPointer = (e: PointerEvent<SVGSVGElement>) => setActive(nearest(e.clientX));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(samples.length - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? 1) - 1));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  const a = active != null ? samples[active] : null;
  const temps = samples.map((s) => s.temp).filter((v): v is number => v != null);
  const tableRows = samples.filter((_, i) => i % Math.max(1, Math.ceil(samples.length / 60)) === 0);

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          className="profile-chart"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t('dive.profileSummary', {
            depth: formatDepth(Math.max(...samples.map((s) => s.d)), depthUnit, lang),
            time: fmtTime(geo.maxT),
          })}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          style={{ touchAction: 'pan-y' }}
        >
          {geo.depthTicks.map((d) => {
            const yy = M.top + (d / geo.top) * (H - M.top - M.bottom);
            return (
              <g key={d}>
                <line x1={M.left} x2={W - M.right} y1={yy} y2={yy} stroke="var(--border)" strokeWidth={1} />
                <text x={M.left - 6} y={yy + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                  {d}
                </text>
              </g>
            );
          })}
          <text x={4} y={M.top + 4} fontSize={11} fill="var(--muted)">
            {unitLabel(depthUnit)}
          </text>
          {geo.timeTicks.map((tt) => (
            <text key={tt} x={geo.x(tt)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {Math.round(tt / 60)}′
            </text>
          ))}
          <path d={geo.area} fill="var(--primary)" opacity={0.1} />
          <path d={geo.line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {a && (
            <g>
              <line x1={geo.x(a.t)} x2={geo.x(a.t)} y1={M.top} y2={H - M.bottom} stroke="var(--muted)" strokeWidth={1} />
              <circle cx={geo.x(a.t)} cy={geo.y(a.d)} r={5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {a && (
          <div
            role="status"
            style={{
              position: 'absolute',
              top: 4,
              left: `${(geo.x(a.t) / W) * 100}%`,
              transform: `translateX(${geo.x(a.t) > W / 2 ? 'calc(-100% - 10px)' : '10px'})`,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 13,
              boxShadow: 'var(--shadow)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontWeight: 700 }}>{fmtTime(a.t)} min</div>
            <div>{formatDepth(a.d, depthUnit, lang)}</div>
            {a.temp != null && <div className="muted">{formatTemp(a.temp, tempUnit, lang)}</div>}
          </div>
        )}
      </div>
      {temps.length > 0 && (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          {t('dive.tempRange', { min: formatTemp(Math.min(...temps), tempUnit, lang), max: formatTemp(Math.max(...temps), tempUnit, lang) })}
        </p>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="small" style={{ cursor: 'pointer', minHeight: 32 }}>
          {t('dive.profileTable')}
        </summary>
        <table className="small" style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>{t('dive.time')}</th>
              <th>{t('dive.depthLabel')}</th>
              <th>{t('dive.waterTemp')}</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((s) => (
              <tr key={s.t}>
                <td>{fmtTime(s.t)}</td>
                <td>{formatDepth(s.d, depthUnit, lang)}</td>
                <td>{s.temp != null ? formatTemp(s.temp, tempUnit, lang) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

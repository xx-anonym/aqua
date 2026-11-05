import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/*
 * Small single-series charts in plain SVG (no chart library). Following the dataviz rules:
 * one series in the app's primary colour, no legend (the heading names it), columns at most 24px
 * wide with 4px rounded tops and a square baseline, a 2px line with a ~10% wash, recessive
 * hairline grid, a value only where the story is (highest column, end of the line), the exact
 * values on hover / tap / keyboard focus, and every chart with a table view.
 */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Whole-number ticks from 0 to at least `max` (steps of 1, 2 or 5 × 10ⁿ, about 4 intervals): the charts show counts. */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, Math.round([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!));
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

/** Rounded top (4px), square at the baseline. */
function columnPath(x: number, y: number, w: number, base: number) {
  const r = Math.min(4, w / 2, base - y);
  if (r <= 0) return `M${x},${base}h${w}v0h${-w}Z`;
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

function TableView({ caption, head, rows }: { caption: string; head: [string, string]; rows: [string, string][] }) {
  const { t } = useTranslation();
  return (
    <details className="chart-table">
      <summary>{t('chart.showTable')}</summary>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{head[0]}</th>
            <th scope="col">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <th scope="row">{a}</th>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Kept inside the chart: flips to the left half when near the right edge.
  const left = Math.min(Math.max(x, 60), width - 60);
  return (
    <div className="chart-tip" style={{ left, top: y }} role="status">
      {children}
    </div>
  );
}

export interface Column {
  key: string;
  label: string;
  value: number;
}

/** Vertical columns, e.g. dives per year. `describe` gives the tooltip / accessible text of a column. */
export function ColumnChart({
  title,
  data,
  describe,
  head,
}: {
  title: string;
  data: Column[];
  describe: (c: Column) => string;
  head: [string, string];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const height = 190;
  const m = { top: 22, right: 8, bottom: 26, left: 30 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => m.top + innerH - (v / top) * innerH;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.max(6, Math.min(24, band * 0.6));
  const every = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44)));
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  return (
    <figure className="chart" ref={ref} onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}>
      <svg width={width} height={height} role="group" aria-label={title}>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={m.left} x2={width - m.right} y1={y(tv)} y2={y(tv)} className="chart-grid" />
            <text aria-hidden="true" x={m.left - 6} y={y(tv)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {tv}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.left + band * i + band / 2;
          return (
            <g key={d.key}>
              {d.value > 0 && <path d={columnPath(cx - barW / 2, y(d.value), barW, y(0))} className={`chart-mark${active === i ? ' on' : ''}`} />}
              {i % every === 0 && (
                <text aria-hidden="true" x={cx} y={height - 8} className="chart-axis" textAnchor="middle">
                  {d.label}
                </text>
              )}
              {i === peak && d.value > 0 && (
                <text aria-hidden="true" x={cx} y={y(d.value) - 6} className="chart-value" textAnchor="middle">
                  {d.value}
                </text>
              )}
              {/* Hit area: the whole band, taller than the mark. */}
              <rect
                x={m.left + band * i}
                y={m.top}
                width={band}
                height={innerH}
                fill="transparent"
                role="img"
                tabIndex={0}
                aria-label={describe(d)}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <Tooltip x={m.left + band * active + band / 2} y={y(data[active].value) - 8} width={width}>
          {describe(data[active])}
        </Tooltip>
      )}
      <TableView caption={title} head={head} rows={data.map((d) => [d.label, String(d.value)])} />
    </figure>
  );
}

export interface Step {
  /** ISO date YYYY-MM-DD */
  date: string;
  value: number;
}

const dayMs = 24 * 3600 * 1000;
const toTime = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

/** Cumulative count over time as a step line, e.g. species seen so far. */
export function StepLineChart({
  title,
  data,
  until,
  describe,
  formatDate,
  head,
}: {
  title: string;
  data: Step[];
  /** End of the time axis (ISO date), usually today. */
  until: string;
  describe: (s: Step) => string;
  formatDate: (iso: string) => string;
  head: [string, string];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId();
  const height = 190;
  const m = { top: 22, right: 28, bottom: 26, left: 30 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const t0 = toTime(data[0].date);
  const t1 = Math.max(toTime(until), t0 + 30 * dayMs);
  const x = (iso: string) => m.left + ((toTime(iso) - t0) / (t1 - t0)) * innerW;
  const ticks = niceTicks(data[data.length - 1].value);
  const top = ticks[ticks.length - 1];
  const y = (v: number) => m.top + innerH - (v / top) * innerH;
  // Step path: flat until the next new species, then up.
  const path = `M${x(data[0].date)},${y(0)}${data.map((d) => `H${x(d.date)}V${y(d.value)}`).join('')}H${x(until)}`;
  const area = `${path}V${y(0)}H${x(data[0].date)}Z`;
  // Year ticks on the time axis (or the first and last date for short spans).
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i).filter((yr) => toTime(`${yr}-01-01`) >= t0);
  const step = Math.ceil(years.length / Math.max(1, Math.floor(innerW / 48)));
  const last = data[data.length - 1];
  const nearest = (px: number) => {
    let best = 0;
    for (let i = 0; i < data.length; i++) if (Math.abs(x(data[i].date) - px) < Math.abs(x(data[best].date) - px)) best = i;
    return best;
  };
  return (
    <figure className="chart" ref={ref} onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}>
      <svg
        width={width}
        height={height}
        role="group"
        aria-label={title}
        onPointerMove={(e) => setActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
        onPointerDown={(e) => setActive(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--primary)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={m.left} x2={width - m.right} y1={y(tv)} y2={y(tv)} className="chart-grid" />
            <text aria-hidden="true" x={m.left - 6} y={y(tv)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {tv}
            </text>
          </g>
        ))}
        {years.length ? (
          years
            .filter((_, i) => i % step === 0)
            .map((yr) => (
              <text aria-hidden="true" key={yr} x={x(`${yr}-01-01`)} y={height - 8} className="chart-axis" textAnchor="middle">
                {yr}
              </text>
            ))
        ) : (
          // Less than a year: first and last day at the ends of the axis.
          <>
            <text aria-hidden="true" x={m.left} y={height - 8} className="chart-axis" textAnchor="start">
              {formatDate(data[0].date)}
            </text>
            <text aria-hidden="true" x={width - m.right} y={height - 8} className="chart-axis" textAnchor="end">
              {formatDate(until)}
            </text>
          </>
        )}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={path} className="chart-line" />
        {active !== null && <line x1={x(data[active].date)} x2={x(data[active].date)} y1={m.top} y2={y(0)} className="chart-cross" />}
        {active !== null && <circle cx={x(data[active].date)} cy={y(data[active].value)} r={4} className="chart-dot" />}
        <circle cx={x(until)} cy={y(last.value)} r={4} className="chart-dot" />
        <text aria-hidden="true" x={x(until)} y={y(last.value) - 10} className="chart-value" textAnchor="end">
          {last.value}
        </text>
        {/* Keyboard: one focus stop per step. */}
        {data.map((d, i) => (
          <rect
            key={d.date}
            x={x(d.date) - 6}
            y={m.top}
            width={12}
            height={innerH}
            fill="transparent"
            role="img"
            tabIndex={0}
            aria-label={describe(d)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      {active !== null && (
        <Tooltip x={x(data[active].date)} y={y(data[active].value) - 8} width={width}>
          {describe(data[active])}
        </Tooltip>
      )}
      <TableView caption={title} head={head} rows={data.map((d) => [formatDate(d.date), String(d.value)])} />
    </figure>
  );
}

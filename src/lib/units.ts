import type { DepthUnit, PressureUnit, TempUnit } from '../settings/settings';

const M_PER_FT = 0.3048;
const BAR_PER_PSI = 0.0689476;

/** All values are stored metric; these convert for display and back from user input. */
export const depthToUnit = (m: number, u: DepthUnit) => (u === 'ft' ? m / M_PER_FT : m);
export const depthFromUnit = (v: number, u: DepthUnit) => (u === 'ft' ? v * M_PER_FT : v);
export const tempToUnit = (c: number, u: TempUnit) => (u === 'f' ? (c * 9) / 5 + 32 : c);
export const tempFromUnit = (v: number, u: TempUnit) => (u === 'f' ? ((v - 32) * 5) / 9 : v);
export const pressureToUnit = (bar: number, u: PressureUnit) => (u === 'psi' ? bar / BAR_PER_PSI : bar);
export const pressureFromUnit = (v: number, u: PressureUnit) => (u === 'psi' ? v * BAR_PER_PSI : v);

const LABEL = { m: 'm', ft: 'ft', c: '°C', f: '°F', bar: 'bar', psi: 'psi' } as const;
export const unitLabel = (u: keyof typeof LABEL) => LABEL[u];

export function round(v: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function formatNumber(v: number | null | undefined, digits = 1, locale = 'de'): string {
  if (v == null || Number.isNaN(v)) return '–';
  return round(v, digits).toLocaleString(locale, { maximumFractionDigits: digits });
}

export const formatDepth = (m: number | null | undefined, u: DepthUnit, locale = 'de') =>
  m == null ? '–' : `${formatNumber(depthToUnit(m, u), u === 'ft' ? 0 : 1, locale)} ${LABEL[u]}`;
export const formatTemp = (c: number | null | undefined, u: TempUnit, locale = 'de') =>
  c == null ? '–' : `${formatNumber(tempToUnit(c, u), 0, locale)} ${LABEL[u]}`;
export const formatPressure = (bar: number | null | undefined, u: PressureUnit, locale = 'de') =>
  bar == null ? '–' : `${formatNumber(pressureToUnit(bar, u), 0, locale)} ${LABEL[u]}`;

export function formatDuration(min: number | null | undefined): string {
  if (min == null) return '–';
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h ${m.toString().padStart(2, '0')} min` : `${m} min`;
}

/** Short form for narrow tiles: "49 min", "25:51 h". */
export function formatDurationShort(min: number | null | undefined): string {
  if (min == null) return '–';
  const total = Math.round(min);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')} h`;
}

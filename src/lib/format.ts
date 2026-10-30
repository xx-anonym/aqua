import type { Lang } from '../catalog/useCatalog';

const locale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'de-DE');

/** Formats YYYY-MM-DD or ISO timestamps as a local date. */
export function formatDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return '–';
  const d = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined, lang: Lang): string {
  if (!value) return '–';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatBytes(bytes: number, lang: Lang): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${mb.toLocaleString(locale(lang), { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const LICENSE_LABELS: Record<string, string> = {
  cc0: 'CC0',
  'cc-by': 'CC BY',
  'cc-by-sa': 'CC BY-SA',
  'cc-by-nc': 'CC BY-NC',
  pd: 'Public Domain',
};
export const licenseLabel = (code: string) => LICENSE_LABELS[code] ?? code.toUpperCase();
export const licenseUrl = (code: string) =>
  code === 'cc0'
    ? 'https://creativecommons.org/publicdomain/zero/1.0/'
    : code.startsWith('cc-')
      ? `https://creativecommons.org/licenses/${code.slice(3)}/4.0/`
      : undefined;

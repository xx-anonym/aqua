import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import de from './de';
import en from './en';

function flatten(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(tsx?)$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') ? [p] : [];
  });
}

describe('translations', () => {
  const deKeys = new Set(flatten(de));
  const enKeys = new Set(flatten(en));

  it('German and English have the same keys', () => {
    expect([...deKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !deKeys.has(k))).toEqual([]);
  });

  it('every literal t() key used in the source exists', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(join(__dirname, '..'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        const key = m[1];
        if (!deKeys.has(key) && !deKeys.has(`${key}_one`)) missing.push(`${file.split('/src/')[1]}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

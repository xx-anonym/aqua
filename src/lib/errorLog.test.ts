import { describe, expect, it } from 'vitest';
import { buildReport, pageOf, type ErrorContext } from './errorLog';

const ctx: ErrorContext = {
  path: '/logbook/3f2a9c1e-0000-4000-8000-000000000001',
  version: '0.8.3',
  browser: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
  installed: true,
  signedIn: true,
  origin: 'https://aqua-tauchlog.vercel.app',
};

describe('error log', () => {
  it('keeps only the first part of the address, no ids', () => {
    expect(pageOf('/logbook/3f2a9c1e')).toBe('logbook');
    expect(pageOf('/species/chaetodon-auriga')).toBe('species');
    expect(pageOf('/')).toBe('start');
  });

  it('reports message, place in the code and context without the site address', () => {
    const e = new TypeError("Cannot read properties of undefined (reading 'id')");
    e.stack = `TypeError: Cannot read properties of undefined (reading 'id')\n    at Ve (https://aqua-tauchlog.vercel.app/assets/index-abc.js:12:3456)\n    at x (https://aqua-tauchlog.vercel.app/assets/index-abc.js:1:2)`;
    const r = buildReport('render', e, ctx)!;
    expect(r).toMatchObject({
      kind: 'render',
      page: 'logbook',
      version: '0.8.3',
      message: "TypeError: Cannot read properties of undefined (reading 'id')",
      source: 'at Ve (/assets/index-abc.js:12:3456)',
      installed: true,
      signed_in: true,
    });
    expect(r.stack).not.toContain('https://');
    expect(JSON.stringify(r)).not.toContain('3f2a9c1e');
  });

  it('ignores noise and cuts long texts', () => {
    expect(buildReport('error', 'Script error.', ctx)).toBeNull();
    expect(buildReport('error', 'ResizeObserver loop completed with undelivered notifications.', ctx)).toBeNull();
    const ext = new Error('boom');
    ext.stack = 'Error: boom\n    at chrome-extension://abc/content.js:1:1';
    expect(buildReport('error', ext, ctx)).toBeNull();
    expect(buildReport('rejection', new DOMException('aborted', 'AbortError'), ctx)).toBeNull();
    // the host's headless check after each deployment
    expect(buildReport('error', new Error('x'), { ...ctx, browser: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/153.0 Safari/537.36' })).toBeNull();
    expect(buildReport('rejection', 'x'.repeat(900), ctx)!.message).toHaveLength(500);
    expect(buildReport('rejection', { code: 42 }, ctx)!.message).toBe('{"code":42}');
  });
});

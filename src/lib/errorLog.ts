/*
 * Errors nobody catches in the browser end up in the table error_log
 * (supabase/migrations/20261107000007_error_log.sql). Otherwise one learns of them only by chance –
 * least of all of those that happen only on the iPhone or only in the installed app.
 *
 * Reported: uncaught errors, unhandled promise rejections and errors while drawing a page (the
 * router catches those, see src/ui/RouteError.tsx). Not reported: what the app catches and shows
 * itself, errors of browser extensions, and failed requests while offline.
 *
 * Without personal data: of the address only the first part stays ("/logbook/<id>" → "logbook"),
 * plus app version, message, place in the code, browser, whether the app is installed and whether
 * someone is signed in. No account id, no entries. The report goes out with the public key only,
 * also when signed in. At most five different errors per page load, each once; without network
 * they wait on the device (at most ten) for the next start.
 */

export type ErrorKind = 'error' | 'rejection' | 'render';

export interface ErrorReport {
  kind: ErrorKind;
  page: string;
  version: string;
  message: string;
  source: string | null;
  stack: string | null;
  browser: string;
  installed: boolean;
  signed_in: boolean;
}

export interface ErrorContext {
  path: string;
  version: string;
  browser: string;
  installed: boolean;
  signedIn: boolean;
  origin: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "/logbook/3f2a…" → "logbook", "/" → "start". */
export function pageOf(path: string): string {
  return clip(path.split('/').filter(Boolean)[0] ?? 'start', 60);
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? null };
  if (typeof error === 'string') return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** The report for an error, or null if it is noise (extensions, cross-origin scripts, …). */
export function buildReport(kind: ErrorKind, error: unknown, ctx: ErrorContext, source?: string | null): ErrorReport | null {
  // Robots without a screen (e.g. the host's check right after each deployment) are no users.
  if (/HeadlessChrome|bot\b|crawler|spider/i.test(ctx.browser)) return null;
  const { message, stack } = describe(error);
  const all = `${message}\n${stack ?? ''}\n${source ?? ''}`;
  if (/^(Script error\.?|ResizeObserver loop)/.test(message) || /(chrome|moz|safari(-web)?)-extension:\/\//.test(all)) return null;
  if (error instanceof DOMException && error.name === 'AbortError') return null;
  // Strip the site's own address: "https://aqua…/assets/index-abc.js:1:2" → "/assets/index-abc.js:1:2".
  const local = (s: string) => s.split(ctx.origin).join('');
  const firstFrame = stack
    ?.split('\n')
    .map((l) => l.trim())
    .find((l) => /:\d+:\d+\)?$/.test(l));
  const where = source ?? firstFrame ?? null;
  return {
    kind,
    page: pageOf(ctx.path),
    version: clip(ctx.version, 40),
    message: clip(local(message), 500),
    source: where ? clip(local(where), 300) : null,
    stack: stack ? clip(local(stack), 2000) : null,
    browser: clip(ctx.browser, 300),
    installed: ctx.installed,
    signed_in: ctx.signedIn,
  };
}

const QUEUE_KEY = 'aqua-error-queue';
const MAX_PER_PAGE = 5;

let sent = new Set<string>();
let send: ((r: ErrorReport) => Promise<boolean>) | null = null;
let context: () => ErrorContext = () => ({ path: '/', version: '', browser: '', installed: false, signedIn: false, origin: '' });

function readQueue(): ErrorReport[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as ErrorReport[];
  } catch {
    return [];
  }
}

function writeQueue(q: ErrorReport[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-10)));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Private mode: a report that cannot go out now is lost.
  }
}

async function deliver(report: ErrorReport) {
  if (!send) return;
  const ok = await send(report).catch(() => false);
  if (!ok) writeQueue([...readQueue(), report]);
}

/** Reports an error once (per page load). Also used by the router's error page. */
export function reportError(kind: ErrorKind, error: unknown, source?: string | null): void {
  try {
    const ctx = context();
    // Failed requests without network are expected, not a fault of the app.
    if (!navigator.onLine && /fetch|network|load failed/i.test(describe(error).message)) return;
    const report = buildReport(kind, error, ctx, source);
    if (!report) return;
    const key = `${report.kind}|${report.message}|${report.source}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);
    void deliver(report);
  } catch {
    // Reporting must never cause an error of its own.
  }
}

async function flushQueue() {
  const q = readQueue();
  if (!q.length || !send || !navigator.onLine) return;
  writeQueue([]);
  for (const r of q) await deliver(r);
}

/**
 * Once at start. `post` sends one report (true when it arrived); `ctx` gives the current page and
 * state. Without a Supabase configuration nothing is set up.
 */
export function setupErrorLog(post: ((r: ErrorReport) => Promise<boolean>) | null, ctx: () => ErrorContext) {
  if (!post) return;
  send = post;
  context = ctx;
  sent = new Set();
  window.addEventListener('error', (e) => {
    // Failed <img>/<script> loads arrive here too, without an error object: not app errors.
    if (!e.error && !e.message) return;
    const source = e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null;
    reportError('error', e.error ?? e.message, source);
  });
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason));
  window.addEventListener('online', () => void flushQueue());
  void flushQueue();
}

/** Sends a report straight to the database's REST interface with the public key. */
export function restPoster(url: string | undefined, key: string | undefined): ((r: ErrorReport) => Promise<boolean>) | null {
  if (!url || !key) return null;
  return async (report) => {
    const res = await fetch(`${url}/rest/v1/error_log`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(report),
      keepalive: true,
    });
    // 4xx (e.g. a check failed): sending again would not help.
    return res.ok || (res.status >= 400 && res.status < 500);
  };
}

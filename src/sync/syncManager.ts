import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { AppDb } from '../db/appDb';
import { persistNow } from '../db/boot';
import { nowIso } from '../lib/ids';
import { loadPhoto, setRemotePhotoLoader, storePhoto } from '../user/photos';
import { PHOTO_BUCKET, supabase, supabaseRemote } from './cloud';
import { adoptLocalRows, forgetUser, getKv, pendingChanges, setKv, syncOnce } from './engine';

export type SyncStatus = 'disabled' | 'signedOut' | 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  email: string | null;
  userId: string | null;
  lastSync: string | null;
  error: string | null;
  pending: number;
}

export const useSync = create<SyncState>(() => ({
  status: supabase ? 'signedOut' : 'disabled',
  email: null,
  userId: null,
  lastSync: null,
  error: null,
  pending: 0,
}));

let db: AppDb | null = null;
let running: Promise<void> | null = null;
let changeTimer: ReturnType<typeof setTimeout> | undefined;

/** Uploads photos that only exist on this device and rewrites their uri to the storage path. */
async function uploadPhotos(userId: string) {
  if (!db || !supabase) return;
  const rows = db.all<{ id: string; photo_uri: string }>(
    "SELECT id, photo_uri FROM sighting WHERE photo_uri LIKE 'idb:%' AND deleted_at IS NULL AND user_id = ?",
    [userId],
  );
  for (const r of rows) {
    const blob = await loadPhoto(r.photo_uri);
    if (!blob) continue;
    const path = `${userId}/${r.id}.jpg`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (error) throw new Error(error.message);
    await storePhoto(`sb:${path}`, blob);
    db.exec('UPDATE sighting SET photo_uri = ?, updated_at = ?, dirty = 1 WHERE id = ?', [`sb:${path}`, nowIso(), r.id]);
  }
}

export function syncNow(): Promise<void> {
  if (running) return running;
  const { userId } = useSync.getState();
  if (!db || !supabase || !userId) return Promise.resolve();
  if (!navigator.onLine) return Promise.resolve();
  const client = supabase;
  const appDb = db;
  useSync.setState({ status: 'syncing', error: null });
  running = (async () => {
    try {
      await uploadPhotos(userId);
      await syncOnce(appDb, supabaseRemote(client, userId), userId);
      await persistNow(appDb);
      useSync.setState({ status: 'idle', lastSync: getKv(appDb, 'last_sync'), pending: pendingChanges(appDb, userId) });
    } catch (e) {
      useSync.setState({ status: 'error', error: e instanceof Error ? e.message : String(e), pending: pendingChanges(appDb, userId) });
    } finally {
      running = null;
    }
  })();
  return running;
}

function onSession(session: Session | null) {
  if (!db) return;
  if (!session) {
    useSync.setState({ status: supabase ? 'signedOut' : 'disabled', email: null, userId: null });
    return;
  }
  const userId = session.user.id;
  const previous = getKv(db, 'user_id');
  if (previous !== userId) {
    // A different account on this device: its rows stay local, cursors restart for the new user.
    if (previous) forgetUser(db);
    adoptLocalRows(db, userId);
  }
  useSync.setState({
    status: 'idle',
    email: session.user.email ?? null,
    userId,
    lastSync: getKv(db, 'last_sync'),
    pending: pendingChanges(db, userId),
  });
  void syncNow();
}

/** Wires auth state, background sync (after local edits, when back online, every 5 minutes). */
export function initCloud(appDb: AppDb) {
  db = appDb;
  if (!supabase) return;
  const client = supabase;
  setRemotePhotoLoader(async (uri) => {
    const { data } = await client.storage.from(PHOTO_BUCKET).download(uri.slice(3));
    return data ?? undefined;
  });
  void client.auth.getSession().then(({ data }) => onSession(data.session));
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') onSession(session);
  });
  appDb.subscribe(() => {
    const { userId, status } = useSync.getState();
    if (!userId || status === 'syncing') return;
    useSync.setState({ pending: pendingChanges(appDb, userId) });
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      if (pendingChanges(appDb, userId) > 0) void syncNow();
    }, 4000);
  });
  window.addEventListener('online', () => void syncNow());
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 5 * 60 * 1000);
}

export async function sendMagicLink(email: string) {
  if (!supabase) throw new Error('disabled');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/profile` } });
  if (error) throw new Error(error.message);
}

export async function verifyCode(email: string, token: string) {
  if (!supabase) throw new Error('disabled');
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw new Error(error.message);
}

export async function signInWithProvider(provider: 'google' | 'apple') {
  if (!supabase) throw new Error('disabled');
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/profile` } });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  if (!supabase || !db) return;
  await syncNow().catch(() => undefined);
  await supabase.auth.signOut();
  setKv(db, 'last_sync', null);
}

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

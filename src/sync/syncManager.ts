import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { AppDb } from '../db/appDb';
import { persistNow } from '../db/boot';
import { nowIso } from '../lib/ids';
import { deletePhoto, loadPhoto, setRemotePhotoLoader, storePhoto } from '../user/photos';
import { PHOTO_BUCKET, supabase, supabaseRemote } from './cloud';
import { getKv, pendingChanges, setKv, switchAccount, syncOnce } from './engine';

export type SyncStatus = 'disabled' | 'signedOut' | 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  /** False until the stored session has been checked at start (avoids a "signed out" flash). */
  authChecked: boolean;
  email: string | null;
  userId: string | null;
  lastSync: string | null;
  error: string | null;
  pending: number;
}

export const useSync = create<SyncState>(() => ({
  status: supabase ? 'signedOut' : 'disabled',
  authChecked: false,
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

/** Shows the data of `userId` (null: nobody signed in) and drops cached photos of the account before. */
function showAccount(appDb: AppDb, userId: string | null) {
  const photos = switchAccount(appDb, userId);
  for (const uri of photos) void deletePhoto(uri);
  void persistNow(appDb);
}

function onSession(session: Session | null, signedOut = false) {
  if (!db) return;
  if (!session) {
    // Only a real sign-out hides the account's data. Starting without a usable session (e.g.
    // offline with an expired token) must not empty the logbook of the device owner.
    if (signedOut) showAccount(db, null);
    useSync.setState({ status: supabase ? 'signedOut' : 'disabled', email: null, userId: null, authChecked: true });
    return;
  }
  const userId = session.user.id;
  if (getKv(db, 'user_id') !== userId) showAccount(db, userId);
  useSync.setState({
    status: 'idle',
    authChecked: true,
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
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') onSession(session, event === 'SIGNED_OUT');
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

/**
 * Sends the sign-in mail. The app signs in with the code from that mail: on iOS a link from the
 * mail app opens in Safari, which shares no storage with the installed app (and PKCE needs the
 * same browser), so the link alone can never sign in the installed app.
 */
export async function sendSignInEmail(email: string) {
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
  // Local scope: signs out this device only (also offline) and keeps other devices signed in.
  await supabase.auth.signOut({ scope: 'local' });
  setKv(db, 'last_sync', null);
}

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

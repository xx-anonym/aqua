import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncTable } from '../db/migrations';
import type { Remote, RemoteRow } from './engine';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** null when the build has no Supabase configuration: the app then runs fully local. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null;

export const PHOTO_BUCKET = 'sighting-photos';

export const oauthProviders = (import.meta.env.VITE_AUTH_PROVIDERS ?? '')
  .split(',')
  .map((p) => p.trim())
  .filter((p): p is 'google' | 'apple' => p === 'google' || p === 'apple');

export function supabaseRemote(client: SupabaseClient, userId: string): Remote {
  return {
    async upsert(table: SyncTable, rows: RemoteRow[]) {
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id', returning: 'minimal' } as never);
      if (error) throw new Error(error.message);
    },
    async pull(table: SyncTable, cursor: string | null, limit: number) {
      let q = client.from(table).select('*').eq('user_id', userId).order('synced_at', { ascending: true }).limit(limit);
      if (cursor) q = q.gt('synced_at', cursor);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as RemoteRow[];
    },
  };
}

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

export type OAuthProvider = 'google' | 'apple';
const PROVIDERS_KEY = 'aqua-auth-providers';

/**
 * Sign-in providers switched on in Supabase (Authentication → Providers). Asked at runtime, so a
 * provider appears in the app as soon as it is enabled there; the last answer is kept for offline use.
 */
export async function fetchOAuthProviders(): Promise<OAuthProvider[]> {
  const cached = (): OAuthProvider[] => {
    try {
      return JSON.parse(localStorage.getItem(PROVIDERS_KEY) ?? '[]');
    } catch {
      return [];
    }
  };
  if (!url || !key) return [];
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return cached();
    const external = ((await res.json()).external ?? {}) as Record<string, boolean>;
    const enabled = (['google', 'apple'] as const).filter((p) => external[p]);
    try {
      localStorage.setItem(PROVIDERS_KEY, JSON.stringify(enabled));
    } catch {
      /* storage unavailable */
    }
    return enabled;
  } catch {
    return cached();
  }
}

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

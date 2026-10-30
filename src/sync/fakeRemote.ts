import type { SyncTable } from '../db/migrations';
import type { Remote, RemoteRow } from './engine';

/**
 * In-memory server with the same semantics as the Supabase schema:
 * per-user rows, server-assigned synced_at and "newer updated_at wins" on upsert.
 */
export class FakeRemote {
  tables = new Map<SyncTable, Map<string, RemoteRow>>();
  private clock = 0;
  online = true;

  client(userId: string): Remote {
    return {
      upsert: async (table, rows) => {
        if (!this.online) throw new Error('offline');
        const t = this.tables.get(table) ?? new Map<string, RemoteRow>();
        this.tables.set(table, t);
        for (const row of rows) {
          if (row.user_id !== userId) throw new Error('RLS: row belongs to another user');
          const existing = t.get(row.id as string);
          if (existing && new Date(existing.updated_at as string) > new Date(row.updated_at as string)) continue;
          t.set(row.id as string, { ...row, synced_at: this.tick() });
        }
      },
      pull: async (table, cursor, limit) => {
        if (!this.online) throw new Error('offline');
        return [...(this.tables.get(table)?.values() ?? [])]
          .filter((r) => r.user_id === userId && (!cursor || (r.synced_at as string) > cursor))
          .sort((a, b) => (a.synced_at as string).localeCompare(b.synced_at as string))
          .slice(0, limit);
      },
    };
  }

  private tick() {
    return new Date(Date.UTC(2030, 0, 1) + ++this.clock).toISOString();
  }
}

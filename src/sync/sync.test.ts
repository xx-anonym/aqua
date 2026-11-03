import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from '../test/testDb';
import type { AppDb } from '../db/appDb';
import { getDive, listDives, saveDive } from '../user/dives';
import { addSighting, deleteSighting, sightingsForDive } from '../user/sightings';
import { favoriteIds, toggleFavorite } from '../user/collections';
import { lifeList } from '../user/lifelist';
import { adoptLocalRows, pendingChanges, switchAccount, syncOnce } from './engine';
import { FakeRemote } from './fakeRemote';

const USER = '11111111-1111-4111-8111-111111111111';
let server: FakeRemote;
let a: AppDb;
let b: AppDb;
let minute = 0;

const tick = () => vi.setSystemTime(new Date(Date.UTC(2026, 4, 1, 8, ++minute)));
const sync = (db: AppDb) => syncOnce(db, server.client(USER), USER);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  tick();
  server = new FakeRemote();
  a = await createTestDb();
  b = await createTestDb();
  adoptLocalRows(a, USER);
  adoptLocalRows(b, USER);
});
afterEach(() => vi.useRealTimers());

describe('two-way sync', () => {
  it('a change on device A appears on device B', async () => {
    const dive = saveDive(a, { dive_no: 1, date: '2026-05-01', max_depth_m: 18, conditions: { water_temp_c: 24 }, features: ['reef'] } as never);
    addSighting(a, { dive_id: dive, species_id: 'pterois-miles' });
    expect(pendingChanges(a, USER)).toBe(4);
    expect(await sync(a)).toMatchObject({ pushed: 4 });
    expect(pendingChanges(a, USER)).toBe(0);

    await sync(b);
    const onB = getDive(b, dive)!;
    expect(onB).toMatchObject({ dive_no: 1, max_depth_m: 18, features: ['reef'] });
    expect(onB.conditions?.water_temp_c).toBe(24);
    expect(sightingsForDive(b, dive).map((s) => s.species_id)).toEqual(['pterois-miles']);
    expect(lifeList(b).has('pterois-miles')).toBe(true);
    expect(pendingChanges(b, USER)).toBe(0);
  });

  it('offline changes are kept and merged when the device comes back online', async () => {
    const dive = saveDive(a, { dive_no: 1, date: '2026-05-01' } as never);
    const sighting = addSighting(a, { dive_id: dive, species_id: 'chromis-chromis' }).id;
    await sync(a);
    await sync(b);

    // B is offline on the boat and edits the dive; the sync attempt fails.
    server.online = false;
    tick();
    saveDive(b, { id: dive, dive_no: 1, date: '2026-05-01', notes: 'Delfine am Riff' } as never);
    addSighting(b, { dive_id: dive, species_id: 'chelonia-mydas' });
    await expect(sync(b)).rejects.toThrow('offline');
    expect(pendingChanges(b, USER)).toBeGreaterThan(0);

    // Meanwhile A deletes a sighting.
    server.online = true;
    tick();
    deleteSighting(a, sighting);
    await sync(a);

    // B comes back online: its edits are pushed, A's deletion arrives.
    await sync(b);
    expect(getDive(b, dive)!.notes).toBe('Delfine am Riff');
    expect(sightingsForDive(b, dive).map((s) => s.species_id)).toEqual(['chelonia-mydas']);

    await sync(a);
    expect(getDive(a, dive)!.notes).toBe('Delfine am Riff');
    expect(sightingsForDive(a, dive).map((s) => s.species_id)).toEqual(['chelonia-mydas']);
  });

  it('resolves conflicting edits with "newest change wins" on both devices', async () => {
    const dive = saveDive(a, { dive_no: 1, date: '2026-05-01', rating: 3 } as never);
    await sync(a);
    await sync(b);
    tick();
    saveDive(a, { id: dive, dive_no: 1, date: '2026-05-01', rating: 4 } as never);
    tick();
    saveDive(b, { id: dive, dive_no: 1, date: '2026-05-01', rating: 5 } as never); // later
    await sync(b);
    await sync(a); // A's older edit is rejected by the server, B's newer one is pulled
    expect(getDive(a, dive)!.rating).toBe(5);
    await sync(b);
    expect(getDive(b, dive)!.rating).toBe(5);
  });

  it('a device clock running ahead cannot block later edits', async () => {
    const dive = saveDive(a, { dive_no: 1, date: '2026-05-01', rating: 3 } as never);
    await sync(a);
    await sync(b);
    const now = Date.now();
    vi.setSystemTime(now + 365 * 24 * 3600 * 1000); // A's clock is a year ahead
    saveDive(a, { id: dive, dive_no: 1, date: '2026-05-01', rating: 4 } as never);
    vi.setSystemTime(now);
    tick();
    await sync(a);
    tick();
    saveDive(b, { id: dive, dive_no: 1, date: '2026-05-01', rating: 5 } as never); // later in real time
    await sync(b);
    expect(getDive(b, dive)!.rating).toBe(5);
    await sync(a);
    expect(getDive(a, dive)!.rating).toBe(5);
  });

  it('soft deletes propagate and stay deleted', async () => {
    const dive = saveDive(a, { dive_no: 1, date: '2026-05-01' } as never);
    await sync(a);
    await sync(b);
    tick();
    const { deleteDive } = await import('../user/dives');
    deleteDive(b, dive);
    await sync(b);
    await sync(a);
    expect(listDives(a)).toHaveLength(0);
    expect(a.get<{ deleted_at: string }>('SELECT deleted_at FROM dive WHERE id = ?', [dive])!.deleted_at).toBeTruthy();
  });

  it('merges the same favorite added on two devices into one row', async () => {
    toggleFavorite(a, 'mobula-alfredi');
    toggleFavorite(b, 'mobula-alfredi');
    await sync(a);
    await sync(b);
    await sync(a);
    expect(server.tables.get('favorite')?.size).toBe(1);
    expect(favoriteIds(a).has('mobula-alfredi')).toBe(true);
    expect(favoriteIds(b).has('mobula-alfredi')).toBe(true);
  });

  it('shows only the signed-in account: A, sign out, B, back to A', async () => {
    const OTHER = '22222222-2222-4222-8222-222222222222';
    const synced = saveDive(a, { dive_no: 1, date: '2026-05-01' } as never);
    addSighting(a, { dive_id: synced, species_id: 'pterois-miles' });
    toggleFavorite(a, 'mobula-alfredi');
    await sync(a);
    const unsynced = saveDive(a, { dive_no: 2, date: '2026-05-02' } as never);

    switchAccount(a, null); // A signs out
    expect(listDives(a)).toHaveLength(0);
    expect(lifeList(a).size).toBe(0);
    expect(favoriteIds(a).size).toBe(0);

    const anonymous = saveDive(a, { dive_no: 1, date: '2026-05-03' } as never);
    switchAccount(a, OTHER); // B signs in: sees only what was recorded while signed out
    expect(listDives(a).map((d) => d.id)).toEqual([anonymous]);
    expect(a.get<{ user_id: string }>('SELECT user_id FROM dive WHERE id = ?', [anonymous])!.user_id).toBe(OTHER);

    switchAccount(a, USER); // A again: unsynced dive is back at once, the rest comes with the sync
    expect(listDives(a).map((d) => d.id)).toEqual([unsynced]);
    expect(pendingChanges(a, USER)).toBe(1);
    await sync(a);
    expect(listDives(a).map((d) => d.id).sort()).toEqual([synced, unsynced].sort());
    expect(lifeList(a).has('pterois-miles')).toBe(true);
    expect(favoriteIds(a).has('mobula-alfredi')).toBe(true);
    expect(server.tables.get('dive')?.has(unsynced)).toBe(true);
  });

  it('drops cached photos of the account that leaves', async () => {
    addSighting(a, { species_id: 'pterois-miles', photo_uri: `sb:${USER}/x.jpg` });
    await sync(a);
    expect(switchAccount(a, null)).toEqual([`sb:${USER}/x.jpg`]);
    expect(switchAccount(a, null)).toEqual([]);
  });

  it('adopts data recorded before signing in', async () => {
    const fresh = await createTestDb();
    const dive = saveDive(fresh, { dive_no: 1, date: '2026-01-01' } as never);
    expect(fresh.get<{ user_id: string | null }>('SELECT user_id FROM dive')!.user_id).toBeNull();
    adoptLocalRows(fresh, USER);
    await sync(fresh);
    await sync(b);
    expect(getDive(b, dive)).not.toBeNull();
  });
});

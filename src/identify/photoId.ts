import type { Catalog } from '../catalog/catalog';
import { idb } from '../db/idb';
import { newId } from '../lib/ids';
import { accessToken } from '../sync/syncManager';
import { downscale } from '../user/photos';

export interface PhotoSuggestion {
  species_id: string;
  confidence: number;
  reason: string;
}

export interface IdentifyResult {
  suggestions: PhotoSuggestion[];
  used?: number;
  limit?: number;
}

export class PhotoIdError extends Error {
  constructor(
    readonly code: 'offline' | 'login' | 'not_configured' | 'quota' | 'failed',
    message = code,
  ) {
    super(message);
  }
}

/** Candidates for the model: the catalog species of the region (all species if unknown). */
export function candidatesFor(catalog: Catalog, regionId: string | null) {
  return catalog.speciesInRegion(regionId).map((s) => ({ id: s.id, sci: s.scientificName, de: s.nameDe, en: s.nameEn }));
}

async function toBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function identifyPhoto(catalog: Catalog, photo: Blob, regionId: string | null): Promise<IdentifyResult> {
  if (!navigator.onLine) throw new PhotoIdError('offline');
  const token = await accessToken();
  if (!token) throw new PhotoIdError('login');
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new PhotoIdError('not_configured');
  // ~1024 px is enough detail for the model and keeps the cost per photo low.
  const image = await toBase64(await downscale(photo, 1024, 0.85));
  const region = regionId ? catalog.regionsById.get(regionId)?.nameEn : null;
  const res = await fetch(`${url}/functions/v1/identify`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, media_type: 'image/jpeg', region, candidates: candidatesFor(catalog, regionId) }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) throw new PhotoIdError('quota');
  if (res.status === 401) throw new PhotoIdError('login');
  if (res.status === 503 && body.error === 'not_configured') throw new PhotoIdError('not_configured');
  if (!res.ok) throw new PhotoIdError('failed', body.message || body.error || `HTTP ${res.status}`);
  return body as IdentifyResult;
}

// ---- Offline queue: photos picked without a connection are identified later.

export interface QueuedPhoto {
  id: string;
  regionId: string | null;
  createdAt: string;
}

const QUEUE_KEY = 'photo-id-queue';

export async function listQueue(): Promise<QueuedPhoto[]> {
  return (await idb.get<QueuedPhoto[]>('kv', QUEUE_KEY)) ?? [];
}

export async function enqueue(photo: Blob, regionId: string | null): Promise<QueuedPhoto> {
  const item = { id: newId(), regionId, createdAt: new Date().toISOString() };
  await idb.set('photos', `queue:${item.id}`, await downscale(photo, 1600));
  await idb.set('kv', QUEUE_KEY, [...(await listQueue()), item]);
  return item;
}

export async function queuedBlob(id: string): Promise<Blob | undefined> {
  return idb.get<Blob>('photos', `queue:${id}`);
}

export async function dequeue(id: string) {
  await idb.del('photos', `queue:${id}`);
  await idb.set('kv', QUEUE_KEY, (await listQueue()).filter((q) => q.id !== id));
}

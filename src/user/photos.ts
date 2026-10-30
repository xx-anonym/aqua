import { useEffect, useState } from 'react';
import { idb } from '../db/idb';
import { newId } from '../lib/ids';

const MAX_EDGE = 1600;

/** Downscales a picked photo (JPEG, ~0.82) so local storage stays small. */
export async function downscale(file: Blob, maxEdge = MAX_EDGE, quality = 0.82): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
}

/** Stores a user photo locally; the returned uri goes into sighting.photo_uri. */
export async function savePhoto(file: Blob): Promise<string> {
  const id = newId();
  await idb.set('photos', id, await downscale(file));
  return `idb:${id}`;
}

/** Local blob key: "idb:<uuid>" for photos not yet uploaded, the full "sb:<path>" uri for synced ones. */
const keyOf = (uri: string) => (uri.startsWith('idb:') ? uri.slice(4) : uri);

let remoteLoader: ((uri: string) => Promise<Blob | undefined>) | null = null;
/** Set by the cloud module: downloads a synced photo ("sb:…") when it is not cached on this device. */
export function setRemotePhotoLoader(fn: typeof remoteLoader) {
  remoteLoader = fn;
}

export async function loadPhoto(uri: string): Promise<Blob | undefined> {
  if (!uri.startsWith('idb:') && !uri.startsWith('sb:')) return undefined;
  const local = await idb.get<Blob>('photos', keyOf(uri));
  if (local || !uri.startsWith('sb:') || !remoteLoader) return local;
  const blob = await remoteLoader(uri).catch(() => undefined);
  if (blob) await idb.set('photos', keyOf(uri), blob);
  return blob;
}

export async function storePhoto(uri: string, blob: Blob) {
  await idb.set('photos', keyOf(uri), blob);
}

export async function deletePhoto(uri: string | null | undefined) {
  if (uri?.startsWith('idb:') || uri?.startsWith('sb:')) await idb.del('photos', keyOf(uri));
}

/** Object URL for a stored photo (idb:…) or a remote URL as-is. */
export function usePhotoUrl(uri: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!uri) {
      setUrl(null);
      return;
    }
    if (!uri.startsWith('idb:') && !uri.startsWith('sb:')) {
      setUrl(uri);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void loadPhoto(uri).then((blob) => {
      if (cancelled || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri]);
  return url;
}

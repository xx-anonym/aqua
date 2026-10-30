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

export async function loadPhoto(uri: string): Promise<Blob | undefined> {
  if (!uri.startsWith('idb:')) return undefined;
  return idb.get<Blob>('photos', uri.slice(4));
}

export async function deletePhoto(uri: string | null | undefined) {
  if (uri?.startsWith('idb:')) await idb.del('photos', uri.slice(4));
}

/** Object URL for a stored photo (idb:…) or a remote URL as-is. */
export function usePhotoUrl(uri: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!uri) {
      setUrl(null);
      return;
    }
    if (!uri.startsWith('idb:')) {
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

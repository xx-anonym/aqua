import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fingerprint } from './offline';

const bytes = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe('image fingerprints', () => {
  it('are the ?v= the catalog build puts into every image address', async () => {
    // Python: hashlib.sha1(b'aqua').hexdigest()[:10]
    expect(await fingerprint(bytes(new TextEncoder().encode('aqua')))).toBe('66a6d5d94f');
    const manifest = JSON.parse(readFileSync('public/catalog/catalog-manifest.json', 'utf8')) as { photos: { file: string }[] };
    for (const { file } of manifest.photos.slice(0, 5)) {
      const [path, v] = file.split('?v=');
      expect(await fingerprint(bytes(readFileSync(`public/catalog/${path}`)))).toBe(v);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './chunkReload';

describe('reload after an update', () => {
  it('recognises failed loading of a page in all browsers', () => {
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/LogbookScreen-a1.js'))).toBe(true); // Chrome
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true); // Firefox
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
  });
});

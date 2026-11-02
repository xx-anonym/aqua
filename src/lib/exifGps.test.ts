import { describe, expect, it } from 'vitest';
import { parseExifGps } from './exifGps';

/** Minimal JPEG with an EXIF GPS block, as phones write it. */
function jpegWithGps(lat: [number, number, number], latRef: string, lng: [number, number, number], lngRef: string, le = true): DataView {
  const tiff: number[] = [];
  const u16 = (v: number) => (le ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (le ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  // Layout: header(8) | IFD0 with 1 entry (2+12+4=18) at 8 | GPS IFD with 4 entries (2+48+4=54) at 26 | rationals at 80
  const ifd0 = 8;
  const gpsIfd = ifd0 + 18;
  const data = gpsIfd + 54;
  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0));
  tiff.push(...u16(1), ...u16(0x8825), ...u16(4), ...u32(1), ...u32(gpsIfd), ...u32(0));
  const ascii = (tag: number, ch: string) => [...u16(tag), ...u16(2), ...u32(2), ch.charCodeAt(0), 0, 0, 0];
  const rational = (tag: number, at: number) => [...u16(tag), ...u16(5), ...u32(3), ...u32(at)];
  tiff.push(...u16(4), ...ascii(1, latRef), ...rational(2, data), ...ascii(3, lngRef), ...rational(4, data + 24), ...u32(0));
  for (const v of [...lat, ...lng]) tiff.push(...u32(Math.round(v * 100)), ...u32(100));
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1, 0xff, 0xda, 0, 2];
  return new DataView(new Uint8Array(bytes).buffer);
}

describe('EXIF GPS', () => {
  it('reads a position (Hurghada, little endian)', () => {
    const pos = parseExifGps(jpegWithGps([27, 15, 0], 'N', [33, 50, 30], 'E'));
    expect(pos!.lat).toBeCloseTo(27.25, 4);
    expect(pos!.lng).toBeCloseTo(33.8417, 3);
  });

  it('handles big endian and the southern / western hemisphere', () => {
    const pos = parseExifGps(jpegWithGps([21, 18, 0], 'S', [157, 51, 0], 'W', false));
    expect(pos!.lat).toBeCloseTo(-21.3, 4);
    expect(pos!.lng).toBeCloseTo(-157.85, 4);
  });

  it('returns null without GPS or for other formats', () => {
    expect(parseExifGps(new DataView(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer))).toBeNull();
    expect(parseExifGps(new DataView(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer))).toBeNull();
    const truncated = jpegWithGps([27, 15, 0], 'N', [33, 50, 30], 'E');
    expect(parseExifGps(new DataView(truncated.buffer.slice(0, 40)))).toBeNull();
  });
});

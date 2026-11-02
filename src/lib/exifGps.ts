/**
 * GPS position stored in a JPEG photo (EXIF), read before the photo is downscaled (the canvas
 * drops all metadata). Small hand-written reader for exactly the four GPS tags we need.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export async function photoLocation(file: Blob): Promise<LatLng | null> {
  try {
    // EXIF sits at the start of the file; 256 KB covers it even with an embedded thumbnail.
    return parseExifGps(new DataView(await file.slice(0, 256 * 1024).arrayBuffer()));
  } catch {
    return null;
  }
}

export function parseExifGps(view: DataView): LatLng | null {
  try {
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not a JPEG
    let off = 2;
    while (off + 4 <= view.byteLength) {
      const marker = view.getUint16(off);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null; // broken, or image data starts
      const len = view.getUint16(off + 2);
      // APP1 segment starting with "Exif\0\0"
      if (marker === 0xffe1 && view.getUint32(off + 4) === 0x45786966 && view.getUint16(off + 8) === 0) {
        return readTiff(view, off + 10);
      }
      off += 2 + len;
    }
  } catch {
    // Truncated or malformed EXIF: no position.
  }
  return null;
}

function readTiff(view: DataView, start: number): LatLng | null {
  const order = view.getUint16(start);
  const le = order === 0x4949; // "II" little endian, "MM" big endian
  if (!le && order !== 0x4d4d) return null;
  const u16 = (o: number) => view.getUint16(start + o, le);
  const u32 = (o: number) => view.getUint32(start + o, le);
  if (u16(2) !== 42) return null;
  const findTag = (ifd: number, tag: number) => {
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (u16(entry) === tag) return entry;
    }
    return null;
  };
  const gpsPointer = findTag(u32(4), 0x8825);
  if (gpsPointer == null) return null;
  const gps = u32(gpsPointer + 8);
  const degrees = (entry: number | null) => {
    if (entry == null || u32(entry + 4) < 3) return NaN;
    const at = u32(entry + 8);
    const part = (k: number) => u32(at + k * 8) / u32(at + k * 8 + 4);
    return part(0) + part(1) / 60 + part(2) / 3600;
  };
  // Hemisphere letters ("N"/"S", "E"/"W") are stored inline in the entry's value field.
  const letter = (entry: number | null) => (entry == null ? '' : String.fromCharCode(view.getUint8(start + entry + 8)));
  let lat = degrees(findTag(gps, 2));
  let lng = degrees(findTag(gps, 4));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (letter(findTag(gps, 1)) === 'S') lat = -lat;
  if (letter(findTag(gps, 3)) === 'W') lng = -lng;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

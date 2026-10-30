/** Ray-casting point-in-polygon on a GeoJSON polygon's outer ring ([lng, lat] pairs). */
export function pointInPolygon(lng: number, lat: number, polygon: GeoJSON.Polygon): boolean {
  const ring = polygon.coordinates[0];
  // Region polygons east of the date line use longitudes > 180.
  const x = lng < -30 ? lng + 360 : lng;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && x < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

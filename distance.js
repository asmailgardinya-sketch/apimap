export function distanceMeters(a, b) {
  const rad = value => value * Math.PI / 180;
  const lat = rad(b.lat - a.lat);
  const lon = rad(b.lon - a.lon);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}

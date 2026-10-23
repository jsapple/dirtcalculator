const EARTH_RADIUS_FT = 20902254.6;

export function distanceFt(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlat = ((lat2 - lat1) * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dlon / 2) ** 2;
  return EARTH_RADIUS_FT * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function trueBearing(lat1, lon1, lat2, lon2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dlon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dlon) * Math.cos(p2);
  const x =
    Math.cos(p1) * Math.sin(p2) -
    Math.sin(p1) * Math.cos(p2) * Math.cos(dlon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

export function magneticDeclination(lat, lon) {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const sin2 = Math.sin(2 * phi);
  const cos2 = Math.cos(2 * phi);
  const cos1 = Math.cos(phi);
  const sin1 = Math.sin(phi);
  const cosL = Math.cos(lam);
  const sinL = Math.sin(lam);
  return (
    -1.4 +
    2.1 * sin1 * cos1 +
    0.35 * sin2 * cosL -
    0.18 * cos1 * sinL +
    0.08 * sin1 * sinL
  );
}

export function magneticBearing(lat1, lon1, lat2, lon2) {
  const trueBrg = trueBearing(lat1, lon1, lat2, lon2);
  const dec = magneticDeclination((lat1 + lat2) / 2, (lon1 + lon2) / 2);
  return Math.round((trueBrg - dec + 360) % 360);
}

export function metersToFt(m) {
  if (m == null || Number.isNaN(m)) return null;
  return m * 3.28084;
}

export function msToFps(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return null;
  return ms * 3.28084;
}

export function slopePercent(riseFt, runFt) {
  if (runFt == null || Math.abs(runFt) < 1) return null;
  if (riseFt == null) return null;
  return (riseFt / runFt) * 100;
}

export function designDeltaFt(runFt, slopePct) {
  if (runFt == null || slopePct == null) return null;
  return (runFt * slopePct) / 100;
}

const RAD = Math.PI / 180;
const CIVIL_ZENITH = 96;
const OFFICIAL_ZENITH = 90.8333;

/** Civil twilight times at lat/lon for the UTC date of `date`. */
export function civilTimes(lat, lon, date = new Date()) {
  const dawn = sunEvent(lat, lon, date, true, CIVIL_ZENITH);
  const dusk = sunEvent(lat, lon, date, false, CIVIL_ZENITH);
  const sunrise = sunEvent(lat, lon, date, true, OFFICIAL_ZENITH);
  const sunset = sunEvent(lat, lon, date, false, OFFICIAL_ZENITH);
  return { dawn, dusk, sunrise, sunset };
}

/** True after civil dusk or before civil dawn. */
export function isCivilNight(lat, lon, date = new Date()) {
  const polar = polarState(lat, lon, date, CIVIL_ZENITH);
  if (polar === "night") return true;
  if (polar === "day") return false;
  const { dawn, dusk } = civilTimes(lat, lon, date);
  if (!dawn || !dusk) return false;
  const t = date.getTime();
  return t < dawn.getTime() || t > dusk.getTime();
}

function polarState(lat, lon, date, zenith) {
  const N = dayOfYear(date);
  const lngHour = lon / 15;
  const t = N + (12 - lngHour) / 24;
  const { sinDec, cosDec } = sunDec(t);
  const cosH =
    (Math.cos(zenith * RAD) - sinDec * Math.sin(lat * RAD)) /
    (cosDec * Math.cos(lat * RAD));
  if (cosH > 1) return "night";
  if (cosH < -1) return "day";
  return null;
}

function sunEvent(lat, lon, date, rising, zenith) {
  const N = dayOfYear(date);
  const lngHour = lon / 15;
  const t = rising ? N + (6 - lngHour) / 24 : N + (18 - lngHour) / 24;
  const { L, RA, sinDec, cosDec } = sunCoords(t);
  void L;
  const cosH =
    (Math.cos(zenith * RAD) - sinDec * Math.sin(lat * RAD)) /
    (cosDec * Math.cos(lat * RAD));
  if (cosH > 1 || cosH < -1) return null;
  let H = Math.acos(cosH) / RAD;
  if (rising) H = 360 - H;
  H /= 15;
  const T = H + RA - 0.06571 * t - 6.622;
  let UT = T - lngHour;
  UT = ((UT % 24) + 24) % 24;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0, Math.round(UT * 3600000)));
}

function sunDec(t) {
  return sunCoords(t);
}

function sunCoords(t) {
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * RAD)) / RAD;
  RA = ((RA % 360) + 360) % 360;
  const Lquad = Math.floor(L / 90) * 90;
  const RAquad = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquad - RAquad)) / 15;
  const sinDec = 0.39782 * Math.sin(L * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  return { L, RA, sinDec, cosDec };
}

function dayOfYear(date) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 0);
  return Math.floor(
    (Date.UTC(y, date.getUTCMonth(), date.getUTCDate()) - start) / 86400000
  );
}

export function formatLocalHm(d) {
  if (!d) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

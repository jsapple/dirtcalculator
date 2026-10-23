import {
  distanceFt,
  magneticBearing,
  magneticDeclination,
  metersToFt,
  slopePercent,
  designDeltaFt,
} from "./geo.js";
import { isCivilNight } from "./sun.js";

const $ = (sel) => document.querySelector(sel);
const COMPASS_PERM_KEY = "grade-compass-perm";
const ZERO_KEY = "grade-attitude-zero";
const COURSE_DEG = 5;
const ON_GRADE_PCT = COURSE_DEG;
const JOB_KEY = "grade-job";
const GEO_FINE = {
  enableHighAccuracy: true,
  maximumAge: 2000,
  timeout: 25000,
};
const GEO_COARSE = {
  enableHighAccuracy: false,
  maximumAge: 15000,
  timeout: 20000,
};

const state = {
  position: null,
  accuracy: null,
  speedMs: null,
  altitudeM: null,
  headingTrue: null,
  headingMag: null,
  watchId: null,
  wakeLock: null,
  geoTriedLow: false,
  source: "gps",
  locked: false,
  benchmark: null,
  shots: [],
  targetSlope: 0,
  pitchRaw: null,
  rollRaw: null,
  pitchZero: 0,
  rollZero: 0,
  zeroed: false,
  zeroArm: false,
};

function padBrg(deg) {
  return String(deg).padStart(3, "0");
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function flashPress(el) {
  if (!el) return;
  el.classList.add("is-pressed");
  window.setTimeout(() => el.classList.remove("is-pressed"), 280);
}

function fmtFt(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 && digits > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}`;
}

function angDiff(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function applyNightMode(on) {
  document.documentElement.classList.toggle("night-mode", on);
}

function updateNightFromSun() {
  if (!state.position) return;
  applyNightMode(
    isCivilNight(state.position.lat, state.position.lon, new Date())
  );
}

function updateGpsStatus() {
  const el = $("#gps-status");
  if (!el) return;
  if (!state.position) {
    el.textContent = "GPS …";
    return;
  }
  const src = state.source === "ip" ? "IP" : "GPS";
  const acc =
    state.accuracy != null ? ` ±${Math.round(state.accuracy)}m` : "";
  const phase = isCivilNight(state.position.lat, state.position.lon)
    ? "NIGHT"
    : "DAY";
  el.textContent = `${src}${acc}  ${phase}`;
}

function headingMag() {
  if (state.headingMag != null && !Number.isNaN(state.headingMag)) {
    return Math.round((state.headingMag + 360) % 360);
  }
  if (
    state.headingTrue != null &&
    !Number.isNaN(state.headingTrue) &&
    state.position
  ) {
    return Math.round(
      (state.headingTrue -
        magneticDeclination(state.position.lat, state.position.lon) +
        360) %
        360
    );
  }
  return null;
}

function setNeedles(brg, hdg) {
  const rose = $("#hero-rose");
  const needle = $("#hero-needle");
  const onCourse = hdg != null && brg != null && angDiff(brg, hdg) <= COURSE_DEG;
  $("#hdg-tile")?.classList.toggle("on-grade", onCourse);
  $("#hero-ring")?.classList.toggle("on-course", onCourse);
  if (hdg != null) {
    if (rose) rose.setAttribute("transform", `rotate(${-hdg} 100 100)`);
    if (needle) {
      const rel = brg == null ? 0 : (brg - hdg + 360) % 360;
      needle.setAttribute("transform", `rotate(${rel} 100 100)`);
    }
    return;
  }
  if (rose) rose.setAttribute("transform", "rotate(0 100 100)");
  if (needle) {
    needle.setAttribute(
      "transform",
      `rotate(${brg == null ? 0 : brg} 100 100)`
    );
  }
}

function updateDirectChrome() {
  const open = $("#lock-open");
  const closed = $("#lock-closed");
  const btn = $("#direct-clr");
  open?.toggleAttribute("hidden", state.locked);
  closed?.toggleAttribute("hidden", !state.locked);
  if (btn) {
    btn.classList.toggle("is-locked", state.locked);
    btn.setAttribute("aria-label", state.locked ? "Unlock" : "Clear");
  }
}

function fmtSigned(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "—";
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return (0).toFixed(digits);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(digits)}`;
}

function smoothAngle(prev, next) {
  if (prev == null || Number.isNaN(prev)) return next;
  return prev * 0.72 + next * 0.28;
}

function gradePercent(deg) {
  if (deg == null || Number.isNaN(deg)) return null;
  const clamped = Math.max(-75, Math.min(75, deg));
  return Math.tan((clamped * Math.PI) / 180) * 100;
}

function cabAttitude() {
  if (state.pitchRaw == null || state.rollRaw == null) {
    return { pitch: null, roll: null, pitchPct: null, rollPct: null };
  }
  const pitch = state.pitchRaw - state.pitchZero;
  const roll = state.rollRaw - state.rollZero;
  return {
    pitch,
    roll,
    pitchPct: gradePercent(pitch),
    rollPct: gradePercent(roll),
  };
}

function setInclineAngle(deg) {
  const arrow = $("#incline-arrow");
  const wrap = $("#incline-wrap");
  if (!arrow) return;
  const known = deg != null && !Number.isNaN(deg);
  wrap?.classList.toggle("is-idle", !known);
  const clamped = known ? Math.max(-40, Math.min(40, deg)) : 0;
  arrow.setAttribute("transform", `rotate(${(-clamped).toFixed(2)} 80 24)`);
  if (wrap) {
    const label = known
      ? `Cab pitch ${Math.round(deg)} degrees`
      : "Cab pitch, zero the mount on level ground";
    wrap.querySelector("svg")?.setAttribute("aria-label", label);
  }
}

function updateAttitude() {
  const att = cabAttitude();
  const live = att.pitch != null;
  setText("#instr-pitch", live ? fmtSigned(att.pitchPct, 0) : "—");
  setText("#instr-roll", live ? fmtSigned(att.rollPct, 0) : "—");
  if (!live) {
    setText("#instr-pitch-unit", "°");
    setText("#instr-roll-unit", "°");
  } else if (!state.zeroed) {
    setText("#instr-pitch-unit", "UNZEROED");
    setText("#instr-roll-unit", "UNZEROED");
  } else {
    setText("#instr-pitch-unit", `${fmtSigned(att.pitch, 0)}°`);
    setText("#instr-roll-unit", `${fmtSigned(att.roll, 0)}°`);
  }
  const onGrade =
    state.zeroed &&
    att.pitchPct != null &&
    Math.abs(Math.round(att.pitchPct) - Math.round(state.targetSlope)) <= ON_GRADE_PCT;
  $("#pitch-tile")?.classList.toggle("on-grade", onGrade);
  const arrowDeg = state.zeroed ? att.pitch : null;
  setInclineAngle(arrowDeg);
  const zeroBtn = $("#zero-btn");
  if (zeroBtn) {
    zeroBtn.classList.toggle("is-zeroed", state.zeroed);
    zeroBtn.textContent = state.zeroed ? "RE-ZERO" : "ZERO";
  }
}

function updateInstruments() {
  const alt = metersToFt(state.altitudeM);
  const hdg = headingMag();
  setText("#instr-alt", alt != null ? Math.round(alt).toString() : "—");
  setText("#instr-hdg", hdg != null ? padBrg(hdg) : "—");
  setText("#instr-target", state.targetSlope.toFixed(1));
  updateAttitude();

  const bm = state.benchmark;
  if (!state.position || !bm) {
    setText("#instr-dist", "—");
    setText("#instr-brg", "—");
    setText("#instr-delev", "—");
    setText("#instr-slope", "—");
    setText("#instr-cut", "—");
    setNeedles(null, hdg);
    return;
  }

  const run = distanceFt(
    bm.lat,
    bm.lon,
    state.position.lat,
    state.position.lon
  );
  const brg = magneticBearing(
    state.position.lat,
    state.position.lon,
    bm.lat,
    bm.lon
  );
  const rise = alt != null && bm.elevFt != null ? alt - bm.elevFt : null;
  const slope = slopePercent(rise, run);
  const design = designDeltaFt(run, state.targetSlope);
  const cut =
    rise != null && design != null ? rise - design : null;

  setText("#instr-dist", run < 10 ? run.toFixed(1) : Math.round(run).toString());
  setText("#instr-brg", padBrg(brg));
  setText("#instr-delev", fmtFt(rise, 1));
  setText("#instr-slope", slope == null ? "—" : slope.toFixed(1));
  if (cut == null) setText("#instr-cut", "—");
  else if (Math.abs(cut) < 0.15) setText("#instr-cut", "ON");
  else setText("#instr-cut", `${cut > 0 ? "CUT" : "FILL"} ${Math.abs(cut).toFixed(1)}`);

  setNeedles(brg, hdg);
}

function renderHero() {
  updateDirectChrome();
  updateInstruments();
}

function renderShots() {
  const list = $("#shot-list");
  if (!list) return;
  list.innerHTML = "";
  if (!state.shots.length) {
    list.innerHTML =
      '<li class="brief-empty">No shots. Tap SHOT to store this location.</li>';
    return;
  }
  for (const s of [...state.shots].reverse()) {
    const li = document.createElement("li");
    li.innerHTML = `<button type="button" class="nrst-row">
      <span class="min-w-0 flex-1">
        <span class="nrst-ident">${s.name}</span>
        <span class="nrst-name">${s.note}</span>
      </span>
      <span class="nrst-right">
        <span class="nrst-vector">${s.vector}</span>
        <span class="nrst-wind">${s.grade}</span>
      </span>
    </button>`;
    list.appendChild(li);
  }
}

function setShotStatus(text) {
  const el = $("#shot-status");
  if (el) el.textContent = text || "";
}

function saveJob() {
  try {
    if (!state.benchmark) {
      localStorage.removeItem(JOB_KEY);
      return;
    }
    localStorage.setItem(
      JOB_KEY,
      JSON.stringify({
        benchmark: state.benchmark,
        shots: state.shots,
        locked: state.locked,
      })
    );
  } catch {
    /* private mode */
  }
}

function loadJob() {
  try {
    const raw = localStorage.getItem(JOB_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved?.benchmark || typeof saved.benchmark.lat !== "number") return;
    state.benchmark = saved.benchmark;
    state.shots = Array.isArray(saved.shots) ? saved.shots : [];
    state.locked = saved.locked !== false;
  } catch {
    /* private mode */
  }
}

function lockPortrait() {
  const orientation = screen.orientation;
  if (!orientation || typeof orientation.lock !== "function") return;
  orientation.lock("portrait").catch(() => {});
}

function markBenchmark() {
  if (!state.position) {
    setShotStatus("No GPS fix yet. Wait for GPS, then tap MARK.");
    return;
  }
  setShotStatus("");
  const n = state.shots.length + 1;
  state.benchmark = {
    name: `BM${String(n).padStart(2, "0")}`,
    lat: state.position.lat,
    lon: state.position.lon,
    elevFt: metersToFt(state.altitudeM),
    at: Date.now(),
  };
  state.locked = true;
  state.shots = [];
  saveJob();
  renderHero();
  renderShots();
}

function hasJob() {
  return Boolean(state.locked || state.benchmark || state.shots.length);
}

function closeClearConfirm() {
  const sheet = $("#clear-confirm");
  if (sheet) sheet.hidden = true;
}

function askClearBenchmark() {
  if (!hasJob()) {
    clearBenchmark();
    return;
  }
  const sheet = $("#clear-confirm");
  if (!sheet || !sheet.hidden) return;
  sheet.hidden = false;
}

function clearBenchmark() {
  state.locked = false;
  state.benchmark = null;
  state.shots = [];
  setShotStatus("");
  saveJob();
  renderHero();
  renderShots();
}

function takeShot() {
  if (!state.position) {
    setShotStatus("No GPS fix. Wait for GPS, then tap SHOT.");
    return;
  }
  if (!state.benchmark) {
    setShotStatus("Tap MARK on the hub before taking a shot.");
    return;
  }
  setShotStatus("");
  const bm = state.benchmark;
  const alt = metersToFt(state.altitudeM);
  const run = distanceFt(
    bm.lat,
    bm.lon,
    state.position.lat,
    state.position.lon
  );
  const brg = magneticBearing(
    state.position.lat,
    state.position.lon,
    bm.lat,
    bm.lon
  );
  const rise = alt != null && bm.elevFt != null ? alt - bm.elevFt : null;
  const slope = slopePercent(rise, run);
  const att = cabAttitude();
  const cab =
    att.pitchPct == null
      ? "cab —"
      : `cab ${fmtSigned(att.pitchPct, 0)}%  roll ${fmtSigned(att.rollPct, 0)}%`;
  const i = state.shots.length + 1;
  state.shots.push({
    name: `S${String(i).padStart(2, "0")}`,
    note: `${run.toFixed(0)} ft run${state.zeroed ? "" : " · unzeroed"}`,
    vector: `${padBrg(brg)}°  ${fmtFt(rise, 1)} ft`,
    grade: slope == null ? cab : `GPS ${slope.toFixed(1)}% · ${cab}`,
    lat: state.position.lat,
    lon: state.position.lon,
  });
  saveJob();
  renderShots();
}

function applyCoords({ lat, lon, accuracy, speed, altitude, heading, source }) {
  if (source === "ip" && state.position && state.source !== "ip") return;
  state.position = { lat, lon };
  state.accuracy = accuracy ?? null;
  state.speedMs = speed ?? null;
  state.altitudeM = altitude ?? null;
  state.headingTrue = heading ?? null;
  state.source = source || "gps";
  updateGpsStatus();
  updateNightFromSun();
  renderHero();
}

function onGeoSuccess(pos) {
  applyCoords({
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    speed: pos.coords.speed,
    altitude: pos.coords.altitude,
    heading: pos.coords.heading,
    source: "gps",
  });
}

function onGeoError(err) {
  if (state.position && state.source === "gps") return;
  const el = $("#gps-status");
  if (err?.code === 1) {
    if (el) el.textContent = "GPS denied · tap GPS to retry";
    return;
  }
  if (!state.geoTriedLow) {
    state.geoTriedLow = true;
    startGeolocation(GEO_COARSE);
  }
}

function startGeolocation(options = GEO_FINE) {
  if (document.visibilityState !== "visible") return;
  if (!navigator.geolocation) {
    $("#gps-status").textContent = "NO GPS";
    return;
  }
  navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, options);
  if (state.watchId != null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = navigator.geolocation.watchPosition(
    onGeoSuccess,
    onGeoError,
    { ...options, timeout: 60000, maximumAge: 3000 }
  );
}

function stopGeolocation() {
  if (state.watchId != null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
}

function loadZero() {
  try {
    const raw = localStorage.getItem(ZERO_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.pitch !== "number" || typeof saved.roll !== "number") return;
    state.pitchZero = saved.pitch;
    state.rollZero = saved.roll;
    state.zeroed = true;
  } catch {
    /* private mode */
  }
}

function saveZero() {
  try {
    localStorage.setItem(
      ZERO_KEY,
      JSON.stringify({ pitch: state.pitchZero, roll: state.rollZero })
    );
  } catch {
    /* private mode */
  }
}

function captureZero() {
  if (state.pitchRaw == null || state.rollRaw == null) return false;
  state.pitchZero = state.pitchRaw;
  state.rollZero = state.rollRaw;
  state.zeroed = true;
  state.zeroArm = false;
  saveZero();
  return true;
}

function onDeviceOrient(e) {
  if (typeof e.beta === "number" && !Number.isNaN(e.beta)) {
    state.pitchRaw = smoothAngle(state.pitchRaw, e.beta);
  }
  if (typeof e.gamma === "number" && !Number.isNaN(e.gamma)) {
    state.rollRaw = smoothAngle(state.rollRaw, e.gamma);
  }
  if (state.zeroArm) captureZero();
  let mag = e.webkitCompassHeading;
  if (mag == null && e.absolute && e.alpha != null) {
    mag = (360 - e.alpha) % 360;
  }
  if (mag != null && !Number.isNaN(Number(mag))) {
    state.headingMag = Number(mag);
  }
  updateInstruments();
}

function stopCompass() {
  window.removeEventListener("deviceorientation", onDeviceOrient, true);
  window.removeEventListener("deviceorientation", onDeviceOrient, false);
  window.removeEventListener("deviceorientationabsolute", onDeviceOrient, true);
  window.removeEventListener("deviceorientationabsolute", onDeviceOrient, false);
}

function bindCompassListeners() {
  stopCompass();
  window.addEventListener("deviceorientation", onDeviceOrient, true);
  window.addEventListener("deviceorientationabsolute", onDeviceOrient, true);
}

function compassPerm() {
  try {
    return localStorage.getItem(COMPASS_PERM_KEY) || "";
  } catch {
    return "";
  }
}

function setCompassPerm(value) {
  try {
    localStorage.setItem(COMPASS_PERM_KEY, value);
  } catch {
    /* private mode */
  }
}

async function startCompass({ prompt = false } = {}) {
  if (document.visibilityState !== "visible") return;
  const saved = compassPerm();
  if (saved === "denied") return;
  const needsAsk =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";
  if (needsAsk) {
    if (saved === "granted") {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch {
        /* still bind */
      }
    } else if (!prompt) {
      return;
    } else {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        setCompassPerm(res);
        if (res !== "granted") return;
      } catch {
        return;
      }
    }
  }
  bindCompassListeners();
}

function playWakeVideo() {
  const v = $("#wake-vid");
  if (!v) return;
  v.muted = true;
  v.playsInline = true;
  v.play().catch(() => {});
}

function releaseWakeLock() {
  const lock = state.wakeLock;
  state.wakeLock = null;
  if (lock) lock.release().catch(() => {});
  $("#wake-vid")?.pause();
}

async function requestWakeLock() {
  if (document.visibilityState !== "visible") return;
  playWakeVideo();
  if (!("wakeLock" in navigator)) return;
  try {
    if (state.wakeLock && state.wakeLock.released === false) return;
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
      if (document.visibilityState === "visible") requestWakeLock();
    });
  } catch {
    playWakeVideo();
  }
}

function sleepSensors() {
  stopGeolocation();
  stopCompass();
  releaseWakeLock();
  const el = $("#gps-status");
  if (el && state.position) el.textContent = "GPS sleep";
}

function wakeSensors() {
  requestWakeLock();
  updateGpsStatus();
  startGeolocation();
  startCompass();
}

export async function initApp() {
  $("#mark-btn")?.addEventListener("click", (e) => {
    flashPress(e.currentTarget);
    requestWakeLock();
    startGeolocation();
    startCompass({ prompt: compassPerm() !== "granted" });
    markBenchmark();
  });

  $("#clear-cancel")?.addEventListener("click", () => {
    closeClearConfirm();
  });
  $("#clear-ok")?.addEventListener("click", () => {
    closeClearConfirm();
    clearBenchmark();
  });
  $("#clear-confirm")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeClearConfirm();
  });

  $("#shot-btn")?.addEventListener("click", (e) => {
    flashPress(e.currentTarget);
    requestWakeLock();
    takeShot();
  });

  $("#zero-btn")?.addEventListener("click", (e) => {
    flashPress(e.currentTarget);
    requestWakeLock();
    startCompass({ prompt: compassPerm() !== "granted" });
    state.zeroArm = true;
    captureZero();
    updateInstruments();
  });

  $("#target-slope")?.addEventListener("focus", (e) => {
    setTimeout(() => {
      e.target.scrollIntoView({ block: "center", inline: "nearest" });
    }, 280);
  });

  $("#target-slope")?.addEventListener("input", (e) => {
    const raw = String(e.target.value).trim().replace(",", ".");
    if (raw === "" || raw === "-" || raw === "." || raw === "-.") {
      state.targetSlope = 0;
      updateInstruments();
      return;
    }
    const n = Number(raw);
    state.targetSlope = Number.isFinite(n) ? n : 0;
    updateInstruments();
  });

  $("#slope-sign")?.addEventListener("click", () => {
    const input = $("#target-slope");
    state.targetSlope = -state.targetSlope;
    if (input) input.value = state.targetSlope.toFixed(1);
    updateInstruments();
  });

  document.addEventListener(
    "click",
    (e) => {
      const clr = e.target.closest("#direct-clr");
      if (!clr) return;
      flashPress(clr);
      e.preventDefault();
      e.stopPropagation();
      askClearBenchmark();
      requestWakeLock();
    },
    true
  );

  $("#gps-status")?.addEventListener("click", () => {
    requestWakeLock();
    state.geoTriedLow = false;
    startGeolocation(GEO_FINE);
  });

  const arm = () => {
    requestWakeLock();
    lockPortrait();
    startGeolocation(GEO_FINE);
    startCompass({ prompt: compassPerm() !== "granted" });
  };
  document.addEventListener("touchend", arm, { passive: true });
  document.addEventListener("click", arm);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wakeSensors();
    else sleepSensors();
  });
  window.addEventListener("pagehide", sleepSensors);
  window.addEventListener("freeze", sleepSensors);
  window.addEventListener("pageshow", wakeSensors);

  setInterval(updateNightFromSun, 60 * 1000);
  setInterval(() => {
    if (document.visibilityState === "visible") requestWakeLock();
  }, 20000);

  loadZero();
  loadJob();
  renderShots();
  renderHero();
  startGeolocation();
  startCompass({ prompt: false });
}

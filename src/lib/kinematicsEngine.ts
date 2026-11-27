import { compileMathExpression } from './mathGraphEngine';

export type TimeUnit = 's' | 'min' | 'h';
export type SpeedUnit = 'm/s' | 'km/h';
export type DistanceUnit = 'm' | 'km';

export interface KinematicsPhase {
  name?: string;
  duration: number; // in timeUnit
  v0?: number; // initial speed in speedUnit
  speed?: number; // alias for constant-speed phase
  v1?: number; // optional final speed in speedUnit (computes exact a = (v1-v0)/duration)
  a?: number; // acceleration in speedUnit / timeUnit
}

export interface KinematicsObjectSpec {
  name: string;
  startTime?: number;
  startDistance?: number;
  phases: KinematicsPhase[];
}

export interface KinematicsGraphResult {
  xKey: string;
  rows: Array<Record<string, any>>;
  series: string[];
  speedSeries: string[];
  distanceSeries: string[];
  accelSeries: string[];
  otherSeries: string[];
  timeUnit: TimeUnit;
  speedUnit: SpeedUnit;
  distanceUnit: DistanceUnit;
  hasSpeedAndDistance: boolean;
  verifiedPhysicsNote: string | null;
  meetings: Array<{ t: number; distance: number; objA: string; objB: string }>;
}

function normalizeTimeUnit(raw?: string): TimeUnit {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'h' || s === 'hr' || s === 'hour' || s === 'hours' || s === 'giờ' || s === 'gio') return 'h';
  if (s === 'min' || s === 'm' || s === 'minute' || s === 'phút' || s === 'phut') return 'min';
  return 's';
}

function normalizeSpeedUnit(raw?: string, fallbackTime: TimeUnit = 's'): SpeedUnit {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (s.includes('km/h') || s.includes('kmh') || s.includes('kph')) return 'km/h';
  if (s.includes('m/s')) return 'm/s';
  return fallbackTime === 'h' ? 'km/h' : 'm/s';
}

function normalizeDistanceUnit(raw?: string, speedUnit: SpeedUnit = 'm/s'): DistanceUnit {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'km' || s.includes('kilometer') || s.includes('kilômét')) return 'km';
  if (s === 'm' || s === 'mét' || s === 'met' || s === 'meter') return 'm';
  return speedUnit === 'km/h' ? 'km' : 'm';
}

/**
 * Multiplier converting (speedUnit * timeUnit) into distanceUnit.
 * Example: speed in km/h, time in min, dist in km => (1/60) km per (km/h * min).
 */
export function getKinematicsUnitFactor(
  timeUnit: TimeUnit,
  speedUnit: SpeedUnit,
  distanceUnit: DistanceUnit
): number {
  const timeInSeconds = timeUnit === 'h' ? 3600 : timeUnit === 'min' ? 60 : 1;
  const speedInMetersPerSec = speedUnit === 'km/h' ? 1000 / 3600 : 1;
  const metersPerProduct = speedInMetersPerSec * timeInSeconds;
  return distanceUnit === 'km' ? metersPerProduct / 1000 : metersPerProduct;
}

function parseNumericTime(val: any): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val ?? '').trim();
  if (!s) return null;
  const hhmm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmm) {
    const h = Number(hhmm[1]);
    const m = Number(hhmm[2]);
    const sec = Number(hhmm[3] || 0);
    return h + m / 60 + sec / 3600;
  }
  const m = s.match(/^-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function sampleObjectPhases(
  obj: KinematicsObjectSpec,
  timeUnit: TimeUnit,
  speedUnit: SpeedUnit,
  distanceUnit: DistanceUnit
): Array<{ t: number; v: number; s: number; a: number }> {
  const factor = getKinematicsUnitFactor(timeUnit, speedUnit, distanceUnit);
  const pts: Array<{ t: number; v: number; s: number; a: number }> = [];

  let curT = Number(obj.startTime ?? 0) || 0;
  let curS = Number(obj.startDistance ?? 0) || 0;
  let prevV = Number(obj.phases[0]?.v0 ?? obj.phases[0]?.speed ?? 0) || 0;

  for (let pIdx = 0; pIdx < obj.phases.length; pIdx++) {
    const ph = obj.phases[pIdx];
    const dur = Math.max(0.01, Number(ph.duration ?? 1) || 1);
    const v0 = ph.v0 !== undefined ? Number(ph.v0) : ph.speed !== undefined ? Number(ph.speed) : prevV;
    const accel =
      ph.a !== undefined
        ? Number(ph.a)
        : ph.v1 !== undefined
        ? (Number(ph.v1) - v0) / dur
        : 0;

    // Sample enough points for curved acceleration segments, 2+ for constant velocity
    const steps = Math.abs(accel) > 1e-9 ? Math.max(8, Math.min(20, Math.round(dur * 4))) : Math.max(2, Math.min(8, Math.round(dur * 2)));
    for (let i = 0; i <= steps; i++) {
      // Avoid duplicate point at exact boundary unless velocity jumps discontinuously
      if (pIdx > 0 && i === 0 && Math.abs(v0 - prevV) < 1e-6) continue;
      const dt = (dur * i) / steps;
      const v = v0 + accel * dt;
      const s = curS + (v0 * dt + 0.5 * accel * dt * dt) * factor;
      pts.push({
        t: round4(curT + dt),
        v: round4(v),
        s: round4(s),
        a: round4(accel),
      });
    }

    curS = curS + (v0 * dur + 0.5 * accel * dur * dur) * factor;
    prevV = v0 + accel * dur;
    curT += dur;
  }

  return pts;
}

export function buildKinematicsTimeGraph(payload: any): KinematicsGraphResult {
  const timeUnit = normalizeTimeUnit(payload?.timeUnit || payload?.xUnit);
  const speedUnit = normalizeSpeedUnit(payload?.speedUnit || payload?.vUnit, timeUnit);
  const distanceUnit = normalizeDistanceUnit(payload?.distanceUnit || payload?.sUnit, speedUnit);
  const factor = getKinematicsUnitFactor(timeUnit, speedUnit, distanceUnit);

  // MODE A: Parametric kinematics (`objects` array or `phases` array)
  const objectsInput: KinematicsObjectSpec[] = Array.isArray(payload?.objects)
    ? payload.objects
    : Array.isArray(payload?.phases)
    ? [{ name: String(payload?.objectName || 'Chuyển động'), startTime: 0, startDistance: 0, phases: payload.phases }]
    : [];

  if (objectsInput.length > 0) {
    const perObjSamples = objectsInput.map((obj) => ({
      name: String(obj.name || 'Đối tượng'),
      pts: sampleObjectPhases(obj, timeUnit, speedUnit, distanceUnit),
    }));

    // Build unified sorted time grid
    const timeSet = new Set<number>();
    perObjSamples.forEach((o) => o.pts.forEach((p) => timeSet.add(p.t)));
    const times = Array.from(timeSet).sort((a, b) => a - b);

    const interpAt = (pts: Array<{ t: number; v: number; s: number; a: number }>, targetT: number) => {
      if (pts.length === 0) return { v: 0, s: 0, a: 0 };
      const exact = pts.find((p) => Math.abs(p.t - targetT) < 1e-6);
      if (exact) return exact;
      if (targetT <= pts[0].t) return { v: pts[0].v, s: pts[0].s, a: pts[0].a };
      if (targetT >= pts[pts.length - 1].t) {
        const last = pts[pts.length - 1];
        return { v: last.v, s: last.s, a: last.a };
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        if (targetT >= p0.t && targetT <= p1.t) {
          const ratio = (targetT - p0.t) / Math.max(1e-9, p1.t - p0.t);
          return {
            v: round4(p0.v + (p1.v - p0.v) * ratio),
            s: round4(p0.s + (p1.s - p0.s) * ratio),
            a: round4(p0.a),
          };
        }
      }
      return pts[pts.length - 1];
    };

    const single = perObjSamples.length === 1;
    const speedSeries: string[] = [];
    const distanceSeries: string[] = [];
    const accelSeries: string[] = [];

    perObjSamples.forEach((o) => {
      speedSeries.push(single ? `Vận tốc (${speedUnit})` : `${o.name} · v (${speedUnit})`);
      distanceSeries.push(single ? `Quãng đường (${distanceUnit})` : `${o.name} · s (${distanceUnit})`);
      accelSeries.push(single ? `Gia tốc` : `${o.name} · a`);
    });

    const rows = times.map((t) => {
      const row: Record<string, any> = { time: t };
      perObjSamples.forEach((o, idx) => {
        const val = interpAt(o.pts, t);
        row[speedSeries[idx]] = val.v;
        row[distanceSeries[idx]] = val.s;
        row[accelSeries[idx]] = val.a;
      });
      return row;
    });

    // Detect crossing/meeting points between distance curves when >=2 objects exist
    const meetings: Array<{ t: number; distance: number; objA: string; objB: string }> = [];
    for (let aIdx = 0; aIdx < perObjSamples.length; aIdx++) {
      for (let bIdx = aIdx + 1; bIdx < perObjSamples.length; bIdx++) {
        const kA = distanceSeries[aIdx];
        const kB = distanceSeries[bIdx];
        for (let i = 0; i < rows.length - 1; i++) {
          const d0 = Number(rows[i][kA]) - Number(rows[i][kB]);
          const d1 = Number(rows[i + 1][kA]) - Number(rows[i + 1][kB]);
          if (Math.abs(d0) < 1e-5 && rows[i].time > 0) {
            meetings.push({
              t: rows[i].time,
              distance: Number(rows[i][kA]),
              objA: perObjSamples[aIdx].name,
              objB: perObjSamples[bIdx].name,
            });
          } else if (d0 * d1 < 0) {
            const frac = Math.abs(d0) / (Math.abs(d0) + Math.abs(d1));
            const tMeet = round4(rows[i].time + (rows[i + 1].time - rows[i].time) * frac);
            const sMeet = round4(Number(rows[i][kA]) + (Number(rows[i + 1][kA]) - Number(rows[i][kA])) * frac);
            meetings.push({
              t: tMeet,
              distance: sMeet,
              objA: perObjSamples[aIdx].name,
              objB: perObjSamples[bIdx].name,
            });
          }
        }
      }
    }

    const showAccel = objectsInput.some((o) => o.phases.some((p) => Number(p.a ?? 0) !== 0 || p.v1 !== undefined));
    const finalSeries = [...distanceSeries, ...speedSeries, ...(showAccel ? accelSeries : [])];

    return {
      xKey: 'time',
      rows,
      series: finalSeries,
      speedSeries,
      distanceSeries,
      accelSeries: showAccel ? accelSeries : [],
      otherSeries: [],
      timeUnit,
      speedUnit,
      distanceUnit,
      hasSpeedAndDistance: true,
      verifiedPhysicsNote:
        meetings.length > 0
          ? `Đã tính s(t) = ∫v(t)dt chính xác · Gặp nhau tại t = ${meetings[0].t}${timeUnit} (s = ${meetings[0].distance}${distanceUnit})`
          : `Đã tính tích phân s(t) = ∫v(t)dt chính xác (${timeUnit} · ${speedUnit} · ${distanceUnit})`,
      meetings,
    };
  }

  // MODE C: Explicit multi-variable time functions (`functions` array or `expression` without objects/phases)
  const rawFuncs = Array.isArray(payload?.functions)
    ? payload.functions
    : payload?.expression || payload?.formula || payload?.equation
    ? [{ label: payload?.label || payload?.yLabel || String(payload.expression || payload.formula || payload.equation), expr: String(payload.expression || payload.formula || payload.equation) }]
    : [];

  if (rawFuncs.length > 0 && (!Array.isArray(payload?.data) || payload.data.length === 0)) {
    const dom = payload?.tRange || payload?.xRange || payload?.domain;
    const tMin = Array.isArray(dom) && Number.isFinite(Number(dom[0])) ? Number(dom[0]) : 0;
    const tMax = Array.isArray(dom) && Number.isFinite(Number(dom[1])) && Number(dom[1]) > tMin ? Number(dom[1]) : 10;
    const paramMap: Record<string, number> = {};
    if (Array.isArray(payload?.params)) {
      payload.params.forEach((p: any) => {
        if (p?.name && Number.isFinite(Number(p.value))) {
          paramMap[String(p.name).toLowerCase()] = Number(p.value);
        }
      });
    }

    const compiledFns = rawFuncs
      .map((fn: any, idx: number) => {
        const rawExpr = typeof fn === 'string' ? fn : String(fn?.expr || fn?.formula || fn?.equation || fn?.y || '');
        if (!rawExpr.trim()) return null;
        const label = typeof fn === 'string' ? `f${idx + 1}(${rawExpr})` : String(fn?.label || fn?.name || rawExpr);
        const kindHint = `${label} ${rawExpr}`.toLowerCase();
        const role: 'distance' | 'speed' | 'accel' | 'other' =
          fn?.kind === 'speed' || /^(v|speed|velocity)\b|\bv\(t\)|vận tốc/i.test(kindHint)
            ? 'speed'
            : fn?.kind === 'accel' || /^(a|accel)\b|\ba\(t\)|gia tốc/i.test(kindHint)
            ? 'accel'
            : fn?.kind === 'distance' || /^(s|x|d|dist|distance)\b|\bs\(t\)|quãng đường|vị trí/i.test(kindHint)
            ? 'distance'
            : 'other';
        return {
          label,
          role,
          evalFn: compileMathExpression(rawExpr),
        };
      })
      .filter((x: any): x is { label: string; role: 'distance' | 'speed' | 'accel' | 'other'; evalFn: (v: Record<string, number>) => number } => Boolean(x));

    if (compiledFns.length > 0) {
      const steps = 48;
      const rows: Array<Record<string, any>> = [];
      for (let i = 0; i <= steps; i++) {
        const t = round4(tMin + ((tMax - tMin) * i) / steps);
        const row: Record<string, any> = { time: t };
        compiledFns.forEach((fn) => {
          const val = fn.evalFn({ ...paramMap, t, x: t });
          row[fn.label] = Number.isFinite(val) ? round4(val) : null;
        });
        rows.push(row);
      }

      const speedSeries = compiledFns.filter((f) => f.role === 'speed').map((f) => f.label);
      const distanceSeries = compiledFns.filter((f) => f.role === 'distance').map((f) => f.label);
      const accelSeries = compiledFns.filter((f) => f.role === 'accel').map((f) => f.label);
      const otherSeries = compiledFns.filter((f) => f.role === 'other').map((f) => f.label);
      const allSeries = compiledFns.map((f) => f.label);

      // Find exact meeting/intersection points across compatible series
      const meetings: Array<{ t: number; distance: number; objA: string; objB: string }> = [];
      for (let a = 0; a < compiledFns.length; a++) {
        for (let b = a + 1; b < compiledFns.length; b++) {
          const fA = compiledFns[a];
          const fB = compiledFns[b];
          if (fA.role !== fB.role && (fA.role === 'speed' || fB.role === 'speed')) continue;
          for (let i = 0; i < rows.length - 1; i++) {
            const vA0 = rows[i][fA.label];
            const vB0 = rows[i][fB.label];
            const vA1 = rows[i + 1][fA.label];
            const vB1 = rows[i + 1][fB.label];
            if (typeof vA0 !== 'number' || typeof vB0 !== 'number' || typeof vA1 !== 'number' || typeof vB1 !== 'number') continue;
            const d0 = vA0 - vB0;
            const d1 = vA1 - vB1;
            if (Math.abs(d0) < 1e-5) {
              meetings.push({ t: rows[i].time, distance: round4(vA0), objA: fA.label, objB: fB.label });
            } else if (d0 * d1 < 0) {
              let lo = rows[i].time;
              let hi = rows[i + 1].time;
              let dLo = d0;
              for (let it = 0; it < 16; it++) {
                const mid = (lo + hi) * 0.5;
                const valA = fA.evalFn({ ...paramMap, t: mid, x: mid });
                const valB = fB.evalFn({ ...paramMap, t: mid, x: mid });
                const dMid = valA - valB;
                if (!Number.isFinite(dMid)) break;
                if (dLo * dMid <= 0) hi = mid;
                else {
                  lo = mid;
                  dLo = dMid;
                }
              }
              const tMeet = round4((lo + hi) * 0.5);
              const yMeet = round4(fA.evalFn({ ...paramMap, t: tMeet, x: tMeet }));
              if (Number.isFinite(yMeet)) {
                meetings.push({ t: tMeet, distance: yMeet, objA: fA.label, objB: fB.label });
              }
            }
          }
        }
      }

      return {
        xKey: 'time',
        rows,
        series: allSeries,
        speedSeries,
        distanceSeries,
        accelSeries,
        otherSeries,
        timeUnit,
        speedUnit,
        distanceUnit,
        hasSpeedAndDistance: speedSeries.length > 0 && distanceSeries.length > 0,
        verifiedPhysicsNote:
          meetings.length > 0
            ? `Đồ thị đa hàm theo ${timeUnit} · Giao điểm tại t = ${meetings[0].t}${timeUnit} (y = ${meetings[0].distance})`
            : `Đồ thị đa hàm theo biến t (${timeUnit})`,
        meetings,
      };
    }
  }

  // MODE B: Tabular rows in payload.data (auto-verify/reconcile kinematics if speed/distance keys exist)
  const rawRows: any[] = Array.isArray(payload?.data) ? payload.data.map((r: any) => ({ ...r })) : [];
  const xKey =
    payload?.xAxis ||
    (rawRows[0]?.time !== undefined
      ? 'time'
      : rawRows[0]?.t !== undefined
      ? 't'
      : rawRows[0]?.date !== undefined
      ? 'date'
      : 'name');

  const explicitSeries: string[] = Array.isArray(payload?.series) && payload.series.length > 0 ? payload.series : [];
  const discoveredKeys = new Set<string>(explicitSeries);
  if (discoveredKeys.size === 0 && rawRows.length > 0) {
    Object.keys(rawRows[0] || {}).forEach((k) => {
      if (k === xKey) return;
      const v = rawRows[0][k];
      if (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))) {
        discoveredKeys.add(k);
      }
    });
  }

  const allKeys = Array.from(discoveredKeys);
  const speedKeys = allKeys.filter((k) => /^(speed|velocity|v|van_toc|vantoc)$/i.test(k) || /(speed|velocity|vận tốc)/i.test(k));
  const distKeys = allKeys.filter((k) => /^(distance|dist|s|quang_duong|quangduong|position)$/i.test(k) || /(distance|quãng đường)/i.test(k));
  const accelKeys = allKeys.filter((k) => /^(accel|acceleration|a|gia_toc)$/i.test(k));
  const otherKeys = allKeys.filter((k) => !speedKeys.includes(k) && !distKeys.includes(k) && !accelKeys.includes(k));

  let verifiedPhysicsNote: string | null = null;
  const shouldVerifyKinematics = payload?.verifyKinematics !== false;

  // Verify or derive distance / speed from exact trapezoidal kinematics when single pair exists
  if (shouldVerifyKinematics && rawRows.length >= 2) {
    const numericTimes = rawRows.map((r) => parseNumericTime(r[xKey]));
    const timesValid = numericTimes.every((t): t is number => t !== null) &&
      numericTimes.every((t, i) => i === 0 || t >= numericTimes[i - 1]);

    if (timesValid && speedKeys.length === 1) {
      const sk = speedKeys[0];
      const dk = distKeys[0] || 'distance';
      const hasInputDistance = distKeys.length >= 1;
      const startDist = hasInputDistance && Number.isFinite(Number(rawRows[0][dk])) ? Number(rawRows[0][dk]) : 0;

      // Exact cumulative trapezoidal integration: s[i] = s[i-1] + 0.5*(v[i-1] + v[i])*dt*factor
      const computedS: number[] = [round4(startDist)];
      let maxRelError = 0;
      for (let i = 1; i < rawRows.length; i++) {
        const dt = numericTimes[i] - numericTimes[i - 1];
        const vPrev = Number(rawRows[i - 1][sk]) || 0;
        const vCur = Number(rawRows[i][sk]) || 0;
        const nextS = computedS[i - 1] + 0.5 * (vPrev + vCur) * dt * factor;
        computedS.push(round4(nextS));

        if (hasInputDistance && Number.isFinite(Number(rawRows[i][dk]))) {
          const given = Number(rawRows[i][dk]);
          const denom = Math.max(1, Math.abs(nextS));
          maxRelError = Math.max(maxRelError, Math.abs(given - nextS) / denom);
        }
      }

      if (!hasInputDistance) {
        rawRows.forEach((r, i) => {
          r[dk] = computedS[i];
        });
        distKeys.push(dk);
        allKeys.push(dk);
        verifiedPhysicsNote = `Đã suy xuất chính xác quãng đường s(t) = ∫v(t)dt (${distanceUnit})`;
      } else if (maxRelError > 0.03) {
        rawRows.forEach((r, i) => {
          r[dk] = computedS[i];
        });
        verifiedPhysicsNote = `Đã chuẩn hóa lại s(t) theo đúng công thức tích phân v(t)·dt`;
      } else {
        verifiedPhysicsNote = `Khớp định luật động học s(t) = ∫v(t)dt (sai số < ${(maxRelError * 100).toFixed(1)}%)`;
      }
    } else if (timesValid && distKeys.length === 1 && speedKeys.length === 0) {
      // Derive instantaneous/segment speed v = Δs / (Δt * factor)
      const dk = distKeys[0];
      const sk = 'speed';
      rawRows[0][sk] =
        rawRows.length > 1
          ? round4(
              (Number(rawRows[1][dk]) - Number(rawRows[0][dk])) /
                Math.max(1e-9, (numericTimes[1] - numericTimes[0]) * factor)
            )
          : 0;
      for (let i = 1; i < rawRows.length; i++) {
        const dt = Math.max(1e-9, numericTimes[i] - numericTimes[i - 1]);
        const ds = (Number(rawRows[i][dk]) || 0) - (Number(rawRows[i - 1][dk]) || 0);
        rawRows[i][sk] = round4(ds / (dt * factor));
      }
      speedKeys.push(sk);
      allKeys.push(sk);
      verifiedPhysicsNote = `Đã suy xuất chính xác vận tốc v(t) = ds/dt (${speedUnit})`;
    }
  }

  return {
    xKey,
    rows: rawRows,
    series: allKeys,
    speedSeries: speedKeys,
    distanceSeries: distKeys,
    accelSeries: accelKeys,
    otherSeries: otherKeys,
    timeUnit,
    speedUnit,
    distanceUnit,
    hasSpeedAndDistance: speedKeys.length > 0 && distKeys.length > 0,
    verifiedPhysicsNote,
    meetings: [],
  };
}

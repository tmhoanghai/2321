export interface MathParamSpec {
  name: string;
  label?: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface MathFunctionSpec {
  id: string;
  expr: string;
  xExpr?: string;
  yExpr?: string;
  zExpr?: string;
  label: string;
  color: string;
  visible: boolean;
  isParametric?: boolean;
  tRange?: [number, number];
}

export interface VectorSpec {
  id: string;
  label: string;
  origin: [number, number, number];
  components: [number, number, number];
  color: string;
  visible: boolean;
}

export interface PointSpec {
  id: string;
  label: string;
  coords: [number, number, number];
  color: string;
}

const MATH_PALETTE = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Crimson
  '#7c3aed', // Violet
  '#0891b2', // Cyan
];

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS_1ARG: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  cot: (x) => {
    const t = Math.tan(x);
    return Math.abs(t) < 1e-12 ? NaN : 1 / t;
  },
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

const FUNCTIONS_2ARG: Record<string, (a: number, b: number) => number> = {
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  atan2: Math.atan2,
};

const RESERVED_IDENTIFIERS = new Set([
  ...Object.keys(CONSTANTS),
  ...Object.keys(FUNCTIONS_1ARG),
  ...Object.keys(FUNCTIONS_2ARG),
  'x',
  'y',
  'z',
  't',
  'theta',
]);

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

export function normalizeMathText(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^[yzsva]\s*\(\s*[xyt]\s*\)\s*=\s*/i, '')
    .replace(/^[yzsva]\s*=\s*/i, '')
    .replace(/^[fghpq]\s*\(\s*[xyt](?:\s*,\s*[y])?\s*\)\s*=\s*/i, '')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/¹/g, '^1')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/π/g, ' pi ')
    .replace(/θ/g, ' theta ')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√([a-zA-Z0-9_.]+)/g, 'sqrt($1)')
    .replace(/\*\*/g, '^');
}

function tokenizeMath(rawExpr: string): Token[] {
  const expr = normalizeMathText(rawExpr);
  const rawTokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < expr.length && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      let j = i;
      while (j < expr.length && ((expr[j] >= '0' && expr[j] <= '9') || expr[j] === '.')) j++;
      if (j < expr.length && (expr[j] === 'e' || expr[j] === 'E')) {
        const next = expr[j + 1];
        if ((next >= '0' && next <= '9') || ((next === '+' || next === '-') && expr[j + 2] >= '0' && expr[j + 2] <= '9')) {
          j++;
          if (expr[j] === '+' || expr[j] === '-') j++;
          while (j < expr.length && expr[j] >= '0' && expr[j] <= '9') j++;
        }
      }
      const numVal = Number(expr.slice(i, j));
      if (!Number.isFinite(numVal)) {
        throw new Error(`Invalid number near "${expr.slice(i, j)}"`);
      }
      rawTokens.push({ type: 'num', value: numVal });
      i = j;
      continue;
    }

    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let j = i;
      while (
        j < expr.length &&
        ((expr[j] >= 'a' && expr[j] <= 'z') || (expr[j] >= 'A' && expr[j] <= 'Z') || (expr[j] >= '0' && expr[j] <= '9') || expr[j] === '_')
      ) {
        j++;
      }
      rawTokens.push({ type: 'ident', value: expr.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      rawTokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '(') {
      rawTokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      rawTokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      rawTokens.push({ type: 'comma' });
      i++;
      continue;
    }

    // Skip unrecognized punctuation safely instead of crashing entire chart
    i++;
  }

  // Insert implicit multiplication:
  // num -> ident | lparen
  // rparen -> ident | num | lparen
  // ident (non-function) -> num | lparen
  const out: Token[] = [];
  for (let k = 0; k < rawTokens.length; k++) {
    const prev = out[out.length - 1];
    const curr = rawTokens[k];
    if (prev) {
      const prevIsValueEnd =
        prev.type === 'num' ||
        prev.type === 'rparen' ||
        (prev.type === 'ident' && !(prev.value in FUNCTIONS_1ARG) && !(prev.value in FUNCTIONS_2ARG));
      const currIsValueStart =
        curr.type === 'lparen' || curr.type === 'ident' || curr.type === 'num';

      if (prevIsValueEnd && currIsValueStart) {
        // Avoid turning `sin(` into `sin * (` (already excluded because prev is function)
        if (!(prev.type === 'ident' && curr.type === 'num')) {
          out.push({ type: 'op', value: '*' });
        } else if (prev.type === 'ident' && curr.type === 'num') {
          out.push({ type: 'op', value: '*' });
        }
      }
    }
    out.push(curr);
  }

  return out;
}

type EvalNode = (vars: Record<string, number>) => number;

export function compileMathExpression(rawExpr: string): EvalNode {
  let tokens: Token[];
  try {
    tokens = tokenizeMath(rawExpr);
  } catch {
    return () => NaN;
  }

  if (tokens.length === 0) return () => NaN;

  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token | undefined => tokens[pos++];

  const parseExpression = (): EvalNode => {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek() as any).value in { '+': 1, '-': 1 }) {
      const op = (consume() as any).value;
      const right = parseTerm();
      const prevLeft = left;
      left = op === '+' ? (v) => prevLeft(v) + right(v) : (v) => prevLeft(v) - right(v);
    }
    return left;
  };

  const parseTerm = (): EvalNode => {
    let left = parseSigned();
    while (peek()?.type === 'op' && (peek() as any).value in { '*': 1, '/': 1 }) {
      const op = (consume() as any).value;
      const right = parseSigned();
      const prevLeft = left;
      left =
        op === '*'
          ? (v) => prevLeft(v) * right(v)
          : (v) => {
              const d = right(v);
              return Math.abs(d) < 1e-12 ? NaN : prevLeft(v) / d;
            };
    }
    return left;
  };

  const parseSigned = (): EvalNode => {
    if (peek()?.type === 'op' && ((peek() as any).value === '+' || (peek() as any).value === '-')) {
      const op = (consume() as any).value;
      const inner = parseSigned();
      return op === '-' ? (v) => -inner(v) : inner;
    }
    return parsePower();
  };

  const parsePower = (): EvalNode => {
    const base = parsePrimary();
    if (peek()?.type === 'op' && (peek() as any).value === '^') {
      consume();
      const expNode = parseSigned();
      return (v) => Math.pow(base(v), expNode(v));
    }
    return base;
  };

  const parsePrimary = (): EvalNode => {
    const tok = peek();
    if (!tok) return () => NaN;

    if (tok.type === 'num') {
      consume();
      const val = tok.value;
      return () => val;
    }

    if (tok.type === 'lparen') {
      consume();
      const inner = parseExpression();
      if (peek()?.type === 'rparen') consume();
      return inner;
    }

    if (tok.type === 'ident') {
      consume();
      const name = tok.value;

      if (peek()?.type === 'lparen' && (name in FUNCTIONS_1ARG || name in FUNCTIONS_2ARG)) {
        consume(); // '('
        const arg1 = parseExpression();
        let arg2: EvalNode | null = null;
        if (peek()?.type === 'comma') {
          consume();
          arg2 = parseExpression();
        }
        if (peek()?.type === 'rparen') consume();

        if (name in FUNCTIONS_2ARG && arg2) {
          const fn2 = FUNCTIONS_2ARG[name];
          return (v) => fn2(arg1(v), arg2!(v));
        }
        if (name in FUNCTIONS_1ARG) {
          const fn1 = FUNCTIONS_1ARG[name];
          return (v) => fn1(arg1(v));
        }
        return () => NaN;
      }

      if (name in CONSTANTS) {
        const c = CONSTANTS[name];
        return () => c;
      }

      // Dynamic variable or implicit single-letter product (e.g. `ax` -> `a * x`)
      return (v) => {
        if (name in v) return v[name];
        if (name.length > 1) {
          let product = 1;
          for (let k = 0; k < name.length; k++) {
            const ch = name[k];
            if (ch in v) product *= v[ch];
            else if (ch in CONSTANTS) product *= CONSTANTS[ch];
            else return NaN;
          }
          return product;
        }
        return NaN;
      };
    }

    consume();
    return () => NaN;
  };

  try {
    return parseExpression();
  } catch {
    return () => NaN;
  }
}

export function extractExpressionIdentifiers(rawExpr: string): string[] {
  try {
    const tokens = tokenizeMath(rawExpr);
    const out = new Set<string>();
    for (const t of tokens) {
      if (t.type !== 'ident') continue;
      if (RESERVED_IDENTIFIERS.has(t.value)) continue;
      if (t.value.length > 1 && /^[a-z]+$/.test(t.value)) {
        // Split implicit compact forms like `ax` if no long param name looks intentional
        // Preserve multi-char parameter names like `omega`, `alpha`, `k1`, `amp`
        if (t.value.length <= 2) {
          for (const ch of t.value) {
            if (!RESERVED_IDENTIFIERS.has(ch)) out.add(ch);
          }
          continue;
        }
      }
      out.add(t.value);
    }
    return Array.from(out);
  } catch {
    return [];
  }
}

export function normalizeFunctions2D(payload: any): MathFunctionSpec[] {
  const list: MathFunctionSpec[] = [];

  if (Array.isArray(payload?.functions) && payload.functions.length > 0) {
    payload.functions.forEach((fn: any, idx: number) => {
      if (typeof fn === 'string') {
        list.push({
          id: `fn-${idx}`,
          expr: fn,
          label: `y = ${normalizeMathText(fn)}`,
          color: MATH_PALETTE[idx % MATH_PALETTE.length],
          visible: true,
        });
        return;
      }
      const xExpr = fn.x || fn.xExpr;
      const yExpr = fn.y || fn.yExpr;
      const zExpr = fn.z || fn.zExpr;
      const expr = String(fn.expr || fn.formula || fn.equation || yExpr || zExpr || '');
      const isParametric = Boolean(xExpr && yExpr);
      if (!expr && !isParametric) return;
      list.push({
        id: String(fn.id || `fn-${idx}`),
        expr,
        xExpr: xExpr ? String(xExpr) : undefined,
        yExpr: yExpr ? String(yExpr) : undefined,
        zExpr: zExpr ? String(zExpr) : undefined,
        label: String(fn.label || fn.name || (isParametric ? `r(t) #${idx + 1}` : `f${idx + 1}: ${expr}`)),
        color: String(fn.color || MATH_PALETTE[idx % MATH_PALETTE.length]),
        visible: fn.visible !== false,
        isParametric,
        tRange: Array.isArray(fn.tRange) && fn.tRange.length >= 2 ? [Number(fn.tRange[0]), Number(fn.tRange[1])] : undefined,
      });
    });
  } else if (payload?.expression || payload?.formula || payload?.zExpression || payload?.equation) {
    const expr = String(payload.zExpression || payload.expression || payload.formula || payload.equation);
    list.push({
      id: 'fn-0',
      expr,
      label: String(payload.label || expr),
      color: MATH_PALETTE[0],
      visible: true,
    });
  }

  return list;
}

export function normalizeVectors(payload: any): VectorSpec[] {
  const raw = Array.isArray(payload?.vectors) ? payload.vectors : [];
  return raw.map((v: any, idx: number) => {
    const ox = Number(v.origin?.[0] ?? v.from?.[0] ?? v.ox ?? 0) || 0;
    const oy = Number(v.origin?.[1] ?? v.from?.[1] ?? v.oy ?? 0) || 0;
    const oz = Number(v.origin?.[2] ?? v.from?.[2] ?? v.oz ?? 0) || 0;

    let vx: number;
    let vy: number;
    let vz: number;
    if (Array.isArray(v.to) && v.to.length >= 2) {
      vx = (Number(v.to[0]) || 0) - ox;
      vy = (Number(v.to[1]) || 0) - oy;
      vz = (Number(v.to[2]) || 0) - oz;
    } else if (Array.isArray(v.components) && v.components.length >= 2) {
      vx = Number(v.components[0]) || 0;
      vy = Number(v.components[1]) || 0;
      vz = Number(v.components[2]) || 0;
    } else {
      vx = Number(v.vx ?? v.x ?? v.dx ?? 0) || 0;
      vy = Number(v.vy ?? v.y ?? v.dy ?? 0) || 0;
      vz = Number(v.vz ?? v.z ?? v.dz ?? 0) || 0;
    }

    return {
      id: String(v.id || `vec-${idx}`),
      label: String(v.label || v.name || ['u', 'v', 'w'][idx] || `v${idx + 1}`),
      origin: [ox, oy, oz],
      components: [vx, vy, vz],
      color: String(v.color || MATH_PALETTE[idx % MATH_PALETTE.length]),
      visible: v.visible !== false,
    };
  });
}

export function normalizeMathPoints(payload: any): PointSpec[] {
  const raw = Array.isArray(payload?.points) ? payload.points : [];
  return raw
    .map((p: any, idx: number) => {
      if (Array.isArray(p)) {
        return {
          id: `pt-${idx}`,
          label: `P${idx + 1}`,
          coords: [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0] as [number, number, number],
          color: MATH_PALETTE[(idx + 2) % MATH_PALETTE.length],
        };
      }
      const x = Number(p.x ?? p.coords?.[0]);
      const y = Number(p.y ?? p.coords?.[1]);
      const z = Number(p.z ?? p.coords?.[2] ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        id: String(p.id || `pt-${idx}`),
        label: String(p.label || p.name || `P${idx + 1}`),
        coords: [x, y, Number.isFinite(z) ? z : 0] as [number, number, number],
        color: String(p.color || MATH_PALETTE[(idx + 2) % MATH_PALETTE.length]),
      };
    })
    .filter((p: PointSpec | null): p is PointSpec => p !== null);
}

export function inferMathParameters(
  payload: any,
  functions: MathFunctionSpec[]
): MathParamSpec[] {
  const explicit: MathParamSpec[] = Array.isArray(payload?.params)
    ? payload.params.map((p: any) => ({
        name: String(p.name || 'a').toLowerCase(),
        label: String(p.label || p.name || 'a'),
        value: Number.isFinite(Number(p.value)) ? Number(p.value) : 1,
        min: Number.isFinite(Number(p.min)) ? Number(p.min) : -5,
        max: Number.isFinite(Number(p.max)) ? Number(p.max) : 5,
        step: Number.isFinite(Number(p.step)) && Number(p.step) > 0 ? Number(p.step) : 0.1,
      }))
    : [];

  const seen = new Set(explicit.map((p) => p.name));

  for (const fn of functions) {
    const sources = [fn.expr, fn.xExpr, fn.yExpr, fn.zExpr].filter(Boolean) as string[];
    for (const s of sources) {
      for (const ident of extractExpressionIdentifiers(s)) {
        if (seen.has(ident)) continue;
        seen.add(ident);
        const defaultZero = ident === 'b' || ident === 'c' || ident === 'd' || ident === 'phi';
        explicit.push({
          name: ident,
          label: ident,
          value: defaultZero ? 0 : 1,
          min: -5,
          max: 5,
          step: 0.1,
        });
      }
    }
  }

  return explicit;
}

export interface SampledCurveSegment {
  points: Array<[number, number]>;
}

export function sampleFunction2D(
  expr: string,
  params: Record<string, number>,
  xMin: number,
  xMax: number,
  samples = 360,
  jumpThreshold = 40
): SampledCurveSegment[] {
  const evalFn = compileMathExpression(expr);
  const segments: SampledCurveSegment[] = [];
  let current: Array<[number, number]> = [];
  let prevY: number | null = null;

  for (let i = 0; i <= samples; i++) {
    const x = xMin + ((xMax - xMin) * i) / samples;
    const y = evalFn({ ...params, x, t: x });
    if (!Number.isFinite(y) || Math.abs(y) > 1e5) {
      if (current.length > 1) segments.push({ points: current });
      current = [];
      prevY = null;
      continue;
    }
    if (prevY !== null && Math.abs(y - prevY) > jumpThreshold) {
      if (current.length > 1) segments.push({ points: current });
      current = [[x, y]];
    } else {
      current.push([x, y]);
    }
    prevY = y;
  }

  if (current.length > 1) segments.push({ points: current });
  return segments;
}

export interface FunctionIntersection2D {
  x: number;
  y: number;
  fnA: string;
  fnB: string;
}

export function findFunctionIntersections2D(
  functions: MathFunctionSpec[],
  params: Record<string, number>,
  xMin: number,
  xMax: number,
  samples = 360
): FunctionIntersection2D[] {
  const visible = functions.filter((f) => f.visible && !f.isParametric && f.expr.trim().length > 0);
  if (visible.length < 2 || xMax <= xMin) return [];

  const compiled = visible.map((f) => ({
    label: f.label || f.expr,
    evalFn: compileMathExpression(f.expr),
  }));

  const intersections: FunctionIntersection2D[] = [];
  const step = (xMax - xMin) / samples;

  for (let a = 0; a < compiled.length; a++) {
    for (let b = a + 1; b < compiled.length; b++) {
      const fA = compiled[a];
      const fB = compiled[b];
      const diffAt = (xv: number) => {
        const y1 = fA.evalFn({ ...params, x: xv, t: xv });
        const y2 = fB.evalFn({ ...params, x: xv, t: xv });
        if (!Number.isFinite(y1) || !Number.isFinite(y2)) return NaN;
        return y1 - y2;
      };

      for (let i = 0; i < samples; i++) {
        const xl = xMin + i * step;
        const xr = xMin + (i + 1) * step;
        const dl = diffAt(xl);
        const dr = diffAt(xr);
        if (!Number.isFinite(dl) || !Number.isFinite(dr)) continue;

        let crossX: number | null = null;
        if (Math.abs(dl) < 1e-6) {
          crossX = xl;
        } else if (dl * dr < 0 && Math.abs(dl - dr) < 1e4) {
          let lo = xl;
          let hi = xr;
          let dLo = dl;
          for (let iter = 0; iter < 18; iter++) {
            const mid = (lo + hi) * 0.5;
            const dMid = diffAt(mid);
            if (!Number.isFinite(dMid)) break;
            if (Math.abs(dMid) < 1e-8) {
              lo = hi = mid;
              break;
            }
            if (dLo * dMid <= 0) {
              hi = mid;
            } else {
              lo = mid;
              dLo = dMid;
            }
          }
          crossX = (lo + hi) * 0.5;
        }

        if (crossX !== null) {
          const yVal = fA.evalFn({ ...params, x: crossX, t: crossX });
          if (!Number.isFinite(yVal) || Math.abs(yVal) > 1e5) continue;
          const dup = intersections.some(
            (pt) => Math.abs(pt.x - crossX!) < 1e-3 && Math.abs(pt.y - yVal) < 1e-3
          );
          if (!dup) {
            intersections.push({
              x: Math.round(crossX * 10000) / 10000,
              y: Math.round(yVal * 10000) / 10000,
              fnA: fA.label,
              fnB: fB.label,
            });
          }
          if (intersections.length >= 16) return intersections;
        }
      }
    }
  }

  return intersections;
}

export function sampleParametric2D(
  xExpr: string,
  yExpr: string,
  params: Record<string, number>,
  tMin = 0,
  tMax = Math.PI * 2,
  samples = 360
): SampledCurveSegment[] {
  const fx = compileMathExpression(xExpr);
  const fy = compileMathExpression(yExpr);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= samples; i++) {
    const t = tMin + ((tMax - tMin) * i) / samples;
    const x = fx({ ...params, t, theta: t });
    const y = fy({ ...params, t, theta: t });
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pts.push([x, y]);
    }
  }
  return pts.length > 1 ? [{ points: pts }] : [];
}

export interface SampledSurface3D {
  cols: number;
  rows: number;
  xValues: number[];
  yValues: number[];
  zGrid: number[][];
  zMin: number;
  zMax: number;
}

export function sampleSurface3D(
  expr: string,
  params: Record<string, number>,
  xRange: [number, number] = [-4, 4],
  yRange: [number, number] = [-4, 4],
  gridSize = 42
): SampledSurface3D {
  const fn = compileMathExpression(expr);
  const cols = gridSize;
  const rows = gridSize;
  const xValues: number[] = [];
  const yValues: number[] = [];
  const zGrid: number[][] = [];
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let ix = 0; ix <= cols; ix++) {
    xValues.push(xRange[0] + ((xRange[1] - xRange[0]) * ix) / cols);
  }
  for (let iy = 0; iy <= rows; iy++) {
    yValues.push(yRange[0] + ((yRange[1] - yRange[0]) * iy) / rows);
  }

  for (let iy = 0; iy <= rows; iy++) {
    const row: number[] = [];
    const y = yValues[iy];
    for (let ix = 0; ix <= cols; ix++) {
      const x = xValues[ix];
      const rawZ = fn({ ...params, x, y });
      const clamped = Number.isFinite(rawZ) ? Math.max(-50, Math.min(50, rawZ)) : NaN;
      row.push(clamped);
      if (Number.isFinite(clamped)) {
        if (clamped < zMin) zMin = clamped;
        if (clamped > zMax) zMax = clamped;
      }
    }
    zGrid.push(row);
  }

  if (!Number.isFinite(zMin)) {
    zMin = -1;
    zMax = 1;
  }

  return { cols, rows, xValues, yValues, zGrid, zMin, zMax };
}

export interface VectorAnalysisSummary {
  magnitudes: Array<{ label: string; length: number; color: string }>;
  sum?: [number, number, number];
  cross?: [number, number, number];
  dot?: number;
  angleDeg?: number;
}

export function analyzeVectors(vectors: VectorSpec[]): VectorAnalysisSummary {
  const active = vectors.filter((v) => v.visible);
  const magnitudes = active.map((v) => ({
    label: v.label,
    length: Math.hypot(v.components[0], v.components[1], v.components[2]),
    color: v.color,
  }));

  if (active.length === 0) return { magnitudes };

  const sum: [number, number, number] = active.reduce(
    (acc, v) => [acc[0] + v.components[0], acc[1] + v.components[1], acc[2] + v.components[2]],
    [0, 0, 0]
  );

  if (active.length >= 2) {
    const a = active[0].components;
    const b = active[1].components;
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const lenA = Math.hypot(a[0], a[1], a[2]);
    const lenB = Math.hypot(b[0], b[1], b[2]);
    const cosTheta = lenA > 1e-9 && lenB > 1e-9 ? Math.max(-1, Math.min(1, dot / (lenA * lenB))) : 1;
    const angleDeg = (Math.acos(cosTheta) * 180) / Math.PI;
    const cross: [number, number, number] = [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    return { magnitudes, sum, cross, dot, angleDeg };
  }

  return { magnitudes, sum };
}

export function detectQuadraticHighlights(
  expr: string,
  params: Record<string, number>
): { vertex?: [number, number]; roots: number[] } {
  // Numerical derivative probe at 0, 1, -1 to check if y = f(x) is quadratic/parabolic
  const fn = compileMathExpression(expr);
  const f0 = fn({ ...params, x: 0 });
  const f1 = fn({ ...params, x: 1 });
  const fm1 = fn({ ...params, x: -1 });
  const f2 = fn({ ...params, x: 2 });
  if (![f0, f1, fm1, f2].every(Number.isFinite)) return { roots: [] };

  const c = f0;
  const a = (f1 + fm1 - 2 * f0) / 2;
  const b = (f1 - fm1) / 2;
  const check2 = a * 4 + b * 2 + c;
  if (Math.abs(a) < 1e-6 || Math.abs(check2 - f2) > 1e-4) {
    return { roots: [] };
  }

  const vx = -b / (2 * a);
  const vy = a * vx * vx + b * vx + c;
  const disc = b * b - 4 * a * c;
  const roots: number[] = [];
  if (disc > 1e-6) {
    const s = Math.sqrt(disc);
    roots.push((-b - s) / (2 * a), (-b + s) / (2 * a));
  } else if (Math.abs(disc) <= 1e-6) {
    roots.push(vx);
  }
  return { vertex: [vx, vy], roots };
}

export type RiemannMethod = 'continuous' | 'left' | 'right' | 'midpoint' | 'trapezoid';

export interface IntegralSliceShape {
  x0: number;
  x1: number;
  y0Bottom: number;
  y0Top: number;
  y1Bottom: number;
  y1Top: number;
  riemannArea: number;
}

export interface IntegralVisualizationResult {
  a: number;
  b: number;
  definiteIntegral: number;
  absArea: number;
  riemannSum: number;
  errorEstimate: number;
  slices: IntegralSliceShape[];
  shadedPolygon: [number, number][];
  tangent?: { x: number; y: number; slope: number };
}

export function numericalDerivative(
  expr: string,
  params: Record<string, number>,
  x0: number
): number {
  const fn = compileMathExpression(expr);
  const h = 1e-4;
  const fPlus = fn({ ...params, x: x0 + h });
  const fMinus = fn({ ...params, x: x0 - h });
  if (!Number.isFinite(fPlus) || !Number.isFinite(fMinus)) return NaN;
  return (fPlus - fMinus) / (2 * h);
}

export function integrateSimpson(
  expr: string,
  params: Record<string, number>,
  a: number,
  b: number,
  subintervals = 160,
  secondExpr?: string
): { signed: number; abs: number } {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b - a) < 1e-12) {
    return { signed: 0, abs: 0 };
  }
  const sign = b >= a ? 1 : -1;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const n = Math.max(4, subintervals % 2 === 0 ? subintervals : subintervals + 1);
  const h = (hi - lo) / n;

  const f1 = compileMathExpression(expr);
  const f2 = secondExpr ? compileMathExpression(secondExpr) : null;

  const evalDiff = (x: number) => {
    const v1 = f1({ ...params, x });
    const v2 = f2 ? f2({ ...params, x }) : 0;
    const d = v1 - v2;
    return Number.isFinite(d) ? Math.max(-1e4, Math.min(1e4, d)) : 0;
  };

  let signedSum = evalDiff(lo) + evalDiff(hi);
  let absSum = Math.abs(evalDiff(lo)) + Math.abs(evalDiff(hi));

  for (let i = 1; i < n; i++) {
    const x = lo + i * h;
    const w = i % 2 === 0 ? 2 : 4;
    const val = evalDiff(x);
    signedSum += w * val;
    absSum += w * Math.abs(val);
  }

  return {
    signed: sign * (h / 3) * signedSum,
    abs: (h / 3) * absSum,
  };
}

export function computeIntegralVisualization(
  expr: string,
  params: Record<string, number>,
  rawA: number,
  rawB: number,
  sliceCount = 12,
  method: RiemannMethod = 'midpoint',
  secondExpr?: string,
  tangentX?: number
): IntegralVisualizationResult {
  const a = Number.isFinite(rawA) ? rawA : 0;
  const b = Number.isFinite(rawB) ? rawB : 2;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const dir = b >= a ? 1 : -1;

  const f1 = compileMathExpression(expr);
  const f2 = secondExpr ? compileMathExpression(secondExpr) : null;
  const eval1 = (x: number) => {
    const v = f1({ ...params, x });
    return Number.isFinite(v) ? Math.max(-500, Math.min(500, v)) : 0;
  };
  const eval2 = (x: number) => {
    if (!f2) return 0;
    const v = f2({ ...params, x });
    return Number.isFinite(v) ? Math.max(-500, Math.min(500, v)) : 0;
  };

  const { signed, abs } = integrateSimpson(expr, params, a, b, 160, secondExpr);

  // Build smooth shaded polygon between f1(x) and f2(x) (or y=0) over [lo, hi]
  const polySteps = 120;
  const topPts: [number, number][] = [];
  const bottomPts: [number, number][] = [];
  if (hi - lo > 1e-9) {
    for (let i = 0; i <= polySteps; i++) {
      const x = lo + ((hi - lo) * i) / polySteps;
      topPts.push([x, eval1(x)]);
      bottomPts.push([x, eval2(x)]);
    }
  }
  const shadedPolygon: [number, number][] = [...topPts, ...bottomPts.reverse()];

  // Compute Riemann slices when discrete method or for comparison
  const n = Math.max(1, Math.min(80, Math.round(sliceCount)));
  const dx = (hi - lo) / n;
  const slices: IntegralSliceShape[] = [];
  let riemannSum = 0;

  if (dx > 1e-9) {
    for (let i = 0; i < n; i++) {
      const x0 = lo + i * dx;
      const x1 = x0 + dx;
      if (method === 'trapezoid') {
        const y0Top = eval1(x0);
        const y0Bottom = eval2(x0);
        const y1Top = eval1(x1);
        const y1Bottom = eval2(x1);
        const area = dir * 0.5 * ((y0Top - y0Bottom) + (y1Top - y1Bottom)) * dx;
        riemannSum += area;
        slices.push({ x0, x1, y0Bottom, y0Top, y1Bottom, y1Top, riemannArea: area });
      } else {
        const sampleX =
          method === 'left'
            ? x0
            : method === 'right'
            ? x1
            : (x0 + x1) * 0.5;
        const yTop = eval1(sampleX);
        const yBottom = eval2(sampleX);
        const area = dir * (yTop - yBottom) * dx;
        riemannSum += area;
        slices.push({
          x0,
          x1,
          y0Bottom: yBottom,
          y0Top: yTop,
          y1Bottom: yBottom,
          y1Top: yTop,
          riemannArea: area,
        });
      }
    }
  }

  const effectiveRiemann = method === 'continuous' ? signed : riemannSum;
  const errorEstimate = Math.abs(signed - effectiveRiemann);

  let tangent: IntegralVisualizationResult['tangent'];
  if (tangentX !== undefined && Number.isFinite(tangentX)) {
    const y = eval1(tangentX);
    const slope = numericalDerivative(expr, params, tangentX);
    if (Number.isFinite(y) && Number.isFinite(slope)) {
      tangent = { x: tangentX, y, slope };
    }
  }

  return {
    a,
    b,
    definiteIntegral: signed,
    absArea: abs,
    riemannSum: effectiveRiemann,
    errorEstimate,
    slices,
    shadedPolygon,
    tangent,
  };
}


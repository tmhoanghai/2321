import type { ChartPayload } from './chartData';

export interface BigOComplexitySpec {
  id: string;
  label: string;
  notation: string;
  color: string;
  visible: boolean;
  evalOps: (n: number) => number;
}

export interface BigOSeriesSummary {
  id: string;
  label: string;
  notation: string;
  color: string;
  visible: boolean;
  opsAtN: number;
  log10OpsAtN: number;
  formattedOps: string;
  estimatedRuntime: string;
}

export interface BigODatasetResult {
  nMax: number;
  sampleN: number;
  rows: Array<Record<string, number>>;
  specs: BigOComplexitySpec[];
  summaries: BigOSeriesSummary[];
}

const BIG_O_PALETTE = [
  '#059669', // O(1) Emerald
  '#0891b2', // O(log n) Cyan
  '#2563eb', // O(n) Blue
  '#4f46e5', // O(n log n) Indigo
  '#d97706', // O(n^2) Amber
  '#dc2626', // O(n^3) / O(2^n) Crimson
  '#7c3aed', // Violet
  '#db2777', // Pink
];

interface BuiltinBigOTemplate {
  id: string;
  label: string;
  notation: string;
  defaultColor: string;
  evalOps: (n: number) => number;
}

const BUILTIN_TEMPLATES: Record<string, BuiltinBigOTemplate> = {
  'o(1)': {
    id: 'O(1)',
    label: 'O(1) — Hằng số',
    notation: 'O(1)',
    defaultColor: '#059669',
    evalOps: () => 1,
  },
  'o(log n)': {
    id: 'O(log n)',
    label: 'O(log n) — Logarit',
    notation: 'O(log n)',
    defaultColor: '#0891b2',
    evalOps: (n) => Math.max(1, Math.log2(Math.max(1, n))),
  },
  'o(sqrt(n))': {
    id: 'O(√n)',
    label: 'O(√n) — Căn bậc hai',
    notation: 'O(√n)',
    defaultColor: '#0d9488',
    evalOps: (n) => Math.sqrt(Math.max(0, n)),
  },
  'o(n)': {
    id: 'O(n)',
    label: 'O(n) — Tuyến tính',
    notation: 'O(n)',
    defaultColor: '#2563eb',
    evalOps: (n) => Math.max(0, n),
  },
  'o(n log n)': {
    id: 'O(n log n)',
    label: 'O(n log n) — Tuyến tính logarit',
    notation: 'O(n log n)',
    defaultColor: '#7c3aed',
    evalOps: (n) => Math.max(0, n) * Math.max(1, Math.log2(Math.max(1, n))),
  },
  'o(n^2)': {
    id: 'O(n^2)',
    label: 'O(n²) — Bình phương',
    notation: 'O(n²)',
    defaultColor: '#d97706',
    evalOps: (n) => n * n,
  },
  'o(n^3)': {
    id: 'O(n^3)',
    label: 'O(n³) — Lập phương',
    notation: 'O(n³)',
    defaultColor: '#ea580c',
    evalOps: (n) => n * n * n,
  },
  'o(2^n)': {
    id: 'O(2^n)',
    label: 'O(2ⁿ) — Hàm mũ',
    notation: 'O(2ⁿ)',
    defaultColor: '#dc2626',
    evalOps: (n) => (n > 1000 ? Infinity : Math.pow(2, n)),
  },
};

export function normalizeNotationKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/√/g, 'sqrt')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/ⁿ/g, '^n')
    .replace(/log₂|log_2|log2/g, 'log')
    .replace(/\*/g, ' ')
    .replace(/nlogn/g, 'n log n')
    .replace(/sqrt\s*\(?\s*n\s*\)?/g, 'sqrt(n)')
    .replace(/\s+/g, ' ');
}

export function buildComplexityEvaluator(notationRaw: string): (n: number) => number {
  const key = normalizeNotationKey(notationRaw);
  const direct = BUILTIN_TEMPLATES[key];
  if (direct) return direct.evalOps;

  // Match aliases like "n log n", "n^2", "2^n", "log n", "1", "V+E", "E log V"
  if (key === '1' || key === 'const' || key === 'constant' || key.includes('o(1)')) {
    return BUILTIN_TEMPLATES['o(1)'].evalOps;
  }
  if (key.includes('2^n') || key.includes('exp')) {
    return BUILTIN_TEMPLATES['o(2^n)'].evalOps;
  }
  if (key.includes('n^3') || key.includes('n3')) {
    return BUILTIN_TEMPLATES['o(n^3)'].evalOps;
  }
  if (key.includes('n^2') || key.includes('n2') || key.includes('n*n')) {
    return BUILTIN_TEMPLATES['o(n^2)'].evalOps;
  }
  if (key.includes('n log n') || key.includes('nlog')) {
    return BUILTIN_TEMPLATES['o(n log n)'].evalOps;
  }
  if (key.includes('sqrt')) {
    return BUILTIN_TEMPLATES['o(sqrt(n))'].evalOps;
  }
  if (key.includes('log n') || key.includes('log(n)')) {
    return BUILTIN_TEMPLATES['o(log n)'].evalOps;
  }
  if (/\bn\b/.test(key) || key === 'o(n)') {
    return BUILTIN_TEMPLATES['o(n)'].evalOps;
  }

  // Fallback safe numeric parser for n expressions like "0.5*n^2 + 3*n"
  const expr = key
    .replace(/^o\s*\((.*)\)$/i, '$1')
    .replace(/\blog\s*\(/gi, 'Math.log2(')
    .replace(/\bsqrt\s*\(/gi, 'Math.sqrt(')
    .replace(/(\w+|\))\s*\^\s*(\w+|\([^)]+\))/g, 'Math.pow($1,$2)');

  if (/^[0-9a-zA-Z_+\-*/().,\s]+$/.test(expr) && !/(window|document|global|eval|Function|fetch|import)/i.test(expr)) {
    try {
      const fn = new Function('n', `"use strict"; try { return Number(${expr}); } catch { return NaN; }`) as (
        n: number
      ) => number;
      const probe = fn(10);
      if (Number.isFinite(probe)) {
        return (n: number) => {
          const val = fn(Math.max(1, n));
          return Number.isFinite(val) && val >= 0 ? val : Infinity;
        };
      }
    } catch {
      // fall through
    }
  }

  return BUILTIN_TEMPLATES['o(n)'].evalOps;
}

export function formatBigOOps(ops: number): string {
  if (!Number.isFinite(ops) || ops > 1e30) return '> 10³⁰ (quá lớn)';
  if (ops < 1000) return Math.round(ops).toLocaleString('en-US');
  if (ops < 1e6) return `${(ops / 1e3).toFixed(1)}K`;
  if (ops < 1e9) return `${(ops / 1e6).toFixed(2)}M`;
  if (ops < 1e12) return `${(ops / 1e9).toFixed(2)}B`;
  return ops.toExponential(2).replace('e+', '×10^');
}

export function estimateBigORuntime(ops: number): string {
  if (!Number.isFinite(ops) || ops > 1e24) return 'Không khả thi (vũ trụ)';
  // Assume modern optimized loop ~10^8 simple operations/sec
  const sec = ops / 1e8;
  if (sec < 1e-6) return '< 1 µs';
  if (sec < 1e-3) return `${(sec * 1e6).toFixed(1)} µs`;
  if (sec < 1) return `${(sec * 1000).toFixed(2)} ms`;
  if (sec < 60) return `${sec.toFixed(2)} giây`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)} phút`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} giờ`;
  if (sec < 31536000) return `${(sec / 86400).toFixed(1)} ngày`;
  const years = sec / 31536000;
  return years > 1e6 ? `${years.toExponential(1)} năm` : `${years.toFixed(1)} năm`;
}

export function parseBigOSpecsFromPayload(payload?: ChartPayload | null): {
  specs: BigOComplexitySpec[];
  nMax: number;
} {
  const defaultNotations = ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)'];
  const rawList: any[] = Array.isArray((payload as any)?.complexities)
    ? (payload as any).complexities
    : Array.isArray(payload?.series)
    ? payload!.series!
    : Array.isArray(payload?.functions)
    ? payload!.functions!
    : defaultNotations;

  const specs: BigOComplexitySpec[] = rawList
    .map((item, idx): BigOComplexitySpec | null => {
      if (typeof item === 'string') {
        const key = normalizeNotationKey(item);
        const tpl = BUILTIN_TEMPLATES[key];
        const notation = tpl ? tpl.notation : item.trim();
        return {
          id: notation,
          label: tpl ? tpl.label : notation,
          notation,
          color: tpl ? tpl.defaultColor : BIG_O_PALETTE[idx % BIG_O_PALETTE.length],
          visible: true,
          evalOps: buildComplexityEvaluator(notation),
        };
      }
      if (item && typeof item === 'object') {
        const notation = String(item.notation || item.expr || item.label || item.name || item.id || '').trim();
        if (!notation) return null;
        const key = normalizeNotationKey(notation);
        const tpl = BUILTIN_TEMPLATES[key];
        return {
          id: String(item.id || notation),
          label: String(item.label || item.name || (tpl ? tpl.label : notation)),
          notation: tpl ? tpl.notation : notation,
          color: String(item.color || (tpl ? tpl.defaultColor : BIG_O_PALETTE[idx % BIG_O_PALETTE.length])),
          visible: item.visible !== false,
          evalOps: buildComplexityEvaluator(notation),
        };
      }
      return null;
    })
    .filter((s): s is BigOComplexitySpec => Boolean(s));

  const finalSpecs =
    specs.length > 0
      ? specs
      : defaultNotations.map((n, idx) => {
          const tpl = BUILTIN_TEMPLATES[normalizeNotationKey(n)];
          return {
            id: tpl.id,
            label: tpl.label,
            notation: tpl.notation,
            color: tpl.defaultColor || BIG_O_PALETTE[idx % BIG_O_PALETTE.length],
            visible: true,
            evalOps: tpl.evalOps,
          };
        });

  const rawMax = Number((payload as any)?.nMax ?? (payload?.domain?.[1] ?? 100));
  const nMax = Number.isFinite(rawMax) && rawMax >= 10 ? Math.min(100000, Math.round(rawMax)) : 100;
  return { specs: finalSpecs, nMax };
}

export function buildBigODataset(
  specs: BigOComplexitySpec[],
  nMax: number,
  sampleN: number,
  useLogY = false,
  pointCount = 36
): BigODatasetResult {
  const safeMax = Math.max(8, Math.min(100000, Math.round(nMax)));
  const safeN = Math.max(1, Math.min(safeMax, Math.round(sampleN)));
  const rows: Array<Record<string, number>> = [];

  for (let i = 0; i <= pointCount; i++) {
    const nVal = Math.max(1, Math.round(1 + ((safeMax - 1) * i) / pointCount));
    const row: Record<string, number> = { n: nVal };
    for (const sp of specs) {
      const ops = sp.evalOps(nVal);
      if (useLogY) {
        row[sp.id] = Number.isFinite(ops) ? Math.log10(Math.max(1, ops)) : 18;
      } else {
        // Clamp extreme exponential explosion in linear mode so smaller curves stay readable up to cap
        const cap = safeMax * safeMax * 2.5;
        row[sp.id] = Number.isFinite(ops) ? Math.min(cap, ops) : cap;
      }
    }
    rows.push(row);
  }

  const summaries: BigOSeriesSummary[] = specs.map((sp) => {
    const opsAtN = sp.evalOps(safeN);
    const log10OpsAtN = Number.isFinite(opsAtN) ? Math.log10(Math.max(1, opsAtN)) : Infinity;
    return {
      id: sp.id,
      label: sp.label,
      notation: sp.notation,
      color: sp.color,
      visible: sp.visible,
      opsAtN,
      log10OpsAtN,
      formattedOps: formatBigOOps(opsAtN),
      estimatedRuntime: estimateBigORuntime(opsAtN),
    };
  });

  return {
    nMax: safeMax,
    sampleN: safeN,
    rows,
    specs,
    summaries,
  };
}

import * as d3 from 'd3';

export type UniversalChartType =
  | 'bar'
  | 'grouped_bar'
  | 'stacked_bar'
  | 'horizontal_bar'
  | 'line'
  | 'pie'
  | 'donut'
  | 'area'
  | 'stacked_area'
  | 'combo'
  | 'pictogram'
  | 'histogram'
  | 'boxplot'
  | 'violin'
  | 'scatter'
  | 'bubble'
  | 'heatmap'
  | 'radar'
  | 'waterfall'
  | 'funnel'
  | 'treemap'
  | 'sunburst'
  | 'candlestick'
  | 'ohlc'
  | 'gantt'
  | 'sankey'
  | 'network'
  | 'choropleth'
  | 'ddos_map'
  | 'coordinate_2d'
  | 'vector_2d'
  | 'integral'
  | 'surface_3d'
  | 'vector_3d'
  | 'parametric_3d'
  | 'scatter_3d'
  | 'time_graph'
  | 'algorithm_trace'
  | 'big_o'
  | 'flowchart';

export interface ChartPayload {
  type: string;
  title?: string;
  subtitle?: string;
  xAxis?: string;
  yAxis?: string;
  zAxis?: string;
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  series?: string[];
  barSeries?: string[];
  lineSeries?: string[];
  stacked?: boolean;
  unit?: string;
  unitValue?: number;
  icon?: string;
  region?: 'world' | 'vietnam' | 'auto';
  directed?: boolean;
  data?: any[];
  values?: number[];
  bins?: number;
  matrix?: number[][];
  xLabels?: string[];
  yLabels?: string[];
  nodes?: any[];
  links?: any[];
  edges?: any[];
  attacks?: any[];
  arcs?: any[];
  tree?: any;
  functions?: any[];
  expression?: string;
  zExpression?: string;
  formula?: string;
  equation?: string;
  vectors?: any[];
  points?: any[];
  params?: Array<{ name: string; label?: string; value: number; min?: number; max?: number; step?: number }>;
  domain?: [number, number];
  bounds?: [number, number];
  integralBounds?: [number, number];
  slices?: number;
  riemannMethod?: 'continuous' | 'left' | 'right' | 'midpoint' | 'trapezoid';
  derivativeX?: number;
  xRange?: [number, number];
  yRange?: [number, number];
  zRange?: [number, number];
  defaultView?: '2d' | '3d';
  showVectorSum?: boolean;
  showCrossProduct?: boolean;
  showGrid?: boolean;
  wireframe?: boolean;
  labels?: string[];
  datasets?: Array<{ label?: string; name?: string; data?: number[]; values?: number[] }>;
  categories?: string[];
  indicators?: Array<string | { name?: string; text?: string; max?: number }>;
  // Algorithm trace & Kinematics time graph fields
  algorithm?: string;
  algo?: string;
  array?: number[];
  target?: number | string;
  start?: string | number;
  phases?: any[];
  objects?: any[];
  timeUnit?: string;
  speedUnit?: string;
  distanceUnit?: string;
  verifyKinematics?: boolean;
  // Big O & Flowchart fields
  complexities?: any[];
  nMax?: number;
  yScale?: 'linear' | 'log';
  steps?: any[];
  flowchart?: { nodes?: any[]; edges?: any[]; links?: any[]; steps?: any[] };
}

export const MATH_COORD_TYPES = new Set<UniversalChartType>([
  'coordinate_2d',
  'vector_2d',
  'integral',
  'surface_3d',
  'vector_3d',
  'parametric_3d',
]);

export const NATIVE_3D_TYPES = new Set<UniversalChartType>([
  'surface_3d',
  'vector_3d',
  'parametric_3d',
  'scatter_3d',
]);

export const SUPPORTS_3D_VIEW_TYPES = new Set<UniversalChartType>([
  'bar',
  'grouped_bar',
  'stacked_bar',
  'horizontal_bar',
  'histogram',
  'waterfall',
  'line',
  'area',
  'stacked_area',
  'combo',
  'pie',
  'donut',
  'scatter',
  'bubble',
  'heatmap',
  'candlestick',
  'ohlc',
  'network',
  'coordinate_2d',
  'vector_2d',
  'integral',
  'surface_3d',
  'vector_3d',
  'parametric_3d',
  'scatter_3d',
]);

const TYPE_ALIAS_MAP: Record<string, UniversalChartType> = {
  bar: 'bar',
  column: 'bar',
  grouped_bar: 'grouped_bar',
  grouped_column: 'grouped_bar',
  stacked_bar: 'stacked_bar',
  stacked_column: 'stacked_bar',
  horizontal_bar: 'horizontal_bar',
  hbar: 'horizontal_bar',
  bar_horizontal: 'horizontal_bar',
  stacked_horizontal_bar: 'horizontal_bar',
  line: 'line',
  pie: 'pie',
  donut: 'donut',
  doughnut: 'donut',
  area: 'area',
  stacked_area: 'stacked_area',
  combo: 'combo',
  composed: 'combo',
  bar_line: 'combo',
  column_line: 'combo',
  pictogram: 'pictogram',
  pictograph: 'pictogram',
  histogram: 'histogram',
  distribution: 'histogram',
  boxplot: 'boxplot',
  box_plot: 'boxplot',
  box: 'boxplot',
  violin: 'violin',
  scatter: 'scatter',
  bubble: 'bubble',
  heatmap: 'heatmap',
  heat_map: 'heatmap',
  radar: 'radar',
  spider: 'radar',
  radar_chart: 'radar',
  spider_chart: 'radar',
  spiderweb: 'radar',
  web_chart: 'radar',
  polar_radar: 'radar',
  mang_nhen: 'radar',
  bieu_do_mang_nhen: 'radar',
  waterfall: 'waterfall',
  bridge: 'waterfall',
  funnel: 'funnel',
  treemap: 'treemap',
  tree_map: 'treemap',
  sunburst: 'sunburst',
  candlestick: 'candlestick',
  candle: 'candlestick',
  so_do_nen: 'candlestick',
  bieu_do_nen: 'candlestick',
  nen: 'candlestick',
  nen_nhat: 'candlestick',
  ve_nen: 'candlestick',
  ohlc: 'ohlc',
  so_do_ohlc: 'ohlc',
  gantt: 'gantt',
  timeline: 'gantt',
  sankey: 'sankey',
  network: 'network',
  graph: 'network',
  force: 'network',
  geo: 'choropleth',
  choropleth: 'choropleth',
  map: 'choropleth',
  ddos: 'ddos_map',
  ddos_map: 'ddos_map',
  attack_map: 'ddos_map',
  cyber_map: 'ddos_map',
  threat_map: 'ddos_map',
  geo_arc: 'ddos_map',
  coordinate_2d: 'coordinate_2d',
  coordinate: 'coordinate_2d',
  oxy: 'coordinate_2d',
  axes_2d: 'coordinate_2d',
  math_2d: 'coordinate_2d',
  function_2d: 'coordinate_2d',
  parabola: 'coordinate_2d',
  parabol: 'coordinate_2d',
  quadratic: 'coordinate_2d',
  linear: 'coordinate_2d',
  polynomial: 'coordinate_2d',
  trig: 'coordinate_2d',
  trigonometry: 'coordinate_2d',
  parametric_2d: 'coordinate_2d',
  conic: 'coordinate_2d',
  ellipse: 'coordinate_2d',
  hyperbola: 'coordinate_2d',
  vector_2d: 'vector_2d',
  vectors_2d: 'vector_2d',
  vector: 'vector_2d',
  vectors: 'vector_2d',
  oxy_vector: 'vector_2d',
  vector_field_2d: 'vector_2d',
  integral: 'integral',
  integrals: 'integral',
  tich_phan: 'integral',
  bieu_do_tich_phan: 'integral',
  riemann: 'integral',
  riemann_sum: 'integral',
  calculus: 'integral',
  area_under_curve: 'integral',
  definite_integral: 'integral',
  antiderivative: 'integral',
  nguyen_ham: 'integral',
  giai_tich: 'integral',
  surface_3d: 'surface_3d',
  '3d_surface': 'surface_3d',
  paraboloid: 'surface_3d',
  saddle: 'surface_3d',
  math_3d: 'surface_3d',
  function_3d: 'surface_3d',
  mesh_3d: 'surface_3d',
  surface: 'surface_3d',
  vector_3d: 'vector_3d',
  vectors_3d: 'vector_3d',
  oxyz: 'vector_3d',
  coordinate_3d: 'vector_3d',
  '3d_vector': 'vector_3d',
  '3d_axes': 'vector_3d',
  axes_3d: 'vector_3d',
  vector_field_3d: 'vector_3d',
  parametric_3d: 'parametric_3d',
  helix: 'parametric_3d',
  curve_3d: 'parametric_3d',
  '3d_curve': 'parametric_3d',
  scatter_3d: 'scatter_3d',
  '3d_scatter': 'scatter_3d',
  bar_3d: 'scatter_3d',
  '3d_bar': 'scatter_3d',
  '3d_chart': 'scatter_3d',
  chart_3d: 'scatter_3d',
  time_graph: 'time_graph',
  time_series: 'time_graph',
  timeseries: 'time_graph',
  kinematics: 'time_graph',
  motion: 'time_graph',
  speed_distance: 'time_graph',
  time_speed_distance: 'time_graph',
  do_thi_thoi_gian: 'time_graph',
  van_toc_quang_duong: 'time_graph',
  van_toc: 'time_graph',
  quang_duong: 'time_graph',
  v_t: 'time_graph',
  s_t: 'time_graph',
  algorithm_trace: 'algorithm_trace',
  algorithm: 'algorithm_trace',
  algo: 'algorithm_trace',
  cp_trace: 'algorithm_trace',
  graph_trace: 'algorithm_trace',
  bfs: 'algorithm_trace',
  dfs: 'algorithm_trace',
  bfs_vs_dfs: 'algorithm_trace',
  binary_search: 'algorithm_trace',
  dijkstra: 'algorithm_trace',
  two_pointers: 'algorithm_trace',
  thuat_toan: 'algorithm_trace',
  tim_kiem_nhi_phan: 'algorithm_trace',
  big_o: 'big_o',
  bigo: 'big_o',
  complexity: 'big_o',
  time_complexity: 'big_o',
  asymptotic: 'big_o',
  do_phuc_tap: 'big_o',
  so_sanh_big_o: 'big_o',
  flowchart: 'flowchart',
  flow_chart: 'flowchart',
  data_flow: 'flowchart',
  so_do_luong: 'flowchart',
  luu_do: 'flowchart',
  luong_du_lieu: 'flowchart',
  quy_trinh_thuat_toan: 'flowchart',
};

export function normalizeChartType(rawType?: string, payload?: ChartPayload): UniversalChartType {
  const key = String(rawType || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (key && TYPE_ALIAS_MAP[key]) {
    if (key === 'stacked_horizontal_bar' && payload) {
      payload.stacked = true;
    }
    return TYPE_ALIAS_MAP[key];
  }
  if (payload?.zExpression) return 'surface_3d';
  if (Array.isArray(payload?.vectors) && payload.vectors.length > 0) {
    const hasZ = payload.vectors.some(
      (v: any) => v?.z !== undefined || v?.vz !== undefined || (Array.isArray(v?.to) && v.to.length >= 3) || (Array.isArray(v?.components) && v.components.length >= 3)
    );
    return hasZ ? 'vector_3d' : 'vector_2d';
  }
  if (
    (Array.isArray(payload?.bounds) && payload.bounds.length >= 2) ||
    (Array.isArray(payload?.integralBounds) && payload.integralBounds.length >= 2)
  ) {
    return 'integral';
  }
  if (payload?.functions || payload?.expression || payload?.formula || payload?.equation) {
    return 'coordinate_2d';
  }
  if (Array.isArray((payload as any)?.complexities) || typeof (payload as any)?.nMax === 'number') {
    return 'big_o';
  }
  if ((payload as any)?.flowchart || Array.isArray((payload as any)?.steps)) {
    return 'flowchart';
  }
  if (payload?.algorithm || payload?.algo || Array.isArray(payload?.array)) return 'algorithm_trace';
  if (Array.isArray(payload?.objects) || Array.isArray(payload?.phases)) return 'time_graph';
  if (payload?.nodes && (payload?.links || payload?.edges)) {
    const hasDecisionOrStart = Array.isArray(payload.nodes) && payload.nodes.some(
      (n: any) => n && ['start', 'end', 'decision', 'condition', 'process', 'io'].includes(String(n.kind || n.shape || '').toLowerCase())
    );
    if (hasDecisionOrStart) return 'flowchart';
    const firstLink = (payload.links || payload.edges || [])[0];
    return firstLink && typeof firstLink.value === 'number' && !payload.directed ? 'sankey' : 'network';
  }
  if (payload?.attacks || payload?.arcs) return 'ddos_map';
  if (payload?.matrix) return 'heatmap';
  return 'bar';
}

function closeUnbalancedJsonBrackets(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }
  let out = text;
  if (inString) out += '"';
  out = out.replace(/,\s*$/, '');
  while (stack.length > 0) {
    out += stack.pop();
  }
  return out;
}

export function parseChartJsonSafe(raw: string): ChartPayload | null {
  let trimmed = (raw || '').trim();
  if (!trimmed) return null;

  // Strip nested markdown code fence wrapper if present
  const fenceMatch = trimmed.match(/^```(?:json|recharts|chart|mathplot)?\s*\n([\s\S]*?)\n?```$/i);
  if (fenceMatch && fenceMatch[1]) {
    trimmed = fenceMatch[1].trim();
  }

  const tryParse = (candidate: string): ChartPayload | null => {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') return null;
      const obj = parsed as ChartPayload;
      obj.type = normalizeChartType(obj.type, obj);
      return obj;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  // Extract outermost JSON object if extra prose surrounds it
  let candidate = trimmed;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  } else if (firstBrace !== -1) {
    candidate = candidate.slice(firstBrace);
  }

  // Repair comments, smart quotes, trailing commas, Python booleans, unquoted keys, and missing closing brackets
  let repaired = candidate
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/,\s*([\]}])/g, '$1')
    .trim();

  const firstRepair = tryParse(repaired);
  if (firstRepair) return firstRepair;

  // Try quoting unquoted keys & single-quoted strings
  const singleFixed = repaired
    .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner) => `"${inner.replace(/"/g, '\\"')}"`)
    .replace(/,\s*([\]}])/g, '$1');

  const secondRepair = tryParse(singleFixed);
  if (secondRepair) return secondRepair;

  // Try closing truncated brackets cleanly
  const balanced = closeUnbalancedJsonBrackets(singleFixed).replace(/,\s*([\]}])/g, '$1');
  return tryParse(balanced);
}

export function formatChartNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  if (abs < 0.01 && abs > 0) return n.toPrecision(3);
  return Number(n.toFixed(3)).toLocaleString('en-US');
}

// ---------- HISTOGRAM ----------
export interface HistogramBin {
  name: string;
  count: number;
  x0: number;
  x1: number;
}

export function buildHistogramData(payload: ChartPayload): HistogramBin[] {
  if (Array.isArray(payload.values) && payload.values.length > 0) {
    const nums = payload.values.map(Number).filter(Number.isFinite);
    if (nums.length === 0) return [];
    const extent = d3.extent(nums) as [number, number];
    const thresholdCount = payload.bins || Math.max(4, Math.min(20, Math.ceil(Math.log2(nums.length) + 1)));
    const binGen = d3.bin().domain(extent).thresholds(thresholdCount);
    return binGen(nums).map((b) => {
      const x0 = b.x0 ?? 0;
      const x1 = b.x1 ?? x0;
      return {
        name: `${formatChartNumber(x0)}–${formatChartNumber(x1)}`,
        count: b.length,
        x0,
        x1,
      };
    });
  }

  const xKey = payload.xAxis || 'name';
  const yKey = payload.yAxis || (Array.isArray(payload.series) && payload.series[0]) || 'count';
  return (payload.data || []).map((d, idx) => ({
    name: String(d[xKey] ?? d.bin ?? d.range ?? d.name ?? `Bin ${idx + 1}`),
    count: Number(d[yKey] ?? d.count ?? d.frequency ?? d.value ?? d.p ?? 0) || 0,
    x0: idx,
    x1: idx + 1,
  }));
}

// ---------- BOX PLOT & VIOLIN ----------
export interface BoxPlotStat {
  name: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  outliers: number[];
  values: number[];
}

export function computeBoxStats(rawData: any[]): BoxPlotStat[] {
  return (rawData || [])
    .map((item, idx) => {
      const name = String(item.name ?? item.label ?? item.group ?? item.category ?? `Nhóm ${idx + 1}`);
      if (Array.isArray(item.values) && item.values.length > 0) {
        const sorted = item.values.map(Number).filter(Number.isFinite).sort((a: number, b: number) => a - b);
        if (sorted.length === 0) return null;
        const q1 = d3.quantileSorted(sorted, 0.25) ?? sorted[0];
        const median = d3.quantileSorted(sorted, 0.5) ?? sorted[0];
        const q3 = d3.quantileSorted(sorted, 0.75) ?? sorted[sorted.length - 1];
        const iqr = q3 - q1;
        const lowFence = q1 - 1.5 * iqr;
        const highFence = q3 + 1.5 * iqr;
        const inliers = sorted.filter((v: number) => v >= lowFence && v <= highFence);
        const outliers = sorted.filter((v: number) => v < lowFence || v > highFence);
        const min = inliers.length > 0 ? inliers[0] : sorted[0];
        const max = inliers.length > 0 ? inliers[inliers.length - 1] : sorted[sorted.length - 1];
        const mean = d3.mean(sorted) ?? median;
        return { name, min, q1, median, q3, max, mean, outliers, values: sorted };
      }

      const min = Number(item.min ?? item.low ?? 0);
      const q1 = Number(item.q1 ?? item.p25 ?? min);
      const median = Number(item.median ?? item.q2 ?? item.p50 ?? q1);
      const q3 = Number(item.q3 ?? item.p75 ?? median);
      const max = Number(item.max ?? item.high ?? q3);
      const mean = Number(item.mean ?? median);
      const outliers = Array.isArray(item.outliers) ? item.outliers.map(Number).filter(Number.isFinite) : [];
      return {
        name,
        min,
        q1,
        median,
        q3,
        max,
        mean,
        outliers,
        values: [min, q1, median, q3, max],
      };
    })
    .filter((v): v is BoxPlotStat => v !== null);
}

export interface ViolinGroup {
  name: string;
  stat: BoxPlotStat;
  density: Array<{ y: number; d: number }>;
  maxDensity: number;
}

export function computeViolinData(rawData: any[], steps = 28): ViolinGroup[] {
  const stats = computeBoxStats(rawData);
  return stats.map((stat, idx) => {
    const rawItem = rawData[idx] || {};
    if (Array.isArray(rawItem.density) && rawItem.density.length > 1) {
      const pts = rawItem.density.map((pt: any) =>
        Array.isArray(pt) ? { y: Number(pt[0]), d: Number(pt[1]) } : { y: Number(pt.y), d: Number(pt.d) }
      );
      const maxD = d3.max(pts, (p: { y: number; d: number }) => p.d) || 1;
      return { name: stat.name, stat, density: pts, maxDensity: maxD };
    }

    const samples =
      stat.values.length >= 6
        ? stat.values
        : [
            stat.min,
            (stat.min + stat.q1) / 2,
            stat.q1,
            (stat.q1 + stat.median) / 2,
            stat.median,
            stat.median,
            (stat.median + stat.q3) / 2,
            stat.q3,
            (stat.q3 + stat.max) / 2,
            stat.max,
          ];
    const span = Math.max(1e-6, stat.max - stat.min);
    const std = d3.deviation(samples) || span / 4;
    const bandwidth = Math.max(span * 0.08, 1.06 * std * Math.pow(samples.length, -0.2));
    const yMin = stat.min - span * 0.08;
    const yMax = stat.max + span * 0.08;
    const density: Array<{ y: number; d: number }> = [];

    for (let i = 0; i <= steps; i++) {
      const y = yMin + ((yMax - yMin) * i) / steps;
      let sum = 0;
      for (const s of samples) {
        const u = (y - s) / bandwidth;
        sum += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
      }
      density.push({ y, d: sum / (samples.length * bandwidth) });
    }
    const maxDensity = d3.max(density, (p) => p.d) || 1;
    return { name: stat.name, stat, density, maxDensity };
  });
}

// ---------- WATERFALL ----------
export interface WaterfallStep {
  name: string;
  delta: number;
  start: number;
  end: number;
  base: number;
  barHeight: number;
  isTotal: boolean;
  kind: 'positive' | 'negative' | 'total';
}

export function buildWaterfallData(rawData: any[], xKey = 'name', yKey = 'value'): WaterfallStep[] {
  let running = 0;
  return (rawData || []).map((item, idx) => {
    const name = String(item[xKey] ?? item.label ?? item.step ?? `Bước ${idx + 1}`);
    const val = Number(item[yKey] ?? item.delta ?? item.value ?? 0) || 0;
    const rawKind = String(item.type ?? '').toLowerCase();
    const isTotal = Boolean(item.isTotal || item.total || rawKind === 'total' || rawKind === 'subtotal');

    if (isTotal) {
      const totalVal = item.value !== undefined ? Number(item.value) : running;
      running = totalVal;
      return {
        name,
        delta: totalVal,
        start: 0,
        end: totalVal,
        base: Math.min(0, totalVal),
        barHeight: Math.abs(totalVal),
        isTotal: true,
        kind: 'total',
      };
    }

    const start = running;
    const signedDelta = rawKind === 'decrease' ? -Math.abs(val) : val;
    const end = start + signedDelta;
    running = end;
    return {
      name,
      delta: signedDelta,
      start,
      end,
      base: Math.min(start, end),
      barHeight: Math.abs(signedDelta),
      isTotal: false,
      kind: signedDelta >= 0 ? 'positive' : 'negative',
    };
  });
}

// ---------- TREE / SUNBURST ----------
export interface HierarchyNodeInput {
  name: string;
  value?: number;
  children?: HierarchyNodeInput[];
}

export function normalizeHierarchyData(payload: ChartPayload): HierarchyNodeInput {
  if (payload.tree && typeof payload.tree === 'object') {
    return payload.tree;
  }
  const items = Array.isArray(payload.data) ? payload.data : [];
  if (items.length === 1 && Array.isArray(items[0]?.children)) {
    return items[0];
  }
  if (items.some((i) => Array.isArray(i?.children))) {
    return {
      name: payload.title || 'Tổng thể',
      children: items,
    };
  }

  // Check flat items with category/group/parent field
  const hasGroup = items.some((i) => i.group || i.category || i.parent);
  if (hasGroup) {
    const groups = new Map<string, HierarchyNodeInput[]>();
    for (const item of items) {
      const g = String(item.group ?? item.category ?? item.parent ?? 'Khác');
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push({
        name: String(item.name ?? item.label ?? 'Mục'),
        value: Math.max(0, Number(item.value ?? item.size ?? item.count ?? 1) || 0),
      });
    }
    return {
      name: payload.title || 'Tổng thể',
      children: Array.from(groups.entries()).map(([gName, children]) => ({
        name: gName,
        children,
      })),
    };
  }

  return {
    name: payload.title || 'Tổng thể',
    children: items.map((item, idx) => ({
      name: String(item.name ?? item.label ?? `Mục ${idx + 1}`),
      value: Math.max(0, Number(item.value ?? item.size ?? item.count ?? 1) || 0),
    })),
  };
}

// ---------- SANKEY ----------
export interface SankeyComputedNode {
  index: number;
  id: string;
  name: string;
  column: number;
  value: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface SankeyComputedLink {
  index: number;
  sourceIdx: number;
  targetIdx: number;
  sourceName: string;
  targetName: string;
  value: number;
  width: number;
  sy0: number;
  sy1: number;
  ty0: number;
  ty1: number;
  path: string;
}

export function computeSankeyLayout(
  payload: ChartPayload,
  width: number,
  height: number
): { nodes: SankeyComputedNode[]; links: SankeyComputedLink[] } {
  const rawLinks = Array.isArray(payload.links)
    ? payload.links
    : Array.isArray(payload.edges)
    ? payload.edges
    : Array.isArray(payload.data)
    ? payload.data.filter((d) => d.source !== undefined && d.target !== undefined)
    : [];

  const nodeMap = new Map<string, { id: string; name: string }>();
  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  rawNodes.forEach((n, idx) => {
    const id = String(n.id ?? n.name ?? idx);
    nodeMap.set(id, { id, name: String(n.name ?? n.label ?? id) });
    if (n.name && String(n.name) !== id) {
      nodeMap.set(String(n.name), { id, name: String(n.name) });
    }
  });

  const canonicalNodes: Array<{ id: string; name: string }> = [];
  const idToIndex = new Map<string, number>();

  const ensureNode = (ref: any): number => {
    if (typeof ref === 'number' && rawNodes[ref]) {
      const id = String(rawNodes[ref].id ?? rawNodes[ref].name ?? ref);
      if (!idToIndex.has(id)) {
        idToIndex.set(id, canonicalNodes.length);
        canonicalNodes.push({ id, name: String(rawNodes[ref].name ?? rawNodes[ref].label ?? id) });
      }
      return idToIndex.get(id)!;
    }
    const key = String(ref);
    const meta = nodeMap.get(key);
    const canonicalId = meta ? meta.id : key;
    if (!idToIndex.has(canonicalId)) {
      idToIndex.set(canonicalId, canonicalNodes.length);
      canonicalNodes.push({ id: canonicalId, name: meta ? meta.name : key });
    }
    return idToIndex.get(canonicalId)!;
  };

  rawNodes.forEach((n, idx) => ensureNode(n.id ?? n.name ?? idx));

  const parsedLinks = rawLinks
    .map((l) => {
      const s = ensureNode(l.source);
      const t = ensureNode(l.target);
      const val = Math.max(0.1, Number(l.value ?? l.weight ?? 1) || 1);
      return { sourceIdx: s, targetIdx: t, value: val };
    })
    .filter((l) => l.sourceIdx !== l.targetIdx);

  if (canonicalNodes.length === 0 || parsedLinks.length === 0) {
    return { nodes: [], links: [] };
  }

  // Compute topological column depths
  const cols = new Array(canonicalNodes.length).fill(0);
  for (let pass = 0; pass < canonicalNodes.length; pass++) {
    let changed = false;
    for (const l of parsedLinks) {
      if (cols[l.targetIdx] <= cols[l.sourceIdx]) {
        cols[l.targetIdx] = cols[l.sourceIdx] + 1;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxCol = Math.max(1, ...cols);
  const inFlow = new Array(canonicalNodes.length).fill(0);
  const outFlow = new Array(canonicalNodes.length).fill(0);
  for (const l of parsedLinks) {
    outFlow[l.sourceIdx] += l.value;
    inFlow[l.targetIdx] += l.value;
  }
  const nodeValues = canonicalNodes.map((_, i) => Math.max(inFlow[i], outFlow[i], 1));

  const padX = 16;
  const padY = 16;
  const nodeWidth = 14;
  const innerW = Math.max(120, width - padX * 2 - nodeWidth);
  const innerH = Math.max(120, height - padY * 2);

  // Group nodes by column and find global vertical scale
  const colBuckets: number[][] = Array.from({ length: maxCol + 1 }, () => []);
  cols.forEach((c, idx) => colBuckets[c].push(idx));

  const nodeGap = 12;
  const ky = d3.min(colBuckets.filter((b) => b.length > 0), (bucket) => {
    const sumVal = d3.sum(bucket, (idx) => nodeValues[idx]);
    const availH = Math.max(40, innerH - (bucket.length - 1) * nodeGap);
    return availH / Math.max(1, sumVal);
  }) || 1;

  const computedNodes: SankeyComputedNode[] = new Array(canonicalNodes.length);
  colBuckets.forEach((bucket, colIdx) => {
    const totalHeight =
      d3.sum(bucket, (idx) => nodeValues[idx] * ky) + Math.max(0, bucket.length - 1) * nodeGap;
    let cursorY = padY + Math.max(0, (innerH - totalHeight) / 2);
    const x0 = padX + (colIdx / maxCol) * innerW;

    for (const nodeIdx of bucket) {
      const h = Math.max(6, nodeValues[nodeIdx] * ky);
      computedNodes[nodeIdx] = {
        index: nodeIdx,
        id: canonicalNodes[nodeIdx].id,
        name: canonicalNodes[nodeIdx].name,
        column: colIdx,
        value: nodeValues[nodeIdx],
        x0,
        x1: x0 + nodeWidth,
        y0: cursorY,
        y1: cursorY + h,
      };
      cursorY += h + nodeGap;
    }
  });

  const srcOffset = new Array(canonicalNodes.length).fill(0);
  const tgtOffset = new Array(canonicalNodes.length).fill(0);

  const sortedLinks = [...parsedLinks].sort((a, b) => {
    if (a.sourceIdx !== b.sourceIdx) return computedNodes[a.sourceIdx].y0 - computedNodes[b.sourceIdx].y0;
    return computedNodes[a.targetIdx].y0 - computedNodes[b.targetIdx].y0;
  });

  const computedLinks: SankeyComputedLink[] = sortedLinks.map((l, idx) => {
    const sNode = computedNodes[l.sourceIdx];
    const tNode = computedNodes[l.targetIdx];
    const lw = Math.max(2, l.value * ky);
    const sy0 = sNode.y0 + srcOffset[l.sourceIdx];
    const sy1 = sy0 + lw;
    srcOffset[l.sourceIdx] += lw;

    const ty0 = tNode.y0 + tgtOffset[l.targetIdx];
    const ty1 = ty0 + lw;
    tgtOffset[l.targetIdx] += lw;

    const syMid = (sy0 + sy1) / 2;
    const tyMid = (ty0 + ty1) / 2;
    const xStart = sNode.x1;
    const xEnd = tNode.x0;
    const xi = d3.interpolateNumber(xStart, xEnd);
    const path = `M${xStart},${syMid} C${xi(0.5)},${syMid} ${xi(0.5)},${tyMid} ${xEnd},${tyMid}`;

    return {
      index: idx,
      sourceIdx: l.sourceIdx,
      targetIdx: l.targetIdx,
      sourceName: sNode.name,
      targetName: tNode.name,
      value: l.value,
      width: lw,
      sy0,
      sy1,
      ty0,
      ty1,
      path,
    };
  });

  return { nodes: computedNodes, links: computedLinks };
}

// ---------- NETWORK GRAPH ----------
export interface NetworkNode {
  id: string;
  label: string;
  group: string;
  size: number;
  x: number;
  y: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  label?: string;
}

export function computeNetworkLayout(
  payload: ChartPayload,
  width: number,
  height: number
): { nodes: NetworkNode[]; edges: NetworkEdge[] } {
  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const rawEdges = Array.isArray(payload.links)
    ? payload.links
    : Array.isArray(payload.edges)
    ? payload.edges
    : Array.isArray(payload.data)
    ? payload.data
    : [];

  const nodeById = new Map<string, any>();
  rawNodes.forEach((n, idx) => {
    const id = String(n.id ?? n.name ?? idx);
    nodeById.set(id, {
      id,
      label: String(n.label ?? n.name ?? id),
      group: String(n.group ?? n.category ?? 'default'),
      size: Math.max(6, Math.min(20, Number(n.size ?? n.value ?? 10) || 10)),
    });
  });

  const validEdges: NetworkEdge[] = [];
  for (const e of rawEdges) {
    if (e.source === undefined || e.target === undefined) continue;
    const src = String(typeof e.source === 'number' && rawNodes[e.source] ? rawNodes[e.source].id ?? rawNodes[e.source].name ?? e.source : e.source);
    const tgt = String(typeof e.target === 'number' && rawNodes[e.target] ? rawNodes[e.target].id ?? rawNodes[e.target].name ?? e.target : e.target);
    if (!nodeById.has(src)) nodeById.set(src, { id: src, label: src, group: 'default', size: 10 });
    if (!nodeById.has(tgt)) nodeById.set(tgt, { id: tgt, label: tgt, group: 'default', size: 10 });
    validEdges.push({
      source: src,
      target: tgt,
      weight: Math.max(1, Number(e.weight ?? e.value ?? 1) || 1),
      label: e.label ? String(e.label) : undefined,
    });
  }

  const simNodes: any[] = Array.from(nodeById.values()).map((n, i) => ({
    ...n,
    x: width / 2 + Math.cos((i / Math.max(1, nodeById.size)) * Math.PI * 2) * 70,
    y: height / 2 + Math.sin((i / Math.max(1, nodeById.size)) * Math.PI * 2) * 70,
  }));

  if (simNodes.length === 0) return { nodes: [], edges: [] };

  const simLinks = validEdges.map((e) => ({ source: e.source, target: e.target }));
  const sim = d3
    .forceSimulation(simNodes)
    .force(
      'link',
      d3
        .forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(78)
    )
    .force('charge', d3.forceManyBody().strength(-210))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide().radius((d: any) => (d.size || 10) + 14))
    .stop();

  for (let i = 0; i < 180; i++) {
    sim.tick();
  }

  const pad = 28;
  const clampedNodes: NetworkNode[] = simNodes.map((n) => ({
    id: n.id,
    label: n.label,
    group: n.group,
    size: n.size,
    x: Math.max(pad, Math.min(width - pad, Number.isFinite(n.x) ? n.x : width / 2)),
    y: Math.max(pad, Math.min(height - pad, Number.isFinite(n.y) ? n.y : height / 2)),
  }));

  return { nodes: clampedNodes, edges: validEdges };
}

// ---------- BUILT-IN OFFLINE CHOROPLETH GEO SHAPES ----------
export interface GeoRegionShape {
  id: string;
  name: string;
  aliases: string[];
  d: string;
  cx: number;
  cy: number;
}

// Simplified clean world macro-regions / major nations on a 600x300 equirectangular canvas
export const WORLD_GEO_SHAPES: GeoRegionShape[] = [
  { id: 'CA', name: 'Canada', aliases: ['ca', 'canada'], d: 'M55,35 L165,35 L175,78 L65,78 Z', cx: 115, cy: 56 },
  { id: 'US', name: 'United States', aliases: ['us', 'usa', 'united states', 'mỹ', 'hoa kỳ'], d: 'M65,80 L170,80 L165,120 L78,120 Z', cx: 118, cy: 100 },
  { id: 'MX', name: 'Mexico', aliases: ['mx', 'mexico'], d: 'M85,122 L126,122 L138,150 L102,148 Z', cx: 112, cy: 135 },
  { id: 'BR', name: 'Brazil', aliases: ['br', 'brazil', 'bra-xin'], d: 'M158,158 L215,165 L202,228 L160,214 Z', cx: 185, cy: 190 },
  { id: 'AR', name: 'Argentina', aliases: ['ar', 'argentina'], d: 'M158,216 L186,228 L170,278 L148,266 Z', cx: 165, cy: 248 },
  { id: 'SOUTH_AMERICA_OTHER', name: 'Andes / S. America', aliases: ['co', 'colombia', 'pe', 'peru', 'cl', 'chile', 'south america', 'nam mỹ'], d: 'M135,152 L162,158 L156,225 L136,205 Z', cx: 147, cy: 184 },
  { id: 'GB', name: 'United Kingdom', aliases: ['gb', 'uk', 'united kingdom', 'anh'], d: 'M258,64 L274,64 L274,84 L258,84 Z', cx: 266, cy: 74 },
  { id: 'FR', name: 'France', aliases: ['fr', 'france', 'pháp'], d: 'M268,88 L292,88 L290,108 L266,106 Z', cx: 279, cy: 98 },
  { id: 'DE', name: 'Germany', aliases: ['de', 'germany', 'đức'], d: 'M293,76 L316,76 L316,98 L293,98 Z', cx: 304, cy: 87 },
  { id: 'EU_SOUTH', name: 'Southern Europe', aliases: ['es', 'spain', 'it', 'italy', 'tây ban nha', 'ý', 'europe', 'châu âu'], d: 'M262,108 L322,100 L328,124 L264,122 Z', cx: 295, cy: 112 },
  { id: 'NORDICS', name: 'Northern Europe', aliases: ['se', 'sweden', 'no', 'norway', 'fi', 'finland', 'nordic'], d: 'M284,34 L330,34 L326,72 L284,72 Z', cx: 306, cy: 52 },
  { id: 'RU', name: 'Russia', aliases: ['ru', 'russia', 'nga'], d: 'M334,26 L530,30 L525,84 L334,82 Z', cx: 430, cy: 55 },
  { id: 'AFRICA_NORTH', name: 'North Africa', aliases: ['eg', 'egypt', 'ma', 'morocco', 'dz', 'algeria', 'north africa'], d: 'M262,130 L345,130 L345,168 L256,166 Z', cx: 302, cy: 148 },
  { id: 'AFRICA_SUB', name: 'Sub-Saharan Africa', aliases: ['ng', 'nigeria', 'ke', 'kenya', 'za', 'south africa', 'africa', 'châu phi'], d: 'M280,170 L356,170 L338,248 L292,240 Z', cx: 318, cy: 205 },
  { id: 'MIDDLE_EAST', name: 'Middle East', aliases: ['sa', 'saudi arabia', 'ae', 'uae', 'tr', 'turkey', 'ir', 'iran', 'middle east', 'trung đông'], d: 'M348,116 L402,116 L396,162 L348,158 Z', cx: 374, cy: 138 },
  { id: 'IN', name: 'India', aliases: ['in', 'india', 'ấn độ'], d: 'M405,126 L446,126 L432,186 L406,168 Z', cx: 424, cy: 152 },
  { id: 'CN', name: 'China', aliases: ['cn', 'china', 'trung quốc'], d: 'M424,84 L512,84 L502,136 L434,132 Z', cx: 470, cy: 108 },
  { id: 'KR', name: 'South Korea', aliases: ['kr', 'korea', 'south korea', 'hàn quốc'], d: 'M514,96 L528,96 L528,116 L514,116 Z', cx: 521, cy: 106 },
  { id: 'JP', name: 'Japan', aliases: ['jp', 'japan', 'nhật bản'], d: 'M535,84 L556,84 L548,122 L532,118 Z', cx: 544, cy: 102 },
  { id: 'VN', name: 'Vietnam', aliases: ['vn', 'vietnam', 'việt nam'], d: 'M478,138 L494,138 L498,176 L482,174 Z', cx: 488, cy: 156 },
  { id: 'SEA_MAIN', name: 'SE Asia', aliases: ['th', 'thailand', 'thái lan', 'my', 'malaysia', 'ph', 'philippines', 'asean', 'đông nam á'], d: 'M452,138 L477,138 L478,182 L454,176 Z', cx: 465, cy: 158 },
  { id: 'ID', name: 'Indonesia', aliases: ['id', 'indonesia'], d: 'M454,188 L522,190 L522,208 L454,206 Z', cx: 488, cy: 198 },
  { id: 'AU', name: 'Australia', aliases: ['au', 'australia', 'úc', 'oceania', 'châu đại dương'], d: 'M476,216 L552,216 L546,268 L474,264 Z', cx: 514, cy: 242 },
];

// Simplified clean Vietnam economic regions + key urban hubs on a 340x440 portrait canvas
export const VIETNAM_GEO_SHAPES: GeoRegionShape[] = [
  { id: 'VN_NW', name: 'Tây Bắc Bộ', aliases: ['tây bắc', 'sơn la', 'điện biên', 'lào cai', 'lai châu', 'yên bái', 'hòa bình'], d: 'M72,30 L132,30 L136,104 L76,94 Z', cx: 104, cy: 64 },
  { id: 'VN_NE', name: 'Đông Bắc Bộ', aliases: ['đông bắc', 'quảng ninh', 'lạng sơn', 'thái nguyên', 'bắc giang', 'cao bằng', 'hà giang', 'phú thọ'], d: 'M135,24 L208,36 L196,96 L138,88 Z', cx: 170, cy: 60 },
  { id: 'VN_RRD', name: 'ĐB Sông Hồng / Hà Nội', aliases: ['hà nội', 'ha noi', 'hải phòng', 'hai phong', 'sông hồng', 'đb sông hồng', 'bắc ninh', 'hải dương', 'nam định', 'thái bình', 'ninh bình'], d: 'M128,88 L192,96 L184,132 L134,126 Z', cx: 160, cy: 109 },
  { id: 'VN_NC', name: 'Bắc Trung Bộ', aliases: ['bắc trung bộ', 'thanh hóa', 'nghệ an', 'hà tĩnh', 'quảng bình', 'quảng trị', 'huế', 'thừa thiên huế'], d: 'M118,128 L178,134 L208,214 L162,214 L124,162 Z', cx: 162, cy: 174 },
  { id: 'VN_SCC', name: 'Nam Trung Bộ / Đà Nẵng', aliases: ['đà nẵng', 'da nang', 'nam trung bộ', 'quảng nam', 'quảng ngãi', 'bình định', 'phú yên', 'khánh hòa', 'nha trang', 'ninh thuận', 'bình thuận'], d: 'M198,214 L236,222 L248,314 L208,314 L202,256 Z', cx: 222, cy: 266 },
  { id: 'VN_CH', name: 'Tây Nguyên', aliases: ['tây nguyên', 'kon tum', 'gia lai', 'đắk lắk', 'đắk nông', 'lâm đồng', 'đà lạt'], d: 'M164,218 L200,220 L204,312 L166,306 Z', cx: 184, cy: 264 },
  { id: 'VN_SE', name: 'Đông Nam Bộ / TP.HCM', aliases: ['tp.hcm', 'tphcm', 'hồ chí minh', 'ho chi minh', 'sài gòn', 'saigon', 'đông nam bộ', 'bình dương', 'đồng nai', 'bà rịa', 'vũng tàu', 'tây ninh'], d: 'M158,308 L216,316 L204,358 L152,350 Z', cx: 184, cy: 334 },
  { id: 'VN_MD', name: 'ĐB Sông Cửu Long / Cần Thơ', aliases: ['cần thơ', 'can tho', 'sông cửu long', 'đbscl', 'miền tây', 'long an', 'tiền giang', 'an giang', 'kiên giang', 'cà mau', 'bến tre', 'vĩnh long', 'đồng tháp'], d: 'M102,346 L168,354 L148,412 L94,394 Z', cx: 132, cy: 378 },
];

export function matchGeoShapeValues(
  data: any[],
  regionMode: 'world' | 'vietnam' | 'auto' = 'auto'
): {
  mode: 'world' | 'vietnam';
  shapes: Array<GeoRegionShape & { value: number | null; matchedLabel?: string }>;
  unmatched: Array<{ name: string; value: number }>;
  minVal: number;
  maxVal: number;
} {
  const items = Array.isArray(data) ? data : [];
  const normalizeStr = (s: string) => s.trim().toLowerCase();

  let chosenMode: 'world' | 'vietnam' = regionMode === 'vietnam' || regionMode === 'world' ? regionMode : 'world';
  if (regionMode === 'auto') {
    const vnHits = items.filter((item) => {
      const lbl = normalizeStr(String(item.name ?? item.region ?? item.country ?? item.province ?? item.id ?? ''));
      return VIETNAM_GEO_SHAPES.some((s) => normalizeStr(s.name) === lbl || s.aliases.some((a) => lbl.includes(a)));
    }).length;
    const worldHits = items.filter((item) => {
      const lbl = normalizeStr(String(item.name ?? item.region ?? item.country ?? item.id ?? ''));
      return WORLD_GEO_SHAPES.some((s) => normalizeStr(s.name) === lbl || s.id.toLowerCase() === lbl || s.aliases.some((a) => a === lbl));
    }).length;
    chosenMode = vnHits > worldHits ? 'vietnam' : 'world';
  }

  const baseShapes = chosenMode === 'vietnam' ? VIETNAM_GEO_SHAPES : WORLD_GEO_SHAPES;
  const valueByShapeId = new Map<string, { value: number; matchedLabel: string }>();
  const unmatched: Array<{ name: string; value: number }> = [];

  for (const item of items) {
    const rawName = String(item.name ?? item.region ?? item.country ?? item.province ?? item.id ?? '');
    const lbl = normalizeStr(rawName);
    const val = Number(item.value ?? item.count ?? item.rate ?? 0);
    if (!Number.isFinite(val)) continue;

    const match = baseShapes.find(
      (s) =>
        s.id.toLowerCase() === lbl ||
        normalizeStr(s.name) === lbl ||
        s.aliases.some((a) => lbl === a || lbl.includes(a) || a.includes(lbl))
    );

    if (match) {
      const prev = valueByShapeId.get(match.id);
      if (!prev) {
        valueByShapeId.set(match.id, { value: val, matchedLabel: rawName });
      } else {
        valueByShapeId.set(match.id, {
          value: prev.value + val,
          matchedLabel: `${prev.matchedLabel}, ${rawName}`,
        });
      }
    } else if (rawName) {
      unmatched.push({ name: rawName, value: val });
    }
  }

  const shapes = baseShapes.map((s) => {
    const found = valueByShapeId.get(s.id);
    return {
      ...s,
      value: found ? found.value : null,
      matchedLabel: found?.matchedLabel,
    };
  });

  const numericVals = shapes.map((s) => s.value).filter((v): v is number => v !== null);
  const minVal = numericVals.length > 0 ? Math.min(...numericVals) : 0;
  const maxVal = numericVals.length > 0 ? Math.max(...numericVals) : 100;

  return { mode: chosenMode, shapes, unmatched, minVal, maxVal };
}

// ============================================================================
// DDoS / CYBER ATTACK MAP (Natural Earth Projection + Animated Arcs)
// ============================================================================
export interface DdosComputedArc {
  id: string;
  sourceName: string;
  targetName: string;
  sourceLonLat: [number, number];
  targetLonLat: [number, number];
  sourceXY: [number, number];
  targetXY: [number, number];
  pathD: string;
  attackType: string;
  volume: number;
  unit: string;
  color: string;
}

export interface DdosNodeSummary {
  name: string;
  role: 'source' | 'target';
  xy: [number, number];
  totalVolume: number;
  count: number;
}

export interface DdosMapLayout {
  width: number;
  height: number;
  landPaths: string[];
  graticulePath: string;
  arcs: DdosComputedArc[];
  sources: DdosNodeSummary[];
  targets: DdosNodeSummary[];
  vectors: Array<{ name: string; color: string; totalVolume: number }>;
  totalVolume: number;
  unit: string;
}

const DDOS_GEO_COORDS: Array<{ aliases: string[]; label: string; lonLat: [number, number] }> = [
  { aliases: ['vn', 'vietnam', 'việt nam', 'hanoi', 'hà nội'], label: 'Vietnam (Hanoi)', lonLat: [105.85, 21.03] },
  { aliases: ['hcm', 'ho chi minh', 'hồ chí minh', 'saigon', 'sài gòn'], label: 'Vietnam (TP.HCM)', lonLat: [106.63, 10.82] },
  { aliases: ['us', 'usa', 'united states', 'mỹ', 'hoa kỳ', 'ashburn', 'washington'], label: 'United States (East)', lonLat: [-77.49, 39.04] },
  { aliases: ['new york', 'nyc'], label: 'New York', lonLat: [-74.01, 40.71] },
  { aliases: ['san francisco', 'california', 'silicon valley', 'los angeles'], label: 'US West', lonLat: [-122.42, 37.77] },
  { aliases: ['ca', 'canada', 'toronto'], label: 'Canada', lonLat: [-79.38, 43.65] },
  { aliases: ['mx', 'mexico'], label: 'Mexico', lonLat: [-99.13, 19.43] },
  { aliases: ['br', 'brazil', 'bra-xin', 'sao paulo'], label: 'Brazil', lonLat: [-46.63, -23.55] },
  { aliases: ['ar', 'argentina', 'buenos aires'], label: 'Argentina', lonLat: [-58.38, -34.6] },
  { aliases: ['cl', 'chile'], label: 'Chile', lonLat: [-70.66, -33.45] },
  { aliases: ['co', 'colombia'], label: 'Colombia', lonLat: [-74.07, 4.71] },
  { aliases: ['gb', 'uk', 'united kingdom', 'anh', 'london'], label: 'United Kingdom', lonLat: [-0.12, 51.51] },
  { aliases: ['fr', 'france', 'pháp', 'paris'], label: 'France', lonLat: [2.35, 48.86] },
  { aliases: ['de', 'germany', 'đức', 'frankfurt'], label: 'Germany (Frankfurt)', lonLat: [8.68, 50.11] },
  { aliases: ['nl', 'netherlands', 'hà lan', 'amsterdam'], label: 'Netherlands (Amsterdam)', lonLat: [4.9, 52.37] },
  { aliases: ['es', 'spain', 'tây ban nha', 'madrid'], label: 'Spain', lonLat: [-3.7, 40.42] },
  { aliases: ['it', 'italy', 'ý', 'milan', 'rome'], label: 'Italy', lonLat: [9.19, 45.46] },
  { aliases: ['ch', 'switzerland', 'thụy sĩ', 'zurich'], label: 'Switzerland', lonLat: [8.54, 47.37] },
  { aliases: ['pl', 'poland', 'ba lan', 'warsaw'], label: 'Poland', lonLat: [21.01, 52.23] },
  { aliases: ['se', 'sweden', 'thụy điển', 'stockholm'], label: 'Sweden', lonLat: [18.07, 59.33] },
  { aliases: ['fi', 'finland', 'phần lan', 'helsinki'], label: 'Finland', lonLat: [24.94, 60.17] },
  { aliases: ['no', 'norway', 'na uy'], label: 'Norway', lonLat: [10.75, 59.91] },
  { aliases: ['ua', 'ukraine', 'kyiv'], label: 'Ukraine', lonLat: [30.52, 50.45] },
  { aliases: ['ro', 'romania'], label: 'Romania', lonLat: [26.1, 44.43] },
  { aliases: ['ru', 'russia', 'nga', 'moscow'], label: 'Russia (Moscow)', lonLat: [37.62, 55.76] },
  { aliases: ['tr', 'turkey', 'thổ nhĩ kỳ', 'istanbul'], label: 'Turkey', lonLat: [28.98, 41.01] },
  { aliases: ['sa', 'saudi arabia', 'riyadh'], label: 'Saudi Arabia', lonLat: [46.72, 24.71] },
  { aliases: ['ae', 'uae', 'dubai'], label: 'UAE (Dubai)', lonLat: [55.27, 25.2] },
  { aliases: ['il', 'israel', 'tel aviv'], label: 'Israel', lonLat: [34.78, 32.08] },
  { aliases: ['ir', 'iran', 'tehran'], label: 'Iran', lonLat: [51.39, 35.69] },
  { aliases: ['eg', 'egypt', 'ai cập', 'cairo'], label: 'Egypt', lonLat: [31.24, 30.04] },
  { aliases: ['ng', 'nigeria', 'lagos'], label: 'Nigeria', lonLat: [3.38, 6.52] },
  { aliases: ['ke', 'kenya'], label: 'Kenya', lonLat: [36.82, -1.29] },
  { aliases: ['za', 'south africa', 'nam phi'], label: 'South Africa', lonLat: [28.05, -26.2] },
  { aliases: ['in', 'india', 'ấn độ', 'mumbai', 'bangalore'], label: 'India', lonLat: [72.88, 19.08] },
  { aliases: ['pk', 'pakistan'], label: 'Pakistan', lonLat: [73.05, 33.68] },
  { aliases: ['cn', 'china', 'trung quốc', 'beijing', 'bắc kinh'], label: 'China (Beijing)', lonLat: [116.41, 39.9] },
  { aliases: ['shanghai', 'thượng hải', 'shenzhen'], label: 'China (East)', lonLat: [121.47, 31.23] },
  { aliases: ['hk', 'hong kong', 'hồng kông'], label: 'Hong Kong', lonLat: [114.17, 22.32] },
  { aliases: ['tw', 'taiwan', 'đài loan', 'taipei'], label: 'Taiwan', lonLat: [121.57, 25.03] },
  { aliases: ['kr', 'korea', 'south korea', 'hàn quốc', 'seoul'], label: 'South Korea', lonLat: [126.98, 37.57] },
  { aliases: ['kp', 'north korea', 'triều tiên'], label: 'North Korea', lonLat: [125.76, 39.04] },
  { aliases: ['jp', 'japan', 'nhật bản', 'tokyo'], label: 'Japan (Tokyo)', lonLat: [139.69, 35.69] },
  { aliases: ['sg', 'singapore'], label: 'Singapore', lonLat: [103.82, 1.35] },
  { aliases: ['th', 'thailand', 'thái lan', 'bangkok'], label: 'Thailand', lonLat: [100.5, 13.76] },
  { aliases: ['my', 'malaysia', 'kuala lumpur'], label: 'Malaysia', lonLat: [101.69, 3.14] },
  { aliases: ['id', 'indonesia', 'jakarta'], label: 'Indonesia', lonLat: [106.85, -6.21] },
  { aliases: ['ph', 'philippines', 'manila'], label: 'Philippines', lonLat: [120.98, 14.6] },
  { aliases: ['au', 'australia', 'úc', 'sydney'], label: 'Australia (Sydney)', lonLat: [151.21, -33.87] },
  { aliases: ['nz', 'new zealand'], label: 'New Zealand', lonLat: [174.76, -36.85] },
];

// Lightweight simplified Natural Earth continent outlines for crisp zero-network D3 projection
const WORLD_CONTINENTS_GEOJSON: any = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'North America' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-168, 65], [-160, 71], [-126, 70], [-95, 72], [-78, 63], [-64, 60], [-55, 50],
          [-66, 44], [-75, 36], [-81, 25], [-90, 29], [-97, 25], [-95, 19], [-87, 21],
          [-84, 10], [-78, 8], [-82, 9], [-92, 14], [-105, 20], [-112, 28], [-118, 33],
          [-124, 41], [-125, 49], [-136, 58], [-152, 60], [-164, 56], [-168, 65]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'South America' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-78, 9], [-72, 11], [-62, 10], [-50, 1], [-35, -6], [-38, -14], [-41, -22],
          [-49, -28], [-54, -34], [-63, -41], [-68, -52], [-73, -53], [-75, -44],
          [-71, -30], [-70, -18], [-80, -6], [-81, 2], [-78, 9]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Greenland' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-55, 68], [-44, 60], [-30, 68], [-18, 77], [-32, 82], [-56, 80], [-64, 76], [-55, 68]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Europe' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-9, 37], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [5, 60], [16, 69],
          [29, 71], [44, 68], [58, 68], [59, 55], [44, 46], [36, 45], [29, 41], [24, 38],
          [18, 40], [15, 38], [12, 43], [8, 44], [3, 42], [-5, 36], [-9, 37]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Africa' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-17, 15], [-16, 24], [-6, 35], [10, 37], [25, 32], [33, 31], [38, 22],
          [43, 12], [51, 12], [47, 2], [40, -10], [35, -24], [28, -33], [19, -35],
          [14, -22], [12, -6], [9, 4], [2, 6], [-8, 5], [-15, 11], [-17, 15]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Asia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [28, 41], [38, 44], [50, 40], [59, 55], [58, 68], [76, 73], [105, 76], [140, 72],
          [174, 66], [162, 55], [142, 53], [135, 44], [128, 35], [122, 37], [121, 31],
          [116, 22], [109, 20], [109, 12], [104, 2], [99, 8], [96, 16], [89, 22],
          [80, 9], [77, 8], [72, 20], [66, 25], [56, 26], [51, 29], [44, 13], [35, 29],
          [28, 41]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Japan' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [130, 31], [136, 34], [141, 38], [145, 44], [140, 42], [134, 35], [130, 31]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Indonesia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [96, 5], [106, -6], [116, -8], [122, -4], [118, 2], [104, 1], [96, 5]
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Australia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [114, -22], [123, -16], [131, -12], [136, -12], [142, -11], [146, -18],
          [153, -27], [150, -37], [140, -38], [131, -32], [118, -35], [114, -28], [114, -22]
        ]],
      },
    },
  ],
};

function resolveDdosGeoCoord(rawName: unknown, explicitLon?: unknown, explicitLat?: unknown): { label: string; lonLat: [number, number] } {
  const lonNum = Number(explicitLon);
  const latNum = Number(explicitLat);
  const labelRaw = String(rawName || '').trim();
  if (Number.isFinite(lonNum) && Number.isFinite(latNum) && Math.abs(lonNum) <= 180 && Math.abs(latNum) <= 90) {
    return { label: labelRaw || `${latNum.toFixed(1)}, ${lonNum.toFixed(1)}`, lonLat: [lonNum, latNum] };
  }

  const lower = labelRaw.toLowerCase();
  if (lower) {
    const exact = DDOS_GEO_COORDS.find((c) => c.aliases.some((a) => a === lower));
    if (exact) return { label: labelRaw || exact.label, lonLat: exact.lonLat };
    const partial = DDOS_GEO_COORDS.find((c) => c.aliases.some((a) => lower.includes(a) || a.includes(lower)));
    if (partial) return { label: labelRaw || partial.label, lonLat: partial.lonLat };
  }

  // Deterministic fallback hash to plausible world coordinates when unknown custom label is passed
  let hash = 0;
  for (let i = 0; i < labelRaw.length; i++) {
    hash = (hash * 31 + labelRaw.charCodeAt(i)) | 0;
  }
  const lon = ((Math.abs(hash) % 240) - 110);
  const lat = ((Math.abs(hash >> 3) % 70) - 20);
  return { label: labelRaw || 'Unknown Node', lonLat: [lon, lat] };
}

function getDdosVectorColor(attackType: string): string {
  const lower = attackType.toLowerCase();
  if (/syn|tcp|ack|rst/i.test(lower)) return '#ef4444'; // Crimson
  if (/udp|dns|ntp|amplif|reflect/i.test(lower)) return '#f59e0b'; // Amber
  if (/http|layer\s*7|l7|get|post|tls|ssl/i.test(lower)) return '#8b5cf6'; // Violet
  if (/botnet|mirai|icmp|flood/i.test(lower)) return '#06b6d4'; // Cyan
  return '#2563eb'; // Blue
}

export function computeDdosMapLayout(
  payload: ChartPayload,
  width = 680,
  height = 340
): DdosMapLayout {
  const projection = d3
    .geoNaturalEarth1()
    .fitExtent([[10, 12], [width - 10, height - 12]], WORLD_CONTINENTS_GEOJSON);
  const pathGen = d3.geoPath(projection);

  const landPaths = (WORLD_CONTINENTS_GEOJSON.features as any[])
    .map((f) => pathGen(f) || '')
    .filter(Boolean);
  const graticulePath = pathGen(d3.geoGraticule10()) || '';

  const rawAttacks = Array.isArray(payload.attacks)
    ? payload.attacks
    : Array.isArray(payload.arcs)
    ? payload.arcs
    : Array.isArray(payload.data)
    ? payload.data
    : [];

  const unit = payload.unit || 'Gbps';
  const arcs: DdosComputedArc[] = [];
  const srcMap = new Map<string, DdosNodeSummary>();
  const tgtMap = new Map<string, DdosNodeSummary>();
  const vecMap = new Map<string, { name: string; color: string; totalVolume: number }>();
  let totalVolume = 0;

  rawAttacks.slice(0, 48).forEach((item: any, idx: number) => {
    const srcGeo = resolveDdosGeoCoord(
      item.source ?? item.from ?? item.attacker ?? item.origin ?? item.src ?? 'CN',
      item.sourceLon ?? item.fromLon ?? item.srcLon,
      item.sourceLat ?? item.fromLat ?? item.srcLat
    );
    const tgtGeo = resolveDdosGeoCoord(
      item.target ?? item.to ?? item.destination ?? item.victim ?? item.dst ?? 'US',
      item.targetLon ?? item.toLon ?? item.dstLon,
      item.targetLat ?? item.toLat ?? item.dstLat
    );

    const srcXY = (projection(srcGeo.lonLat) || [width * 0.3, height * 0.45]) as [number, number];
    const tgtXY = (projection(tgtGeo.lonLat) || [width * 0.7, height * 0.45]) as [number, number];

    const dx = tgtXY[0] - srcXY[0];
    const dy = tgtXY[1] - srcXY[1];
    const dist = Math.hypot(dx, dy);
    const lift = Math.min(92, Math.max(18, dist * 0.32));
    const midX = (srcXY[0] + tgtXY[0]) / 2;
    const midY = (srcXY[1] + tgtXY[1]) / 2 - lift;
    const pathD = `M ${srcXY[0].toFixed(1)},${srcXY[1].toFixed(1)} Q ${midX.toFixed(1)},${midY.toFixed(1)} ${tgtXY[0].toFixed(1)},${tgtXY[1].toFixed(1)}`;

    const attackType = String(item.type ?? item.vector ?? item.protocol ?? 'SYN Flood');
    const volume = Number(item.volume ?? item.gbps ?? item.value ?? item.rate ?? item.intensity ?? 10);
    const safeVol = Number.isFinite(volume) && volume > 0 ? volume : 10;
    const color = String(item.color || getDdosVectorColor(attackType));

    totalVolume += safeVol;
    arcs.push({
      id: `arc-${idx}`,
      sourceName: srcGeo.label,
      targetName: tgtGeo.label,
      sourceLonLat: srcGeo.lonLat,
      targetLonLat: tgtGeo.lonLat,
      sourceXY: [Math.round(srcXY[0] * 10) / 10, Math.round(srcXY[1] * 10) / 10],
      targetXY: [Math.round(tgtXY[0] * 10) / 10, Math.round(tgtXY[1] * 10) / 10],
      pathD,
      attackType,
      volume: safeVol,
      unit,
      color,
    });

    const prevS = srcMap.get(srcGeo.label);
    srcMap.set(srcGeo.label, {
      name: srcGeo.label,
      role: 'source',
      xy: srcXY,
      totalVolume: (prevS?.totalVolume || 0) + safeVol,
      count: (prevS?.count || 0) + 1,
    });

    const prevT = tgtMap.get(tgtGeo.label);
    tgtMap.set(tgtGeo.label, {
      name: tgtGeo.label,
      role: 'target',
      xy: tgtXY,
      totalVolume: (prevT?.totalVolume || 0) + safeVol,
      count: (prevT?.count || 0) + 1,
    });

    const prevVec = vecMap.get(attackType);
    vecMap.set(attackType, {
      name: attackType,
      color,
      totalVolume: (prevVec?.totalVolume || 0) + safeVol,
    });
  });

  return {
    width,
    height,
    landPaths,
    graticulePath,
    arcs,
    sources: Array.from(srcMap.values()).sort((a, b) => b.totalVolume - a.totalVolume),
    targets: Array.from(tgtMap.values()).sort((a, b) => b.totalVolume - a.totalVolume),
    vectors: Array.from(vecMap.values()).sort((a, b) => b.totalVolume - a.totalVolume),
    totalVolume: Math.round(totalVolume * 100) / 100,
    unit,
  };
}

export interface RadarNormalizedData {
  xKey: string;
  series: string[];
  rows: Record<string, any>[];
}

export function normalizeRadarData(payload: ChartPayload): RadarNormalizedData {
  const rawSeries: any[] = Array.isArray(payload.series) ? payload.series : [];

  // 1. Chart.js style: { labels: [...], datasets: [{ label, data: [...] }] }
  if (Array.isArray(payload.datasets) && payload.datasets.length > 0) {
    const labels = Array.isArray(payload.labels)
      ? payload.labels
      : Array.isArray(payload.categories)
      ? payload.categories
      : [];
    const maxLen = Math.max(
      labels.length,
      ...payload.datasets.map((ds) => (Array.isArray(ds?.data) ? ds.data.length : Array.isArray(ds?.values) ? ds.values.length : 0))
    );
    const seriesNames = payload.datasets.map(
      (ds, i) => String(ds?.label || ds?.name || `Series ${i + 1}`)
    );
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, any> = {
        subject: String(labels[i] ?? `Tiêu chí ${i + 1}`),
      };
      payload.datasets.forEach((ds, sIdx) => {
        const arr = Array.isArray(ds?.data) ? ds.data : Array.isArray(ds?.values) ? ds.values : [];
        const v = Number(arr[i] ?? 0);
        row[seriesNames[sIdx]] = Number.isFinite(v) ? v : 0;
      });
      rows.push(row);
    }
    return { xKey: 'subject', series: seriesNames, rows };
  }

  // 2. ECharts / Apex style: { categories/indicators: [...], series: [{ name, data: [...] }] }
  if (
    rawSeries.length > 0 &&
    typeof rawSeries[0] === 'object' &&
    rawSeries[0] !== null &&
    (Array.isArray(rawSeries[0].data) || Array.isArray(rawSeries[0].values))
  ) {
    const rawAxes: any[] = Array.isArray(payload.categories)
      ? payload.categories
      : Array.isArray(payload.indicators)
      ? payload.indicators
      : Array.isArray(payload.labels)
      ? payload.labels
      : [];
    const labels = rawAxes.map((ax, i) =>
      typeof ax === 'string' ? ax : String(ax?.name || ax?.text || `Tiêu chí ${i + 1}`)
    );
    const maxLen = Math.max(
      labels.length,
      ...rawSeries.map((s) => (Array.isArray(s?.data) ? s.data.length : Array.isArray(s?.values) ? s.values.length : 0))
    );
    const seriesNames = rawSeries.map((s, i) => String(s?.name || s?.label || `Series ${i + 1}`));
    const rows: Record<string, any>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, any> = {
        subject: String(labels[i] ?? `Tiêu chí ${i + 1}`),
      };
      rawSeries.forEach((s, sIdx) => {
        const arr = Array.isArray(s?.data) ? s.data : Array.isArray(s?.values) ? s.values : [];
        const v = Number(arr[i] ?? 0);
        row[seriesNames[sIdx]] = Number.isFinite(v) ? v : 0;
      });
      rows.push(row);
    }
    return { xKey: 'subject', series: seriesNames, rows };
  }

  // 3. Recharts / Array-of-objects style: payload.data = [{ subject/metric/name/..., A: 80, B: 90 }]
  const rawRows = Array.isArray(payload.data) ? payload.data.filter((r) => r && typeof r === 'object') : [];
  if (rawRows.length === 0) {
    return { xKey: payload.xAxis || 'name', series: [], rows: [] };
  }

  const first = rawRows[0];
  const candidateLabelKeys = [
    payload.xAxis,
    'name',
    'subject',
    'metric',
    'label',
    'category',
    'skill',
    'axis',
    'criteria',
    'chiSo',
    'tieuChi',
    'indicator',
  ].filter(Boolean) as string[];

  let xKey = candidateLabelKeys.find((k) => first[k] !== undefined && typeof first[k] !== 'object');
  if (!xKey) {
    xKey = Object.keys(first).find((k) => typeof first[k] === 'string') || 'name';
  }

  const stringSeries = rawSeries.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
  const ignoredKeys = new Set([xKey, 'fullMark', 'max', 'maxValue', 'color', 'unit', 'id']);

  let seriesKeys: string[] = [];
  if (stringSeries.length > 0 && stringSeries.some((k) => rawRows.some((r) => r[k] !== undefined))) {
    seriesKeys = stringSeries;
  } else {
    const keySet = new Set<string>();
    rawRows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (ignoredKeys.has(k)) return;
        const val = r[k];
        if (typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && Number.isFinite(Number(val)))) {
          keySet.add(k);
        }
      });
    });
    seriesKeys = Array.from(keySet);
  }

  if (seriesKeys.length === 0 && payload.yAxis) {
    seriesKeys = [payload.yAxis];
  }

  const normalizedRows = rawRows.map((r, idx) => {
    const out: Record<string, any> = {
      ...r,
      [xKey!]: String(r[xKey!] ?? `Tiêu chí ${idx + 1}`),
    };
    seriesKeys.forEach((sk) => {
      const n = Number(r[sk] ?? 0);
      out[sk] = Number.isFinite(n) ? n : 0;
    });
    return out;
  });

  return {
    xKey: xKey!,
    series: seriesKeys,
    rows: normalizedRows,
  };
}

function normalizeIntegralMathExpr(raw: string): string {
  let s = raw
    .replace(/[−–—]/g, '-')
    .replace(/×|·/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√\(([^)]+)\)/g, 'sqrt($1)')
    .replace(/√([a-zA-Z0-9]+)/g, 'sqrt($1)')
    .replace(/e\^\(([^)]+)\)/g, 'exp($1)')
    .replace(/e\^([a-zA-Z0-9_-]+)/g, 'exp($1)')
    .replace(/ln\(/g, 'log(')
    .trim();
  s = s.replace(/\b(từ|tu|from|trên|tren|với|with|trong|đoạn|doan|khoảng|dx|dt|và|va)\b[\s\S]*$/i, '').trim();
  return s.replace(/[.,;!?]+$/, '').trim() || 'x^2';
}

export function repairChartPayloadDeterministic(brokenConfig: string): string | null {
  const repaired = parseChartJsonSafe(brokenConfig);
  if (repaired) {
    return JSON.stringify(repaired, null, 2);
  }
  const lower = brokenConfig.toLowerCase();
  if (/tích phân|integral|bounds|riemann/i.test(lower)) {
    let a = 0;
    let b = 3;
    const parseBound = (tok: string): number => {
      const clean = tok.trim().toLowerCase().replace(/π/g, 'pi');
      if (clean === 'pi') return Math.PI;
      if (clean === '-pi') return -Math.PI;
      if (clean === '2pi' || clean === '2*pi') return Math.PI * 2;
      if (clean === 'pi/2') return Math.PI / 2;
      if (clean === '-pi/2') return -Math.PI / 2;
      const n = Number(clean);
      return Number.isFinite(n) ? n : 0;
    };
    const rangeMatch =
      brokenConfig.match(/(?:từ|tu|from|cận|can)\s+([+-]?(?:\d+(?:\.\d+)?|pi\/2|2\*?pi|pi|π\/2|π))\s+(?:đến|den|to|tới|toi|và|va|-)\s+([+-]?(?:\d+(?:\.\d+)?|pi\/2|2\*?pi|pi|π\/2|π))/i) ||
      brokenConfig.match(/\[\s*([+-]?(?:\d+(?:\.\d+)?|pi|π))\s*[,;]\s*([+-]?(?:\d+(?:\.\d+)?|pi|π))\s*\]/i);
    if (rangeMatch) {
      a = parseBound(rangeMatch[1]);
      b = parseBound(rangeMatch[2]);
      if (a === b) b = a + 2;
    }
    const eqMatch = brokenConfig.match(/(?:y|f\(x\)|expr)\s*[:=]\s*["']?([^"'\n,;]+)/i);
    const expr = eqMatch ? normalizeIntegralMathExpr(eqMatch[1]) : '0.4*x^2 + 0.5';
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const pad = Math.max(1.5, (hi - lo) * 0.45);
    return JSON.stringify(
      {
        type: 'integral',
        title: `Tích phân ∫[${a}, ${b}] (${expr}) dx`,
        functions: [{ expr, label: `f(x) = ${expr}`, color: '#2563eb' }],
        bounds: [Number(a.toFixed(3)), Number(b.toFixed(3))],
        xRange: [Number((lo - pad).toFixed(2)), Number((hi + pad).toFixed(2))],
        slices: 12,
        riemannMethod: 'midpoint',
      },
      null,
      2
    );
  }

  const pairs = [...brokenConfig.matchAll(/["']?([A-Za-zÀ-ỹ0-9_\s-]{1,24})["']?\s*[:=]\s*(-?\d+(?:\.\d+)?)/g)];
  const filteredPairs = pairs
    .filter((m) => !/^(width|height|bins|slices|min|max)$/i.test(m[1].trim()))
    .slice(0, 8);
  if (filteredPairs.length >= 2) {
    return JSON.stringify(
      {
        type: 'bar',
        title: 'Biểu đồ đã khôi phục tự động',
        xAxis: 'name',
        yAxis: 'value',
        data: filteredPairs.map((m) => ({
          name: m[1].trim(),
          value: Number(m[2]),
        })),
      },
      null,
      2
    );
  }
  return null;
}

// ============================================================================
// CHART DISPLAY SWITCHER & SORTING ALGORITHMS (QuickSort / MergeSort / HeapSort)
// ============================================================================
export type ChartSortAlgorithm =
  | 'none'
  | 'quicksort_desc'
  | 'quicksort_asc'
  | 'mergesort_alpha_asc'
  | 'mergesort_alpha_desc'
  | 'heapsort_top'
  | 'volatility_desc';

export interface ChartSortResult {
  rows: any[];
  algorithm: ChartSortAlgorithm;
  algorithmLabel: string;
  summary: string | null;
  topLabel?: string;
  topValue?: number;
  minLabel?: string;
  minValue?: number;
}

function getNumericRowMetric(row: any, valueKey: string, mode: 'value' | 'volatility' = 'value'): number {
  if (!row || typeof row !== 'object') return 0;
  if (mode === 'volatility') {
    const h = Number(row.high ?? row.h);
    const l = Number(row.low ?? row.l);
    if (Number.isFinite(h) && Number.isFinite(l)) {
      return Math.abs(h - l);
    }
    const o = Number(row.open ?? row.o);
    const c = Number(row.close ?? row.c);
    if (Number.isFinite(o) && Number.isFinite(c)) {
      return Math.abs(c - o);
    }
  }
  const direct = Number(row[valueKey] ?? row.close ?? row.c ?? row.value ?? row.count ?? row.y ?? 0);
  return Number.isFinite(direct) ? direct : 0;
}

function getRowLabel(row: any, xKey: string, idx: number): string {
  if (!row || typeof row !== 'object') return `#${idx + 1}`;
  return String(row[xKey] ?? row.name ?? row.label ?? row.date ?? row.time ?? row.subject ?? `#${idx + 1}`);
}

export function quickSortChartRows<T>(
  items: T[],
  getKey: (item: T) => number,
  direction: 'asc' | 'desc' = 'desc'
): T[] {
  const arr = [...items];
  if (arr.length <= 1) return arr;

  const stack: Array<[number, number]> = [[0, arr.length - 1]];
  const cmp = (aVal: number, bVal: number) => (direction === 'asc' ? aVal < bVal : aVal > bVal);

  while (stack.length > 0) {
    const [low, high] = stack.pop()!;
    if (low >= high) continue;

    const mid = (low + high) >> 1;
    const pivotVal = getKey(arr[mid]);
    [arr[mid], arr[high]] = [arr[high], arr[mid]];

    let storeIdx = low;
    for (let i = low; i < high; i++) {
      if (cmp(getKey(arr[i]), pivotVal)) {
        [arr[i], arr[storeIdx]] = [arr[storeIdx], arr[i]];
        storeIdx++;
      }
    }
    [arr[storeIdx], arr[high]] = [arr[high], arr[storeIdx]];

    if (storeIdx - 1 - low > high - (storeIdx + 1)) {
      if (low < storeIdx - 1) stack.push([low, storeIdx - 1]);
      if (storeIdx + 1 < high) stack.push([storeIdx + 1, high]);
    } else {
      if (storeIdx + 1 < high) stack.push([storeIdx + 1, high]);
      if (low < storeIdx - 1) stack.push([low, storeIdx - 1]);
    }
  }
  return arr;
}

export function mergeSortChartRows<T>(items: T[], compare: (a: T, b: T) => number): T[] {
  if (items.length <= 1) return [...items];
  const mid = items.length >> 1;
  const left = mergeSortChartRows(items.slice(0, mid), compare);
  const right = mergeSortChartRows(items.slice(mid), compare);
  const merged: T[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) {
      merged.push(left[i++]);
    } else {
      merged.push(right[j++]);
    }
  }
  while (i < left.length) merged.push(left[i++]);
  while (j < right.length) merged.push(right[j++]);
  return merged;
}

export function heapSortChartRows<T>(
  items: T[],
  getKey: (item: T) => number,
  direction: 'asc' | 'desc' = 'desc'
): T[] {
  const arr = [...items];
  const n = arr.length;
  if (n <= 1) return arr;

  // For final descending order we build a min-heap (smallest extracted to end);
  // for final ascending order we build a max-heap (largest extracted to end).
  const shouldSwap = (parentVal: number, childVal: number) =>
    direction === 'desc' ? childVal < parentVal : childVal > parentVal;

  const heapify = (heapSize: number, rootIdx: number) => {
    let idx = rootIdx;
    while (true) {
      let target = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < heapSize && shouldSwap(getKey(arr[target]), getKey(arr[left]))) {
        target = left;
      }
      if (right < heapSize && shouldSwap(getKey(arr[target]), getKey(arr[right]))) {
        target = right;
      }
      if (target === idx) break;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      idx = target;
    }
  };

  for (let i = (n >> 1) - 1; i >= 0; i--) {
    heapify(n, i);
  }
  for (let end = n - 1; end > 0; end--) {
    [arr[0], arr[end]] = [arr[end], arr[0]];
    heapify(end, 0);
  }
  return arr;
}

const SORT_LABELS: Record<ChartSortAlgorithm, string> = {
  none: 'Mặc định',
  quicksort_desc: 'QuickSort (Giảm dần)',
  quicksort_asc: 'QuickSort (Tăng dần)',
  mergesort_alpha_asc: 'MergeSort (A → Z)',
  mergesort_alpha_desc: 'MergeSort (Z → A)',
  heapsort_top: 'HeapSort (Top-K)',
  volatility_desc: 'QuickSort (Biên độ)',
};

export function applyChartSortAlgorithm(
  rows: any[],
  algorithm: ChartSortAlgorithm,
  xKey = 'name',
  valueKey = 'value'
): ChartSortResult {
  const list = Array.isArray(rows) ? rows : [];
  if (algorithm === 'none' || list.length === 0) {
    return {
      rows: list,
      algorithm: 'none',
      algorithmLabel: SORT_LABELS.none,
      summary: null,
    };
  }

  let sorted: any[] = list;
  let metricMode: 'value' | 'volatility' = 'value';

  if (algorithm === 'quicksort_desc') {
    sorted = quickSortChartRows(list, (r) => getNumericRowMetric(r, valueKey), 'desc');
  } else if (algorithm === 'quicksort_asc') {
    sorted = quickSortChartRows(list, (r) => getNumericRowMetric(r, valueKey), 'asc');
  } else if (algorithm === 'heapsort_top') {
    sorted = heapSortChartRows(list, (r) => getNumericRowMetric(r, valueKey), 'desc');
  } else if (algorithm === 'mergesort_alpha_asc') {
    sorted = mergeSortChartRows(list, (a, b) =>
      getRowLabel(a, xKey, 0).localeCompare(getRowLabel(b, xKey, 0), 'vi', { numeric: true })
    );
  } else if (algorithm === 'mergesort_alpha_desc') {
    sorted = mergeSortChartRows(list, (a, b) =>
      getRowLabel(b, xKey, 0).localeCompare(getRowLabel(a, xKey, 0), 'vi', { numeric: true })
    );
  } else if (algorithm === 'volatility_desc') {
    metricMode = 'volatility';
    const hasOhlc = list.some((r) => r && (r.high !== undefined || r.h !== undefined));
    if (hasOhlc) {
      sorted = quickSortChartRows(list, (r) => getNumericRowMetric(r, valueKey, 'volatility'), 'desc');
    } else {
      const vals = list.map((r) => getNumericRowMetric(r, valueKey));
      const mean = vals.reduce((acc, v) => acc + v, 0) / Math.max(1, vals.length);
      sorted = quickSortChartRows(list, (r) => Math.abs(getNumericRowMetric(r, valueKey) - mean), 'desc');
    }
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstLbl = getRowLabel(first, xKey, 0);
  const lastLbl = getRowLabel(last, xKey, sorted.length - 1);
  const maxItem = sorted.reduce(
    (best, item, idx) => {
      const val = getNumericRowMetric(item, valueKey, metricMode);
      return val > best.val ? { val, label: getRowLabel(item, xKey, idx) } : best;
    },
    { val: -Infinity, label: '' }
  );
  const minItem = sorted.reduce(
    (best, item, idx) => {
      const val = getNumericRowMetric(item, valueKey, metricMode);
      return val < best.val ? { val, label: getRowLabel(item, xKey, idx) } : best;
    },
    { val: Infinity, label: '' }
  );

  const label = SORT_LABELS[algorithm];
  const summary =
    algorithm === 'mergesort_alpha_asc' || algorithm === 'mergesort_alpha_desc'
      ? `${label} · Đầu: ${firstLbl} · Cuối: ${lastLbl}`
      : `${label} · Cao nhất: ${maxItem.label} (${formatChartNumber(maxItem.val)}) · Thấp nhất: ${minItem.label} (${formatChartNumber(minItem.val)})`;

  return {
    rows: sorted,
    algorithm,
    algorithmLabel: label,
    summary,
    topLabel: maxItem.label,
    topValue: maxItem.val,
    minLabel: minItem.label,
    minValue: minItem.val,
  };
}

export function getCompatibleChartDisplayTypes(
  baseType: UniversalChartType,
  payload: ChartPayload | null
): UniversalChartType[] {
  const rows = Array.isArray(payload?.data) ? payload!.data! : [];
  const hasOhlcFields =
    baseType === 'candlestick' ||
    baseType === 'ohlc' ||
    rows.some(
      (r) =>
        r &&
        (r.open !== undefined || r.o !== undefined) &&
        (r.close !== undefined || r.c !== undefined) &&
        (r.high !== undefined || r.h !== undefined) &&
        (r.low !== undefined || r.l !== undefined)
    );

  if (hasOhlcFields) {
    return ['candlestick', 'ohlc', 'line', 'area', 'bar'];
  }

  if (baseType === 'treemap' || baseType === 'sunburst') {
    return ['treemap', 'sunburst'];
  }

  if (baseType === 'boxplot' || baseType === 'violin') {
    return ['boxplot', 'violin'];
  }

  if (baseType === 'scatter' || baseType === 'bubble') {
    return ['scatter', 'bubble', 'line'];
  }

  if (baseType === 'histogram') {
    if (Array.isArray(payload?.values) && payload!.values!.length > 0) {
      return ['histogram'];
    }
    return ['histogram', 'bar', 'line', 'area'];
  }

  const categoricalTypes: UniversalChartType[] = [
    'bar',
    'grouped_bar',
    'stacked_bar',
    'horizontal_bar',
    'line',
    'area',
    'stacked_area',
    'combo',
    'radar',
    'waterfall',
    'pie',
    'donut',
    'funnel',
    'pictogram',
  ];

  if (baseType === 'time_graph') {
    return ['time_graph', 'line', 'area', 'combo', 'bar'];
  }

  if (baseType === 'algorithm_trace') {
    return ['algorithm_trace'];
  }

  if (baseType === 'big_o') {
    return ['big_o'];
  }

  if (baseType === 'flowchart') {
    return ['flowchart'];
  }

  if (categoricalTypes.includes(baseType)) {
    const hasMultipleSeries = Array.isArray(payload?.series) && payload!.series!.length > 1;
    const list: UniversalChartType[] = [
      'bar',
      'grouped_bar',
      'stacked_bar',
      'horizontal_bar',
      'line',
      'area',
      'stacked_area',
      ...(hasMultipleSeries || baseType === 'combo' ? (['combo'] as UniversalChartType[]) : []),
      'radar',
      'waterfall',
      'pie',
      'donut',
      'funnel',
      'pictogram',
      'time_graph',
    ];
    return list.includes(baseType) ? list : [baseType, ...list];
  }

  return [baseType];
}





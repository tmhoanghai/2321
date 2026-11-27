import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  ComposedChart,
  ScatterChart,
  Scatter,
  ZAxis,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  Brush,
} from 'recharts';
import {
  BarChart3,
  Box,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ChartPayload,
  ChartSortAlgorithm,
  UniversalChartType,
  MATH_COORD_TYPES,
  NATIVE_3D_TYPES,
  SUPPORTS_3D_VIEW_TYPES,
  applyChartSortAlgorithm,
  getCompatibleChartDisplayTypes,
  normalizeChartType,
  parseChartJsonSafe,
  formatChartNumber,
  buildHistogramData,
  computeBoxStats,
  computeViolinData,
  buildWaterfallData,
  normalizeHierarchyData,
  computeSankeyLayout,
  computeNetworkLayout,
  matchGeoShapeValues,
  computeDdosMapLayout,
  normalizeRadarData,
} from '../lib/chartData';
import {
  analyzeVectors,
  compileMathExpression,
  extractExpressionIdentifiers,
  inferMathParameters,
  MathFunctionSpec,
  MathParamSpec,
  normalizeFunctions2D,
  normalizeMathPoints,
  normalizeVectors,
  RiemannMethod,
  VectorSpec,
} from '../lib/mathGraphEngine';
import { Math2DCoordinateView } from './Math2DCoordinateView';
import { ThreeChartViewport } from './ThreeChartViewport';
import { AlgorithmTraceView } from './AlgorithmTraceView';
import { BigOComplexityView } from './BigOComplexityView';
import { FlowchartView } from './FlowchartView';
import { buildKinematicsTimeGraph } from '../lib/kinematicsEngine';
import { acquireFullscreenLock, releaseFullscreenLock } from '../lib/fullscreenBus';

const PALETTE = [
  '#2563eb', // Blue
  '#059669', // Emerald
  '#d97706', // Amber
  '#dc2626', // Crimson
  '#7c3aed', // Violet
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#4f46e5', // Indigo
];

const CHART_TYPE_LABELS: Record<UniversalChartType, string> = {
  bar: 'Biểu đồ cột',
  grouped_bar: 'Biểu đồ cột ghép',
  stacked_bar: 'Biểu đồ cột chồng',
  horizontal_bar: 'Biểu đồ thanh ngang',
  line: 'Biểu đồ đường',
  pie: 'Biểu đồ tròn',
  donut: 'Biểu đồ vành khuyên',
  area: 'Biểu đồ miền',
  stacked_area: 'Biểu đồ miền chồng',
  combo: 'Biểu đồ kết hợp (Cột + Đường)',
  pictogram: 'Biểu đồ tranh',
  histogram: 'Biểu đồ tần số',
  boxplot: 'Biểu đồ hộp (Box Plot)',
  violin: 'Biểu đồ Violin',
  scatter: 'Biểu đồ phân tán',
  bubble: 'Biểu đồ bong bóng',
  heatmap: 'Biểu đồ nhiệt',
  radar: 'Biểu đồ mạng nhện',
  waterfall: 'Biểu đồ thác nước',
  funnel: 'Biểu đồ phễu',
  treemap: 'Biểu đồ cây (Treemap)',
  sunburst: 'Biểu đồ ánh dương (Sunburst)',
  candlestick: 'Biểu đồ nến',
  ohlc: 'Biểu đồ OHLC',
  gantt: 'Biểu đồ Gantt',
  sankey: 'Biểu đồ Sankey',
  network: 'Biểu đồ mạng lưới',
  choropleth: 'Biểu đồ bản đồ',
  ddos_map: 'Bản đồ tấn công DDoS',
  coordinate_2d: 'Hệ trục tọa độ Oxy & Đồ thị hàm số',
  vector_2d: 'Hệ trục & Vector Oxy',
  integral: 'Biểu đồ tích phân & Diện tích đường cong',
  surface_3d: 'Đồ thị mặt 3D Oxyz',
  vector_3d: 'Hệ trục & Vector 3D Oxyz',
  parametric_3d: 'Đường cong tham số 3D Oxyz',
  scatter_3d: 'Biểu đồ phân tán 3D',
  time_graph: 'Đồ thị thời gian (Time / Speed / Distance)',
  algorithm_trace: 'Minh họa thuật toán (Step Trace)',
  big_o: 'So sánh độ phức tạp Big O',
  flowchart: 'Sơ đồ luồng xử lý (Flowchart)',
};

const PICTOGRAM_PATH = (kind: string) => {
  switch (kind) {
    case 'person':
    case 'user':
    case 'people':
      return 'M12 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm-5 10c0-1.66 2.24-3 5-3s5 1.34 5 3v6h-2v4H9v-4H7v-6z';
    case 'star':
      return 'M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z';
    case 'box':
    case 'cube':
      return 'M3 7l9-4 9 4v10l-9 4-9-4V7zm9 4l9-4M12 11v10M12 11L3 7';
    case 'heart':
      return 'M12 21s-7.5-4.35-9.5-9.2C1.2 8.4 3.4 4.5 7.1 4.5c2.1 0 3.9 1.1 4.9 2.7 1-1.6 2.8-2.7 4.9-2.7 3.7 0 5.9 3.9 4.6 7.3C19.5 16.65 12 21 12 21z';
    case 'leaf':
      return 'M17 3C9 3 4 8.5 4 15.5c0 1.9.6 3.7 1.6 5.1 1.5-4.6 5.1-8.5 9.9-10.3-3.7 2.4-6.3 5.9-7.4 10.1 5.9-.5 11.9-5.2 11.9-14.4V3h-3z';
    default:
      return 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z';
  }
};

interface UniversalChartRendererProps {
  config: string;
  theme: 'dark' | 'light';
  defaultEquationDrawerOpen?: boolean;
  isStreaming?: boolean;
  onRetryChart?: (brokenConfig: string) => void;
}

export const UniversalChartRenderer: React.FC<UniversalChartRendererProps> = React.memo(({
  config,
  theme,
  defaultEquationDrawerOpen = false,
  isStreaming = false,
  onRetryChart,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRetriedConfigsRef = useRef<Set<string>>(new Set());
  const [isRetryingChart, setIsRetryingChart] = useState(false);

  // Shared interactive states
  const [selectedInfo, setSelectedInfo] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [displayTypeOverride, setDisplayTypeOverride] = useState<UniversalChartType | null>(null);
  const [sortAlgorithm, setSortAlgorithm] = useState<ChartSortAlgorithm>('none');
  const [hiddenSeries, setHiddenSeries] = useState<Record<string, boolean>>({});
  const [showBrush, setShowBrush] = useState<boolean>(false);
  const [pinnedLabel, setPinnedLabel] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const lockToken = acquireFullscreenLock();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      releaseFullscreenLock(lockToken);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isFullscreen]);

  // Interactive Math / Coordinate / Vector / Integral / 3D Parameter states
  const [equationDrawerOpen, setEquationDrawerOpen] = useState<boolean>(defaultEquationDrawerOpen);
  const [activePlotOverride, setActivePlotOverride] = useState<
    'coordinate_2d' | 'integral' | 'surface_3d' | 'vector_2d' | 'vector_3d' | null
  >(null);
  const [customDomain, setCustomDomain] = useState<[number, number]>([-6, 6]);
  const [editableFunctions, setEditableFunctions] = useState<MathFunctionSpec[]>([]);
  const [editableVectors, setEditableVectors] = useState<VectorSpec[]>([]);
  const [mathParams, setMathParams] = useState<MathParamSpec[]>([]);
  const [paramValues, setParamValues] = useState<Record<string, number>>({});
  const [animatingParam, setAnimatingParam] = useState<string | null>(null);
  const [showVecSum, setShowVecSum] = useState<boolean>(false);
  const [showVecCross, setShowVecCross] = useState<boolean>(false);
  const [showParamPanel, setShowParamPanel] = useState<boolean>(true);
  const [newFuncExpr, setNewFuncExpr] = useState<string>('');
  const [integralEnabled, setIntegralEnabled] = useState<boolean>(false);
  const [integralBounds, setIntegralBounds] = useState<[number, number]>([0, 2]);
  const [riemannSlices, setRiemannSlices] = useState<number>(12);
  const [riemannMethod, setRiemannMethod] = useState<RiemannMethod>('midpoint');
  const [showTangentLine, setShowTangentLine] = useState<boolean>(false);
  const [tangentX, setTangentX] = useState<number>(1);

  // Pie / Donut hover & active focus
  const [activePieIdx, setActivePieIdx] = useState<number | null>(null);

  // Sunburst drill-down & hover
  const [sunburstFocusName, setSunburstFocusName] = useState<string | null>(null);
  const [hoveredSunburst, setHoveredSunburst] = useState<string | null>(null);

  // Treemap & Heatmap & Sankey hover
  const [hoveredTreemapIdx, setHoveredTreemapIdx] = useState<number | null>(null);
  const [hoveredHeatCell, setHoveredHeatCell] = useState<{ x: string; y: string; value: number } | null>(null);
  const [hoveredSankeyKey, setHoveredSankeyKey] = useState<{ kind: 'node' | 'link'; id: string } | null>(null);

  // Candlestick / OHLC interactive crosshair + zoom/pan window
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [candleWindow, setCandleWindow] = useState<'all' | 30 | 15>('all');
  const [candleOffset, setCandleOffset] = useState<number>(0);

  // Network graph interactive drag + pan/zoom + selection
  const [selectedNetNode, setSelectedNetNode] = useState<string | null>(null);
  const [netNodePos, setNetNodePos] = useState<Record<string, { x: number; y: number }>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const netSvgRef = useRef<SVGSVGElement | null>(null);

  // Map (Choropleth + DDoS) interactive pan & zoom + vector filter
  const [mapTransform, setMapTransform] = useState<{ scale: number; x: number; y: number }>({
    scale: 1,
    x: 0,
    y: 0,
  });
  const [isPanningMap, setIsPanningMap] = useState(false);
  const panStartRef = useRef<{ clientX: number; clientY: number; origX: number; origY: number } | null>(null);
  const [ddosPlaying, setDdosPlaying] = useState(true);
  const [ddosVectorFilter, setDdosVectorFilter] = useState<string | null>(null);
  const [hoveredGeoInfo, setHoveredGeoInfo] = useState<string | null>(null);
  const [timeMetricFilter, setTimeMetricFilter] = useState<'all' | 'distance' | 'speed' | 'accel'>('all');
  const [timeDualAxis, setTimeDualAxis] = useState<boolean>(true);

  const payload: ChartPayload | null = useMemo(() => parseChartJsonSafe(config), [config]);
  const isDark = theme === 'dark';

  const hasRenderableData = Boolean(
    payload &&
      (Array.isArray(payload.data) ||
        Array.isArray(payload.values) ||
        Array.isArray(payload.matrix) ||
        Array.isArray(payload.nodes) ||
        Array.isArray(payload.attacks) ||
        Array.isArray(payload.arcs) ||
        Array.isArray(payload.functions) ||
        Array.isArray(payload.vectors) ||
        Array.isArray(payload.points) ||
        Array.isArray(payload.bounds) ||
        Array.isArray(payload.integralBounds) ||
        Array.isArray(payload.phases) ||
        Array.isArray(payload.objects) ||
        Array.isArray(payload.array) ||
        Array.isArray((payload as any).complexities) ||
        Array.isArray((payload as any).steps) ||
        Boolean((payload as any).flowchart) ||
        typeof (payload as any).nMax === 'number' ||
        payload.algorithm ||
        payload.algo ||
        payload.expression ||
        payload.zExpression ||
        payload.formula ||
        payload.equation ||
        payload.tree ||
        Array.isArray(payload.datasets) ||
        Array.isArray(payload.categories) ||
        Array.isArray(payload.indicators))
  );

  // Automatic single-shot recovery retry when chart JSON fails to render after streaming ends
  useEffect(() => {
    setIsRetryingChart(false);
  }, [config]);

  useEffect(() => {
    if (
      (!payload || !hasRenderableData) &&
      !isStreaming &&
      onRetryChart &&
      config.trim().length > 0 &&
      !autoRetriedConfigsRef.current.has(config)
    ) {
      autoRetriedConfigsRef.current.add(config);
      setIsRetryingChart(true);
      onRetryChart(config);
    }
  }, [payload, hasRenderableData, isStreaming, onRetryChart, config]);

  const chartType: UniversalChartType = useMemo(
    () => (payload ? normalizeChartType(payload.type, payload) : 'bar'),
    [payload]
  );

  const effectiveChartType: UniversalChartType = activePlotOverride || displayTypeOverride || chartType;

  const radarNorm = useMemo(
    () => (effectiveChartType === 'radar' && payload ? normalizeRadarData(payload) : null),
    [effectiveChartType, payload]
  );

  const mathPoints = useMemo(() => normalizeMathPoints(payload), [payload]);

  // Reset per-chart interaction state when config string changes
  useEffect(() => {
    setSelectedInfo(null);
    setPinnedLabel(null);
    setActivePieIdx(null);
    setSunburstFocusName(null);
    setHoveredSunburst(null);
    setHoveredTreemapIdx(null);
    setHoveredHeatCell(null);
    setHoveredSankeyKey(null);
    setHoveredIdx(null);
    setCandleWindow('all');
    setCandleOffset(0);
    setSelectedNetNode(null);
    setNetNodePos({});
    setMapTransform({ scale: 1, x: 0, y: 0 });
    setDdosVectorFilter(null);
    setHoveredGeoInfo(null);
    setHiddenSeries({});
    setDisplayTypeOverride(null);
    setSortAlgorithm('none');
    setTimeMetricFilter('all');
    setTimeDualAxis(true);
    setAnimatingParam(null);
    setNewFuncExpr('');
    setActivePlotOverride(null);
    setEquationDrawerOpen(defaultEquationDrawerOpen);

    const domainFromPayload = payload?.xRange || payload?.domain;
    if (
      Array.isArray(domainFromPayload) &&
      domainFromPayload.length >= 2 &&
      Number.isFinite(Number(domainFromPayload[0])) &&
      Number.isFinite(Number(domainFromPayload[1])) &&
      Number(domainFromPayload[1]) > Number(domainFromPayload[0])
    ) {
      setCustomDomain([Number(domainFromPayload[0]), Number(domainFromPayload[1])]);
    } else {
      setCustomDomain(chartType === 'surface_3d' ? [-4, 4] : [-6, 6]);
    }

    const is3dDefault =
      NATIVE_3D_TYPES.has(chartType) || payload?.defaultView === '3d';
    setViewMode(is3dDefault ? '3d' : '2d');

    // Initialize math functions, vectors & parameter sliders
    const fns = normalizeFunctions2D(payload);
    // Provide clean defaults if user requested pure coordinate system without expressions
    if (
      fns.length === 0 &&
      chartType === 'surface_3d'
    ) {
      fns.push({
        id: 'fn-default-3d',
        expr: 'a*(x^2) + b*(y^2)',
        label: 'z = a·x² + b·y²',
        color: '#2563eb',
        visible: true,
      });
    } else if (
      fns.length === 0 &&
      chartType === 'integral'
    ) {
      fns.push({
        id: 'fn-default-integral',
        expr: 'x^2',
        label: 'y = x²',
        color: '#2563eb',
        visible: true,
      });
    } else if (
      fns.length === 0 &&
      chartType === 'coordinate_2d' &&
      (!payload?.vectors || payload.vectors.length === 0) &&
      (!payload?.points || payload.points.length === 0)
    ) {
      fns.push({
        id: 'fn-default-2d',
        expr: 'a*x^2 + b*x + c',
        label: 'y = a·x² + b·x + c',
        color: '#2563eb',
        visible: true,
      });
    }
    setEditableFunctions(fns);

    // Initialize Integral / Calculus controls
    const rawBounds = payload?.integralBounds || payload?.bounds;
    const hasBounds =
      Array.isArray(rawBounds) &&
      rawBounds.length >= 2 &&
      Number.isFinite(Number(rawBounds[0])) &&
      Number.isFinite(Number(rawBounds[1]));
    const isIntegralChart = chartType === 'integral' || hasBounds;
    setIntegralEnabled(isIntegralChart);
    if (hasBounds) {
      const b0 = Number(rawBounds![0]);
      const b1 = Number(rawBounds![1]);
      setIntegralBounds([b0, b1]);
      setTangentX(Number(((b0 + b1) / 2).toFixed(2)));
    } else {
      setIntegralBounds([0, 2]);
      setTangentX(1);
    }
    if (payload?.slices && Number.isFinite(Number(payload.slices))) {
      setRiemannSlices(Math.max(1, Math.min(60, Math.round(Number(payload.slices)))));
    } else {
      setRiemannSlices(12);
    }
    setRiemannMethod(payload?.riemannMethod || 'midpoint');
    if (payload?.derivativeX !== undefined && Number.isFinite(Number(payload.derivativeX))) {
      setShowTangentLine(true);
      setTangentX(Number(payload.derivativeX));
    } else {
      setShowTangentLine(false);
    }

    const vecs = normalizeVectors(payload);
    if (
      vecs.length === 0 &&
      (chartType === 'vector_2d' || chartType === 'vector_3d')
    ) {
      vecs.push(
        {
          id: 'v-0',
          label: 'u',
          origin: [0, 0, 0],
          components: chartType === 'vector_3d' ? [2, 1, 2] : [3, 2, 0],
          color: '#2563eb',
          visible: true,
        },
        {
          id: 'v-1',
          label: 'v',
          origin: [0, 0, 0],
          components: chartType === 'vector_3d' ? [-1, 3, 1.5] : [1, 3, 0],
          color: '#059669',
          visible: true,
        }
      );
    }
    setEditableVectors(vecs);
    setShowVecSum(Boolean(payload?.showVectorSum ?? vecs.length >= 2));
    setShowVecCross(Boolean(payload?.showCrossProduct && chartType === 'vector_3d'));

    const inferredParams = inferMathParameters(payload, fns);
    setMathParams(inferredParams);
    const initialMap: Record<string, number> = {};
    inferredParams.forEach((p) => {
      initialMap[p.name] = p.value;
    });
    setParamValues(initialMap);
    setShowParamPanel(
      !defaultEquationDrawerOpen &&
        (inferredParams.length > 0 || fns.length > 0 || vecs.length > 0 || MATH_COORD_TYPES.has(chartType))
    );
  }, [config, chartType, payload, defaultEquationDrawerOpen]);

  // Smooth parameter oscillation when animating a math slider
  useEffect(() => {
    if (!animatingParam) return;
    const spec = mathParams.find((p) => p.name === animatingParam);
    if (!spec) return;
    let dir = 1;
    const timer = window.setInterval(() => {
      setParamValues((prev) => {
        const cur = prev[animatingParam] ?? spec.value;
        const delta = Math.max(0.02, (spec.max - spec.min) / 60) * dir;
        let next = cur + delta;
        if (next >= spec.max) {
          next = spec.max;
          dir = -1;
        } else if (next <= spec.min) {
          next = spec.min;
          dir = 1;
        }
        return { ...prev, [animatingParam]: Math.round(next * 100) / 100 };
      });
    }, 45);
    return () => window.clearInterval(timer);
  }, [animatingParam, mathParams]);

  const kinematicsData = useMemo(() => {
    if (!payload) return null;
    if (
      chartType === 'time_graph' ||
      effectiveChartType === 'time_graph' ||
      Array.isArray(payload.objects) ||
      Array.isArray(payload.phases)
    ) {
      return buildKinematicsTimeGraph(payload);
    }
    return null;
  }, [chartType, effectiveChartType, payload]);

  const rawData = useMemo(() => {
    if (kinematicsData && kinematicsData.rows.length > 0) return kinematicsData.rows;
    return Array.isArray(payload?.data) ? payload!.data! : [];
  }, [kinematicsData, payload]);
  const xAxis = useMemo(() => {
    if (kinematicsData && kinematicsData.xKey) return kinematicsData.xKey;
    if (payload?.xAxis) return payload.xAxis;
    if (rawData.length > 0 && rawData[0]) {
      if (rawData[0].name !== undefined) return 'name';
      if (rawData[0].date !== undefined) return 'date';
      if (rawData[0].time !== undefined) return 'time';
      if (rawData[0].label !== undefined) return 'label';
    }
    return 'name';
  }, [kinematicsData, payload?.xAxis, rawData]);
  const yAxis = payload?.yAxis || 'value';
  const activeSeries: string[] = useMemo(() => {
    if (kinematicsData && kinematicsData.series.length > 0) {
      return kinematicsData.series;
    }
    if (Array.isArray(payload?.series) && payload!.series!.length > 0) {
      return payload!.series!;
    }
    if (rawData.length > 0 && rawData[0]) {
      if (payload?.yAxis && rawData[0][payload.yAxis] !== undefined) return [payload.yAxis];
      if (rawData[0][yAxis] === undefined && rawData[0].close !== undefined) {
        return ['close'];
      }
      if (rawData[0][yAxis] === undefined && rawData[0].c !== undefined) {
        return ['c'];
      }
    }
    return [yAxis];
  }, [kinematicsData, payload, yAxis, rawData]);

  // Algorithmically sorted data (QuickSort / MergeSort / HeapSort / Volatility)
  const sortResult = useMemo(() => {
    if (effectiveChartType === 'radar' && radarNorm && radarNorm.rows.length > 0) {
      return applyChartSortAlgorithm(
        radarNorm.rows,
        sortAlgorithm,
        radarNorm.xKey,
        radarNorm.series[0] || yAxis
      );
    }
    return applyChartSortAlgorithm(rawData, sortAlgorithm, xAxis, activeSeries[0] || yAxis);
  }, [effectiveChartType, radarNorm, rawData, sortAlgorithm, xAxis, activeSeries, yAxis]);
  const sortedData = sortResult.rows;

  const compatibleDisplayTypes = useMemo(
    () => getCompatibleChartDisplayTypes(chartType, payload),
    [chartType, payload]
  );

  const hasOhlcFields = useMemo(
    () =>
      effectiveChartType === 'candlestick' ||
      effectiveChartType === 'ohlc' ||
      rawData.some(
        (r) =>
          r &&
          (r.open !== undefined || r.o !== undefined) &&
          (r.close !== undefined || r.c !== undefined) &&
          (r.high !== undefined || r.h !== undefined)
      ),
    [effectiveChartType, rawData]
  );

  const vectorSummary = useMemo(() => analyzeVectors(editableVectors), [editableVectors]);

  // Unified tabular rows for CSV export
  const tabularView = useMemo(() => {
    if (!payload || !hasRenderableData) return { columns: [] as string[], rows: [] as Record<string, any>[] };

    if (effectiveChartType === 'histogram') {
      const bins = buildHistogramData(payload);
      return {
        columns: ['name', 'range', 'count'],
        rows: bins.map((b) => ({
          name: b.name,
          range: `${formatChartNumber(b.x0)}–${formatChartNumber(b.x1)}`,
          count: b.count,
        })),
      };
    }
    if (effectiveChartType === 'boxplot') {
      const stats = computeBoxStats(rawData);
      return {
        columns: ['name', 'min', 'q1', 'median', 'q3', 'max'],
        rows: stats.map((s) => ({
          name: s.name,
          min: s.min,
          q1: s.q1,
          median: s.median,
          q3: s.q3,
          max: s.max,
        })),
      };
    }
    if (effectiveChartType === 'waterfall') {
      const steps = buildWaterfallData(rawData, xAxis, activeSeries[0]);
      return {
        columns: ['name', 'delta', 'start', 'end'],
        rows: steps.map((s) => ({ name: s.name, delta: s.delta, start: s.start, end: s.end })),
      };
    }
    if (effectiveChartType === 'ddos_map') {
      const arcs = computeDdosMapLayout(payload, 680, 340).arcs;
      return {
        columns: ['source', 'target', 'type', 'volume'],
        rows: arcs.map((a) => ({
          source: a.sourceName,
          target: a.targetName,
          type: a.attackType,
          volume: a.volume,
        })),
      };
    }
    if (effectiveChartType === 'heatmap' && Array.isArray(payload.matrix)) {
      const m = payload.matrix;
      const xl = Array.isArray(payload.xLabels) ? payload.xLabels : (m[0] || []).map((_, j) => `C${j + 1}`);
      const yl = Array.isArray(payload.yLabels) ? payload.yLabels : m.map((_, i) => `R${i + 1}`);
      const rows = m.map((row, rIdx) => {
        const obj: Record<string, any> = { row: yl[rIdx] ?? `R${rIdx + 1}` };
        xl.forEach((colName, cIdx) => {
          obj[colName] = Number(row?.[cIdx] ?? 0);
        });
        return obj;
      });
      return { columns: ['row', ...xl], rows };
    }
    if (MATH_COORD_TYPES.has(effectiveChartType)) {
      if (editableVectors.length > 0 && editableFunctions.length === 0) {
        return {
          columns: ['vector', 'vx', 'vy', 'vz', 'length'],
          rows: editableVectors.map((v) => ({
            vector: v.label,
            vx: v.components[0],
            vy: v.components[1],
            vz: v.components[2],
            length: Math.round(Math.hypot(v.components[0], v.components[1], v.components[2]) * 1000) / 1000,
          })),
        };
      }
      if (editableFunctions.length > 0) {
        const fn0 = editableFunctions[0];
        const xr = payload.xRange || payload.domain || [-5, 5];
        const step = (xr[1] - xr[0]) / 20 || 0.5;
        const evalFn = compileMathExpression(fn0.expr);
        const rows: Record<string, any>[] = [];
        for (let i = 0; i <= 20; i++) {
          const xVal = Math.round((xr[0] + i * step) * 1000) / 1000;
          const outVal =
            effectiveChartType === 'surface_3d'
              ? evalFn({ ...paramValues, x: xVal, y: 0 })
              : evalFn({ ...paramValues, x: xVal });
          rows.push({
            x: xVal,
            [effectiveChartType === 'surface_3d' ? 'z(x,0)' : 'y']: Number.isFinite(outVal)
              ? Math.round(outVal * 10000) / 10000
              : 'NaN',
          });
        }
        return { columns: ['x', effectiveChartType === 'surface_3d' ? 'z(x,0)' : 'y'], rows };
      }
    }
    if (effectiveChartType === 'radar' && radarNorm && radarNorm.rows.length > 0) {
      return {
        columns: [radarNorm.xKey, ...radarNorm.series],
        rows: radarNorm.rows,
      };
    }
    if (rawData.length > 0) {
      const colSet = new Set<string>();
      rawData.slice(0, 40).forEach((row) => {
        if (row && typeof row === 'object') {
          Object.keys(row).forEach((k) => {
            if (typeof row[k] !== 'object' || row[k] === null) colSet.add(k);
          });
        }
      });
      const columns = Array.from(colSet).slice(0, 10);
      return { columns, rows: sortedData };
    }
  return { columns: [] as string[], rows: [] as Record<string, any>[] };
  }, [payload, hasRenderableData, effectiveChartType, rawData, sortedData, xAxis, activeSeries, editableVectors, editableFunctions, paramValues, radarNorm]);

  if (!payload || !hasRenderableData) {
    return (
      <div
        className={`my-4 p-4 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
          isDark
            ? 'border-zinc-800 bg-zinc-900/60 text-zinc-300'
            : 'border-zinc-200 bg-zinc-50 text-zinc-700'
        }`}
      >
        <span>
          {isStreaming || isRetryingChart
            ? 'Đang tạo và khôi phục dữ liệu biểu đồ...'
            : 'Không thể hiển thị biểu đồ từ dữ liệu hiện tại.'}
        </span>
        {!isStreaming && onRetryChart && (
          <button
            type="button"
            onClick={() => {
              setIsRetryingChart(true);
              onRetryChart(config);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors ${
              isDark
                ? 'border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                : 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <RotateCcw size={12} />
            <span>Thử lại biểu đồ</span>
          </button>
        )}
      </div>
    );
  }

  const data = sortedData;
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const axisStroke = isDark ? '#94a3b8' : '#64748b';
  const textColor = isDark ? '#e2e8f0' : '#0f172a';
  const mutedText = isDark ? '#94a3b8' : '#64748b';
  const surfaceBg = isDark ? '#0f172a' : '#ffffff';

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: isDark ? '#09090b' : '#ffffff',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)'}`,
    borderRadius: '8px',
    fontSize: '12px',
    color: textColor,
    fontVariantNumeric: 'tabular-nums',
  };

  const toggleSeriesKey = (key: string, allKeys: string[]) => {
    setHiddenSeries((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const visibleCount = allKeys.filter((k) => !next[k]).length;
      if (visibleCount === 0) {
        return prev; // keep at least one visible series
      }
      return next;
    });
  };

  const handleLegendClick = (entry: any, allKeys: string[]) => {
    const key = String(entry?.dataKey || entry?.value || '').trim();
    if (!key || !allKeys.includes(key)) return;
    toggleSeriesKey(key, allKeys);
  };

  const supports3D = SUPPORTS_3D_VIEW_TYPES.has(effectiveChartType);
  const sortableRowCount =
    effectiveChartType === 'radar' && radarNorm ? radarNorm.rows.length : rawData.length;
  const canSort =
    viewMode === '2d' &&
    sortableRowCount >= 2 &&
    (effectiveChartType === 'bar' ||
      effectiveChartType === 'grouped_bar' ||
      effectiveChartType === 'stacked_bar' ||
      effectiveChartType === 'horizontal_bar' ||
      effectiveChartType === 'line' ||
      effectiveChartType === 'time_graph' ||
      effectiveChartType === 'area' ||
      effectiveChartType === 'stacked_area' ||
      effectiveChartType === 'combo' ||
      effectiveChartType === 'radar' ||
      effectiveChartType === 'waterfall' ||
      effectiveChartType === 'pie' ||
      effectiveChartType === 'donut' ||
      effectiveChartType === 'funnel' ||
      effectiveChartType === 'pictogram' ||
      effectiveChartType === 'candlestick' ||
      effectiveChartType === 'ohlc');

  const canBrush =
    viewMode === '2d' &&
    data.length >= 6 &&
    (effectiveChartType === 'bar' ||
      effectiveChartType === 'grouped_bar' ||
      effectiveChartType === 'stacked_bar' ||
      effectiveChartType === 'line' ||
      effectiveChartType === 'time_graph' ||
      effectiveChartType === 'area' ||
      effectiveChartType === 'stacked_area' ||
      effectiveChartType === 'combo');

  const canShowTable = tabularView.columns.length > 0 && tabularView.rows.length > 0;
  const isMathOrVectorChart =
    MATH_COORD_TYPES.has(effectiveChartType) ||
    editableFunctions.length > 0 ||
    editableVectors.length > 0;

  const syncFunctionsAndParams = (nextList: MathFunctionSpec[]) => {
    setEditableFunctions(nextList);
    const usedIdents = new Set<string>();
    nextList.forEach((fn) => {
      [fn.expr, fn.xExpr, fn.yExpr, fn.zExpr].forEach((s) => {
        if (!s) return;
        extractExpressionIdentifiers(s).forEach((id) => usedIdents.add(id));
      });
    });
    const allInferred = inferMathParameters(payload, nextList);
    const filtered =
      nextList.length > 0 ? allInferred.filter((p) => usedIdents.has(p.name)) : allInferred;
    setMathParams(filtered);
    setParamValues((prev) => {
      const merged: Record<string, number> = {};
      filtered.forEach((p) => {
        merged[p.name] = prev[p.name] !== undefined ? prev[p.name] : p.value;
      });
      return merged;
    });
  };

  const ensureMathPlotActive = (preferred?: 'coordinate_2d' | 'surface_3d') => {
    if (!MATH_COORD_TYPES.has(effectiveChartType)) {
      const target = preferred || (viewMode === '3d' ? 'surface_3d' : 'coordinate_2d');
      setActivePlotOverride(target);
      setViewMode(target === 'surface_3d' ? '3d' : '2d');
    }
  };

  const handleOpenEquationDrawer = () => {
    setEquationDrawerOpen((open) => {
      const next = !open;
      if (next && editableFunctions.length === 0 && editableVectors.length === 0) {
        const defaultFn: MathFunctionSpec = {
          id: `fn-${Date.now()}`,
          expr: 'a*x^2 + b*x + c',
          label: 'y = ax² + bx + c',
          color: PALETTE[0],
          visible: true,
        };
        syncFunctionsAndParams([defaultFn]);
        ensureMathPlotActive('coordinate_2d');
      }
      return next;
    });
  };

  const applyEquationPreset = (
    presetId: 'parabola' | 'cubic' | 'trig' | 'integral' | 'surface' | 'saddle' | 'vector2d'
  ) => {
    setAnimatingParam(null);
    if (presetId === 'integral') {
      setActivePlotOverride('integral');
      setViewMode('2d');
      setCustomDomain([-2, 5]);
      setIntegralEnabled(true);
      setIntegralBounds([0, 3]);
      setRiemannSlices(12);
      setRiemannMethod('midpoint');
      syncFunctionsAndParams([
        { id: 'fn-integral', expr: '0.35*x^2 + 0.5', label: 'y = 0.35x² + 0.5', color: PALETTE[0], visible: true },
      ]);
      setParamValues({});
    } else if (presetId === 'parabola') {
      setActivePlotOverride('coordinate_2d');
      setViewMode('2d');
      setCustomDomain([-6, 6]);
      setIntegralEnabled(false);
      syncFunctionsAndParams([
        { id: 'fn-parabola', expr: 'a*x^2 + b*x + c', label: 'y = ax² + bx + c', color: PALETTE[0], visible: true },
      ]);
      setParamValues({ a: 1, b: 0, c: 0 });
    } else if (presetId === 'cubic') {
      setActivePlotOverride('coordinate_2d');
      setViewMode('2d');
      setCustomDomain([-5, 5]);
      setIntegralEnabled(false);
      syncFunctionsAndParams([
        { id: 'fn-cubic', expr: 'a*x^3 + b*x^2 + c*x + d', label: 'y = ax³ + bx² + cx + d', color: PALETTE[1], visible: true },
      ]);
      setParamValues({ a: 1, b: 0, c: -3, d: 0 });
    } else if (presetId === 'trig') {
      setActivePlotOverride('coordinate_2d');
      setViewMode('2d');
      setCustomDomain([-7, 7]);
      setIntegralEnabled(false);
      syncFunctionsAndParams([
        { id: 'fn-trig', expr: 'a*sin(b*x + c) + d', label: 'y = a·sin(bx + c) + d', color: PALETTE[4], visible: true },
      ]);
      setParamValues({ a: 2, b: 1, c: 0, d: 0 });
    } else if (presetId === 'surface') {
      setActivePlotOverride('surface_3d');
      setViewMode('3d');
      setCustomDomain([-4, 4]);
      syncFunctionsAndParams([
        { id: 'fn-surface', expr: 'a*(x^2) + b*(y^2)', label: 'z = ax² + by²', color: PALETTE[0], visible: true },
      ]);
      setParamValues({ a: 0.4, b: 0.4 });
    } else if (presetId === 'saddle') {
      setActivePlotOverride('surface_3d');
      setViewMode('3d');
      setCustomDomain([-4, 4]);
      syncFunctionsAndParams([
        { id: 'fn-saddle', expr: 'a*(x^2) - b*(y^2)', label: 'z = ax² - by²', color: PALETTE[3], visible: true },
      ]);
      setParamValues({ a: 0.4, b: 0.4 });
    } else if (presetId === 'vector2d') {
      setActivePlotOverride('vector_2d');
      setViewMode('2d');
      setCustomDomain([-6, 6]);
      setIntegralEnabled(false);
      setEditableFunctions([]);
      setMathParams([]);
      setEditableVectors([
        { id: 'v-0', label: 'u', origin: [0, 0, 0], components: [3, 2, 0], color: PALETTE[0], visible: true },
        { id: 'v-1', label: 'v', origin: [0, 0, 0], components: [1, 3, 0], color: PALETTE[1], visible: true },
      ]);
      setShowVecSum(true);
    }
  };

  const handleExportSvg = () => {
    const svg = containerRef.current?.querySelector('svg');
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    if (!clone.getAttribute('xmlns')) {
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(payload.title || effectiveChartType).toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportCsv = () => {
    if (!canShowTable) return;
    const escapeCell = (val: unknown) => {
      const s = String(val ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = tabularView.columns.map(escapeCell).join(',');
    const lines = tabularView.rows.map((row) =>
      tabularView.columns.map((c) => escapeCell(row?.[c])).join(',')
    );
    const csv = '\uFEFF' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(payload.title || effectiveChartType).toLowerCase().replace(/[^a-z0-9]+/gi, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleMapWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.18 : 0.85;
    setMapTransform((prev) => ({
      ...prev,
      scale: Math.max(1, Math.min(4.5, Number((prev.scale * delta).toFixed(2)))),
    }));
  };

  const handleMapPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement)?.closest('[data-no-pan="true"]')) return;
    setIsPanningMap(true);
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      origX: mapTransform.x,
      origY: mapTransform.y,
    };
  };

  const handleMapPointerMove = (e: React.PointerEvent) => {
    if (!isPanningMap || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.clientX;
    const dy = e.clientY - panStartRef.current.clientY;
    setMapTransform((prev) => ({
      ...prev,
      x: panStartRef.current!.origX + dx,
      y: panStartRef.current!.origY + dy,
    }));
  };

  const handleMapPointerUp = () => {
    setIsPanningMap(false);
    panStartRef.current = null;
  };

  const renderZoomControls = (compactLabel?: string) => (
    <div className="flex items-center gap-1 shrink-0">
      {compactLabel && (
        <span className="text-[10px] font-mono tabular-nums text-text-secondary mr-1">
          {compactLabel}
        </span>
      )}
      <button
        type="button"
        onClick={() =>
          setMapTransform((p) => ({ ...p, scale: Math.min(4.5, Number((p.scale * 1.25).toFixed(2))) }))
        }
        className="p-1 rounded-md border border-border-color text-text-secondary hover:text-text-primary transition-colors"
        title="Phóng to"
        aria-label="Phóng to"
      >
        <ZoomIn size={12} />
      </button>
      <button
        type="button"
        onClick={() =>
          setMapTransform((p) => ({ ...p, scale: Math.max(1, Number((p.scale / 1.25).toFixed(2))) }))
        }
        className="p-1 rounded-md border border-border-color text-text-secondary hover:text-text-primary transition-colors"
        title="Thu nhỏ"
        aria-label="Thu nhỏ"
      >
        <ZoomOut size={12} />
      </button>
      <button
        type="button"
        onClick={() => setMapTransform({ scale: 1, x: 0, y: 0 })}
        className="p-1 rounded-md border border-border-color text-text-secondary hover:text-text-primary transition-colors"
        title="Đặt lại khung nhìn"
        aria-label="Đặt lại khung nhìn"
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );

  const renderChartBody = () => {
    if (viewMode === '3d') {
      return (
        <ThreeChartViewport
          chartType={effectiveChartType}
          payload={payload}
          isDark={isDark}
          hiddenSeries={hiddenSeries}
          functions={editableFunctions}
          vectors={editableVectors}
          points={mathPoints}
          mathParams={paramValues}
          xRange={customDomain}
          yRange={effectiveChartType === 'surface_3d' ? customDomain : payload.yRange || customDomain}
          showVectorSum={showVecSum}
          showCrossProduct={showVecCross}
          isFullscreen={isFullscreen}
        />
      );
    }

    if (
      effectiveChartType === 'coordinate_2d' ||
      effectiveChartType === 'vector_2d' ||
      effectiveChartType === 'integral' ||
      effectiveChartType === 'surface_3d' ||
      effectiveChartType === 'vector_3d' ||
      effectiveChartType === 'parametric_3d'
    ) {
      return (
        <Math2DCoordinateView
          isDark={isDark}
          functions={editableFunctions}
          vectors={editableVectors}
          points={mathPoints}
          params={paramValues}
          initialXRange={customDomain}
          initialYRange={payload.yRange}
          xLabel={payload.xLabel}
          yLabel={payload.yLabel}
          showVectorSum={showVecSum}
          integralSpec={
            integralEnabled || effectiveChartType === 'integral'
              ? {
                  enabled: true,
                  bounds: integralBounds,
                  slices: riemannSlices,
                  method: riemannMethod,
                  showTangent: showTangentLine,
                  tangentX,
                }
              : undefined
          }
          onVectorChange={(idx, nextComp) => {
            setEditableVectors((prev) =>
              prev.map((vec, i) => (i === idx ? { ...vec, components: nextComp } : vec))
            );
          }}
        />
      );
    }

    if (effectiveChartType === 'algorithm_trace') {
      return (
        <AlgorithmTraceView
          payload={payload}
          isDark={isDark}
          isFullscreen={isFullscreen}
          onSelectInfo={setSelectedInfo}
        />
      );
    }

    if (effectiveChartType === 'big_o') {
      return (
        <BigOComplexityView
          payload={payload}
          isDark={isDark}
          isFullscreen={isFullscreen}
          onSelectInfo={setSelectedInfo}
        />
      );
    }

    if (effectiveChartType === 'flowchart') {
      return (
        <FlowchartView
          payload={payload}
          isDark={isDark}
          isFullscreen={isFullscreen}
          onSelectInfo={setSelectedInfo}
        />
      );
    }

    // 1. BAR / GROUPED BAR / STACKED BAR / HISTOGRAM
    if (
      effectiveChartType === 'bar' ||
      effectiveChartType === 'grouped_bar' ||
      effectiveChartType === 'stacked_bar' ||
      effectiveChartType === 'histogram'
    ) {
      const isStacked = effectiveChartType === 'stacked_bar' || Boolean(payload.stacked);
      const barData = effectiveChartType === 'histogram' ? buildHistogramData(payload) : data;
      const keys = effectiveChartType === 'histogram' ? ['count'] : activeSeries;
      const barX = effectiveChartType === 'histogram' ? 'name' : xAxis;

      const chartBoxH = isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[380px]' : 'h-[280px]';
      return (
        <div className={`${chartBoxH} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barData}
              barCategoryGap={effectiveChartType === 'histogram' ? 1 : '18%'}
              onClick={(d: any) => {
                const p = d?.activePayload?.[0]?.payload;
                if (p) {
                  const label = String(p[barX] ?? '');
                  setPinnedLabel((prev) => (prev === label ? null : label));
                  setSelectedInfo(
                    `${label}: ${keys
                      .filter((k) => !hiddenSeries[k])
                      .map((k) => `${k} = ${formatChartNumber(Number(p[k] ?? 0))}`)
                      .join(' · ')}`
                  );
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey={barX} stroke={axisStroke} fontSize={11} />
              <YAxis stroke={axisStroke} fontSize={11} />
              <Tooltip cursor={{ fill: isDark ? '#ffffff0d' : '#00000008' }} contentStyle={tooltipStyle} />
              {(keys.length > 1 || effectiveChartType === 'histogram') && (
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '6px', cursor: 'pointer' }}
                  onClick={(entry) => handleLegendClick(entry, keys)}
                />
              )}
              {pinnedLabel && <ReferenceLine x={pinnedLabel} stroke={axisStroke} strokeDasharray="3 3" />}
              {keys.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  hide={Boolean(hiddenSeries[key])}
                  stackId={isStacked ? 'stack' : undefined}
                  fill={PALETTE[idx % PALETTE.length]}
                  radius={isStacked ? [0, 0, 0, 0] : [3, 3, 0, 0]}
                  animationDuration={350}
                />
              ))}
              {showBrush && barData.length >= 4 && (
                <Brush dataKey={barX} height={22} stroke={axisStroke} fill={isDark ? '#18181b' : '#f8fafc'} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 2. HORIZONTAL BAR
    if (effectiveChartType === 'horizontal_bar') {
      const isStacked = Boolean(payload.stacked);
      const chartHeight = Math.max(240, Math.min(440, data.length * 36 + 56));
      return (
        <div style={{ height: chartHeight }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 6, right: 20, left: 10, bottom: 6 }}
              onClick={(d: any) => {
                const p = d?.activePayload?.[0]?.payload;
                if (p) {
                  setSelectedInfo(
                    `${p[xAxis] ?? ''}: ${activeSeries
                      .filter((k) => !hiddenSeries[k])
                      .map((k) => `${k} = ${formatChartNumber(Number(p[k] ?? 0))}`)
                      .join(' · ')}`
                  );
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis type="number" stroke={axisStroke} fontSize={11} />
              <YAxis type="category" dataKey={xAxis} stroke={axisStroke} fontSize={11} width={92} />
              <Tooltip cursor={{ fill: isDark ? '#ffffff0d' : '#00000008' }} contentStyle={tooltipStyle} />
              {activeSeries.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '6px', cursor: 'pointer' }}
                  onClick={(entry) => handleLegendClick(entry, activeSeries)}
                />
              )}
              {activeSeries.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  hide={Boolean(hiddenSeries[key])}
                  stackId={isStacked ? 'h_stack' : undefined}
                  fill={PALETTE[idx % PALETTE.length]}
                  radius={isStacked ? [0, 0, 0, 0] : [0, 3, 3, 0]}
                  animationDuration={350}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 3. LINE
    if (effectiveChartType === 'line') {
      return (
        <div className={`${isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[380px]' : 'h-[280px]'} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              onClick={(d: any) => {
                const p = d?.activePayload?.[0]?.payload;
                if (p) {
                  const label = String(p[xAxis] ?? '');
                  setPinnedLabel((prev) => (prev === label ? null : label));
                  setSelectedInfo(
                    `${label}: ${activeSeries
                      .filter((k) => !hiddenSeries[k])
                      .map((k) => `${k} = ${formatChartNumber(Number(p[k] ?? 0))}`)
                      .join(' · ')}`
                  );
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey={xAxis} stroke={axisStroke} fontSize={11} />
              <YAxis stroke={axisStroke} fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              {activeSeries.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '6px', cursor: 'pointer' }}
                  onClick={(entry) => handleLegendClick(entry, activeSeries)}
                />
              )}
              {pinnedLabel && <ReferenceLine x={pinnedLabel} stroke={axisStroke} strokeDasharray="3 3" />}
              {activeSeries.map((key, idx) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  hide={Boolean(hiddenSeries[key])}
                  stroke={PALETTE[idx % PALETTE.length]}
                  strokeWidth={2.2}
                  dot={{ fill: PALETTE[idx % PALETTE.length], r: 3 }}
                  activeDot={{ r: 5 }}
                  animationDuration={350}
                />
              ))}
              {showBrush && data.length >= 4 && (
                <Brush dataKey={xAxis} height={22} stroke={axisStroke} fill={isDark ? '#18181b' : '#f8fafc'} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 3B. TIME GRAPH (Kinematics: Time / Speed / Distance & Multi-Series)
    if (effectiveChartType === 'time_graph' && kinematicsData) {
      const distSet = new Set(kinematicsData.distanceSeries);
      const spdSet = new Set(kinematicsData.speedSeries);
      const accSet = new Set(kinematicsData.accelSeries);

      const filteredSeries = activeSeries.filter((k) => {
        if (timeMetricFilter === 'distance') return distSet.has(k);
        if (timeMetricFilter === 'speed') return spdSet.has(k);
        if (timeMetricFilter === 'accel') return accSet.has(k);
        return true;
      });
      const displaySeries = filteredSeries.length > 0 ? filteredSeries : activeSeries;

      const hasLeftGroup = displaySeries.some((k) => !hiddenSeries[k] && (distSet.has(k) || (!spdSet.has(k) && !accSet.has(k))));
      const hasRightGroup = displaySeries.some((k) => !hiddenSeries[k] && (spdSet.has(k) || accSet.has(k)));
      const useDual = timeDualAxis && hasLeftGroup && hasRightGroup;

      const isNumericX =
        sortAlgorithm === 'none' &&
        data.length >= 2 &&
        data.every((r) => typeof r?.[xAxis] === 'number' && Number.isFinite(r[xAxis]));

      const computeCalibratedDomain = (keys: string[]): [number | 'auto', 'auto'] => {
        const vals: number[] = [];
        data.forEach((row) => {
          keys.forEach((k) => {
            if (hiddenSeries[k]) return;
            const n = Number(row?.[k]);
            if (Number.isFinite(n)) vals.push(n);
          });
        });
        if (vals.length === 0) return ['auto', 'auto'];
        const minV = Math.min(...vals);
        return minV >= 0 ? [0, 'auto'] : ['auto', 'auto'];
      };

      const leftKeys = useDual
        ? displaySeries.filter((k) => !spdSet.has(k) && !accSet.has(k))
        : displaySeries;
      const rightKeys = useDual
        ? displaySeries.filter((k) => spdSet.has(k) || accSet.has(k))
        : [];
      const leftDomain = computeCalibratedDomain(leftKeys);
      const rightDomain = computeCalibratedDomain(rightKeys);

      const leftAxisUnitLabel =
        payload.yLabel ||
        (kinematicsData.distanceSeries.length > 0 && (timeMetricFilter === 'all' || timeMetricFilter === 'distance')
          ? `s (${kinematicsData.distanceUnit})`
          : timeMetricFilter === 'speed'
          ? `v (${kinematicsData.speedUnit})`
          : undefined);
      const rightAxisUnitLabel =
        useDual && kinematicsData.speedSeries.length > 0 ? `v (${kinematicsData.speedUnit})` : undefined;

      return (
        <div className="space-y-2.5">
          {(kinematicsData.hasSpeedAndDistance || kinematicsData.accelSeries.length > 0 || kinematicsData.verifiedPhysicsNote) && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-1">
                {kinematicsData.hasSpeedAndDistance && (
                  <>
                    {(
                      [
                        { id: 'all', label: 'Tất cả', show: true },
                        { id: 'distance', label: `Quãng đường s (${kinematicsData.distanceUnit})`, show: kinematicsData.distanceSeries.length > 0 },
                        { id: 'speed', label: `Vận tốc v (${kinematicsData.speedUnit})`, show: kinematicsData.speedSeries.length > 0 },
                        { id: 'accel', label: 'Gia tốc a', show: kinematicsData.accelSeries.length > 0 },
                      ] as const
                    )
                      .filter((opt) => opt.show)
                      .map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTimeMetricFilter(opt.id)}
                          className={`px-2 py-0.5 rounded border transition-colors ${
                            timeMetricFilter === opt.id
                              ? isDark
                                ? 'border-zinc-200 bg-zinc-100 text-zinc-950 font-medium'
                                : 'border-zinc-900 bg-zinc-900 text-white font-medium'
                              : 'border-border-color text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    {timeMetricFilter === 'all' && (
                      <button
                        type="button"
                        onClick={() => setTimeDualAxis((v) => !v)}
                        className={`px-2 py-0.5 rounded border transition-colors ${
                          timeDualAxis
                            ? 'border-blue-500/60 bg-blue-500/10 text-text-primary'
                            : 'border-border-color text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        2 trục Y
                      </button>
                    )}
                  </>
                )}
              </div>
              {kinematicsData.verifiedPhysicsNote && (
                <span className="font-mono text-[10px] text-text-secondary tabular-nums">
                  {kinematicsData.verifiedPhysicsNote}
                </span>
              )}
            </div>
          )}

          <div className={`${isFullscreen ? 'h-[calc(100dvh-220px)] min-h-[380px]' : 'h-[295px]'} w-full`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 14, right: useDual ? 14 : 10, left: 4, bottom: 16 }}
                onClick={(d: any) => {
                  const p = d?.activePayload?.[0]?.payload;
                  if (p) {
                    const label = String(p[xAxis] ?? '');
                    setPinnedLabel((prev) => (prev === label ? null : label));
                    setSelectedInfo(
                      `t=${label}${isNumericX ? kinematicsData.timeUnit : ''}: ${displaySeries
                        .filter((k) => !hiddenSeries[k])
                        .map((k) => `${k} = ${formatChartNumber(Number(p[k] ?? 0))}`)
                        .join(' · ')}`
                    );
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey={xAxis}
                  type={isNumericX ? 'number' : 'category'}
                  domain={isNumericX ? ['dataMin', 'dataMax'] : undefined}
                  tickFormatter={isNumericX ? (v) => `${formatChartNumber(Number(v))}${kinematicsData.timeUnit}` : undefined}
                  stroke={axisStroke}
                  fontSize={11}
                  label={
                    isNumericX
                      ? {
                          value: payload.xLabel || `t (${kinematicsData.timeUnit})`,
                          position: 'insideBottomRight',
                          offset: -6,
                          fill: axisStroke,
                          fontSize: 10,
                        }
                      : undefined
                  }
                />
                <YAxis
                  yAxisId="left"
                  domain={leftDomain}
                  stroke={axisStroke}
                  fontSize={11}
                  width={54}
                  label={
                    leftAxisUnitLabel
                      ? {
                          value: leftAxisUnitLabel,
                          angle: -90,
                          position: 'insideLeft',
                          fill: axisStroke,
                          fontSize: 10,
                        }
                      : undefined
                  }
                />
                {useDual && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={rightDomain}
                    stroke={axisStroke}
                    fontSize={11}
                    width={54}
                    label={
                      rightAxisUnitLabel
                        ? {
                            value: rightAxisUnitLabel,
                            angle: 90,
                            position: 'insideRight',
                            fill: axisStroke,
                            fontSize: 10,
                          }
                        : undefined
                    }
                  />
                )}
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(lbl) => `t = ${lbl}${isNumericX ? ` ${kinematicsData.timeUnit}` : ''}`}
                />
                {displaySeries.length > 1 && (
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '6px', cursor: 'pointer' }}
                    onClick={(entry) => handleLegendClick(entry, displaySeries)}
                  />
                )}
                {pinnedLabel !== null && (
                  <ReferenceLine
                    yAxisId={hasLeftGroup ? 'left' : 'right'}
                    x={isNumericX ? Number(pinnedLabel) : pinnedLabel}
                    stroke={axisStroke}
                    strokeDasharray="3 3"
                  />
                )}
                {isNumericX &&
                  kinematicsData.meetings.map((m, mIdx) => (
                    <ReferenceLine
                      key={`meet-${mIdx}`}
                      yAxisId={hasLeftGroup ? 'left' : 'right'}
                      x={m.t}
                      stroke="#d97706"
                      strokeDasharray="4 4"
                      label={{
                        value: `Gặp nhau (${m.t}${kinematicsData.timeUnit}, ${m.distance}${kinematicsData.distanceUnit})`,
                        position: 'top',
                        fill: '#d97706',
                        fontSize: 10,
                      }}
                    />
                  ))}
                {displaySeries.map((key, idx) => {
                  const isRight = useDual && (spdSet.has(key) || accSet.has(key));
                  const isAccel = accSet.has(key);
                  return (
                    <Line
                      key={key}
                      yAxisId={isRight ? 'right' : 'left'}
                      type={isAccel ? 'stepAfter' : 'monotone'}
                      dataKey={key}
                      hide={Boolean(hiddenSeries[key])}
                      stroke={PALETTE[idx % PALETTE.length]}
                      strokeWidth={2.2}
                      strokeDasharray={isAccel ? '4 3' : undefined}
                      dot={data.length <= 20 ? { fill: PALETTE[idx % PALETTE.length], r: 2.5 } : false}
                      activeDot={{ r: 4.5 }}
                      animationDuration={320}
                    />
                  );
                })}
                {showBrush && data.length >= 6 && (
                  <Brush dataKey={xAxis} height={22} stroke={axisStroke} fill={isDark ? '#18181b' : '#f8fafc'} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }

    // 4. AREA / STACKED AREA
    if (effectiveChartType === 'area' || effectiveChartType === 'stacked_area') {
      const isStacked = effectiveChartType === 'stacked_area' || Boolean(payload.stacked);
      return (
        <div className={`${isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[380px]' : 'h-[280px]'} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              onClick={(d: any) => {
                const p = d?.activePayload?.[0]?.payload;
                if (p) {
                  const label = String(p[xAxis] ?? '');
                  setPinnedLabel((prev) => (prev === label ? null : label));
                  setSelectedInfo(
                    `${label}: ${activeSeries
                      .filter((k) => !hiddenSeries[k])
                      .map((k) => `${k} = ${formatChartNumber(Number(p[k] ?? 0))}`)
                      .join(' · ')}`
                  );
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey={xAxis} stroke={axisStroke} fontSize={11} />
              <YAxis stroke={axisStroke} fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              {activeSeries.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '6px', cursor: 'pointer' }}
                  onClick={(entry) => handleLegendClick(entry, activeSeries)}
                />
              )}
              {pinnedLabel && <ReferenceLine x={pinnedLabel} stroke={axisStroke} strokeDasharray="3 3" />}
              {activeSeries.map((key, idx) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  hide={Boolean(hiddenSeries[key])}
                  stackId={isStacked ? 'area_stack' : undefined}
                  stroke={PALETTE[idx % PALETTE.length]}
                  fill={PALETTE[idx % PALETTE.length]}
                  fillOpacity={isStacked ? 0.32 : 0.16}
                  strokeWidth={2}
                  animationDuration={350}
                />
              ))}
              {showBrush && data.length >= 4 && (
                <Brush dataKey={xAxis} height={22} stroke={axisStroke} fill={isDark ? '#18181b' : '#f8fafc'} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 5. PIE & DONUT (with live slice hover + click pin + dynamic center readout)
    if (effectiveChartType === 'pie' || effectiveChartType === 'donut') {
      const valKey = activeSeries[0];
      const total = data.reduce((acc, item) => acc + (Number(item[valKey] ?? 0) || 0), 0);
      const focusedSlice = activePieIdx !== null && data[activePieIdx] ? data[activePieIdx] : null;
      const focusedVal = focusedSlice ? Number(focusedSlice[valKey] ?? 0) : total;
      const focusedPct = focusedSlice && total > 0 ? ((focusedVal / total) * 100).toFixed(1) : null;

      return (
        <div className={`${isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[380px]' : 'h-[285px]'} w-full relative`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={effectiveChartType === 'donut' ? 56 : 0}
                outerRadius={92}
                paddingAngle={effectiveChartType === 'donut' ? 3 : 1}
                dataKey={valKey}
                nameKey={xAxis}
                onMouseEnter={(_: any, index: number) => setActivePieIdx(index)}
                onMouseLeave={() => setActivePieIdx(null)}
                onClick={(d: any, index: number) => {
                  setActivePieIdx((prev) => (prev === index ? null : index));
                  if (d) {
                    const val = Number(d[valKey] ?? d.value ?? 0);
                    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                    setSelectedInfo(`${d[xAxis] ?? d.name}: ${formatChartNumber(val)} (${pct}%)`);
                  }
                }}
              >
                {data.map((_: any, index: number) => {
                  const dimmed = activePieIdx !== null && activePieIdx !== index;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={PALETTE[index % PALETTE.length]}
                      fillOpacity={dimmed ? 0.35 : 0.95}
                      stroke={surfaceBg}
                      strokeWidth={activePieIdx === index ? 2.5 : 1.5}
                      className="cursor-pointer transition-opacity"
                    />
                  );
                })}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
            </PieChart>
          </ResponsiveContainer>
          {effectiveChartType === 'donut' && total > 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-7">
              <div className="text-center max-w-[100px] px-1">
                <div className="text-[10px] text-text-secondary truncate">
                  {focusedSlice ? String(focusedSlice[xAxis] ?? '') : 'Tổng'}
                </div>
                <div className="text-sm font-semibold font-mono tabular-nums text-text-primary">
                  {formatChartNumber(focusedVal)}
                </div>
                {focusedPct && (
                  <div className="text-[10px] font-mono tabular-nums text-text-secondary">{focusedPct}%</div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // 6. COMBO (BAR + LINE)
    if (effectiveChartType === 'combo') {
      const bars =
        Array.isArray(payload.barSeries) && payload.barSeries.length > 0
          ? payload.barSeries
          : [activeSeries[0]];
      const lines =
        Array.isArray(payload.lineSeries) && payload.lineSeries.length > 0
          ? payload.lineSeries
          : activeSeries.length > 1
          ? activeSeries.slice(1)
          : [];
      const allKeys = [...bars, ...lines];
      const hasDualAxis = lines.some((k) => !hiddenSeries[k]) && bars.some((k) => !hiddenSeries[k]);

      return (
        <div className={`${isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[380px]' : 'h-[280px]'} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              onClick={(d: any) => {
                const p = d?.activePayload?.[0]?.payload;
                if (p) {
                  const label = String(p[xAxis] ?? '');
                  setPinnedLabel((prev) => (prev === label ? null : label));
                  setSelectedInfo(
                    `${label}: ${allKeys
                      .filter((k) => !hiddenSeries[k])
                      .map((k) => `${k} = ${formatChartNumber(Number(p[k] ?? 0))}`)
                      .join(' · ')}`
                  );
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey={xAxis} stroke={axisStroke} fontSize={11} />
              <YAxis yAxisId="left" stroke={axisStroke} fontSize={11} />
              {hasDualAxis && <YAxis yAxisId="right" orientation="right" stroke={axisStroke} fontSize={11} />}
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '6px', cursor: 'pointer' }}
                onClick={(entry) => handleLegendClick(entry, allKeys)}
              />
              {pinnedLabel && <ReferenceLine yAxisId="left" x={pinnedLabel} stroke={axisStroke} strokeDasharray="3 3" />}
              {bars.map((k, idx) => (
                <Bar
                  key={`bar-${k}`}
                  yAxisId="left"
                  dataKey={k}
                  hide={Boolean(hiddenSeries[k])}
                  fill={PALETTE[idx % PALETTE.length]}
                  radius={[3, 3, 0, 0]}
                  barSize={26}
                />
              ))}
              {lines.map((k, idx) => (
                <Line
                  key={`line-${k}`}
                  yAxisId={hasDualAxis ? 'right' : 'left'}
                  type="monotone"
                  dataKey={k}
                  hide={Boolean(hiddenSeries[k])}
                  stroke={PALETTE[(bars.length + idx) % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3.5 }}
                />
              ))}
              {showBrush && data.length >= 4 && (
                <Brush dataKey={xAxis} height={22} stroke={axisStroke} fill={isDark ? '#18181b' : '#f8fafc'} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 7. SCATTER & BUBBLE (with interactive group filter)
    if (effectiveChartType === 'scatter' || effectiveChartType === 'bubble') {
      const zKey = payload.zAxis || 'z';
      const xKey = payload.xAxis || 'x';
      const yKey = payload.yAxis || 'y';
      const groupMap = new Map<string, any[]>();
      for (const item of data) {
        const g = String(item.group ?? item.series ?? item.category ?? 'Dữ liệu');
        if (!groupMap.has(g)) groupMap.set(g, []);
        groupMap.get(g)!.push({
          ...item,
          x: Number(item[xKey] ?? item.x ?? 0),
          y: Number(item[yKey] ?? item.y ?? 0),
          z: Number(item[zKey] ?? item.size ?? item.r ?? item.value ?? 10),
        });
      }
      const groups = Array.from(groupMap.entries());
      const groupNames = groups.map(([gName]) => gName);

      return (
        <div className={`${isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[380px]' : 'h-[290px]'} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis type="number" dataKey="x" name={payload.xLabel || xKey} stroke={axisStroke} fontSize={11} />
              <YAxis type="number" dataKey="y" name={payload.yLabel || yKey} stroke={axisStroke} fontSize={11} />
              {effectiveChartType === 'bubble' && (
                <ZAxis type="number" dataKey="z" range={[70, 1100]} name={zKey} />
              )}
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={tooltipStyle}
                formatter={(val: any, name: any) => [formatChartNumber(Number(val)), String(name)]}
              />
              {groups.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }}
                  onClick={(entry) => {
                    const gName = String(entry?.value || '').trim();
                    if (gName && groupNames.includes(gName)) {
                      toggleSeriesKey(gName, groupNames);
                    }
                  }}
                />
              )}
              {groups.map(([gName, pts], idx) => (
                <Scatter
                  key={gName}
                  name={gName}
                  data={hiddenSeries[gName] ? [] : pts}
                  fill={PALETTE[idx % PALETTE.length]}
                  fillOpacity={effectiveChartType === 'bubble' ? 0.68 : 0.85}
                  onClick={(pt: any) => {
                    if (pt) {
                      const lbl = pt.name || pt.label || gName;
                      setSelectedInfo(
                        `${lbl}: x = ${formatChartNumber(pt.x)}, y = ${formatChartNumber(pt.y)}${
                          effectiveChartType === 'bubble' ? `, size = ${formatChartNumber(pt.z)}` : ''
                        }`
                      );
                    }
                  }}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 8. RADAR (with auto-normalized axes/series, instant rendering, and interactive legend toggle)
    if (effectiveChartType === 'radar') {
      const radarXKey = radarNorm?.xKey || xAxis;
      const radarSeries = radarNorm && radarNorm.series.length > 0 ? radarNorm.series : activeSeries;
      const baseRadarRows = radarNorm && radarNorm.rows.length > 0 ? radarNorm.rows : data;
      const radarData =
        sortAlgorithm !== 'none'
          ? applyChartSortAlgorithm(baseRadarRows, sortAlgorithm, radarXKey, radarSeries[0] || yAxis).rows
          : baseRadarRows;

      if (radarData.length === 0 || radarSeries.length === 0) {
        return (
          <div className="h-[240px] w-full flex items-center justify-center text-xs text-text-secondary border border-border-color rounded-lg">
            Chưa có dữ liệu hợp lệ cho biểu đồ mạng nhện.
          </div>
        );
      }

      return (
        <div className={`${isFullscreen ? 'h-[calc(100dvh-180px)] min-h-[380px]' : 'h-[320px]'} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              cx="50%"
              cy="50%"
              outerRadius="72%"
              data={radarData}
              onClick={(state: any) => {
                const pt = state?.activePayload?.[0]?.payload;
                if (pt) {
                  const lbl = String(pt[radarXKey] ?? '');
                  setSelectedInfo(
                    `${lbl}: ${radarSeries
                      .filter((k) => !hiddenSeries[k])
                      .map((k) => `${k} = ${formatChartNumber(Number(pt[k] ?? 0))}`)
                      .join(' · ')}`
                  );
                }
              }}
            >
              <PolarGrid stroke={gridStroke} />
              <PolarAngleAxis dataKey={radarXKey} tick={{ fill: axisStroke, fontSize: 11 }} />
              <PolarRadiusAxis
                domain={[0, 'auto']}
                tick={{ fill: axisStroke, fontSize: 10 }}
                axisLine={false}
              />
              <Tooltip contentStyle={tooltipStyle} />
              {radarSeries.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: '11px', cursor: 'pointer' }}
                  onClick={(entry) => handleLegendClick(entry, radarSeries)}
                />
              )}
              {radarSeries.map((key, idx) => (
                <Radar
                  key={key}
                  name={key}
                  dataKey={key}
                  hide={Boolean(hiddenSeries[key])}
                  stroke={PALETTE[idx % PALETTE.length]}
                  fill={PALETTE[idx % PALETTE.length]}
                  fillOpacity={0.22}
                  strokeWidth={2}
                  isAnimationActive={false}
                  dot={{ r: 3, fill: PALETTE[idx % PALETTE.length] }}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // 9. PICTOGRAM
    if (effectiveChartType === 'pictogram') {
      const valKey = activeSeries[0];
      const maxVal = Math.max(1, ...data.map((d) => Number(d[valKey] ?? 0) || 0));
      const unitVal = payload.unitValue && payload.unitValue > 0 ? payload.unitValue : Math.max(1, Math.ceil(maxVal / 10));
      const iconD = PICTOGRAM_PATH(String(payload.icon || 'circle').toLowerCase());

      return (
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-end gap-2 text-[11px] text-text-secondary font-mono tabular-nums">
            <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d={iconD} />
            </svg>
            <span>= {formatChartNumber(unitVal)} {payload.unit || 'đơn vị'}</span>
          </div>
          <div className="space-y-2.5">
            {data.map((row, idx) => {
              const rawVal = Math.max(0, Number(row[valKey] ?? 0) || 0);
              const units = Math.min(18, rawVal / unitVal);
              const fullIcons = Math.floor(units);
              const frac = units - fullIcons;
              const color = PALETTE[idx % PALETTE.length];

              return (
                <button
                  key={`${row[xAxis]}-${idx}`}
                  type="button"
                  onClick={() => setSelectedInfo(`${row[xAxis] ?? ''}: ${formatChartNumber(rawVal)} ${payload.unit || ''}`)}
                  className="w-full text-left flex items-center gap-3 py-1 px-1.5 rounded-lg hover:bg-tertiary/40 transition-colors"
                >
                  <span className="w-28 sm:w-36 shrink-0 text-xs text-text-primary truncate">{String(row[xAxis] ?? '')}</span>
                  <div className="flex-1 flex flex-wrap items-center gap-1 min-w-0">
                    {Array.from({ length: fullIcons }).map((_, i) => (
                      <svg key={i} className="w-4 h-4 shrink-0" viewBox="0 0 24 24" style={{ color }} fill="currentColor">
                        <path d={iconD} />
                      </svg>
                    ))}
                    {frac > 0.08 && (
                      <span className="relative w-4 h-4 shrink-0 inline-block overflow-hidden">
                        <svg className="w-4 h-4 opacity-20" viewBox="0 0 24 24" style={{ color }} fill="currentColor">
                          <path d={iconD} />
                        </svg>
                        <span
                          className="absolute inset-y-0 left-0 overflow-hidden"
                          style={{ width: `${Math.round(frac * 100)}%` }}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" style={{ color }} fill="currentColor">
                            <path d={iconD} />
                          </svg>
                        </span>
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono tabular-nums text-text-secondary shrink-0">
                    {formatChartNumber(rawVal)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // 10. WATERFALL
    if (effectiveChartType === 'waterfall') {
      const steps = buildWaterfallData(data, xAxis, activeSeries[0]);
      if (steps.length === 0) return null;
      const allVals = steps.flatMap((s) => [s.start, s.end, 0]);
      const yMin = Math.min(...allVals);
      const yMax = Math.max(...allVals);
      const span = Math.max(1e-6, yMax - yMin);
      const padMin = yMin - span * 0.08;
      const padMax = yMax + span * 0.1;

      const W = 620;
      const H = 270;
      const margin = { top: 20, right: 16, bottom: 42, left: 50 };
      const innerW = W - margin.left - margin.right;
      const innerH = H - margin.top - margin.bottom;
      const yScale = d3.scaleLinear().domain([padMin, padMax]).range([innerH, 0]);
      const bandW = innerW / steps.length;
      const barW = Math.min(44, bandW * 0.62);

      return (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[420px]">
            <g transform={`translate(${margin.left},${margin.top})`}>
              {yScale.ticks(5).map((tk) => (
                <g key={tk} transform={`translate(0,${yScale(tk)})`}>
                  <line x1={0} x2={innerW} stroke={gridStroke} strokeDasharray="3 3" />
                  <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={axisStroke} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatChartNumber(tk)}
                  </text>
                </g>
              ))}
              <line x1={0} x2={innerW} y1={yScale(0)} y2={yScale(0)} stroke={axisStroke} strokeOpacity={0.45} />
              {steps.map((s, idx) => {
                const cx = idx * bandW + bandW / 2;
                const x = cx - barW / 2;
                const yTop = yScale(Math.max(s.start, s.end));
                const yBot = yScale(Math.min(s.start, s.end));
                const h = Math.max(2, yBot - yTop);
                const fill =
                  s.kind === 'total' ? '#2563eb' : s.kind === 'positive' ? '#059669' : '#dc2626';
                const next = steps[idx + 1];
                const connY = yScale(s.end);

                return (
                  <g
                    key={`${s.name}-${idx}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() =>
                      setSelectedInfo(
                        `${s.name}: ${s.isTotal ? '' : s.delta >= 0 ? '+' : ''}${formatChartNumber(s.delta)} (Lũy kế: ${formatChartNumber(s.end)})`
                      )
                    }
                  >
                    {next && (
                      <line
                        x1={x + barW}
                        x2={cx + bandW - barW / 2}
                        y1={connY}
                        y2={connY}
                        stroke={axisStroke}
                        strokeDasharray="2 2"
                        strokeOpacity={0.5}
                      />
                    )}
                    <rect
                      x={x}
                      y={yTop}
                      width={barW}
                      height={h}
                      rx={3}
                      fill={fill}
                      fillOpacity={hoveredIdx === null || hoveredIdx === idx ? 0.92 : 0.45}
                    />
                    <text
                      x={cx}
                      y={yTop - 5}
                      textAnchor="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill={textColor}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {s.isTotal ? formatChartNumber(s.delta) : `${s.delta >= 0 ? '+' : ''}${formatChartNumber(s.delta)}`}
                    </text>
                    <text x={cx} y={innerH + 16} textAnchor="middle" fontSize={10} fill={mutedText}>
                      {s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      );
    }

    // 11. FUNNEL
    if (effectiveChartType === 'funnel') {
      const valKey = activeSeries[0];
      const rows = data.map((d, i) => ({
        name: String(d[xAxis] ?? d.stage ?? `Bước ${i + 1}`),
        value: Math.max(0, Number(d[valKey] ?? d.count ?? 0) || 0),
      }));
      const topVal = Math.max(1, rows[0]?.value || Math.max(...rows.map((r) => r.value), 1));
      const W = 560;
      const rowH = 38;
      const gap = 5;
      const H = Math.max(160, rows.length * (rowH + gap) + 16);
      const maxBarW = 330;
      const centerX = 215;

      return (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[360px]">
            {rows.map((r, i) => {
              const nextVal = rows[i + 1]?.value ?? r.value * 0.82;
              const wTop = Math.max(38, (r.value / topVal) * maxBarW);
              const wBot = i === rows.length - 1 ? wTop * 0.85 : Math.max(32, (nextVal / topVal) * maxBarW);
              const y = 8 + i * (rowH + gap);
              const pts = [
                `${centerX - wTop / 2},${y}`,
                `${centerX + wTop / 2},${y}`,
                `${centerX + wBot / 2},${y + rowH}`,
                `${centerX - wBot / 2},${y + rowH}`,
              ].join(' ');
              const pctTop = ((r.value / topVal) * 100).toFixed(1);
              const conv = i > 0 && rows[i - 1].value > 0 ? ((r.value / rows[i - 1].value) * 100).toFixed(1) : '100';

              return (
                <g
                  key={`${r.name}-${i}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => setSelectedInfo(`${r.name}: ${formatChartNumber(r.value)} (${pctTop}% tổng · chuyển đổi ${conv}%)`)}
                >
                  <polygon
                    points={pts}
                    fill={PALETTE[i % PALETTE.length]}
                    fillOpacity={hoveredIdx === null || hoveredIdx === i ? 0.9 : 0.45}
                  />
                  <text
                    x={centerX}
                    y={y + rowH / 2 + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="#ffffff"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatChartNumber(r.value)}
                  </text>
                  <text x={centerX + maxBarW / 2 + 16} y={y + rowH / 2 - 2} fontSize={11} fontWeight={600} fill={textColor}>
                    {r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name}
                  </text>
                  <text
                    x={centerX + maxBarW / 2 + 16}
                    y={y + rowH / 2 + 12}
                    fontSize={10}
                    fill={mutedText}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {pctTop}% {i > 0 ? `· bước trước ${conv}%` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      );
    }

    // 12. BOX PLOT
    if (effectiveChartType === 'boxplot') {
      const stats = computeBoxStats(data);
      if (stats.length === 0) return null;
      const allNums = stats.flatMap((s) => [s.min, s.max, ...s.outliers]);
      const dMin = Math.min(...allNums);
      const dMax = Math.max(...allNums);
      const span = Math.max(1e-6, dMax - dMin);

      const W = 600;
      const H = 280;
      const margin = { top: 18, right: 16, bottom: 38, left: 48 };
      const innerW = W - margin.left - margin.right;
      const innerH = H - margin.top - margin.bottom;
      const yScale = d3.scaleLinear().domain([dMin - span * 0.08, dMax + span * 0.08]).range([innerH, 0]);
      const bandW = innerW / stats.length;
      const boxW = Math.min(46, bandW * 0.5);

      return (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[380px]">
            <g transform={`translate(${margin.left},${margin.top})`}>
              {yScale.ticks(5).map((tk) => (
                <g key={tk} transform={`translate(0,${yScale(tk)})`}>
                  <line x1={0} x2={innerW} stroke={gridStroke} strokeDasharray="3 3" />
                  <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={axisStroke} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatChartNumber(tk)}
                  </text>
                </g>
              ))}
              {stats.map((s, i) => {
                const cx = i * bandW + bandW / 2;
                const color = PALETTE[i % PALETTE.length];
                const yMin = yScale(s.min);
                const yQ1 = yScale(s.q1);
                const yMed = yScale(s.median);
                const yQ3 = yScale(s.q3);
                const yMax = yScale(s.max);

                return (
                  <g
                    key={`${s.name}-${i}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() =>
                      setSelectedInfo(
                        `${s.name}: Min=${formatChartNumber(s.min)} · Q1=${formatChartNumber(s.q1)} · Trung vị=${formatChartNumber(s.median)} · Q3=${formatChartNumber(s.q3)} · Max=${formatChartNumber(s.max)}`
                      )
                    }
                  >
                    <line x1={cx} x2={cx} y1={yMax} y2={yMin} stroke={color} strokeWidth={1.6} />
                    <line x1={cx - boxW * 0.3} x2={cx + boxW * 0.3} y1={yMax} y2={yMax} stroke={color} strokeWidth={1.6} />
                    <line x1={cx - boxW * 0.3} x2={cx + boxW * 0.3} y1={yMin} y2={yMin} stroke={color} strokeWidth={1.6} />
                    <rect
                      x={cx - boxW / 2}
                      y={yQ3}
                      width={boxW}
                      height={Math.max(2, yQ1 - yQ3)}
                      fill={color}
                      fillOpacity={hoveredIdx === i ? 0.44 : 0.25}
                      stroke={color}
                      strokeWidth={hoveredIdx === i ? 2.4 : 1.8}
                      rx={3}
                    />
                    <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={yMed} y2={yMed} stroke={textColor} strokeWidth={2.2} />
                    {s.outliers.map((out, oi) => (
                      <circle key={oi} cx={cx} cy={yScale(out)} r={3} fill="none" stroke={color} strokeWidth={1.5} />
                    ))}
                    <text x={cx} y={innerH + 18} textAnchor="middle" fontSize={11} fill={mutedText}>
                      {s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      );
    }

    // 13. VIOLIN
    if (effectiveChartType === 'violin') {
      const groups = computeViolinData(data);
      if (groups.length === 0) return null;
      const allY = groups.flatMap((g) => g.density.map((pt) => pt.y));
      const dMin = Math.min(...allY);
      const dMax = Math.max(...allY);

      const W = 600;
      const H = 285;
      const margin = { top: 18, right: 16, bottom: 38, left: 48 };
      const innerW = W - margin.left - margin.right;
      const innerH = H - margin.top - margin.bottom;
      const yScale = d3.scaleLinear().domain([dMin, dMax]).range([innerH, 0]);
      const bandW = innerW / groups.length;
      const halfMaxW = Math.min(48, bandW * 0.4);

      return (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[380px]">
            <g transform={`translate(${margin.left},${margin.top})`}>
              {yScale.ticks(5).map((tk) => (
                <g key={tk} transform={`translate(0,${yScale(tk)})`}>
                  <line x1={0} x2={innerW} stroke={gridStroke} strokeDasharray="3 3" />
                  <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={axisStroke} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatChartNumber(tk)}
                  </text>
                </g>
              ))}
              {groups.map((g, i) => {
                const cx = i * bandW + bandW / 2;
                const color = PALETTE[i % PALETTE.length];
                const areaGen = d3
                  .area<{ y: number; d: number }>()
                  .x0((p) => cx - (p.d / g.maxDensity) * halfMaxW)
                  .x1((p) => cx + (p.d / g.maxDensity) * halfMaxW)
                  .y((p) => yScale(p.y))
                  .curve(d3.curveCatmullRom);
                const dPath = areaGen(g.density) || '';

                return (
                  <g
                    key={`${g.name}-${i}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() =>
                      setSelectedInfo(
                        `${g.name}: Trung vị=${formatChartNumber(g.stat.median)} · IQR=[${formatChartNumber(g.stat.q1)}, ${formatChartNumber(g.stat.q3)}] · TB=${formatChartNumber(g.stat.mean)}`
                      )
                    }
                  >
                    <path
                      d={dPath}
                      fill={color}
                      fillOpacity={hoveredIdx === i ? 0.45 : 0.28}
                      stroke={color}
                      strokeWidth={hoveredIdx === i ? 2.4 : 1.8}
                    />
                    <line
                      x1={cx}
                      x2={cx}
                      y1={yScale(g.stat.q1)}
                      y2={yScale(g.stat.q3)}
                      stroke={textColor}
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                    <circle cx={cx} cy={yScale(g.stat.median)} r={3} fill={surfaceBg} stroke={textColor} strokeWidth={1.5} />
                    <text x={cx} y={innerH + 18} textAnchor="middle" fontSize={11} fill={mutedText}>
                      {g.name.length > 14 ? `${g.name.slice(0, 13)}…` : g.name}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      );
    }

    // 14. HEATMAP (with hover row/col highlight + live cell readout)
    if (effectiveChartType === 'heatmap') {
      let xLabels: string[] = Array.isArray(payload.xLabels) ? payload.xLabels : [];
      let yLabels: string[] = Array.isArray(payload.yLabels) ? payload.yLabels : [];
      const cells: Array<{ x: string; y: string; value: number }> = [];

      if (Array.isArray(payload.matrix)) {
        const m = payload.matrix;
        yLabels = yLabels.length ? yLabels : m.map((_, i) => `R${i + 1}`);
        xLabels = xLabels.length ? xLabels : (m[0] || []).map((_, j) => `C${j + 1}`);
        m.forEach((row, rIdx) => {
          (row || []).forEach((val, cIdx) => {
            cells.push({
              x: xLabels[cIdx] ?? `C${cIdx + 1}`,
              y: yLabels[rIdx] ?? `R${rIdx + 1}`,
              value: Number(val) || 0,
            });
          });
        });
      } else {
        const xSet = new Set<string>();
        const ySet = new Set<string>();
        for (const item of data) {
          const xv = String(item[xAxis] ?? item.x ?? item.col ?? '');
          const yv = String(item[yAxis] ?? item.y ?? item.row ?? '');
          const v = Number(item.value ?? item.count ?? item.score ?? 0) || 0;
          xSet.add(xv);
          ySet.add(yv);
          cells.push({ x: xv, y: yv, value: v });
        }
        xLabels = Array.from(xSet);
        yLabels = Array.from(ySet);
      }

      if (cells.length === 0) return null;
      const minV = d3.min(cells, (c) => c.value) ?? 0;
      const maxV = d3.max(cells, (c) => c.value) ?? 1;
      const colorScale = d3.scaleSequential(d3.interpolateBlues).domain([minV, maxV === minV ? minV + 1 : maxV]);
      const cellMap = new Map(cells.map((c) => [`${c.y}__${c.x}`, c.value]));

      return (
        <div className="space-y-2.5 overflow-x-auto">
          <div className="h-4 text-[11px] font-mono tabular-nums text-text-secondary">
            {hoveredHeatCell
              ? `${hoveredHeatCell.y} × ${hoveredHeatCell.x} = ${formatChartNumber(hoveredHeatCell.value)}`
              : 'Di chuột hoặc nhấn vào ô để xem giá trị'}
          </div>
          <div className="inline-block min-w-full">
            <table className="w-full border-collapse text-[11px] font-mono tabular-nums">
              <thead>
                <tr>
                  <th className="p-1.5 text-left font-sans text-text-secondary font-medium" />
                  {xLabels.map((xl) => (
                    <th
                      key={xl}
                      className={`p-1.5 text-center font-sans font-medium transition-colors ${
                        hoveredHeatCell?.x === xl ? 'text-text-primary underline' : 'text-text-secondary'
                      }`}
                    >
                      {xl}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yLabels.map((yl) => (
                  <tr key={yl}>
                    <td
                      className={`p-1.5 pr-3 text-right font-sans whitespace-nowrap font-medium transition-colors ${
                        hoveredHeatCell?.y === yl ? 'text-text-primary underline' : 'text-text-secondary'
                      }`}
                    >
                      {yl}
                    </td>
                    {xLabels.map((xl) => {
                      const val = cellMap.get(`${yl}__${xl}`);
                      const numeric = val ?? 0;
                      const bg = val !== undefined ? colorScale(numeric) : isDark ? '#1e293b' : '#f1f5f9';
                      const ratio = maxV === minV ? 0.5 : (numeric - minV) / (maxV - minV);
                      const fg = ratio > 0.52 ? '#ffffff' : '#0f172a';
                      const isActive = hoveredHeatCell?.x === xl && hoveredHeatCell?.y === yl;
                      return (
                        <td key={`${yl}-${xl}`} className="p-0.5">
                          <button
                            type="button"
                            onMouseEnter={() => setHoveredHeatCell({ x: xl, y: yl, value: numeric })}
                            onMouseLeave={() => setHoveredHeatCell(null)}
                            onClick={() => setSelectedInfo(`${yl} × ${xl}: ${formatChartNumber(numeric)}`)}
                            style={{ backgroundColor: bg, color: fg }}
                            className={`w-full min-w-[44px] h-9 rounded text-center font-semibold transition-all ${
                              isActive ? 'ring-2 ring-blue-500 scale-[1.03]' : 'hover:opacity-95'
                            }`}
                          >
                            {val !== undefined ? formatChartNumber(numeric) : '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-2 text-[10px] font-mono tabular-nums text-text-secondary">
            <span>{formatChartNumber(minV)}</span>
            <div
              className="w-28 h-2 rounded"
              style={{
                background: `linear-gradient(to right, ${colorScale(minV)}, ${colorScale((minV + maxV) / 2)}, ${colorScale(maxV)})`,
              }}
            />
            <span>{formatChartNumber(maxV)}</span>
          </div>
        </div>
      );
    }

    // 15. TREEMAP (with live hover dimming + readout)
    if (effectiveChartType === 'treemap') {
      const rootData = normalizeHierarchyData(payload);
      const W = 600;
      const H = 290;
      const root = d3
        .hierarchy(rootData)
        .sum((d: any) => Math.max(0, Number(d.value) || 0))
        .sort((a, b) => (b.value || 0) - (a.value || 0));
      d3.treemap<any>().size([W, H]).paddingOuter(4).paddingInner(3)(root);

      const leaves = root.leaves();
      const topGroups = Array.from(
        new Set(leaves.map((l) => (l.depth >= 2 ? l.ancestors()[l.depth - 1]?.data.name : l.data.name)))
      );
      const hoveredLeaf = hoveredTreemapIdx !== null ? leaves[hoveredTreemapIdx] : null;

      return (
        <div className="space-y-2 w-full">
          <div className="h-4 text-[11px] font-mono tabular-nums text-text-secondary">
            {hoveredLeaf
              ? `${hoveredLeaf.ancestors().slice(0, -1).reverse().map((a: any) => a.data.name).join(' / ')}: ${formatChartNumber(hoveredLeaf.value || 0)}`
              : 'Di chuột hoặc chạm vào ô để xem chi tiết tỷ trọng'}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            {leaves.map((leaf: any, idx: number) => {
              const w = Math.max(0, leaf.x1 - leaf.x0);
              const h = Math.max(0, leaf.y1 - leaf.y0);
              if (w < 2 || h < 2) return null;
              const groupName = leaf.depth >= 2 ? leaf.ancestors()[leaf.depth - 1]?.data.name : leaf.data.name;
              const color = PALETTE[Math.max(0, topGroups.indexOf(groupName)) % PALETTE.length];
              const showLabel = w > 54 && h > 28;
              const showValue = w > 54 && h > 42;
              const isDim = hoveredTreemapIdx !== null && hoveredTreemapIdx !== idx;

              return (
                <g
                  key={`${leaf.data.name}-${idx}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredTreemapIdx(idx)}
                  onMouseLeave={() => setHoveredTreemapIdx(null)}
                  onClick={() =>
                    setSelectedInfo(
                      `${leaf.ancestors().slice(0, -1).reverse().map((a: any) => a.data.name).join(' / ')}: ${formatChartNumber(leaf.value || 0)}`
                    )
                  }
                >
                  <rect
                    x={leaf.x0}
                    y={leaf.y0}
                    width={w}
                    height={h}
                    rx={4}
                    fill={color}
                    fillOpacity={isDim ? 0.45 : 0.9}
                    stroke={hoveredTreemapIdx === idx ? textColor : surfaceBg}
                    strokeWidth={hoveredTreemapIdx === idx ? 1.8 : 1}
                  />
                  {showLabel && (
                    <text x={leaf.x0 + 7} y={leaf.y0 + 16} fontSize={11} fontWeight={600} fill="#ffffff">
                      {leaf.data.name.length > Math.floor(w / 7)
                        ? `${leaf.data.name.slice(0, Math.max(4, Math.floor(w / 7) - 1))}…`
                        : leaf.data.name}
                    </text>
                  )}
                  {showValue && (
                    <text
                      x={leaf.x0 + 7}
                      y={leaf.y0 + 31}
                      fontSize={10}
                      fill="rgba(255,255,255,0.88)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatChartNumber(leaf.value || 0)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      );
    }

    // 16. SUNBURST (interactive drill-down + breadcrumb + hover)
    if (effectiveChartType === 'sunburst') {
      const rootData = normalizeHierarchyData(payload);
      const size = 320;
      const radius = size / 2 - 8;
      const fullRoot = d3
        .hierarchy(rootData)
        .sum((d: any) => Math.max(0, Number(d.value) || 0))
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      const focusNode =
        (sunburstFocusName && fullRoot.descendants().find((n) => n.data.name === sunburstFocusName)) ||
        fullRoot;

      const subRoot = d3
        .hierarchy(focusNode.data)
        .sum((d: any) => Math.max(0, Number(d.value) || 0))
        .sort((a, b) => (b.value || 0) - (a.value || 0));

      const partition = d3.partition<any>().size([2 * Math.PI, radius])(subRoot);
      const nodes = partition.descendants().filter((d) => d.depth > 0);
      const arcGen = d3
        .arc<any>()
        .startAngle((d) => d.x0)
        .endAngle((d) => d.x1)
        .padAngle((d) => Math.min((d.x1 - d.x0) / 2, 0.015))
        .innerRadius((d) => Math.max(36, d.y0))
        .outerRadius((d) => Math.max(38, d.y1 - 2));

      const topBranches = (subRoot.children || []).map((c) => c.data.name);

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
            <span className="font-mono tabular-nums truncate">
              {hoveredSunburst || (sunburstFocusName ? `Đang xem nhánh: ${sunburstFocusName}` : 'Nhấn vào nhánh để đi sâu (drill-down)')}
            </span>
            {sunburstFocusName && (
              <button
                type="button"
                onClick={() => setSunburstFocusName(null)}
                className="text-text-primary hover:underline whitespace-nowrap shrink-0"
              >
                Quay lại gốc
              </button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-5 justify-center">
            <svg viewBox={`0 0 ${size} ${size}`} className="w-[260px] h-[260px] shrink-0">
              <g transform={`translate(${size / 2},${size / 2})`}>
                {nodes.map((d: any, idx: number) => {
                  const topAncestor = d.ancestors().find((a: any) => a.depth === 1) || d;
                  const branchIdx = Math.max(0, topBranches.indexOf(topAncestor.data.name));
                  const color = PALETTE[branchIdx % PALETTE.length];
                  const baseOpacity = Math.max(0.45, 1 - (d.depth - 1) * 0.22);
                  const pathLabel = d.ancestors().slice(0, -1).reverse().map((a: any) => a.data.name).join(' › ');

                  return (
                    <path
                      key={`${d.data.name}-${idx}`}
                      d={arcGen(d) || ''}
                      fill={color}
                      fillOpacity={hoveredSunburst === `${pathLabel}: ${formatChartNumber(d.value || 0)}` ? 1 : baseOpacity}
                      stroke={surfaceBg}
                      strokeWidth={1}
                      className="cursor-pointer transition-opacity"
                      onMouseEnter={() => setHoveredSunburst(`${pathLabel}: ${formatChartNumber(d.value || 0)}`)}
                      onMouseLeave={() => setHoveredSunburst(null)}
                      onClick={() => {
                        setSelectedInfo(`${pathLabel}: ${formatChartNumber(d.value || 0)}`);
                        if (d.children && d.children.length > 0) {
                          setSunburstFocusName(d.data.name);
                        }
                      }}
                    />
                  );
                })}
                <g
                  className="cursor-pointer"
                  onClick={() => setSunburstFocusName(null)}
                >
                  <circle r={34} fill="transparent" />
                  <text textAnchor="middle" dy="-2" fontSize={10} fill={mutedText}>
                    {sunburstFocusName ? 'Quay lại' : 'Tổng'}
                  </text>
                  <text
                    textAnchor="middle"
                    dy="13"
                    fontSize={12}
                    fontWeight={600}
                    fill={textColor}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatChartNumber(subRoot.value || 0)}
                  </text>
                </g>
              </g>
            </svg>
            <div className="flex-1 w-full space-y-1.5 text-xs max-w-xs">
              {(subRoot.children || []).slice(0, 8).map((child, idx) => {
                const pct = subRoot.value ? (((child.value || 0) / subRoot.value) * 100).toFixed(1) : '0';
                return (
                  <button
                    key={child.data.name}
                    type="button"
                    onClick={() => {
                      setSelectedInfo(`${child.data.name}: ${formatChartNumber(child.value || 0)} (${pct}%)`);
                      if (child.children && child.children.length > 0) {
                        setSunburstFocusName(child.data.name);
                      }
                    }}
                    className="w-full flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-tertiary/50 text-left"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: PALETTE[idx % PALETTE.length] }}
                      />
                      <span className="truncate text-text-primary">{child.data.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-text-secondary shrink-0">
                      {formatChartNumber(child.value || 0)} ({pct}%)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    // 17. CANDLESTICK & 18. OHLC (with crosshair + window zoom & pan)
    if (effectiveChartType === 'candlestick' || effectiveChartType === 'ohlc') {
      const allCandles = data.map((d, i) => ({
        label: String(d[xAxis] ?? d.date ?? d.time ?? d.name ?? `#${i + 1}`),
        open: Number(d.open ?? d.o ?? 0),
        high: Number(d.high ?? d.h ?? 0),
        low: Number(d.low ?? d.l ?? 0),
        close: Number(d.close ?? d.c ?? 0),
        volume: d.volume !== undefined ? Number(d.volume) : undefined,
      }));
      if (allCandles.length === 0) return null;

      const winSize = candleWindow === 'all' ? allCandles.length : Math.min(allCandles.length, candleWindow);
      const maxOffset = Math.max(0, allCandles.length - winSize);
      const safeOffset = Math.max(0, Math.min(maxOffset, candleOffset));
      const startSlice = Math.max(0, allCandles.length - winSize - safeOffset);
      const candles = allCandles.slice(startSlice, startSlice + winSize);

      const minPrice = Math.min(...candles.map((c) => Math.min(c.low, c.open, c.close)));
      const maxPrice = Math.max(...candles.map((c) => Math.max(c.high, c.open, c.close)));
      const span = Math.max(1e-6, maxPrice - minPrice);

      const W = 640;
      const H = 285;
      const margin = { top: 18, right: 16, bottom: 38, left: 54 };
      const innerW = W - margin.left - margin.right;
      const innerH = H - margin.top - margin.bottom;
      const yScale = d3.scaleLinear().domain([minPrice - span * 0.08, maxPrice + span * 0.08]).range([innerH, 0]);
      const bandW = innerW / candles.length;
      const bodyW = Math.max(4, Math.min(20, bandW * 0.62));
      const safeHoveredIdx = hoveredIdx !== null && hoveredIdx < candles.length ? hoveredIdx : null;
      const activeCandle = safeHoveredIdx !== null ? candles[safeHoveredIdx] : candles[candles.length - 1];

      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {activeCandle && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-text-secondary">
                <span className="text-text-primary font-semibold">{activeCandle.label}</span>
                <span>O: {formatChartNumber(activeCandle.open)}</span>
                <span>H: {formatChartNumber(activeCandle.high)}</span>
                <span>L: {formatChartNumber(activeCandle.low)}</span>
                <span className={activeCandle.close >= activeCandle.open ? 'text-emerald-500' : 'text-red-500'}>
                  C: {formatChartNumber(activeCandle.close)}
                </span>
                {activeCandle.volume !== undefined && <span>V: {formatChartNumber(activeCandle.volume)}</span>}
              </div>
            )}

            {allCandles.length > 12 && (
              <div className="flex items-center gap-1 text-[11px] shrink-0">
                {(['all', 30, 15] as const).map((wOpt) => (
                  <button
                    key={String(wOpt)}
                    type="button"
                    onClick={() => {
                      setCandleWindow(wOpt);
                      setCandleOffset(0);
                    }}
                    className={`px-2 py-0.5 rounded border text-[10px] font-mono tabular-nums whitespace-nowrap ${
                      candleWindow === wOpt
                        ? 'border-blue-500/60 bg-blue-500/10 text-text-primary'
                        : 'border-border-color text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {wOpt === 'all' ? 'Tất cả' : `${wOpt} nến`}
                  </button>
                ))}
                {candleWindow !== 'all' && (
                  <>
                    <button
                      type="button"
                      disabled={safeOffset >= maxOffset}
                      onClick={() => setCandleOffset((o) => Math.min(maxOffset, o + 5))}
                      className="p-0.5 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
                      title="Lùi trái"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={safeOffset <= 0}
                      onClick={() => setCandleOffset((o) => Math.max(0, o - 5))}
                      className="p-0.5 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
                      title="Tiến phải"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[420px]">
              <g transform={`translate(${margin.left},${margin.top})`}>
                {yScale.ticks(5).map((tk) => (
                  <g key={tk} transform={`translate(0,${yScale(tk)})`}>
                    <line x1={0} x2={innerW} stroke={gridStroke} strokeDasharray="3 3" />
                    <text x={-8} dy="0.32em" textAnchor="end" fontSize={10} fill={axisStroke} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatChartNumber(tk)}
                    </text>
                  </g>
                ))}

                {/* Interactive Crosshair */}
                {safeHoveredIdx !== null && activeCandle && (
                  <g className="pointer-events-none">
                    <line
                      x1={safeHoveredIdx * bandW + bandW / 2}
                      x2={safeHoveredIdx * bandW + bandW / 2}
                      y1={0}
                      y2={innerH}
                      stroke={axisStroke}
                      strokeOpacity={0.55}
                      strokeDasharray="3 3"
                    />
                    <line
                      x1={0}
                      x2={innerW}
                      y1={yScale(activeCandle.close)}
                      y2={yScale(activeCandle.close)}
                      stroke={axisStroke}
                      strokeOpacity={0.55}
                      strokeDasharray="3 3"
                    />
                  </g>
                )}

                {candles.map((c, idx) => {
                  const cx = idx * bandW + bandW / 2;
                  const bullish = c.close >= c.open;
                  const strokeCol = bullish ? '#10b981' : '#ef4444';
                  const yHigh = yScale(c.high);
                  const yLow = yScale(c.low);
                  const yOpen = yScale(c.open);
                  const yClose = yScale(c.close);
                  const showTick = candles.length <= 16 || idx % Math.ceil(candles.length / 8) === 0;

                  return (
                    <g
                      key={`${c.label}-${idx}`}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() =>
                        setSelectedInfo(
                          `${c.label}: O=${formatChartNumber(c.open)} · H=${formatChartNumber(c.high)} · L=${formatChartNumber(c.low)} · C=${formatChartNumber(c.close)}`
                        )
                      }
                    >
                      <rect x={idx * bandW} y={0} width={bandW} height={innerH} fill="transparent" />
                      <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={strokeCol} strokeWidth={safeHoveredIdx === idx ? 2.2 : 1.6} />
                      {effectiveChartType === 'candlestick' ? (
                        <rect
                          x={cx - bodyW / 2}
                          y={Math.min(yOpen, yClose)}
                          width={bodyW}
                          height={Math.max(2, Math.abs(yClose - yOpen))}
                          fill={strokeCol}
                          fillOpacity={safeHoveredIdx === idx ? 1 : 0.88}
                          rx={1}
                        />
                      ) : (
                        <>
                          <line x1={cx - bodyW / 2} x2={cx} y1={yOpen} y2={yOpen} stroke={strokeCol} strokeWidth={2} />
                          <line x1={cx} x2={cx + bodyW / 2} y1={yClose} y2={yClose} stroke={strokeCol} strokeWidth={2} />
                        </>
                      )}
                      {showTick && (
                        <text x={cx} y={innerH + 16} textAnchor="middle" fontSize={10} fill={mutedText}>
                          {c.label.length > 10 ? c.label.slice(-5) : c.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
      );
    }

    // 19. GANTT
    if (effectiveChartType === 'gantt') {
      const parsedTasks = data.map((d, idx) => {
        const rawStart = d.start ?? d.from ?? 0;
        const rawEnd = d.end ?? d.to ?? 1;
        const isDate = typeof rawStart === 'string' && !Number.isFinite(Number(rawStart));
        const sVal = isDate ? Date.parse(rawStart) : Number(rawStart);
        const eVal = isDate ? Date.parse(String(rawEnd)) : Number(rawEnd);
        return {
          name: String(d.task ?? d.name ?? d.label ?? `Tác vụ ${idx + 1}`),
          group: d.group ? String(d.group) : undefined,
          start: Number.isFinite(sVal) ? sVal : idx,
          end: Number.isFinite(eVal) ? Math.max(sVal + 0.2, eVal) : (Number.isFinite(sVal) ? sVal + 1 : idx + 1),
          startLabel: String(rawStart),
          endLabel: String(rawEnd),
          progress: Math.max(0, Math.min(100, Number(d.progress ?? 100))),
          isDate,
        };
      });
      if (parsedTasks.length === 0) return null;

      const minT = Math.min(...parsedTasks.map((t) => t.start));
      const maxT = Math.max(...parsedTasks.map((t) => t.end));
      const span = Math.max(1, maxT - minT);

      return (
        <div className="space-y-2 overflow-x-auto">
          <div className="min-w-[440px] space-y-2">
            {parsedTasks.map((task, idx) => {
              const leftPct = ((task.start - minT) / span) * 100;
              const widthPct = Math.max(3, ((task.end - task.start) / span) * 100);
              const color = PALETTE[idx % PALETTE.length];

              return (
                <button
                  key={`${task.name}-${idx}`}
                  type="button"
                  onClick={() =>
                    setSelectedInfo(`${task.name}: ${task.startLabel} → ${task.endLabel} (${task.progress}%)`)
                  }
                  className="w-full text-left grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr] items-center gap-3 py-1 px-1.5 rounded hover:bg-tertiary/40 transition-colors"
                >
                  <div className="truncate">
                    <div className="text-xs text-text-primary truncate">{task.name}</div>
                    {task.group && <div className="text-[10px] text-text-secondary truncate">{task.group}</div>}
                  </div>
                  <div className="relative h-6 rounded bg-tertiary/50 overflow-hidden">
                    <div
                      className="absolute inset-y-1 rounded overflow-hidden flex items-center"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        backgroundColor: `${color}33`,
                        border: `1px solid ${color}`,
                      }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${task.progress}%`,
                          backgroundColor: color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
            <div className="grid grid-cols-[130px_1fr] sm:grid-cols-[160px_1fr] gap-3 pt-1 text-[10px] font-mono tabular-nums text-text-secondary">
              <span />
              <div className="flex justify-between">
                <span>
                  {parsedTasks[0]?.isDate ? new Date(minT).toLocaleDateString('vi-VN') : formatChartNumber(minT)}
                </span>
                <span>
                  {parsedTasks[0]?.isDate
                    ? new Date((minT + maxT) / 2).toLocaleDateString('vi-VN')
                    : formatChartNumber((minT + maxT) / 2)}
                </span>
                <span>
                  {parsedTasks[0]?.isDate ? new Date(maxT).toLocaleDateString('vi-VN') : formatChartNumber(maxT)}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 20. SANKEY (interactive node & flow path highlighting)
    if (effectiveChartType === 'sankey') {
      const W = 620;
      const H = 290;
      const { nodes, links } = computeSankeyLayout(payload, W, H);
      if (nodes.length === 0) return null;

      return (
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[420px]">
            {links.map((l) => {
              const color = PALETTE[l.sourceIdx % PALETTE.length];
              const linkId = String(l.index);
              const isHighlighted =
                !hoveredSankeyKey ||
                (hoveredSankeyKey.kind === 'link' && hoveredSankeyKey.id === linkId) ||
                (hoveredSankeyKey.kind === 'node' &&
                  (hoveredSankeyKey.id === l.sourceName || hoveredSankeyKey.id === l.targetName));

              return (
                <path
                  key={`link-${l.index}`}
                  d={l.path}
                  fill="none"
                  stroke={color}
                  strokeOpacity={hoveredSankeyKey ? (isHighlighted ? 0.68 : 0.1) : 0.34}
                  strokeWidth={Math.max(2, l.width)}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoveredSankeyKey({ kind: 'link', id: linkId })}
                  onMouseLeave={() => setHoveredSankeyKey(null)}
                  onClick={() => setSelectedInfo(`${l.sourceName} → ${l.targetName}: ${formatChartNumber(l.value)}`)}
                />
              );
            })}
            {nodes.map((n) => {
              const color = PALETTE[n.index % PALETTE.length];
              const isRight = n.x0 > W * 0.55;
              return (
                <g
                  key={`snode-${n.id}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredSankeyKey({ kind: 'node', id: n.name })}
                  onMouseLeave={() => setHoveredSankeyKey(null)}
                  onClick={() => setSelectedInfo(`${n.name}: Tổng lưu lượng ${formatChartNumber(n.value)}`)}
                >
                  <rect
                    x={n.x0}
                    y={n.y0}
                    width={n.x1 - n.x0}
                    height={Math.max(6, n.y1 - n.y0)}
                    rx={2}
                    fill={color}
                  />
                  <text
                    x={isRight ? n.x0 - 6 : n.x1 + 6}
                    y={(n.y0 + n.y1) / 2}
                    dy="0.32em"
                    textAnchor={isRight ? 'end' : 'start'}
                    fontSize={11}
                    fontWeight={500}
                    fill={textColor}
                  >
                    {n.name} ({formatChartNumber(n.value)})
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      );
    }

    // 21. NETWORK GRAPH (interactive drag nodes + pan/zoom + 1-hop isolation)
    if (effectiveChartType === 'network') {
      const W = 600;
      const H = 310;
      const { nodes: baseNodes, edges } = computeNetworkLayout(payload, W, H);
      if (baseNodes.length === 0) return null;

      const nodes = baseNodes.map((n) => {
        const override = netNodePos[n.id];
        return override ? { ...n, x: override.x, y: override.y } : n;
      });

      const nodePos = new Map(nodes.map((n) => [n.id, n]));
      const groups = Array.from(new Set(nodes.map((n) => n.group)));
      const markerId = 'tm-net-arrow';

      const toSvgCoords = (clientX: number, clientY: number) => {
        const svg = netSvgRef.current;
        if (!svg) return null;
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const sx = ((clientX - rect.left) / rect.width) * W;
        const sy = ((clientY - rect.top) / rect.height) * H;
        // Invert pan & zoom transform around center
        const cx = W / 2;
        const cy = H / 2;
        return {
          x: Math.max(20, Math.min(W - 20, (sx - mapTransform.x - cx) / mapTransform.scale + cx)),
          y: Math.max(20, Math.min(H - 20, (sy - mapTransform.y - cy) / mapTransform.scale + cy)),
        };
      };

      const connectedSet = new Set<string>();
      if (selectedNetNode) {
        connectedSet.add(selectedNetNode);
        edges.forEach((e) => {
          if (e.source === selectedNetNode) connectedSet.add(e.target);
          if (e.target === selectedNetNode) connectedSet.add(e.source);
        });
      }

      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
            <span>Kéo từng nút để sắp xếp · Cuộn hoặc kéo nền để thu phóng</span>
            <div className="flex items-center gap-1.5">
              {Object.keys(netNodePos).length > 0 && (
                <button
                  type="button"
                  onClick={() => setNetNodePos({})}
                  className="px-2 py-0.5 rounded border border-border-color text-[10px] hover:text-text-primary whitespace-nowrap"
                >
                  Xếp lại
                </button>
              )}
              {renderZoomControls(mapTransform.scale > 1 ? `${mapTransform.scale.toFixed(1)}×` : undefined)}
            </div>
          </div>

          <div
            className="w-full overflow-hidden rounded-lg border border-border-color/70 select-none"
            onWheel={handleMapWheel}
          >
            <svg
              ref={netSvgRef}
              viewBox={`0 0 ${W} ${H}`}
              className={`w-full h-auto min-w-[400px] ${draggingNodeId || isPanningMap ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={(e) => handleMapPointerDown(e)}
              onPointerMove={(e) => {
                if (draggingNodeId) {
                  const pt = toSvgCoords(e.clientX, e.clientY);
                  if (pt) {
                    setNetNodePos((prev) => ({ ...prev, [draggingNodeId]: pt }));
                  }
                } else {
                  handleMapPointerMove(e);
                }
              }}
              onPointerUp={() => {
                setDraggingNodeId(null);
                handleMapPointerUp();
              }}
              onPointerLeave={() => {
                setDraggingNodeId(null);
                handleMapPointerUp();
              }}
            >
              {payload.directed && (
                <defs>
                  <marker id={markerId} viewBox="0 -5 10 10" refX={18} refY={0} markerWidth={6} markerHeight={6} orient="auto">
                    <path d="M0,-5L10,0L0,5" fill={axisStroke} />
                  </marker>
                </defs>
              )}
              <g
                transform={`translate(${mapTransform.x + W / 2}, ${mapTransform.y + H / 2}) scale(${mapTransform.scale}) translate(${-W / 2}, ${-H / 2})`}
              >
                {edges.map((e, idx) => {
                  const s = nodePos.get(e.source);
                  const t = nodePos.get(e.target);
                  if (!s || !t) return null;
                  const isHighlighted =
                    !selectedNetNode || selectedNetNode === s.id || selectedNetNode === t.id;
                  return (
                    <g key={`edge-${idx}`}>
                      <line
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        stroke={axisStroke}
                        strokeWidth={Math.min(4, 1 + Math.log2(e.weight))}
                        strokeOpacity={isHighlighted ? 0.58 : 0.12}
                        markerEnd={payload.directed ? `url(#${markerId})` : undefined}
                      />
                      {e.label && (
                        <text
                          x={(s.x + t.x) / 2}
                          y={(s.y + t.y) / 2 - 4}
                          textAnchor="middle"
                          fontSize={9}
                          fill={mutedText}
                        >
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}
                {nodes.map((n) => {
                  const gIdx = Math.max(0, groups.indexOf(n.group));
                  const color = PALETTE[gIdx % PALETTE.length];
                  const isSelected = selectedNetNode === n.id;
                  const isDimmed = Boolean(selectedNetNode && !connectedSet.has(n.id));
                  const degree = edges.filter((e) => e.source === n.id || e.target === n.id).length;

                  return (
                    <g
                      key={n.id}
                      data-no-pan="true"
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDraggingNodeId(n.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = isSelected ? null : n.id;
                        setSelectedNetNode(next);
                        setSelectedInfo(`${n.label} (Nhóm: ${n.group} · ${degree} kết nối)`);
                      }}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.size}
                        fill={color}
                        fillOpacity={isDimmed ? 0.25 : 0.92}
                        stroke={isSelected ? textColor : surfaceBg}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                      <text
                        x={n.x}
                        y={n.y + n.size + 12}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={500}
                        fill={textColor}
                        fillOpacity={isDimmed ? 0.4 : 1}
                      >
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
      );
    }

    // 22. CHOROPLETH / GEO MAP (with pan & zoom + hover readout)
    if (effectiveChartType === 'choropleth') {
      const geo = matchGeoShapeValues(data, payload.region || 'auto');
      const vbW = geo.mode === 'vietnam' ? 340 : 600;
      const vbH = geo.mode === 'vietnam' ? 430 : 295;
      const colorScale = d3
        .scaleSequential(d3.interpolateYlGnBu)
        .domain([geo.minVal, geo.maxVal === geo.minVal ? geo.minVal + 1 : geo.maxVal]);
      const emptyFill = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';

      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
            <span className="font-mono tabular-nums truncate">
              {hoveredGeoInfo || 'Di chuột, kéo bản đồ hoặc thu phóng để xem chi tiết'}
            </span>
            {renderZoomControls(mapTransform.scale > 1 ? `${mapTransform.scale.toFixed(1)}×` : undefined)}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div
              className="w-full max-w-[460px] overflow-hidden rounded-lg border border-border-color/70 select-none"
              onWheel={handleMapWheel}
            >
              <svg
                viewBox={`0 0 ${vbW} ${vbH}`}
                className={`w-full h-auto block ${isPanningMap ? 'cursor-grabbing' : 'cursor-grab'}`}
                onPointerDown={handleMapPointerDown}
                onPointerMove={handleMapPointerMove}
                onPointerUp={handleMapPointerUp}
                onPointerLeave={handleMapPointerUp}
              >
                <g
                  transform={`translate(${mapTransform.x + vbW / 2}, ${mapTransform.y + vbH / 2}) scale(${mapTransform.scale}) translate(${-vbW / 2}, ${-vbH / 2})`}
                >
                  {geo.shapes.map((shape) => {
                    const hasVal = shape.value !== null;
                    const fill = hasVal ? colorScale(shape.value!) : emptyFill;
                    const labelText = `${shape.matchedLabel || shape.name}: ${
                      hasVal ? formatChartNumber(shape.value!) : 'Không có dữ liệu'
                    }`;
                    return (
                      <g
                        key={shape.id}
                        data-no-pan="true"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredGeoInfo(labelText)}
                        onMouseLeave={() => setHoveredGeoInfo(null)}
                        onClick={() => setSelectedInfo(labelText)}
                      >
                        <path
                          d={shape.d}
                          fill={fill}
                          stroke={isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.22)'}
                          strokeWidth={1 / mapTransform.scale}
                        />
                        {hasVal && (
                          <text
                            x={shape.cx}
                            y={shape.cy}
                            textAnchor="middle"
                            dy="0.32em"
                            fontSize={geo.mode === 'vietnam' ? 9 : 8.5}
                            fontWeight={600}
                            fill="#0f172a"
                            stroke="rgba(255,255,255,0.75)"
                            strokeWidth={2}
                            paintOrder="stroke"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {formatChartNumber(shape.value!)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            <div className="w-full sm:w-52 space-y-1.5 text-xs shrink-0">
              <div className="text-[11px] font-medium text-text-secondary mb-1">
                {geo.mode === 'vietnam' ? 'Khu vực Việt Nam' : 'Khu vực / Quốc gia'}
              </div>
              {geo.shapes
                .filter((s) => s.value !== null)
                .sort((a, b) => (b.value || 0) - (a.value || 0))
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedInfo(`${s.matchedLabel || s.name}: ${formatChartNumber(s.value!)}`)}
                    className="w-full flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-tertiary/40 text-left"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: colorScale(s.value!) }}
                      />
                      <span className="truncate text-text-primary">{s.matchedLabel || s.name}</span>
                    </span>
                    <span className="font-mono tabular-nums text-text-secondary shrink-0">
                      {formatChartNumber(s.value!)}
                    </span>
                  </button>
                ))}
              {geo.unmatched.slice(0, 4).map((u) => (
                <div key={u.name} className="flex items-center justify-between gap-2 py-0.5 px-1.5 text-text-secondary">
                  <span className="truncate">{u.name}</span>
                  <span className="font-mono tabular-nums">{formatChartNumber(u.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 text-[10px] font-mono tabular-nums text-text-secondary">
            <span>{formatChartNumber(geo.minVal)}</span>
            <div
              className="w-28 h-2 rounded"
              style={{
                background: `linear-gradient(to right, ${colorScale(geo.minVal)}, ${colorScale((geo.minVal + geo.maxVal) / 2)}, ${colorScale(geo.maxVal)})`,
              }}
            />
            <span>{formatChartNumber(geo.maxVal)}</span>
          </div>
        </div>
      );
    }

    // 23. DDoS / CYBER ATTACK MAP (interactive vector filter + pan/zoom + hover + pause/play)
    if (effectiveChartType === 'ddos_map') {
      const mapW = 680;
      const mapH = 340;
      const layout = computeDdosMapLayout(payload, mapW, mapH);
      const landFill = isDark ? '#18181b' : '#f1f5f9';
      const landStroke = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.16)';
      const gratStroke = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)';
      const visibleArcs = ddosVectorFilter
        ? layout.arcs.filter((a) => a.attackType === ddosVectorFilter)
        : layout.arcs;
      const visibleVolume = visibleArcs.reduce((acc, a) => acc + a.volume, 0);
      const maxArcVol = Math.max(1, ...layout.arcs.map((a) => a.volume));

      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono tabular-nums text-text-primary font-medium mr-1">
                {visibleArcs.length} luồng · {formatChartNumber(visibleVolume)} {layout.unit}
              </span>
              {layout.vectors.slice(0, 5).map((v) => {
                const isSelected = ddosVectorFilter === v.name;
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => setDdosVectorFilter((prev) => (prev === v.name ? null : v.name))}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'border-blue-500/60 bg-blue-500/10 text-text-primary'
                        : 'border-border-color text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                    <span>{v.name}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {renderZoomControls(mapTransform.scale > 1 ? `${mapTransform.scale.toFixed(1)}×` : undefined)}
              <button
                type="button"
                onClick={() => setDdosPlaying((p) => !p)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-color text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap shrink-0"
              >
                {ddosPlaying ? <Pause size={11} /> : <Play size={11} />}
                <span>{ddosPlaying ? 'Tạm dừng' : 'Phát lại'}</span>
              </button>
            </div>
          </div>

          {hoveredGeoInfo && (
            <div className="text-[11px] font-mono tabular-nums text-text-primary">
              {hoveredGeoInfo}
            </div>
          )}

          <div
            onWheel={handleMapWheel}
            className={`rounded-xl border overflow-hidden select-none ${
              isDark ? 'border-white/10 bg-[#09090b]' : 'border-slate-200 bg-slate-50'
            }`}
          >
            <svg
              viewBox={`0 0 ${mapW} ${mapH}`}
              className={`w-full h-auto block ${isPanningMap ? 'cursor-grabbing' : 'cursor-grab'}`}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={handleMapPointerUp}
              onPointerLeave={handleMapPointerUp}
            >
              <g
                transform={`translate(${mapTransform.x + mapW / 2}, ${mapTransform.y + mapH / 2}) scale(${mapTransform.scale}) translate(${-mapW / 2}, ${-mapH / 2})`}
              >
                {layout.graticulePath && (
                  <path d={layout.graticulePath} fill="none" stroke={gratStroke} strokeWidth={0.6} />
                )}
                {layout.landPaths.map((dPath, idx) => (
                  <path
                    key={`land-${idx}`}
                    d={dPath}
                    fill={landFill}
                    stroke={landStroke}
                    strokeWidth={0.9 / mapTransform.scale}
                  />
                ))}

                {/* Underlay static arc tracks */}
                {visibleArcs.map((arc) => (
                  <path
                    key={`track-${arc.id}`}
                    d={arc.pathD}
                    fill="none"
                    stroke={arc.color}
                    strokeOpacity={0.18}
                    strokeWidth={(1 + (arc.volume / maxArcVol) * 1.8) / Math.sqrt(mapTransform.scale)}
                  />
                ))}

                {/* Animated attack arcs */}
                {visibleArcs.map((arc) => {
                  const arcDetail = `${arc.sourceName} → ${arc.targetName} · ${arc.attackType} (${formatChartNumber(arc.volume)} ${arc.unit})`;
                  return (
                    <path
                      key={arc.id}
                      data-no-pan="true"
                      d={arc.pathD}
                      fill="none"
                      stroke={arc.color}
                      strokeWidth={(1.2 + (arc.volume / maxArcVol) * 2.2) / Math.sqrt(mapTransform.scale)}
                      strokeLinecap="round"
                      className={`cursor-pointer ${ddosPlaying ? 'tm-ddos-arc-anim' : 'tm-ddos-arc-paused'}`}
                      onMouseEnter={() => setHoveredGeoInfo(arcDetail)}
                      onMouseLeave={() => setHoveredGeoInfo(null)}
                      onClick={() => setSelectedInfo(arcDetail)}
                    />
                  );
                })}

                {/* Source markers */}
                {layout.sources.map((src) => {
                  const info = `Nguồn phát: ${src.name} · ${src.count} luồng (${formatChartNumber(src.totalVolume)} ${layout.unit})`;
                  return (
                    <g
                      key={`src-${src.name}`}
                      data-no-pan="true"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredGeoInfo(info)}
                      onMouseLeave={() => setHoveredGeoInfo(null)}
                      onClick={() => setSelectedInfo(info)}
                    >
                      <circle
                        cx={src.xy[0]}
                        cy={src.xy[1]}
                        r={3.2 / Math.sqrt(mapTransform.scale)}
                        fill="#f59e0b"
                        stroke={surfaceBg}
                        strokeWidth={1 / Math.sqrt(mapTransform.scale)}
                      />
                    </g>
                  );
                })}

                {/* Target markers */}
                {layout.targets.map((tgt) => {
                  const info = `Mục tiêu: ${tgt.name} · hứng ${tgt.count} luồng (${formatChartNumber(tgt.totalVolume)} ${layout.unit})`;
                  return (
                    <g
                      key={`tgt-${tgt.name}`}
                      data-no-pan="true"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredGeoInfo(info)}
                      onMouseLeave={() => setHoveredGeoInfo(null)}
                      onClick={() => setSelectedInfo(info)}
                    >
                      <circle
                        cx={tgt.xy[0]}
                        cy={tgt.xy[1]}
                        r={7.5 / Math.sqrt(mapTransform.scale)}
                        fill="none"
                        stroke="#ef4444"
                        strokeOpacity={0.45}
                        strokeWidth={1.2 / Math.sqrt(mapTransform.scale)}
                      />
                      <circle
                        cx={tgt.xy[0]}
                        cy={tgt.xy[1]}
                        r={3.8 / Math.sqrt(mapTransform.scale)}
                        fill="#ef4444"
                        stroke={surfaceBg}
                        strokeWidth={1.2 / Math.sqrt(mapTransform.scale)}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {layout.targets.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
              {layout.targets.slice(0, 6).map((tgt) => (
                <button
                  key={tgt.name}
                  type="button"
                  onClick={() =>
                    setSelectedInfo(
                      `Mục tiêu: ${tgt.name} · hứng ${tgt.count} luồng (${formatChartNumber(tgt.totalVolume)} ${layout.unit})`
                    )
                  }
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-border-color hover:bg-tertiary/40 text-left transition-colors"
                >
                  <span className="truncate font-medium text-text-primary">{tgt.name}</span>
                  <span className="font-mono tabular-nums text-red-400 shrink-0">
                    {formatChartNumber(tgt.totalVolume)} {layout.unit}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const chartCard = (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? `fixed inset-0 z-[9990] m-0 w-screen h-[100dvh] flex flex-col p-4 sm:p-6 overflow-y-auto ${
              isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-gray-900'
            }`
          : 'my-4 p-4 sm:p-5 bg-secondary/40 rounded-xl border border-border-color'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-text-primary leading-snug">
            {payload.title || CHART_TYPE_LABELS[effectiveChartType]}
          </h4>
          {payload.subtitle ? (
            <p className="text-xs text-text-secondary mt-0.5">{payload.subtitle}</p>
          ) : (
            <p className="text-[11px] text-text-secondary mt-0.5">{CHART_TYPE_LABELS[effectiveChartType]}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenEquationDrawer}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors whitespace-nowrap shrink-0 ${
              equationDrawerOpen
                ? 'border-blue-500/60 bg-blue-500/10 text-text-primary font-medium'
                : 'border-border-color text-text-secondary hover:text-text-primary'
            }`}
            title="Mở menu trượt nhập phương trình toán học"
          >
            <SlidersHorizontal size={12} />
            <span>Phương trình</span>
          </button>

          {supports3D && (
            <div className="flex items-center p-0.5 rounded-lg border border-border-color bg-primary/40 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === '2d'
                    ? isDark
                      ? 'bg-white text-zinc-950 font-medium'
                      : 'bg-zinc-900 text-white font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <BarChart3 size={12} />
                <span>2D</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3d')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === '3d'
                    ? isDark
                      ? 'bg-white text-zinc-950 font-medium'
                      : 'bg-zinc-900 text-white font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
                title="Tương tác 3D xoay/thu phóng"
              >
                <Box size={12} />
                <span>3D</span>
              </button>
            </div>
          )}

          {isMathOrVectorChart && !equationDrawerOpen && (
            <button
              type="button"
              onClick={() => setShowParamPanel((s) => !s)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                showParamPanel
                  ? 'border-blue-500/60 bg-blue-500/10 text-text-primary'
                  : 'border-border-color text-text-secondary hover:text-text-primary'
              }`}
              title="Ẩn/hiện thanh tham số bên dưới"
            >
              <span>Tham số</span>
            </button>
          )}

          {compatibleDisplayTypes.length > 1 && (
            <select
              aria-label="Chọn kiểu hiển thị biểu đồ"
              value={effectiveChartType}
              onChange={(e) => {
                const nextType = e.target.value as UniversalChartType;
                setActivePlotOverride(null);
                setDisplayTypeOverride(nextType === chartType ? null : nextType);
                if (!NATIVE_3D_TYPES.has(nextType) && viewMode === '3d' && !SUPPORTS_3D_VIEW_TYPES.has(nextType)) {
                  setViewMode('2d');
                }
              }}
              className={`px-2 py-1 rounded-lg border text-[11px] outline-none transition-colors cursor-pointer ${
                isDark
                  ? 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
              title="Chọn dạng biểu đồ hiển thị"
            >
              {compatibleDisplayTypes.map((optType) => (
                <option key={optType} value={optType}>
                  {CHART_TYPE_LABELS[optType]}
                </option>
              ))}
            </select>
          )}

          {canSort && (
            <select
              aria-label="Thuật toán sắp xếp dữ liệu"
              value={sortAlgorithm}
              onChange={(e) => setSortAlgorithm(e.target.value as ChartSortAlgorithm)}
              className={`px-2 py-1 rounded-lg border text-[11px] outline-none transition-colors cursor-pointer ${
                sortAlgorithm !== 'none'
                  ? 'border-blue-500/60 bg-blue-500/10 text-text-primary'
                  : isDark
                  ? 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
              title="Chọn thuật toán sắp xếp dữ liệu"
            >
              <option value="none">Sắp xếp: Mặc định</option>
              <option value="quicksort_desc">QuickSort · Giảm dần</option>
              <option value="quicksort_asc">QuickSort · Tăng dần</option>
              <option value="heapsort_top">HeapSort · Top-K</option>
              <option value="mergesort_alpha_asc">MergeSort · A → Z</option>
              <option value="mergesort_alpha_desc">MergeSort · Z → A</option>
              {hasOhlcFields ? (
                <option value="volatility_desc">QuickSort · Biên độ nến</option>
              ) : (
                <option value="volatility_desc">QuickSort · Biến động</option>
              )}
            </select>
          )}

          {canBrush && (
            <button
              type="button"
              onClick={() => setShowBrush((b) => !b)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                showBrush
                  ? 'border-blue-500/60 bg-blue-500/10 text-text-primary'
                  : 'border-border-color text-text-secondary hover:text-text-primary'
              }`}
              title="Bật/tắt thanh chọn vùng thu phóng"
            >
              <ZoomIn size={12} />
              <span>Chọn vùng</span>
            </button>
          )}

          {canShowTable && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-text-primary transition-colors"
              title="Tải dữ liệu CSV"
              aria-label="Tải dữ liệu CSV"
            >
              <FileSpreadsheet size={13} />
            </button>
          )}

          {viewMode === '2d' && (
            <button
              type="button"
              onClick={handleExportSvg}
              className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-text-primary transition-colors"
              title="Tải biểu đồ SVG"
              aria-label="Tải biểu đồ SVG"
            >
              <Download size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isFullscreen
                ? isDark
                  ? 'bg-white text-zinc-950 border-white'
                  : 'bg-zinc-900 text-white border-zinc-900'
                : 'border-border-color text-text-secondary hover:text-text-primary'
            }`}
            title={isFullscreen ? 'Thu nhỏ (Esc)' : 'Xem toàn màn hình'}
            aria-label={isFullscreen ? 'Thu nhỏ' : 'Xem toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {sortResult.summary && (
        <div className="mb-2.5 px-2.5 py-1 rounded-md border border-border-color/70 text-[11px] font-mono tabular-nums text-text-secondary flex items-center justify-between gap-2">
          <span className="truncate">{sortResult.summary}</span>
          <button
            type="button"
            onClick={() => setSortAlgorithm('none')}
            className="text-[10px] text-text-secondary hover:text-text-primary shrink-0"
          >
            Bỏ lọc
          </button>
        </div>
      )}

      {/* Interactive Viewport + Slide-Out Equation Menu */}
      <div className="relative overflow-hidden rounded-lg">
        {renderChartBody()}

        {isMathOrVectorChart && !equationDrawerOpen && (
          <button
            type="button"
            onClick={handleOpenEquationDrawer}
            className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1 pl-1 pr-1.5 py-2.5 rounded-r-md border border-l-0 text-[10px] font-medium transition-colors ${
              isDark
                ? 'bg-zinc-900/95 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800'
                : 'bg-white/95 border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
            title="Mở menu trượt nhập phương trình"
            aria-label="Mở menu trượt nhập phương trình"
          >
            <ChevronRight size={13} />
          </button>
        )}

        {/* Solid-surface slide-out drawer (no backdrop-filter so WebGL remains clean) */}
        <aside
          aria-hidden={!equationDrawerOpen}
          className={`absolute top-0 left-0 bottom-0 z-20 w-72 sm:w-80 border-r flex flex-col transition-transform duration-200 ease-out ${
            equationDrawerOpen ? 'translate-x-0 pointer-events-auto' : '-translate-x-full pointer-events-none'
          } ${
            isDark
              ? 'bg-zinc-950/95 border-zinc-800 text-zinc-100'
              : 'bg-white/95 border-slate-200 text-slate-900'
          }`}
        >
          <div className={`px-3 py-2 border-b flex items-center justify-between gap-2 shrink-0 ${
            isDark ? 'border-zinc-800' : 'border-slate-200'
          }`}>
            <span className="text-xs font-semibold tracking-tight">Phương trình đồ thị</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setActivePlotOverride('coordinate_2d');
                  setViewMode('2d');
                }}
                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                  viewMode !== '3d'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500 font-medium'
                    : isDark
                      ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
                      : 'border-slate-200 text-slate-500 hover:text-slate-800'
                }`}
              >
                Oxy
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePlotOverride('surface_3d');
                  setViewMode('3d');
                }}
                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                  viewMode === '3d'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500 font-medium'
                    : isDark
                      ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
                      : 'border-slate-200 text-slate-500 hover:text-slate-800'
                }`}
              >
                3D
              </button>
              <button
                type="button"
                onClick={() => setEquationDrawerOpen(false)}
                className={`p-1 rounded transition-colors ${
                  isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Thu gọn menu"
                aria-label="Thu gọn menu"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            {/* Quick Equation Presets */}
            <div className="flex flex-wrap gap-1">
              {[
                { id: 'parabola' as const, label: 'Parabol' },
                { id: 'cubic' as const, label: 'Bậc 3' },
                { id: 'trig' as const, label: 'Sin(bx)' },
                { id: 'integral' as const, label: 'Tích phân' },
                { id: 'surface' as const, label: 'Mặt 3D' },
                { id: 'saddle' as const, label: 'Yên ngựa' },
                { id: 'vector2d' as const, label: 'Vector' },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyEquationPreset(preset.id)}
                  className={`px-2 py-0.5 rounded border text-[10px] transition-colors ${
                    isDark
                      ? 'border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-600 hover:text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Direct Live Equation Editors */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-text-secondary">
                {effectiveChartType === 'surface_3d' ? 'Hàm z = f(x, y)' : 'Nhập phương trình'}
              </div>
              {editableFunctions.map((fn, idx) => {
                const probeVars = { ...paramValues, x: 1, y: 1, t: 1, theta: 1 };
                const trimmed = fn.expr.trim();
                const isExprValid = !trimmed || fn.isParametric || Number.isFinite(compileMathExpression(trimmed)(probeVars));
                return (
                  <div
                    key={fn.id}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded border ${
                      !isExprValid
                        ? 'border-amber-500/60'
                        : isDark
                          ? 'border-zinc-800 bg-zinc-900/60'
                          : 'border-slate-200 bg-slate-50/70'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setEditableFunctions((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, visible: !item.visible } : item))
                        )
                      }
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: fn.color, opacity: fn.visible ? 1 : 0.3 }}
                      title="Ẩn / hiện"
                    />
                    <span className="text-[11px] font-mono text-text-secondary shrink-0">
                      {effectiveChartType === 'surface_3d' ? 'z=' : fn.isParametric ? 'r:' : 'y='}
                    </span>
                    <input
                      type="text"
                      value={fn.isParametric ? `(${fn.xExpr}, ${fn.yExpr})` : fn.expr}
                      readOnly={fn.isParametric}
                      placeholder="ax^2 + bx + c"
                      onChange={(e) => {
                        const val = e.target.value;
                        ensureMathPlotActive();
                        const nextList = editableFunctions.map((item, i) =>
                          i === idx ? { ...item, expr: val, label: val || 'f(x)' } : item
                        );
                        syncFunctionsAndParams(nextList);
                      }}
                      className="flex-1 min-w-0 bg-transparent text-[11px] font-mono outline-none"
                    />
                    {editableFunctions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => syncFunctionsAndParams(editableFunctions.filter((_, i) => i !== idx))}
                        className="text-text-secondary hover:text-red-400 shrink-0"
                        title="Xóa"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="flex items-center gap-1 pt-0.5">
                <input
                  type="text"
                  value={newFuncExpr}
                  onChange={(e) => setNewFuncExpr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFuncExpr.trim()) {
                      const clean = newFuncExpr.trim();
                      ensureMathPlotActive();
                      syncFunctionsAndParams([
                        ...editableFunctions,
                        {
                          id: `fn-${Date.now()}`,
                          expr: clean,
                          label: clean,
                          color: PALETTE[editableFunctions.length % PALETTE.length],
                          visible: true,
                        },
                      ]);
                      setNewFuncExpr('');
                    }
                  }}
                  placeholder={effectiveChartType === 'surface_3d' ? 'sin(x)*cos(y)' : 'vd: 2x + 1'}
                  className={`flex-1 min-w-0 px-2 py-1 rounded border text-[11px] font-mono outline-none ${
                    isDark
                      ? 'border-zinc-800 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500'
                      : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newFuncExpr.trim()) return;
                    const clean = newFuncExpr.trim();
                    ensureMathPlotActive();
                    syncFunctionsAndParams([
                      ...editableFunctions,
                      {
                        id: `fn-${Date.now()}`,
                        expr: clean,
                        label: clean,
                        color: PALETTE[editableFunctions.length % PALETTE.length],
                        visible: true,
                      },
                    ]);
                    setNewFuncExpr('');
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] shrink-0 ${
                    isDark
                      ? 'border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Plus size={11} />
                  <span>Thêm</span>
                </button>
              </div>
            </div>

            {/* Domain Range */}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-text-secondary">Miền x:</span>
              <div className="flex items-center gap-1 font-mono">
                <input
                  type="number"
                  step={1}
                  value={customDomain[0]}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val < customDomain[1]) {
                      setCustomDomain([val, customDomain[1]]);
                    }
                  }}
                  className={`w-14 text-right px-1.5 py-0.5 rounded border text-[11px] tabular-nums outline-none ${
                    isDark ? 'border-zinc-800 bg-zinc-900' : 'border-slate-200 bg-white'
                  }`}
                />
                <span className="text-text-secondary">→</span>
                <input
                  type="number"
                  step={1}
                  value={customDomain[1]}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (Number.isFinite(val) && val > customDomain[0]) {
                      setCustomDomain([customDomain[0], val]);
                    }
                  }}
                  className={`w-14 text-right px-1.5 py-0.5 rounded border text-[11px] tabular-nums outline-none ${
                    isDark ? 'border-zinc-800 bg-zinc-900' : 'border-slate-200 bg-white'
                  }`}
                />
              </div>
            </div>

            {/* Interactive Parameters inside Slide-out Drawer */}
            {mathParams.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border-color">
                <div className="flex items-center justify-between text-[11px] text-text-secondary">
                  <span>Tham số</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAnimatingParam(null);
                      const resetMap: Record<string, number> = {};
                      mathParams.forEach((p) => {
                        resetMap[p.name] = p.value;
                      });
                      setParamValues(resetMap);
                    }}
                    className="inline-flex items-center gap-1 hover:text-text-primary"
                  >
                    <RotateCcw size={10} />
                    <span>Đặt lại</span>
                  </button>
                </div>
                <div className="space-y-1.5">
                  {mathParams.map((p) => {
                    const currentVal = paramValues[p.name] ?? p.value;
                    const isAnim = animatingParam === p.name;
                    return (
                      <div
                        key={`drawer-${p.name}`}
                        className={`px-2 py-1.5 rounded border space-y-1 ${
                          isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-slate-200 bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="font-semibold">{p.label || p.name}</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={currentVal}
                              step={p.step}
                              onChange={(e) => {
                                const num = Number(e.target.value);
                                if (Number.isFinite(num)) {
                                  setParamValues((prev) => ({ ...prev, [p.name]: num }));
                                }
                              }}
                              className={`w-14 text-right px-1 py-0.5 rounded border text-[11px] tabular-nums outline-none ${
                                isDark ? 'border-zinc-700 bg-zinc-900' : 'border-slate-200 bg-white'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setAnimatingParam(isAnim ? null : p.name)}
                              className={`p-1 rounded border text-[10px] ${
                                isAnim ? 'border-blue-500 text-blue-500' : 'border-border-color text-text-secondary hover:text-text-primary'
                              }`}
                              title={isAnim ? 'Dừng' : 'Tự chạy'}
                            >
                              {isAnim ? <Pause size={10} /> : <Play size={10} />}
                            </button>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={p.min}
                          max={p.max}
                          step={p.step}
                          value={Math.max(p.min, Math.min(p.max, currentVal))}
                          onChange={(e) =>
                            setParamValues((prev) => ({
                              ...prev,
                              [p.name]: Number(e.target.value),
                            }))
                          }
                          className="w-full h-1.5 accent-blue-600 cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vector Coordinates inside Slide-out Drawer */}
            {editableVectors.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border-color">
                <div className="flex items-center justify-between text-[11px] text-text-secondary">
                  <span>Vector</span>
                  <div className="flex items-center gap-1">
                    {editableVectors.length >= 2 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowVecSum((s) => !s)}
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${
                            showVecSum ? 'border-violet-500/70 text-violet-400' : 'border-border-color text-text-secondary'
                          }`}
                        >
                          u+v
                        </button>
                        {viewMode === '3d' && (
                          <button
                            type="button"
                            onClick={() => setShowVecCross((s) => !s)}
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${
                              showVecCross ? 'border-pink-500/70 text-pink-400' : 'border-border-color text-text-secondary'
                            }`}
                          >
                            u×v
                          </button>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditableVectors((prev) => [
                          ...prev,
                          {
                            id: `vec-${Date.now()}`,
                            label: `v${prev.length + 1}`,
                            origin: [0, 0, 0],
                            components: viewMode === '3d' ? [1, 2, 1] : [2, 1, 0],
                            color: PALETTE[prev.length % PALETTE.length],
                            visible: true,
                          },
                        ])
                      }
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border-color text-[10px] hover:text-text-primary"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {editableVectors.map((vec, vIdx) => {
                    const showZ = viewMode === '3d' || effectiveChartType === 'vector_3d' || vec.components[2] !== 0;
                    return (
                      <div
                        key={`drawer-vec-${vec.id}`}
                        className={`flex items-center justify-between gap-1 px-2 py-1 rounded border text-[11px] font-mono ${
                          isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-slate-200 bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: vec.color, opacity: vec.visible ? 1 : 0.3 }}
                          />
                          <span className="font-semibold truncate">{vec.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {(['x', 'y', ...(showZ ? ['z'] : [])] as const).map((axisName, compIdx) => (
                            <input
                              key={axisName}
                              type="number"
                              step={0.5}
                              value={vec.components[compIdx]}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (!Number.isFinite(val)) return;
                                setEditableVectors((prev) =>
                                  prev.map((item, i) => {
                                    if (i !== vIdx) return item;
                                    const nextComp: [number, number, number] = [...item.components] as [number, number, number];
                                    nextComp[compIdx] = val;
                                    return { ...item, components: nextComp };
                                  })
                                );
                              }}
                              title={`${vec.label}.${axisName}`}
                              className={`w-10 text-right px-1 py-0.5 rounded border text-[10px] tabular-nums outline-none ${
                                isDark ? 'border-zinc-700 bg-zinc-900' : 'border-slate-200 bg-white'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Interactive Math / Function / Vector / Parameter Slider Panel (Minimal) */}
      {isMathOrVectorChart && showParamPanel && !equationDrawerOpen && (
        <div className="mt-3 pt-3 border-t border-border-color space-y-2.5 text-xs">
          {/* Editable Functions */}
          {(editableFunctions.length > 0 || effectiveChartType === 'coordinate_2d' || effectiveChartType === 'integral' || effectiveChartType === 'surface_3d') && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-text-secondary">
                  {effectiveChartType === 'surface_3d' ? 'Phương trình mặt z = f(x, y)' : 'Phương trình hàm số'}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newFuncExpr}
                    onChange={(e) => setNewFuncExpr(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFuncExpr.trim()) {
                        const clean = newFuncExpr.trim();
                        const nextFn: MathFunctionSpec = {
                          id: `fn-${Date.now()}`,
                          expr: clean,
                          label: clean,
                          color: PALETTE[editableFunctions.length % PALETTE.length],
                          visible: true,
                        };
                        const nextList = [...editableFunctions, nextFn];
                        setEditableFunctions(nextList);
                        const inferred = inferMathParameters(payload, nextList);
                        setMathParams(inferred);
                        setParamValues((prev) => {
                          const merged = { ...prev };
                          inferred.forEach((p) => {
                            if (merged[p.name] === undefined) merged[p.name] = p.value;
                          });
                          return merged;
                        });
                        setNewFuncExpr('');
                      }
                    }}
                    placeholder={effectiveChartType === 'surface_3d' ? 'vd: sin(x)*cos(y)' : 'vd: a*x^2 + b*x + c'}
                    className={`px-2 py-1 rounded border text-[11px] font-mono w-40 outline-none ${
                      isDark
                        ? 'border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500'
                        : 'border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newFuncExpr.trim()) return;
                      const clean = newFuncExpr.trim();
                      const nextFn: MathFunctionSpec = {
                        id: `fn-${Date.now()}`,
                        expr: clean,
                        label: clean,
                        color: PALETTE[editableFunctions.length % PALETTE.length],
                        visible: true,
                      };
                      const nextList = [...editableFunctions, nextFn];
                      setEditableFunctions(nextList);
                      const inferred = inferMathParameters(payload, nextList);
                      setMathParams(inferred);
                      setParamValues((prev) => {
                        const merged = { ...prev };
                        inferred.forEach((p) => {
                          if (merged[p.name] === undefined) merged[p.name] = p.value;
                        });
                        return merged;
                      });
                      setNewFuncExpr('');
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border-color text-[11px] text-text-secondary hover:text-text-primary whitespace-nowrap"
                  >
                    <Plus size={11} />
                    <span>Thêm hàm</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {editableFunctions.map((fn, idx) => (
                  <div
                    key={fn.id}
                    className="flex items-center gap-1.5 px-2 py-1 rounded border border-border-color bg-primary/30"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setEditableFunctions((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, visible: !item.visible } : item))
                        )
                      }
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: fn.color, opacity: fn.visible ? 1 : 0.3 }}
                      title="Ẩn / hiện đồ thị"
                    />
                    <span className="text-[11px] font-mono text-text-secondary shrink-0">
                      {effectiveChartType === 'surface_3d' ? 'z =' : fn.isParametric ? 'r(t):' : 'y ='}
                    </span>
                    <input
                      type="text"
                      value={fn.isParametric ? `(${fn.xExpr}, ${fn.yExpr})` : fn.expr}
                      readOnly={fn.isParametric}
                      onChange={(e) => {
                        const val = e.target.value;
                        const nextList = editableFunctions.map((item, i) =>
                          i === idx ? { ...item, expr: val, label: val } : item
                        );
                        syncFunctionsAndParams(nextList);
                      }}
                      className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-text-primary outline-none"
                    />
                    {editableFunctions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          syncFunctionsAndParams(editableFunctions.filter((_, i) => i !== idx))
                        }
                        className="text-text-secondary hover:text-red-400 shrink-0"
                        title="Xóa hàm"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Integral & Riemann Interactive Controls */}
          {(integralEnabled || effectiveChartType === 'integral' || editableFunctions.length > 0) &&
            viewMode === '2d' && (
              <div className="space-y-1.5 pt-1 border-t border-border-color/60">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIntegralEnabled((v) => !v)}
                      className={`px-2 py-0.5 rounded border font-mono text-[10px] transition-colors ${
                        integralEnabled
                          ? 'border-blue-500/60 bg-blue-500/10 text-blue-400 font-semibold'
                          : 'border-border-color text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      ∫ Tích phân
                    </button>
                    {integralEnabled && (
                      <button
                        type="button"
                        onClick={() => setShowTangentLine((v) => !v)}
                        className={`px-2 py-0.5 rounded border font-mono text-[10px] transition-colors ${
                          showTangentLine
                            ? 'border-amber-500/60 bg-amber-500/10 text-amber-400 font-semibold'
                            : 'border-border-color text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        f&apos;(x) Tiếp tuyến
                      </button>
                    )}
                  </div>

                  {integralEnabled && (
                    <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
                      <label className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                        <span>a:</span>
                        <input
                          type="number"
                          step={0.5}
                          value={integralBounds[0]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) setIntegralBounds(([, b]) => [v, b]);
                          }}
                          className={`w-12 text-right px-1 py-0.5 rounded border text-[10px] outline-none ${
                            isDark ? 'border-zinc-700 bg-zinc-900 text-zinc-100' : 'border-zinc-200 bg-white text-zinc-900'
                          }`}
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                        <span>b:</span>
                        <input
                          type="number"
                          step={0.5}
                          value={integralBounds[1]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (Number.isFinite(v)) setIntegralBounds(([a]) => [a, v]);
                          }}
                          className={`w-12 text-right px-1 py-0.5 rounded border text-[10px] outline-none ${
                            isDark ? 'border-zinc-700 bg-zinc-900 text-zinc-100' : 'border-zinc-200 bg-white text-zinc-900'
                          }`}
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
                        <span>n:</span>
                        <input
                          type="number"
                          min={2}
                          max={60}
                          step={2}
                          value={riemannSlices}
                          onChange={(e) => {
                            const v = Math.max(2, Math.min(60, Math.round(Number(e.target.value) || 8)));
                            setRiemannSlices(v);
                          }}
                          className={`w-11 text-right px-1 py-0.5 rounded border text-[10px] outline-none ${
                            isDark ? 'border-zinc-700 bg-zinc-900 text-zinc-100' : 'border-zinc-200 bg-white text-zinc-900'
                          }`}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {integralEnabled && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                    <div className="flex flex-wrap items-center gap-1">
                      {(
                        [
                          { id: 'continuous', label: 'Liên tục' },
                          { id: 'midpoint', label: 'Trung điểm' },
                          { id: 'left', label: 'Trái' },
                          { id: 'right', label: 'Phải' },
                          { id: 'trapezoid', label: 'Hình thang' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setRiemannMethod(m.id)}
                          className={`px-2 py-0.5 rounded border transition-colors ${
                            riemannMethod === m.id
                              ? isDark
                                ? 'border-zinc-200 bg-zinc-100 text-zinc-950 font-medium'
                                : 'border-zinc-900 bg-zinc-900 text-white font-medium'
                              : 'border-border-color text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    {showTangentLine && (
                      <label className="inline-flex items-center gap-1.5 font-mono tabular-nums text-text-secondary">
                        <span>x₀ = {tangentX.toFixed(1)}</span>
                        <input
                          type="range"
                          min={customDomain[0]}
                          max={customDomain[1]}
                          step={0.1}
                          value={tangentX}
                          onChange={(e) => setTangentX(Number(e.target.value))}
                          className="w-24 h-1.5 accent-amber-500 cursor-pointer"
                        />
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

          {/* Parameter Sliders */}
          {mathParams.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-text-secondary">
                <span>Tham số tương tác</span>
                <button
                  type="button"
                  onClick={() => {
                    setAnimatingParam(null);
                    const resetMap: Record<string, number> = {};
                    mathParams.forEach((p) => {
                      resetMap[p.name] = p.value;
                    });
                    setParamValues(resetMap);
                  }}
                  className="inline-flex items-center gap-1 hover:text-text-primary"
                >
                  <RotateCcw size={10} />
                  <span>Đặt lại tham số</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {mathParams.map((p) => {
                  const currentVal = paramValues[p.name] ?? p.value;
                  const isAnim = animatingParam === p.name;
                  return (
                    <div
                      key={p.name}
                      className="px-2.5 py-1.5 rounded border border-border-color bg-primary/30 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                        <span className="font-semibold text-text-primary">{p.label || p.name}</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={currentVal}
                            step={p.step}
                            onChange={(e) => {
                              const num = Number(e.target.value);
                              if (Number.isFinite(num)) {
                                setParamValues((prev) => ({ ...prev, [p.name]: num }));
                              }
                            }}
                            className={`w-14 text-right px-1 py-0.5 rounded border text-[11px] tabular-nums outline-none ${
                              isDark
                                ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
                                : 'border-zinc-200 bg-white text-zinc-900'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setAnimatingParam(isAnim ? null : p.name)}
                            className={`p-1 rounded border text-[10px] ${
                              isAnim
                                ? 'border-blue-500 text-blue-500'
                                : 'border-border-color text-text-secondary hover:text-text-primary'
                            }`}
                            title={isAnim ? 'Dừng tự chạy' : 'Chạy tham số tự động'}
                          >
                            {isAnim ? <Pause size={10} /> : <Play size={10} />}
                          </button>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={Math.max(p.min, Math.min(p.max, currentVal))}
                        onChange={(e) =>
                          setParamValues((prev) => ({
                            ...prev,
                            [p.name]: Number(e.target.value),
                          }))
                        }
                        className="w-full h-1.5 accent-blue-600 cursor-pointer"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vector Coordinates Editor & Vector Algebra Readout */}
          {editableVectors.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-text-secondary">
                  <span>Vector:</span>
                  {vectorSummary.dot !== undefined && (
                    <span>
                      u·v = <strong className="text-text-primary">{formatChartNumber(vectorSummary.dot)}</strong>
                    </span>
                  )}
                  {vectorSummary.angleDeg !== undefined && (
                    <span>
                      ∠(u,v) = <strong className="text-text-primary">{vectorSummary.angleDeg.toFixed(1)}°</strong>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {editableVectors.length >= 2 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowVecSum((s) => !s)}
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                          showVecSum
                            ? 'border-violet-500/70 bg-violet-500/10 text-violet-400'
                            : 'border-border-color text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        u + v
                      </button>
                      {(viewMode === '3d' || effectiveChartType === 'vector_3d') && (
                        <button
                          type="button"
                          onClick={() => setShowVecCross((s) => !s)}
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                            showVecCross
                              ? 'border-pink-500/70 bg-pink-500/10 text-pink-400'
                              : 'border-border-color text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          u × v
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setEditableVectors((prev) => [
                        ...prev,
                        {
                          id: `vec-${Date.now()}`,
                          label: `v${prev.length + 1}`,
                          origin: [0, 0, 0],
                          components: viewMode === '3d' || effectiveChartType === 'vector_3d' ? [1, 2, 1] : [2, 1, 0],
                          color: PALETTE[prev.length % PALETTE.length],
                          visible: true,
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border-color text-[10px] text-text-secondary hover:text-text-primary"
                  >
                    <Plus size={10} />
                    <span>Thêm vector</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {editableVectors.map((vec, vIdx) => {
                  const len = Math.hypot(vec.components[0], vec.components[1], vec.components[2]);
                  const showZ = viewMode === '3d' || effectiveChartType === 'vector_3d' || vec.components[2] !== 0;
                  return (
                    <div
                      key={vec.id}
                      className="flex flex-wrap items-center justify-between gap-1.5 px-2 py-1 rounded border border-border-color bg-primary/30 text-[11px] font-mono"
                    >
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setEditableVectors((prev) =>
                              prev.map((item, i) => (i === vIdx ? { ...item, visible: !item.visible } : item))
                            )
                          }
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: vec.color, opacity: vec.visible ? 1 : 0.3 }}
                          title="Ẩn / hiện vector"
                        />
                        <span className="font-semibold text-text-primary">{vec.label}</span>
                        <span className="text-[10px] text-text-secondary tabular-nums">|{vec.label}|={len.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {(['x', 'y', ...(showZ ? ['z'] : [])] as const).map((axisName, compIdx) => (
                          <label key={axisName} className="inline-flex items-center gap-0.5 text-[10px] text-text-secondary">
                            <span>{axisName}:</span>
                            <input
                              type="number"
                              step={0.5}
                              value={vec.components[compIdx]}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (!Number.isFinite(val)) return;
                                setEditableVectors((prev) =>
                                  prev.map((item, i) => {
                                    if (i !== vIdx) return item;
                                    const nextComp: [number, number, number] = [...item.components] as [number, number, number];
                                    nextComp[compIdx] = val;
                                    return { ...item, components: nextComp };
                                  })
                                );
                              }}
                              className={`w-12 text-right px-1 py-0.5 rounded border text-[11px] tabular-nums outline-none ${
                                isDark
                                  ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
                                  : 'border-zinc-200 bg-white text-zinc-900'
                              }`}
                            />
                          </label>
                        ))}
                        {editableVectors.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditableVectors((prev) => prev.filter((_, i) => i !== vIdx))
                            }
                            className="text-text-secondary hover:text-red-400 ml-0.5"
                            title="Xóa vector"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedInfo && (
        <div className="mt-3 pt-2.5 border-t border-border-color flex items-center justify-between gap-3 text-xs">
          <span className="font-mono tabular-nums text-text-primary truncate">{selectedInfo}</span>
          <button
            type="button"
            onClick={() => {
              setSelectedInfo(null);
              setPinnedLabel(null);
              setSelectedNetNode(null);
              setActivePieIdx(null);
            }}
            className="text-[11px] text-text-secondary hover:text-text-primary shrink-0"
          >
            Đóng
          </button>
        </div>
      )}
    </div>
  );

  return isFullscreen && typeof document !== 'undefined'
    ? createPortal(chartCard, document.body)
    : chartCard;
});

import { describe, it, expect } from 'vitest';
import {
  normalizeChartType,
  parseChartJsonSafe,
  buildHistogramData,
  computeBoxStats,
  computeViolinData,
  buildWaterfallData,
  normalizeHierarchyData,
  computeSankeyLayout,
  computeNetworkLayout,
  matchGeoShapeValues,
  quickSortChartRows,
  mergeSortChartRows,
  heapSortChartRows,
  applyChartSortAlgorithm,
  getCompatibleChartDisplayTypes,
} from '../src/lib/chartData';
import {
  analyzeVectors,
  compileMathExpression,
  detectQuadraticHighlights,
  inferMathParameters,
  normalizeFunctions2D,
  normalizeVectors,
  sampleFunction2D,
  sampleSurface3D,
} from '../src/lib/mathGraphEngine';
import { extractFilesFromMarkdown } from '../src/lib/fileGenerator';
import { getSystemPrompt } from '../src/lib/neuralBridge';
import { AIMode, Language } from '../src/types';

describe('Universal Chart Engine (25+ Chart Types & 3D Math)', () => {
  it('normalizes all 25+ chart types, math, vector, and 3D aliases cleanly', () => {
    const expectedPairs: Array<[string, string]> = [
      ['bar', 'bar'],
      ['column', 'bar'],
      ['grouped_bar', 'grouped_bar'],
      ['stacked_bar', 'stacked_bar'],
      ['horizontal_bar', 'horizontal_bar'],
      ['line', 'line'],
      ['pie', 'pie'],
      ['donut', 'donut'],
      ['doughnut', 'donut'],
      ['area', 'area'],
      ['combo', 'combo'],
      ['composed', 'combo'],
      ['pictogram', 'pictogram'],
      ['histogram', 'histogram'],
      ['boxplot', 'boxplot'],
      ['box_plot', 'boxplot'],
      ['violin', 'violin'],
      ['scatter', 'scatter'],
      ['bubble', 'bubble'],
      ['heatmap', 'heatmap'],
      ['radar', 'radar'],
      ['waterfall', 'waterfall'],
      ['funnel', 'funnel'],
      ['treemap', 'treemap'],
      ['sunburst', 'sunburst'],
      ['candlestick', 'candlestick'],
      ['ohlc', 'ohlc'],
      ['gantt', 'gantt'],
      ['sankey', 'sankey'],
      ['network', 'network'],
      ['geo', 'choropleth'],
      ['choropleth', 'choropleth'],
      ['parabol', 'coordinate_2d'],
      ['parabola', 'coordinate_2d'],
      ['oxy', 'coordinate_2d'],
      ['vector', 'vector_2d'],
      ['vector_2d', 'vector_2d'],
      ['paraboloid', 'surface_3d'],
      ['surface_3d', 'surface_3d'],
      ['oxyz', 'vector_3d'],
      ['vector_3d', 'vector_3d'],
      ['helix', 'parametric_3d'],
      ['scatter_3d', 'scatter_3d'],
    ];

    for (const [input, expected] of expectedPairs) {
      expect(normalizeChartType(input)).toBe(expected);
    }

    expect(normalizeChartType('unknown', { type: 'unknown', zExpression: 'x^2 + y^2' })).toBe('surface_3d');
    expect(
      normalizeChartType('unknown', { type: 'unknown', vectors: [{ x: 1, y: 2, z: 3 }] })
    ).toBe('vector_3d');
  });

  it('repairs trailing commas / comments in chart JSON and computes histogram bins from raw values', () => {
    const parsed = parseChartJsonSafe(`{
      // sample
      "type": "histogram",
      "values": [1, 2, 2, 3, 4, 4, 4, 5, 8, 9,],
    }`);
    expect(parsed).not.toBeNull();
    const bins = buildHistogramData(parsed!);
    expect(bins.length).toBeGreaterThanOrEqual(3);
    const totalCount = bins.reduce((acc, b) => acc + b.count, 0);
    expect(totalCount).toBe(10);
  });

  it('computes Box Plot quartiles/outliers and Violin KDE curves accurately', () => {
    const raw = [
      { name: 'Nhóm A', values: [10, 12, 13, 14, 15, 16, 17, 18, 45] },
      { name: 'Nhóm B', min: 5, q1: 10, median: 15, q3: 20, max: 25 },
    ];
    const box = computeBoxStats(raw);
    expect(box.length).toBe(2);
    expect(box[0].median).toBe(15);
    expect(box[0].outliers).toContain(45);
    expect(box[1].q1).toBe(10);

    const violin = computeViolinData(raw, 20);
    expect(violin.length).toBe(2);
    expect(violin[0].density.length).toBe(21);
    expect(violin[0].maxDensity).toBeGreaterThan(0);
  });

  it('computes Waterfall cumulative steps including decreases and totals', () => {
    const steps = buildWaterfallData([
      { name: 'Khởi đầu', value: 100 },
      { name: 'Doanh thu', value: 50 },
      { name: 'Chi phí', value: -30 },
      { name: 'Lợi nhuận', isTotal: true },
    ]);
    expect(steps.length).toBe(4);
    expect(steps[2].start).toBe(150);
    expect(steps[2].end).toBe(120);
    expect(steps[3].isTotal).toBe(true);
    expect(steps[3].delta).toBe(120);
  });

  it('normalizes hierarchical tree and flat grouped data for Treemap & Sunburst', () => {
    const tree = normalizeHierarchyData({
      type: 'treemap',
      title: 'Ngân sách',
      data: [
        { category: 'Kỹ thuật', name: 'Cloud', value: 40 },
        { category: 'Kỹ thuật', name: 'AI', value: 60 },
        { category: 'Marketing', name: 'Ads', value: 30 },
      ],
    });
    expect(tree.children?.length).toBe(2);
    expect(tree.children?.[0].children?.length).toBe(2);
  });

  it('computes Sankey ribbon paths and Network force positions without NaN', () => {
    const sankey = computeSankeyLayout(
      {
        type: 'sankey',
        nodes: [{ name: 'Nguồn A' }, { name: 'Trung gian' }, { name: 'Đầu ra' }],
        links: [
          { source: 'Nguồn A', target: 'Trung gian', value: 80 },
          { source: 'Trung gian', target: 'Đầu ra', value: 80 },
        ],
      },
      600,
      280
    );
    expect(sankey.nodes.length).toBe(3);
    expect(sankey.links.length).toBe(2);
    expect(sankey.links[0].path).toContain('M');

    const net = computeNetworkLayout(
      {
        type: 'network',
        nodes: [{ id: 'n1', label: 'Server' }, { id: 'n2', label: 'Client' }],
        links: [{ source: 'n1', target: 'n2', weight: 2 }],
      },
      600,
      300
    );
    expect(net.nodes.length).toBe(2);
    expect(Number.isFinite(net.nodes[0].x)).toBe(true);
    expect(Number.isFinite(net.nodes[1].y)).toBe(true);
  });

  it('auto-detects Vietnam vs World regions offline for Geo/Choropleth charts', () => {
    const vn = matchGeoShapeValues(
      [
        { name: 'Hà Nội', value: 8.5 },
        { name: 'TP.HCM', value: 9.6 },
        { name: 'Đà Nẵng', value: 1.2 },
      ],
      'auto'
    );
    expect(vn.mode).toBe('vietnam');
    expect(vn.shapes.some((s) => s.id === 'VN_SE' && s.value === 9.6)).toBe(true);

    const world = matchGeoShapeValues(
      [
        { name: 'Vietnam', value: 100 },
        { name: 'Japan', value: 125 },
        { name: 'USA', value: 335 },
      ],
      'auto'
    );
    expect(world.mode).toBe('world');
    expect(world.shapes.some((s) => s.id === 'VN' && s.value === 100)).toBe(true);
  });

  it('compiles math expressions safely, infers parameters, detects parabola vertex, and computes 3D surfaces & vectors', () => {
    const fn = compileMathExpression('a*x^2 - 4x + c');
    expect(fn({ a: 1, c: 3, x: 2 })).toBe(-1);
    const negPow = compileMathExpression('-x^2 + 1');
    expect(negPow({ x: 3 })).toBe(-8);

    const fns = normalizeFunctions2D({ expression: 'a*x^2 + b*x + c' });
    const params = inferMathParameters({}, fns);
    expect(params.map((p) => p.name)).toEqual(['a', 'b', 'c']);

    const quad = detectQuadraticHighlights('a*x^2 + b*x + c', { a: 1, b: -4, c: 3 });
    expect(quad.vertex).toEqual([2, -1]);
    expect(quad.roots.sort((a, b) => a - b)).toEqual([1, 3]);

    const segs = sampleFunction2D('tan(x)', {}, -3, 3, 120, 15);
    expect(segs.length).toBeGreaterThanOrEqual(2); // Split cleanly across tan(x) asymptotes

    const surf = sampleSurface3D('x^2 + y^2', {}, [-2, 2], [-2, 2], 10);
    expect(surf.zMin).toBeCloseTo(0, 5);
    expect(surf.zMax).toBeCloseTo(8, 5);

    const vecs = normalizeVectors({
      vectors: [
        { label: 'u', x: 1, y: 0, z: 0 },
        { label: 'v', x: 0, y: 2, z: 0 },
      ],
    });
    const vecStats = analyzeVectors(vecs);
    expect(vecStats.dot).toBe(0);
    expect(vecStats.angleDeg).toBeCloseTo(90, 5);
    expect(vecStats.sum).toEqual([1, 2, 0]);
    expect(vecStats.cross).toEqual([0, 0, 2]);
  });

  it('ignores chart/recharts/mathplot/plot3d blocks during workspace file extraction and documents all charts in system prompt', () => {
    const md = [
      '```chart',
      '{"type":"donut","data":[{"name":"A","value":10}]}',
      '```',
      '```mathplot',
      '{"type":"coordinate_2d","expression":"x^2"}',
      '```',
      '```plot3d',
      '{"type":"surface_3d","zExpression":"x^2+y^2"}',
      '```',
      '```recharts',
      '{"type":"sankey","nodes":[],"links":[]}',
      '```',
    ].join('\n');
    expect(extractFilesFromMarkdown(md).length).toBe(0);

    const prompt = getSystemPrompt(AIMode.MATH, Language.VIETNAMESE, '', '', false, 2);
    for (const chartKey of [
      'grouped_bar',
      'stacked_bar',
      'horizontal_bar',
      'donut',
      'combo',
      'pictogram',
      'histogram',
      'boxplot',
      'violin',
      'scatter',
      'bubble',
      'heatmap',
      'radar',
      'waterfall',
      'funnel',
      'treemap',
      'sunburst',
      'candlestick',
      'ohlc',
      'gantt',
      'sankey',
      'network',
      'choropleth',
      'coordinate_2d',
      'vector_2d',
      'surface_3d',
      'vector_3d',
      'parametric_3d',
      'scatter_3d',
    ]) {
      expect(prompt).toContain(chartKey);
    }
  });

  it('normalizes Vietnamese candlestick aliases, resolves compatible displays, and runs QuickSort / MergeSort / HeapSort accurately', () => {
    expect(normalizeChartType('sơ đồ nến')).toBe('candlestick');
    expect(normalizeChartType('biểu đồ nến')).toBe('candlestick');
    expect(normalizeChartType('vẽ nến')).toBe('candlestick');

    const rows = [
      { name: 'Tháng 3', value: 42 },
      { name: 'Tháng 1', value: 85 },
      { name: 'Tháng 2', value: 19 },
      { name: 'Tháng 4', value: 64 },
    ];

    expect(quickSortChartRows(rows, (r) => r.value, 'desc').map((r) => r.value)).toEqual([85, 64, 42, 19]);
    expect(quickSortChartRows(rows, (r) => r.value, 'asc').map((r) => r.value)).toEqual([19, 42, 64, 85]);
    expect(heapSortChartRows(rows, (r) => r.value, 'desc').map((r) => r.value)).toEqual([85, 64, 42, 19]);
    expect(
      mergeSortChartRows(rows, (a, b) => a.name.localeCompare(b.name, 'vi')).map((r) => r.name)
    ).toEqual(['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4']);

    const sortedSummary = applyChartSortAlgorithm(rows, 'heapsort_top', 'name', 'value');
    expect(sortedSummary.topLabel).toBe('Tháng 1');
    expect(sortedSummary.topValue).toBe(85);
    expect(sortedSummary.minLabel).toBe('Tháng 2');
    expect(sortedSummary.summary).toContain('HeapSort (Top-K)');

    const candles = [
      { date: 'D1', open: 100, high: 104, low: 99, close: 102 },
      { date: 'D2', open: 102, high: 120, low: 100, close: 118 },
      { date: 'D3', open: 118, high: 122, low: 115, close: 116 },
    ];
    const volSort = applyChartSortAlgorithm(candles, 'volatility_desc', 'date', 'close');
    expect(volSort.rows[0].date).toBe('D2'); // largest High-Low span = 20
    expect(getCompatibleChartDisplayTypes('candlestick', { type: 'candlestick', data: candles })).toEqual([
      'candlestick',
      'ohlc',
      'line',
      'area',
      'bar',
    ]);
    expect(getCompatibleChartDisplayTypes('bar', { type: 'bar', data: rows })).toContain('radar');
  });
});


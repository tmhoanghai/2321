import { describe, expect, it } from 'vitest';
import {
  acquireFullscreenLock,
  getFullscreenLockCount,
  isFullscreenLocked,
  releaseFullscreenLock,
  subscribeFullscreenLock,
} from '../src/lib/fullscreenBus';
import { getCompatibleChartDisplayTypes, normalizeChartType } from '../src/lib/chartData';
import {
  buildBigODataset,
  estimateBigORuntime,
  formatBigOOps,
  parseBigOSpecsFromPayload,
} from '../src/lib/bigOEngine';
import { layoutFlowchartGraph, normalizeFlowchartPayload } from '../src/lib/flowchartEngine';
import { classifyImplicitVisualIntent } from '../src/lib/neuralBridge';
import { normalizeTradingViewInterval } from '../src/lib/tradingView';
import { formatCandleDate, runSixTierTradingAnalysis, type OhlcvBar } from '../api/_tradingTools';
import {
  DEFAULT_TCN_WEIGHT_BUNDLE,
  isValidTcnWeightBundle,
  loadClientTcnWeights,
  runClientTcnInference,
} from '../src/lib/tcnClientEngine';
import {
  CURRENT_RELEASE_NAME,
  CURRENT_RELEASE_VERSION,
  UPDATE_LOG_ENTRIES,
} from '../src/lib/updateLogData';

describe('Fullscreen Bus & Navbar Isolation', () => {
  it('ref-counts fullscreen locks and notifies subscribers accurately', () => {
    const events: Array<{ locked: boolean; count: number }> = [];
    const unsub = subscribeFullscreenLock((locked, count) => {
      events.push({ locked, count });
    });

    expect(isFullscreenLocked()).toBe(false);
    const t1 = acquireFullscreenLock();
    const t2 = acquireFullscreenLock();
    expect(isFullscreenLocked()).toBe(true);
    expect(getFullscreenLockCount()).toBe(2);

    releaseFullscreenLock(t1);
    expect(isFullscreenLocked()).toBe(true);
    expect(getFullscreenLockCount()).toBe(1);

    releaseFullscreenLock(t2);
    // Double release is a safe no-op
    releaseFullscreenLock(t2);
    expect(isFullscreenLocked()).toBe(false);
    expect(getFullscreenLockCount()).toBe(0);

    unsub();
    expect(events[0]).toEqual({ locked: false, count: 0 });
    expect(events.some((e) => e.locked && e.count === 2)).toBe(true);
    expect(events[events.length - 1]).toEqual({ locked: false, count: 0 });
  });
});

describe('Big O Complexity Chart Engine & Classification', () => {
  it('recognizes big_o aliases and implicit intent', () => {
    expect(normalizeChartType('big_o')).toBe('big_o');
    expect(normalizeChartType('do_phuc_tap')).toBe('big_o');
    expect(
      normalizeChartType(undefined, {
        type: '',
        complexities: ['O(1)', 'O(log n)', 'O(n^2)'],
      })
    ).toBe('big_o');
    expect(getCompatibleChartDisplayTypes('big_o', null)).toContain('big_o');
    expect(
      classifyImplicitVisualIntent('Hãy vẽ đồ thị so sánh độ phức tạp Big O của O(n log n) và O(n^2)').preferChart
    ).toBe(true);
  });

  it('computes accurate asymptotic growth order, linear clamping, and log10 scaling', () => {
    const { specs, nMax } = parseBigOSpecsFromPayload({
      type: 'big_o',
      complexities: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)', 'O(n^2)', 'O(2^n)'],
      nMax: 50,
    });
    expect(nMax).toBe(50);
    expect(specs).toHaveLength(6);

    const linear = buildBigODataset(specs, 50, 20, false);
    const mapLin = new Map(linear.summaries.map((s) => [s.notation, s.opsAtN]));
    expect(mapLin.get('O(1)')).toBe(1);
    expect(mapLin.get('O(n)')).toBe(20);
    expect(mapLin.get('O(n²)')).toBe(400);
    expect(mapLin.get('O(2ⁿ)')).toBe(Math.pow(2, 20));
    expect(mapLin.get('O(log n)')!).toBeLessThan(mapLin.get('O(n)')!);
    expect(mapLin.get('O(n log n)')!).toBeGreaterThan(mapLin.get('O(n)')!);

    const logScaled = buildBigODataset(specs, 50, 20, true);
    const lastRow = logScaled.rows[logScaled.rows.length - 1];
    expect(lastRow['O(2ⁿ)']).toBeCloseTo(Math.log10(Math.pow(2, 50)), 4);
    expect(formatBigOOps(1_500_000)).toBe('1.50M');
    expect(estimateBigORuntime(50)).toBe('< 1 µs');
    expect(estimateBigORuntime(100)).toBe('1.0 µs');
  });
});

describe('Interactive Data Flowchart Engine', () => {
  it('detects flowchart payload variants and builds default Binary Search flowchart', () => {
    expect(normalizeChartType('flowchart')).toBe('flowchart');
    expect(normalizeChartType('so_do_luong')).toBe('flowchart');
    expect(
      normalizeChartType(undefined, {
        type: '',
        nodes: [
          { id: 'a', label: 'Start', kind: 'start' },
          { id: 'b', label: 'Check', kind: 'decision' },
        ],
        edges: [['a', 'b']],
      })
    ).toBe('flowchart');
    expect(
      classifyImplicitVisualIntent('Vẽ sơ đồ luồng dữ liệu flowchart cho thuật toán sắp xếp').preferChart
    ).toBe(true);

    const fallback = normalizeFlowchartPayload({ type: 'flowchart' });
    expect(fallback.nodes.some((n) => n.kind === 'decision')).toBe(true);
    expect(fallback.edges.some((e) => e.isBackEdge)).toBe(true);

    const layout = layoutFlowchartGraph(fallback.nodes, fallback.edges);
    expect(layout.nodes.length).toBe(fallback.nodes.length);
    expect(layout.edges.filter((e) => e.isBackEdge).length).toBeGreaterThanOrEqual(1);
    expect(layout.stepsOrder[0]).toBe('start');
    expect(layout.width).toBeGreaterThan(400);
    expect(layout.height).toBeGreaterThan(200);
  });

  it('lays out custom decision diamonds and loop back-edges cleanly', () => {
    const normalized = normalizeFlowchartPayload({
      type: 'flowchart',
      nodes: [
        { id: 's', label: 'Input n', kind: 'io', description: 'Read n' },
        { id: 'loop', label: 'i < n ?', kind: 'decision', description: 'Loop check' },
        { id: 'body', label: 'sum += i', kind: 'process', description: 'Accumulate' },
        { id: 'done', label: 'Return sum', kind: 'end', description: 'Finish' },
      ],
      edges: [
        { from: 's', to: 'loop' },
        { from: 'loop', to: 'body', label: 'True' },
        { from: 'body', to: 'loop', label: 'i++', isBackEdge: true },
        { from: 'loop', to: 'done', label: 'False' },
      ],
    });
    const layout = layoutFlowchartGraph(normalized.nodes, normalized.edges);
    const loopNode = layout.nodes.find((n) => n.id === 'loop')!;
    const bodyNode = layout.nodes.find((n) => n.id === 'body')!;
    expect(bodyNode.layer).toBeGreaterThan(loopNode.layer);
    const backEdge = layout.edges.find((e) => e.from === 'body' && e.to === 'loop')!;
    expect(backEdge.isBackEdge).toBe(true);
    expect(backEdge.pathD).toContain('C ');
  });
});

describe('Trading 1m/5m Intraday Formatting & Upgraded 6-Tier Quant Pipeline', () => {
  it('supports 1m and 5m intervals and preserves UTC minutes in candle timestamps', () => {
    expect(normalizeTradingViewInterval('1m')).toBe('1');
    expect(normalizeTradingViewInterval('5m')).toBe('5');
    expect(normalizeTradingViewInterval('1')).toBe('1');
    expect(normalizeTradingViewInterval('5')).toBe('5');

    const ts = Date.UTC(2026, 10, 27, 14, 37, 0);
    expect(formatCandleDate(ts, '1m')).toBe('11-27 14:37');
    expect(formatCandleDate(ts, '5m')).toBe('11-27 14:37');
    expect(formatCandleDate(ts, '1d')).toBe('2026-11-27');
  });

  it('computes Hurst, Garman-Klass vol, OU half-life, Kyle Lambda, L2 Bid/Ask % & 7-modality DL heads', () => {
    const trendingCandles: OhlcvBar[] = Array.from({ length: 120 }, (_, i) => {
      const base = 100 + i * 0.65 + Math.sin(i * 0.45) * 1.1;
      const open = Number((base - 0.25).toFixed(2));
      const close = Number((base + 0.35).toFixed(2));
      const high = Number((Math.max(open, close) + 0.55).toFixed(2));
      const low = Number((Math.min(open, close) - 0.45).toFixed(2));
      return {
        date: formatCandleDate(Date.UTC(2026, 10, 27, 0, 0) + i * 60_000, '1m'),
        open,
        high,
        low,
        close,
        volume: 1200 + (i % 7) * 180,
      };
    });

    const analysis = runSixTierTradingAnalysis(trendingCandles, {
      orderBookImbalance: 0.24,
      spreadBps: 1.4,
      takerBuyRatio: 0.61,
      estimatedSlippage10kBps: 1.9,
      bestBid: 177.5,
      bestAsk: 177.52,
      bidDepthNotional: 250000,
      askDepthNotional: 155000,
    });

    // Tier 2 upgrades
    expect(analysis.tier2_quantitative.hurstExponent).not.toBeNull();
    expect(analysis.tier2_quantitative.hurstExponent!).toBeGreaterThan(0.45);
    expect(analysis.tier2_quantitative.garmanKlassVolPct).not.toBeNull();
    expect(analysis.tier2_quantitative.garmanKlassVolPct!).toBeGreaterThan(0);

    // Tier 3 upgrades with L2 depth
    expect(analysis.tier3_microstructure.orderBookStatus).toBe('live_l2_depth');
    expect(analysis.tier3_microstructure.bidAskImbalancePct).toBeCloseTo(24, 1);
    expect(analysis.tier3_microstructure.kylesLambdaBpsPer100k).not.toBeNull();
    expect(analysis.tier3_microstructure.kylesLambdaBpsPer100k!).toBeGreaterThan(0);

    // Tier 4 7-modality encoder & TCN / PatchTST / Transformer heads
    const fv = analysis.tier4_deepLearningPipeline.featureVector;
    expect(Object.keys(fv)).toEqual([
      'ohlcv',
      'orderFlow',
      'volume',
      'volatility',
      'marketStructure',
      'indicators',
      'multiTimeframe',
    ]);
    const heads = analysis.tier4_deepLearningPipeline.modelHeads;
    expect(Number.isFinite(heads.tcnScore)).toBe(true);
    expect(Number.isFinite(heads.patchTstScore)).toBe(true);
    expect(Number.isFinite(heads.transformerScore)).toBe(true);
    expect(heads.ensembleScore).toBeGreaterThan(0);
    expect(analysis.tier6_multiModelMeta.metaModel.pUp + analysis.tier6_multiModelMeta.metaModel.pDown + analysis.tier6_multiModelMeta.metaModel.pNeutral).toBeCloseTo(1, 2);
  });

  it('never fabricates L2 Bid/Ask imbalance when free feed has no L2 depth and computes finite OU half-life', () => {
    const oscillatingCandles: OhlcvBar[] = Array.from({ length: 100 }, (_, i) => {
      const wave = Math.sin(i * 0.7) * 3.5;
      const open = Number((50 + wave * 0.8).toFixed(2));
      const close = Number((50 + wave).toFixed(2));
      return {
        date: formatCandleDate(Date.UTC(2026, 10, 27, 0, 0) + i * 300_000, '5m'),
        open,
        high: Number((Math.max(open, close) + 0.6).toFixed(2)),
        low: Number((Math.min(open, close) - 0.6).toFixed(2)),
        close,
        volume: 850 + (i % 5) * 90,
      };
    });

    const analysis = runSixTierTradingAnalysis(oscillatingCandles, null);
    expect(analysis.tier3_microstructure.orderBookStatus).toBe('unavailable_free_feed');
    expect(analysis.tier3_microstructure.bidAskImbalancePct).toBeNull();
    expect(analysis.tier3_microstructure.obi).toBeNull();
    expect(analysis.tier2_quantitative.meanReversionHalfLifeBars).not.toBeNull();
    expect(analysis.tier2_quantitative.meanReversionHalfLifeBars!).toBeGreaterThan(0);
  });
});

describe('TheMaster ver 2.8 — Knowledge Update: Client-Side Causal Dilated TCN Engine', () => {
  it('provides an ultra-lightweight valid TCN weight bundle (< 6 KB) and loads cleanly on client', async () => {
    expect(isValidTcnWeightBundle(DEFAULT_TCN_WEIGHT_BUNDLE)).toBe(true);
    expect(DEFAULT_TCN_WEIGHT_BUNDLE.dilations).toEqual([1, 2, 4]);
    expect(DEFAULT_TCN_WEIGHT_BUNDLE.receptiveField).toBe(15);

    const serialized = JSON.stringify(DEFAULT_TCN_WEIGHT_BUNDLE);
    expect(serialized.length).toBeLessThan(6000);

    const loaded = await loadClientTcnWeights();
    expect(loaded.bundle.version).toBe('tcn-v2.8-lite');
    expect(loaded.meta.paramCount).toBe(DEFAULT_TCN_WEIGHT_BUNDLE.paramCount);
  });

  it('predicts directional short-term trend on client and stays consistent with server Tier 4 TCN head', () => {
    const bullishCandles: OhlcvBar[] = Array.from({ length: 60 }, (_, i) => {
      const base = 100 + i * 0.9;
      return {
        date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        open: Number((base - 0.35).toFixed(2)),
        high: Number((base + 0.75).toFixed(2)),
        low: Number((base - 0.55).toFixed(2)),
        close: Number((base + 0.55).toFixed(2)),
        volume: 1000 + i * 35,
      };
    });

    const bearishCandles: OhlcvBar[] = Array.from({ length: 60 }, (_, i) => {
      const base = 200 - i * 0.9;
      return {
        date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
        open: Number((base + 0.35).toFixed(2)),
        high: Number((base + 0.55).toFixed(2)),
        low: Number((base - 0.75).toFixed(2)),
        close: Number((base - 0.55).toFixed(2)),
        volume: 1000 + i * 35,
      };
    });

    const bullPred = runClientTcnInference(bullishCandles);
    expect(bullPred.runtimeMode).toBe('client-browser');
    expect(bullPred.shortTermTrend).toBe('BULLISH');
    expect(bullPred.directionScore).toBeGreaterThan(0.15);
    expect(bullPred.pUp).toBeGreaterThan(bullPred.pDown);
    expect(bullPred.pUp + bullPred.pDown + bullPred.pNeutral).toBeCloseTo(1, 2);
    expect(bullPred.layerActivations.d1Norm).toBeGreaterThan(0);
    expect(bullPred.layerActivations.d2Norm).toBeGreaterThan(0);
    expect(bullPred.layerActivations.d4Norm).toBeGreaterThan(0);

    const bearPred = runClientTcnInference(bearishCandles);
    expect(bearPred.shortTermTrend).toBe('BEARISH');
    expect(bearPred.directionScore).toBeLessThan(-0.15);
    expect(bearPred.pDown).toBeGreaterThan(bearPred.pUp);

    const serverQuant = runSixTierTradingAnalysis(bullishCandles);
    expect(serverQuant.tier4_deepLearningPipeline.modelHeads.tcnScore).toBeCloseTo(
      bullPred.directionScore,
      3
    );
    expect(serverQuant.tier4_deepLearningPipeline.modelHeads.tcnVersion).toBe('tcn-v2.8-lite');
  });

  it('registers TheMaster ver 2.8 — Knowledge Update in Update Log metadata', () => {
    expect(CURRENT_RELEASE_VERSION).toBe('TheMaster ver 2.8');
    expect(CURRENT_RELEASE_NAME).toBe('Knowledge Update');
    expect(UPDATE_LOG_ENTRIES[0].version).toContain('TheMaster ver 2.8');
    expect(UPDATE_LOG_ENTRIES[0].title).toContain('Knowledge Update');
  });
});


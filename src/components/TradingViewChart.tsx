import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import {
  CandlestickChart,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  buildTradingViewExternalUrl,
  buildTradingViewWidgetUrl,
  normalizeTradingViewInterval,
  resolveTradingViewSymbol,
} from '../lib/tradingView';
import { acquireFullscreenLock, releaseFullscreenLock } from '../lib/fullscreenBus';
import {
  loadClientTcnWeights,
  runClientTcnInference,
  type TcnClientPrediction,
  type TcnWeightBundle,
  type TcnWeightMeta,
} from '../lib/tcnClientEngine';

interface TradingViewChartProps {
  rawConfig: string;
  theme: 'dark' | 'light';
}

interface ParsedTvConfig {
  symbol: string;
  interval: string;
  title?: string;
  note?: string;
}

interface QuoteIndicators {
  latestClose?: number;
  ema9?: number | null;
  ema21?: number | null;
  ema50?: number | null;
  rsi14?: number | null;
  atr14?: number | null;
  trend?: 'bullish' | 'bearish' | 'sideways';
  pivots?: { pivot: number; r1: number; r2: number; s1: number; s2: number } | null;
}

interface QuoteQuantAnalysis {
  tier1_priceAction?: {
    structureTrend?: string;
    lastStructureEvent?: string;
    dynamicSupport?: number | null;
    dynamicResistance?: number | null;
    activeFvgs?: Array<{ direction: string; bottom: number; top: number; filled: boolean }>;
    supplyDemandZones?: Array<{ type: string; low: number; high: number; impulsePct: number }>;
    liquiditySweeps?: Array<{ direction: string; date: string; sweptLevel: number }>;
    multiTimeframe?: { alignment?: string; macroTrend?: string; dailyTrend?: string; microMomentum?: string };
  };
  tier2_quantitative?: {
    kalmanPrice?: number | null;
    kalmanSlopePct?: number | null;
    kalmanInnovationZ?: number | null;
    garchAnnualizedVolPct?: number | null;
    garmanKlassVolPct?: number | null;
    realizedVol20dPct?: number | null;
    meanReversionZ20?: number | null;
    meanReversionHalfLifeBars?: number | null;
    meanReversionSignal?: string;
    statArbSpreadZ50?: number | null;
    hurstExponent?: number | null;
    regime?: string;
  };
  tier3_microstructure?: {
    orderBookStatus?: string;
    poc?: number | null;
    vah?: number | null;
    val?: number | null;
    vwap?: number | null;
    cvdTrend?: string;
    obi?: number | null;
    bidAskImbalancePct?: number | null;
    spreadBps?: number | null;
    kylesLambdaBpsPer100k?: number | null;
  };
  tier4_deepLearningPipeline?: {
    architecture?: string;
    featureVector?: {
      ohlcv: number;
      orderFlow: number;
      volume: number;
      volatility: number;
      marketStructure: number;
      indicators: number;
      multiTimeframe: number;
    };
    modelHeads?: {
      tcnScore: number;
      patchTstScore: number;
      transformerScore: number;
      ensembleScore: number;
    };
    outOfSampleValidation?: Array<{
      school: string;
      hitRate: number;
      informationCoefficient: number;
      sampleCount: number;
      reliable: boolean;
    }>;
  };
  tier5_reinforcementLearning?: {
    policyFamily?: string;
    recommendedAction?: 'LONG' | 'SHORT' | 'STAND_ASIDE' | 'REDUCE_POSITION';
    riskAdjustedUtilityScore?: number;
    convictionPct?: number;
  };
  tier6_multiModelMeta?: {
    modelA_direction?: { score: number; bias: string; oosHitRate: number };
    modelB_volatility?: { annualizedVolPct: number | null; regime: string };
    modelC_regime?: { regime: string; trendPersistence: number | null };
    modelD_liquidity?: { score: number; nearZone: string };
    modelE_entryTiming?: { score: number; status: string };
    modelF_positionSizing?: {
      suggestedRiskPct: number;
      kellyFractionPct: number;
      atrStopDistance: number | null;
      entry: number | null;
      stopLoss: number | null;
      takeProfit1: number | null;
      takeProfit2: number | null;
      riskRewardRatio: number | null;
    };
    metaModel?: {
      finalDecision: 'LONG' | 'SHORT' | 'STAND_ASIDE' | 'REDUCE_POSITION';
      pUp: number;
      pDown: number;
      pNeutral: number;
      expectedReturnPct: number;
      note: string;
    };
  };
}

interface OhlcvCandleItem {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface LiveQuotePayload {
  ok?: boolean;
  symbol: string;
  display: string;
  market: string;
  currency: string;
  interval: string;
  price: number;
  changePercent24h: number | null;
  high24h: number | null;
  low24h: number | null;
  tradingViewSymbol?: string;
  tradingViewRecommend?: number | null;
  candles?: OhlcvCandleItem[];
  source: string;
  fetchedAt: string;
  indicators?: QuoteIndicators;
  quantAnalysis?: QuoteQuantAnalysis;
}

function parseTradingViewBlock(raw: string): ParsedTvConfig | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed);
      const sym = String(json.symbol || json.ticker || json.tvSymbol || '').trim();
      if (!sym) return null;
      return {
        symbol: sym,
        interval: normalizeTradingViewInterval(json.interval || 'D'),
        title: typeof json.title === 'string' ? json.title : undefined,
        note: typeof json.note === 'string' ? json.note : undefined,
      };
    } catch {
      // Fallback to line parsing below
    }
  }

  const firstLine = trimmed.split(/\r?\n/)[0].trim();
  const symToken = firstLine.split(/[\s,]+/)[0];
  if (!symToken) return null;
  return {
    symbol: symToken,
    interval: 'D',
  };
}

const TIMEFRAMES = [
  { id: '1', apiInterval: '1m', label: '1m' },
  { id: '5', apiInterval: '5m', label: '5m' },
  { id: '15', apiInterval: '15m', label: '15m' },
  { id: '60', apiInterval: '1h', label: '1H' },
  { id: '240', apiInterval: '4h', label: '4H' },
  { id: 'D', apiInterval: '1d', label: '1D' },
  { id: 'W', apiInterval: '1w', label: '1W' },
];

function mapTvIntervalToApi(tvInterval: string): string {
  const found = TIMEFRAMES.find((tf) => tf.id === tvInterval);
  return found ? found.apiInterval : '1d';
}

function formatPrice(val: number | null | undefined, currency?: string): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  const cur = String(currency || '').toUpperCase();
  if (cur === 'VND') {
    return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  const abs = Math.abs(val);
  const digits = abs >= 1000 ? 2 : abs >= 10 ? 2 : abs >= 1 ? 3 : 5;
  return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function decisionLabel(decision?: string): { text: string; tone: string } {
  switch (decision) {
    case 'LONG':
      return { text: 'BUY / LONG', tone: 'text-emerald-400 border-emerald-500/35 bg-emerald-500/10' };
    case 'SHORT':
      return { text: 'SELL / SHORT', tone: 'text-rose-400 border-rose-500/35 bg-rose-500/10' };
    case 'REDUCE_POSITION':
      return { text: 'GIẢM VỊ THẾ', tone: 'text-amber-400 border-amber-500/35 bg-amber-500/10' };
    default:
      return { text: 'ĐỨNG NGOÀI / TRUNG LẬP', tone: 'text-zinc-300 border-border-color bg-primary/40' };
  }
}

export const TradingViewChart: React.FC<TradingViewChartProps> = React.memo(({ rawConfig, theme }) => {
  const parsed = useMemo(() => parseTradingViewBlock(rawConfig), [rawConfig]);
  const [interval, setIntervalState] = useState<string>(parsed?.interval || 'D');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [autoLive, setAutoLive] = useState(true);
  const [showQuant, setShowQuant] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartViewMode, setChartViewMode] = useState<'candle' | 'widget'>('candle');
  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [hoveredCandleIdx, setHoveredCandleIdx] = useState<number | null>(null);

  const [quote, setQuote] = useState<LiveQuotePayload | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Interactive candle Zoom & Pan + Overlay layers
  const [visibleCount, setVisibleCount] = useState<number>(68);
  const [panOffset, setPanOffset] = useState<number>(0); // 0 = latest candles at right edge
  const [showEmaOverlay, setShowEmaOverlay] = useState<boolean>(true);
  const [showVwapKalmanOverlay, setShowVwapKalmanOverlay] = useState<boolean>(true);
  const [showSrFvgOverlay, setShowSrFvgOverlay] = useState<boolean>(true);
  const [isDraggingCandles, setIsDraggingCandles] = useState(false);
  const candleDragRef = useRef<{ startX: number; origOffset: number } | null>(null);
  const [tcnWeights, setTcnWeights] = useState<{ bundle: TcnWeightBundle; meta: TcnWeightMeta } | null>(null);

  const resolved = useMemo(
    () => resolveTradingViewSymbol(parsed?.symbol || 'AAPL'),
    [parsed?.symbol]
  );
  const widgetUrl = useMemo(
    () =>
      buildTradingViewWidgetUrl({
        symbol: resolved.tvSymbol,
        interval,
        theme,
      }) + `&_r=${reloadNonce}`,
    [resolved.tvSymbol, interval, theme, reloadNonce]
  );
  const externalUrl = useMemo(
    () => buildTradingViewExternalUrl(resolved.tvSymbol),
    [resolved.tvSymbol]
  );

  const fetchLiveQuote = useCallback(async (signal?: AbortSignal) => {
    if (!resolved.tvSymbol) return;
    setQuoteLoading(true);
    try {
      const apiInterval = mapTvIntervalToApi(interval);
      const res = await fetch(
        `/api/trading/quote?symbol=${encodeURIComponent(resolved.tvSymbol)}&interval=${encodeURIComponent(apiInterval)}`,
        { signal }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      setQuote(data as LiveQuotePayload);
      setQuoteError(null);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setQuoteError(err?.message || 'Không lấy được giá real-time');
    } finally {
      setQuoteLoading(false);
    }
  }, [resolved.tvSymbol, interval]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLiveQuote(controller.signal);
    if (!autoLive) {
      return () => controller.abort();
    }
    const timer = window.setInterval(() => {
      void fetchLiveQuote(controller.signal);
    }, 10000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [fetchLiveQuote, autoLive]);

  useEffect(() => {
    setPanOffset(0);
  }, [resolved.tvSymbol, interval]);

  useEffect(() => {
    let cancelled = false;
    void loadClientTcnWeights().then((loaded) => {
      if (!cancelled) setTcnWeights(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clientTcnForecast = useMemo<TcnClientPrediction | null>(() => {
    if (!quote?.candles || quote.candles.length < 4) return null;
    return runClientTcnInference(
      quote.candles,
      tcnWeights?.bundle,
      tcnWeights?.meta,
      'client-browser'
    );
  }, [quote?.candles, tcnWeights]);

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

  // If API candles fail completely and widget is needed, auto-switch cleanly
  useEffect(() => {
    if (quoteError && (!quote?.candles || quote.candles.length === 0) && chartViewMode === 'candle') {
      setChartViewMode('widget');
    }
  }, [quoteError, quote, chartViewMode]);

  if (!parsed) {
    return (
      <div className="my-4 p-4 rounded-xl border border-border-color bg-secondary/40 text-xs text-text-secondary">
        Không xác định được mã tài sản cho biểu đồ TradingView.
      </div>
    );
  }

  const meta = quote?.quantAnalysis?.tier6_multiModelMeta?.metaModel;
  const sizing = quote?.quantAnalysis?.tier6_multiModelMeta?.modelF_positionSizing;
  const sigBadge = decisionLabel(meta?.finalDecision);
  const changePct = quote?.changePercent24h;
  const isUp = typeof changePct === 'number' && changePct >= 0;

  const chartCard = (
    <div
      className={
        isFullscreen
          ? `fixed inset-0 z-[9990] m-0 w-screen h-[100dvh] flex flex-col p-3 sm:p-5 overflow-y-auto space-y-3 ${
              theme === 'light' ? 'bg-white text-gray-900' : 'bg-zinc-950 text-zinc-100'
            }`
          : 'my-4 p-3 sm:p-4 rounded-xl border border-border-color bg-secondary/40 space-y-3'
      }
    >
      {/* Header: Symbol + Live Price + Controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-primary">
            <span className="truncate">{parsed.title || quote?.display || `${resolved.ticker} · TradingView`}</span>
            <span className="text-[11px] font-normal text-text-secondary font-mono">
              {resolved.tvSymbol}
            </span>
          </div>

          {quote ? (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg sm:text-xl font-semibold font-mono tabular-nums text-text-primary">
                {formatPrice(quote.price, quote.currency)}
                <span className="ml-1 text-[11px] font-normal text-text-secondary">{quote.currency}</span>
              </span>
              {typeof changePct === 'number' && (
                <span
                  className={`text-xs font-mono tabular-nums font-medium ${
                    isUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {changePct.toFixed(2)}%
                </span>
              )}
              <span className="text-[11px] font-mono tabular-nums text-text-secondary">
                H: {formatPrice(quote.high24h, quote.currency)} · L: {formatPrice(quote.low24h, quote.currency)}
              </span>
              <span className="text-[10px] text-text-secondary">
                {quote.source} · {new Date(quote.fetchedAt).toLocaleTimeString('vi-VN', { hour12: false })}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-text-secondary">
              {quoteLoading ? 'Đang tải giá real-time từ TradingView API...' : quoteError || `${resolved.exchange}`}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <div className="flex items-center p-0.5 rounded-lg border border-border-color bg-primary/40 text-[11px]">
            <button
              type="button"
              onClick={() => setChartViewMode('candle')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartViewMode === 'candle'
                  ? theme === 'light'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white text-zinc-950 font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Biểu đồ nến OHLCV trực tiếp từ TradingView/Exchange API"
            >
              <CandlestickChart size={12} />
              <span>Nến API</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setWidgetLoaded(false);
                setChartViewMode('widget');
              }}
              className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
                chartViewMode === 'widget'
                  ? theme === 'light'
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white text-zinc-950 font-medium'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
              title="Nhúng TradingView Widget"
            >
              <span>TV Widget</span>
            </button>
          </div>

          <div className="flex items-center p-0.5 rounded-lg border border-border-color bg-primary/40 text-[11px]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setIntervalState(tf.id)}
                className={`px-2 py-1 rounded-md font-mono tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                  interval === tf.id
                    ? theme === 'light'
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-950 font-medium'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAutoLive((v) => !v)}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-border-color text-[11px] text-text-secondary hover:text-text-primary transition-colors"
            title={autoLive ? 'Tạm dừng cập nhật 10s' : 'Bật cập nhật tự động 10s'}
          >
            {autoLive ? <Pause size={11} /> : <Play size={11} />}
            <span>{autoLive ? 'Live' : 'Tạm dừng'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReloadNonce((n) => n + 1);
              setWidgetLoaded(false);
              void fetchLiveQuote();
            }}
            className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-text-primary transition-colors"
            title="Làm mới giá & biểu đồ"
          >
            <RefreshCw size={13} className={quoteLoading ? 'animate-spin' : ''} />
          </button>

          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border-color text-[11px] font-medium text-text-secondary hover:text-text-primary transition-colors whitespace-nowrap shrink-0"
            title="Mở trên TradingView"
          >
            <span>TradingView</span>
            <ExternalLink size={11} />
          </a>

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isFullscreen
                ? theme === 'light'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-950 border-white'
                : 'border-border-color text-text-secondary hover:text-text-primary'
            }`}
            title={isFullscreen ? 'Thu nhỏ (Esc)' : 'Xem toàn màn hình'}
            aria-label={isFullscreen ? 'Thu nhỏ' : 'Xem toàn màn hình'}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Real-time BUY/SELL + Entry / SL / TP1 / TP2 bar */}
      {meta && sizing && (
        <div className="rounded-lg border border-border-color bg-primary/35 p-2.5 sm:p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded border text-[11px] font-semibold font-mono tracking-tight ${sigBadge.tone}`}
              >
                {sigBadge.text}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-text-secondary">
                P(Up) {(meta.pUp <= 1 ? meta.pUp * 100 : meta.pUp).toFixed(0)}% · P(Down){' '}
                {(meta.pDown <= 1 ? meta.pDown * 100 : meta.pDown).toFixed(0)}% · P(Neutral){' '}
                {(meta.pNeutral <= 1 ? meta.pNeutral * 100 : meta.pNeutral).toFixed(0)}%
              </span>
              <span className="text-[11px] font-mono tabular-nums text-text-secondary">
                E[R] {meta.expectedReturnPct >= 0 ? '+' : ''}
                {meta.expectedReturnPct.toFixed(2)}%
              </span>
              {typeof quote?.tradingViewRecommend === 'number' && (
                <span className="text-[11px] font-mono tabular-nums text-text-secondary">
                  TV Tech: {quote.tradingViewRecommend.toFixed(2)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowQuant((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors"
            >
              <span>Phân tích 6 cấp</span>
              {showQuant ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {clientTcnForecast && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-text-secondary border-t border-border-color/60 pt-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <span className="font-semibold text-text-primary">TCN Client ({clientTcnForecast.weightMeta.version})</span>
                <span
                  className={
                    clientTcnForecast.shortTermTrend === 'BULLISH'
                      ? 'text-emerald-400 font-medium'
                      : clientTcnForecast.shortTermTrend === 'BEARISH'
                      ? 'text-rose-400 font-medium'
                      : 'text-text-secondary font-medium'
                  }
                >
                  {clientTcnForecast.shortTermHorizon}: {clientTcnForecast.shortTermTrend} ({clientTcnForecast.directionScore >= 0 ? '+' : ''}
                  {clientTcnForecast.directionScore.toFixed(2)})
                </span>
                <span>
                  P(↑/↓/—) {(clientTcnForecast.pUp * 100).toFixed(0)}%/{(clientTcnForecast.pDown * 100).toFixed(0)}%/
                  {(clientTcnForecast.pNeutral * 100).toFixed(0)}%
                </span>
                <span>
                  Δ dự kiến {clientTcnForecast.expectedMovePct >= 0 ? '+' : ''}
                  {clientTcnForecast.expectedMovePct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span>
                  {clientTcnForecast.inferenceTimeMs.toFixed(2)}ms ·{' '}
                  {(clientTcnForecast.weightMeta.payloadBytes / 1024).toFixed(1)}KB · {clientTcnForecast.weightMeta.source}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void loadClientTcnWeights(true).then((loaded) => setTcnWeights(loaded));
                  }}
                  className="px-1.5 py-0.5 rounded border border-border-color hover:text-text-primary transition-colors font-sans"
                  title="Tải lại trọng số nhẹ TCN trên client"
                >
                  Sync weights
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px] font-mono tabular-nums">
            <div className="rounded border border-border-color/70 px-2 py-1.5">
              <div className="text-[10px] text-text-secondary">Entry</div>
              <div className="font-semibold text-text-primary">{formatPrice(sizing.entry, quote?.currency)}</div>
            </div>
            <div className="rounded border border-rose-500/25 px-2 py-1.5">
              <div className="text-[10px] text-rose-400">Stop Loss (SL)</div>
              <div className="font-semibold text-rose-400">{formatPrice(sizing.stopLoss, quote?.currency)}</div>
            </div>
            <div className="rounded border border-emerald-500/25 px-2 py-1.5">
              <div className="text-[10px] text-emerald-400">Take Profit 1</div>
              <div className="font-semibold text-emerald-400">{formatPrice(sizing.takeProfit1, quote?.currency)}</div>
            </div>
            <div className="rounded border border-emerald-500/25 px-2 py-1.5">
              <div className="text-[10px] text-emerald-400">Take Profit 2</div>
              <div className="font-semibold text-emerald-400">{formatPrice(sizing.takeProfit2, quote?.currency)}</div>
            </div>
            <div className="rounded border border-border-color/70 px-2 py-1.5">
              <div className="text-[10px] text-text-secondary">Tỉ lệ R:R</div>
              <div className="font-semibold text-text-primary">
                {sizing.riskRewardRatio ? `1 : ${sizing.riskRewardRatio.toFixed(2)}` : '—'}
              </div>
            </div>
            <div className="rounded border border-border-color/70 px-2 py-1.5">
              <div className="text-[10px] text-text-secondary">Risk / Kelly</div>
              <div className="font-semibold text-text-primary">
                {sizing.suggestedRiskPct.toFixed(2)}% / {sizing.kellyFractionPct.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Expandable 6-tier quantitative breakdown */}
          {showQuant && quote?.quantAnalysis && (
            <div className="pt-2 border-t border-border-color/70 grid grid-cols-1 md:grid-cols-2 gap-2.5 text-[11px]">
              <div className="rounded border border-border-color/70 p-2 space-y-1">
                <div className="font-semibold text-text-primary">1. Price Action & Multi-Timeframe</div>
                <div className="text-text-secondary font-mono tabular-nums">
                  Cấu trúc: {quote.quantAnalysis.tier1_priceAction?.structureTrend} ·{' '}
                  {quote.quantAnalysis.tier1_priceAction?.lastStructureEvent} · MTF:{' '}
                  {quote.quantAnalysis.tier1_priceAction?.multiTimeframe?.alignment}
                </div>
                <div className="text-text-secondary font-mono tabular-nums">
                  S/R động: {formatPrice(quote.quantAnalysis.tier1_priceAction?.dynamicSupport, quote?.currency)} /{' '}
                  {formatPrice(quote.quantAnalysis.tier1_priceAction?.dynamicResistance, quote?.currency)} · FVG:{' '}
                  {quote.quantAnalysis.tier1_priceAction?.activeFvgs?.length ?? 0} · Sweeps:{' '}
                  {quote.quantAnalysis.tier1_priceAction?.liquiditySweeps?.length ?? 0}
                </div>
              </div>

              <div className="rounded border border-border-color/70 p-2 space-y-1">
                <div className="font-semibold text-text-primary">2. Quantitative (Kalman / GARCH / Hurst / OU)</div>
                <div className="text-text-secondary font-mono tabular-nums">
                  Regime: {quote.quantAnalysis.tier2_quantitative?.regime} · Hurst:{' '}
                  {quote.quantAnalysis.tier2_quantitative?.hurstExponent?.toFixed(2) ?? '—'} · Half-Life:{' '}
                  {quote.quantAnalysis.tier2_quantitative?.meanReversionHalfLifeBars ?? '—'} nến
                </div>
                <div className="text-text-secondary font-mono tabular-nums">
                  Kalman: {formatPrice(quote.quantAnalysis.tier2_quantitative?.kalmanPrice, quote?.currency)} · GARCH Vol:{' '}
                  {quote.quantAnalysis.tier2_quantitative?.garchAnnualizedVolPct?.toFixed(1) ?? '—'}% · GK Vol:{' '}
                  {quote.quantAnalysis.tier2_quantitative?.garmanKlassVolPct?.toFixed(1) ?? '—'}%
                </div>
              </div>

              <div className="rounded border border-border-color/70 p-2 space-y-1">
                <div className="font-semibold text-text-primary">3. Order Flow / Microstructure</div>
                <div className="text-text-secondary font-mono tabular-nums">
                  VWAP: {formatPrice(quote.quantAnalysis.tier3_microstructure?.vwap, quote?.currency)} · POC:{' '}
                  {formatPrice(quote.quantAnalysis.tier3_microstructure?.poc, quote?.currency)} (VAL/H:{' '}
                  {formatPrice(quote.quantAnalysis.tier3_microstructure?.val, quote?.currency)}–
                  {formatPrice(quote.quantAnalysis.tier3_microstructure?.vah, quote?.currency)})
                </div>
                <div className="text-text-secondary font-mono tabular-nums">
                  {quote.quantAnalysis.tier3_microstructure?.orderBookStatus === 'live_l2_depth'
                    ? `OBI: ${quote.quantAnalysis.tier3_microstructure?.obi?.toFixed(2)} (${quote.quantAnalysis.tier3_microstructure?.bidAskImbalancePct?.toFixed(1)}%) · Spread: ${quote.quantAnalysis.tier3_microstructure?.spreadBps?.toFixed(1)} bps · Kyle λ: ${quote.quantAnalysis.tier3_microstructure?.kylesLambdaBpsPer100k ?? '—'}`
                    : `CVD: ${quote.quantAnalysis.tier3_microstructure?.cvdTrend} · Kyle λ: ${quote.quantAnalysis.tier3_microstructure?.kylesLambdaBpsPer100k ?? '—'} bps/100k (L2 ẩn trên feed miễn phí)`}
                </div>
              </div>

              <div className="rounded border border-border-color/70 p-2 space-y-1">
                <div className="font-semibold text-text-primary">4–6. Deep Learning (Client TCN / PatchTST / Transformer) & RL</div>
                <div className="text-text-secondary font-mono tabular-nums">
                  Heads: TCN {(clientTcnForecast?.directionScore ?? quote.quantAnalysis.tier4_deepLearningPipeline?.modelHeads?.tcnScore)?.toFixed(2) ?? '—'} ·
                  PatchTST {quote.quantAnalysis.tier4_deepLearningPipeline?.modelHeads?.patchTstScore?.toFixed(2) ?? '—'} ·
                  Transformer {quote.quantAnalysis.tier4_deepLearningPipeline?.modelHeads?.transformerScore?.toFixed(2) ?? '—'}
                </div>
                {clientTcnForecast && (
                  <div className="text-text-secondary font-mono tabular-nums">
                    TCN Dilation Norm (d1/d2/d4): {clientTcnForecast.layerActivations.d1Norm.toFixed(2)} /{' '}
                    {clientTcnForecast.layerActivations.d2Norm.toFixed(2)} /{' '}
                    {clientTcnForecast.layerActivations.d4Norm.toFixed(2)} · Client OOS:{' '}
                    {clientTcnForecast.rollingHitRatePct !== null
                      ? `${clientTcnForecast.rollingHitRatePct.toFixed(1)}% (${clientTcnForecast.rollingSampleCount})`
                      : '—'}
                  </div>
                )}
                <div className="text-text-secondary font-mono tabular-nums">
                  RL ({quote.quantAnalysis.tier5_reinforcementLearning?.policyFamily}):{' '}
                  {quote.quantAnalysis.tier5_reinforcementLearning?.recommendedAction} · Tin cậy{' '}
                  {quote.quantAnalysis.tier5_reinforcementLearning?.convictionPct?.toFixed(0)}% · OOS:{' '}
                  {(quote.quantAnalysis.tier4_deepLearningPipeline?.outOfSampleValidation || [])
                    .slice(0, 3)
                    .map((s) => `${s.school.split(' ')[0]}:${(s.hitRate * 100).toFixed(0)}%`)
                    .join(' ')}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart Body: Interactive Zoom/Pan Candlestick Chart OR TradingView Embed Widget */}
      {chartViewMode === 'candle' && quote?.candles && quote.candles.length > 0 ? (
        (() => {
          const allCandles = quote.candles;
          const totalLen = allCandles.length;
          const safeCount = Math.max(Math.min(14, totalLen), Math.min(totalLen, visibleCount));
          const maxOffset = Math.max(0, totalLen - safeCount);
          const safeOffset = Math.max(0, Math.min(maxOffset, panOffset));
          const endIdx = totalLen - safeOffset;
          const startIdx = Math.max(0, endIdx - safeCount);
          const candles = allCandles.slice(startIdx, endIdx);

          const dynSup = quote.quantAnalysis?.tier1_priceAction?.dynamicSupport ?? null;
          const dynRes = quote.quantAnalysis?.tier1_priceAction?.dynamicResistance ?? null;
          const vwapVal = quote.quantAnalysis?.tier3_microstructure?.vwap ?? null;
          const kalmanVal = quote.quantAnalysis?.tier2_quantitative?.kalmanPrice ?? null;
          const fvgs = quote.quantAnalysis?.tier1_priceAction?.activeFvgs || [];

          const minPrice = Math.min(
            ...candles.map((c) => Math.min(c.low, c.open, c.close)),
            ...(sizing?.stopLoss ? [sizing.stopLoss] : [])
          );
          const maxPrice = Math.max(
            ...candles.map((c) => Math.max(c.high, c.open, c.close)),
            ...(sizing?.takeProfit1 ? [sizing.takeProfit1] : [])
          );
          const span = Math.max(1e-6, maxPrice - minPrice);
          const maxVol = Math.max(1, ...candles.map((c) => c.volume || 0));

          const W = 780;
          const H = isFullscreen ? 440 : 330;
          const margin = { top: 18, right: 68, bottom: 30, left: 12 };
          const innerW = W - margin.left - margin.right;
          const innerH = H - margin.top - margin.bottom;
          const priceAreaH = innerH * 0.78;
          const volAreaTop = priceAreaH + 8;
          const volAreaH = innerH - volAreaTop;

          const yScale = d3
            .scaleLinear()
            .domain([minPrice - span * 0.08, maxPrice + span * 0.08])
            .range([priceAreaH, 0]);
          const bandW = innerW / Math.max(1, candles.length);
          const bodyW = Math.max(2.5, Math.min(14, bandW * 0.64));
          const safeHover =
            hoveredCandleIdx !== null && hoveredCandleIdx < candles.length ? hoveredCandleIdx : null;
          const activeBar = safeHover !== null ? candles[safeHover] : candles[candles.length - 1];
          const gridStroke = theme === 'light' ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.07)';
          const axisCol = theme === 'light' ? '#64748b' : '#94a3b8';

          // Compute EMA9 over all candles so moving window preserves true historical EMA
          const allEma9: number[] = [];
          const k = 2 / (9 + 1);
          allCandles.forEach((c, i) => {
            allEma9.push(i === 0 ? c.close : c.close * k + allEma9[i - 1] * (1 - k));
          });
          const windowEma9 = allEma9.slice(startIdx, endIdx);
          const emaPath = candles
            .map((_c, i) => `${i === 0 ? 'M' : 'L'}${i * bandW + bandW / 2},${yScale(windowEma9[i])}`)
            .join(' ');

          const zoomIn = () => setVisibleCount((c) => Math.max(Math.min(18, totalLen), Math.round(c * 0.75)));
          const zoomOut = () => setVisibleCount((c) => Math.min(totalLen, Math.round(c * 1.35)));
          const panLeft = () => setPanOffset((o) => Math.min(maxOffset, o + Math.max(3, Math.round(safeCount * 0.25))));
          const panRight = () => setPanOffset((o) => Math.max(0, o - Math.max(3, Math.round(safeCount * 0.25))));
          const resetView = () => {
            setVisibleCount(Math.min(68, totalLen));
            setPanOffset(0);
          };

          return (
            <div className="rounded-lg border border-border-color bg-primary/30 p-2.5 space-y-2">
              {/* OHLCV Readout + Interactive Zoom / Pan / Overlay Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-text-secondary">
                {activeBar ? (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="font-semibold text-text-primary">{activeBar.date}</span>
                    <span>O:{formatPrice(activeBar.open, quote.currency)}</span>
                    <span>H:{formatPrice(activeBar.high, quote.currency)}</span>
                    <span>L:{formatPrice(activeBar.low, quote.currency)}</span>
                    <span className={activeBar.close >= activeBar.open ? 'text-emerald-400' : 'text-rose-400'}>
                      C:{formatPrice(activeBar.close, quote.currency)}
                    </span>
                    {activeBar.volume !== undefined && activeBar.volume > 0 && (
                      <span>Vol:{activeBar.volume.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                    )}
                  </div>
                ) : (
                  <span />
                )}

                <div className="flex flex-wrap items-center gap-1 font-sans">
                  <button
                    type="button"
                    onClick={() => setShowEmaOverlay((v) => !v)}
                    className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                      showEmaOverlay ? 'border-sky-500/60 bg-sky-500/10 text-sky-400' : 'border-border-color text-text-secondary'
                    }`}
                    title="Bật/tắt đường EMA(9)"
                  >
                    EMA9
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVwapKalmanOverlay((v) => !v)}
                    className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                      showVwapKalmanOverlay ? 'border-violet-500/60 bg-violet-500/10 text-violet-400' : 'border-border-color text-text-secondary'
                    }`}
                    title="Bật/tắt mức VWAP & Kalman Fair Value"
                  >
                    VWAP/Kalman
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSrFvgOverlay((v) => !v)}
                    className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                      showSrFvgOverlay ? 'border-amber-500/60 bg-amber-500/10 text-amber-400' : 'border-border-color text-text-secondary'
                    }`}
                    title="Bật/tắt S/R động & Fair Value Gap"
                  >
                    S/R·FVG
                  </button>

                  <span className="mx-0.5 text-border-color">|</span>

                  <button
                    type="button"
                    onClick={panLeft}
                    disabled={safeOffset >= maxOffset}
                    className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
                    title="Kéo sang quá khứ"
                    aria-label="Kéo sang quá khứ"
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={panRight}
                    disabled={safeOffset <= 0}
                    className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
                    title="Kéo về hiện tại"
                    aria-label="Kéo về hiện tại"
                  >
                    <ChevronRight size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={zoomIn}
                    disabled={safeCount <= 18}
                    className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
                    title="Phóng to (ít nến hơn)"
                    aria-label="Phóng to biểu đồ nến"
                  >
                    <ZoomIn size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={zoomOut}
                    disabled={safeCount >= totalLen}
                    className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary disabled:opacity-35"
                    title="Thu nhỏ (nhiều nến hơn)"
                    aria-label="Thu nhỏ biểu đồ nến"
                  >
                    <ZoomOut size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={resetView}
                    className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary"
                    title="Đặt lại khung nhìn"
                    aria-label="Đặt lại khung nhìn nến"
                  >
                    <RotateCcw size={11} />
                  </button>
                  <span className="ml-1 text-[10px] font-mono tabular-nums text-text-secondary">
                    {candles.length}/{totalLen}
                  </span>
                </div>
              </div>

              <div
                className="w-full overflow-x-auto select-none"
                onWheel={(e) => {
                  e.preventDefault();
                  if (e.deltaY < 0) zoomIn();
                  else zoomOut();
                }}
                onPointerDown={(e) => {
                  setIsDraggingCandles(true);
                  candleDragRef.current = { startX: e.clientX, origOffset: safeOffset };
                }}
                onPointerMove={(e) => {
                  if (!isDraggingCandles || !candleDragRef.current) return;
                  const dx = e.clientX - candleDragRef.current.startX;
                  const barsPerPx = safeCount / 620;
                  const deltaBars = Math.round(dx * barsPerPx);
                  setPanOffset(Math.max(0, Math.min(maxOffset, candleDragRef.current.origOffset + deltaBars)));
                }}
                onPointerUp={() => {
                  setIsDraggingCandles(false);
                  candleDragRef.current = null;
                }}
                onPointerLeave={() => {
                  setIsDraggingCandles(false);
                  candleDragRef.current = null;
                }}
              >
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full h-auto min-w-[460px] cursor-grab active:cursor-grabbing"
                >
                  <g transform={`translate(${margin.left},${margin.top})`}>
                    {yScale.ticks(5).map((tk) => (
                      <g key={tk} transform={`translate(0,${yScale(tk)})`}>
                        <line x1={0} x2={innerW} stroke={gridStroke} strokeDasharray="3 3" />
                        <text
                          x={innerW + 6}
                          dy="0.32em"
                          fontSize={10}
                          fill={axisCol}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatPrice(tk, quote.currency)}
                        </text>
                      </g>
                    ))}

                    {/* FVG & Dynamic Support/Resistance Overlay */}
                    {showSrFvgOverlay &&
                      fvgs.map((gap, gIdx) => {
                        const topY = yScale(Math.min(maxPrice + span * 0.08, Math.max(minPrice - span * 0.08, gap.top)));
                        const botY = yScale(Math.min(maxPrice + span * 0.08, Math.max(minPrice - span * 0.08, gap.bottom)));
                        const h = Math.max(2, Math.abs(botY - topY));
                        return (
                          <rect
                            key={`fvg-${gIdx}`}
                            x={0}
                            y={Math.min(topY, botY)}
                            width={innerW}
                            height={h}
                            fill={gap.direction === 'bullish' ? '#10b981' : '#ef4444'}
                            fillOpacity={0.09}
                          />
                        );
                      })}
                    {showSrFvgOverlay && dynRes !== null && dynRes >= minPrice - span * 0.08 && dynRes <= maxPrice + span * 0.08 && (
                      <line
                        x1={0}
                        x2={innerW}
                        y1={yScale(dynRes)}
                        y2={yScale(dynRes)}
                        stroke="#f59e0b"
                        strokeOpacity={0.55}
                        strokeDasharray="2 3"
                      />
                    )}
                    {showSrFvgOverlay && dynSup !== null && dynSup >= minPrice - span * 0.08 && dynSup <= maxPrice + span * 0.08 && (
                      <line
                        x1={0}
                        x2={innerW}
                        y1={yScale(dynSup)}
                        y2={yScale(dynSup)}
                        stroke="#14b8a6"
                        strokeOpacity={0.55}
                        strokeDasharray="2 3"
                      />
                    )}

                    {/* VWAP & Kalman Fair Value Levels */}
                    {showVwapKalmanOverlay && vwapVal !== null && vwapVal >= minPrice - span * 0.08 && vwapVal <= maxPrice + span * 0.08 && (
                      <line
                        x1={0}
                        x2={innerW}
                        y1={yScale(vwapVal)}
                        y2={yScale(vwapVal)}
                        stroke="#a855f7"
                        strokeOpacity={0.65}
                        strokeDasharray="6 3"
                      />
                    )}
                    {showVwapKalmanOverlay && kalmanVal !== null && kalmanVal >= minPrice - span * 0.08 && kalmanVal <= maxPrice + span * 0.08 && (
                      <line
                        x1={0}
                        x2={innerW}
                        y1={yScale(kalmanVal)}
                        y2={yScale(kalmanVal)}
                        stroke="#06b6d4"
                        strokeOpacity={0.65}
                        strokeDasharray="3 3"
                      />
                    )}

                    {/* Entry / SL / TP1 price levels */}
                    {sizing?.takeProfit1 && (
                      <line
                        x1={0}
                        x2={innerW}
                        y1={yScale(sizing.takeProfit1)}
                        y2={yScale(sizing.takeProfit1)}
                        stroke="#10b981"
                        strokeOpacity={0.45}
                        strokeDasharray="4 3"
                      />
                    )}
                    {sizing?.stopLoss && (
                      <line
                        x1={0}
                        x2={innerW}
                        y1={yScale(sizing.stopLoss)}
                        y2={yScale(sizing.stopLoss)}
                        stroke="#ef4444"
                        strokeOpacity={0.45}
                        strokeDasharray="4 3"
                      />
                    )}

                    {/* EMA9 overlay */}
                    {showEmaOverlay && candles.length >= 2 && (
                      <path d={emaPath} fill="none" stroke="#38bdf8" strokeWidth={1.3} strokeOpacity={0.85} />
                    )}

                    {/* Crosshair */}
                    {safeHover !== null && activeBar && (
                      <g className="pointer-events-none">
                        <line
                          x1={safeHover * bandW + bandW / 2}
                          x2={safeHover * bandW + bandW / 2}
                          y1={0}
                          y2={innerH}
                          stroke={axisCol}
                          strokeOpacity={0.45}
                          strokeDasharray="3 3"
                        />
                        <line
                          x1={0}
                          x2={innerW}
                          y1={yScale(activeBar.close)}
                          y2={yScale(activeBar.close)}
                          stroke={axisCol}
                          strokeOpacity={0.45}
                          strokeDasharray="3 3"
                        />
                      </g>
                    )}

                    {/* Candles & Volume bars */}
                    {candles.map((c, idx) => {
                      const cx = idx * bandW + bandW / 2;
                      const bullish = c.close >= c.open;
                      const col = bullish ? '#10b981' : '#ef4444';
                      const yH = yScale(c.high);
                      const yL = yScale(c.low);
                      const yO = yScale(c.open);
                      const yC = yScale(c.close);
                      const volH = ((c.volume || 0) / maxVol) * volAreaH;
                      const showTick = candles.length <= 14 || idx % Math.ceil(candles.length / 7) === 0;

                      return (
                        <g
                          key={`${c.date}-${idx}`}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredCandleIdx(idx)}
                          onMouseLeave={() => setHoveredCandleIdx(null)}
                        >
                          <rect x={idx * bandW} y={0} width={bandW} height={innerH} fill="transparent" />
                          {volH > 0 && (
                            <rect
                              x={cx - bodyW / 2}
                              y={volAreaTop + (volAreaH - volH)}
                              width={bodyW}
                              height={Math.max(1, volH)}
                              fill={col}
                              fillOpacity={0.28}
                            />
                          )}
                          <line x1={cx} x2={cx} y1={yH} y2={yL} stroke={col} strokeWidth={safeHover === idx ? 2 : 1.3} />
                          <rect
                            x={cx - bodyW / 2}
                            y={Math.min(yO, yC)}
                            width={bodyW}
                            height={Math.max(2, Math.abs(yC - yO))}
                            fill={col}
                            fillOpacity={safeHover === idx ? 1 : 0.88}
                            rx={1}
                          />
                          {showTick && (
                            <text x={cx} y={innerH + 16} textAnchor="middle" fontSize={9.5} fill={axisCol}>
                              {c.date.length > 10 ? c.date.slice(-5) : c.date.slice(5)}
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
        })()
      ) : (
        <div
          className={`relative w-full rounded-lg overflow-hidden border border-border-color bg-primary/30 ${
            isFullscreen ? 'flex-1 min-h-[420px]' : 'h-[400px] sm:h-[440px]'
          }`}
        >
          {chartViewMode === 'candle' && quoteLoading && (
            <div className="w-full h-full flex items-center justify-center text-xs text-text-secondary">
              Đang tải dữ liệu nến từ TradingView & sàn giao dịch...
            </div>
          )}
          {(chartViewMode === 'widget' || !quoteLoading) && (
            <iframe
              key={`${resolved.tvSymbol}-${interval}-${theme}-${reloadNonce}`}
              title={`TradingView Chart ${resolved.tvSymbol}`}
              src={widgetUrl}
              onLoad={() => setWidgetLoaded(true)}
              className="w-full h-full border-0"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          )}
          {chartViewMode === 'widget' && !widgetLoaded && quote?.candles && quote.candles.length > 0 && (
            <button
              type="button"
              onClick={() => setChartViewMode('candle')}
              className="absolute bottom-3 right-3 px-2.5 py-1 rounded border border-border-color bg-zinc-900 text-zinc-100 text-[11px] hover:bg-zinc-800"
            >
              Chuyển sang Biểu đồ nến API
            </button>
          )}
        </div>
      )}

      {quoteError && !quote && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-400">
          <span>Không tải được feed API ({quoteError}). Bạn có thể thử làm mới hoặc mở trực tiếp trên TradingView.</span>
          <button
            type="button"
            onClick={() => {
              setReloadNonce((n) => n + 1);
              void fetchLiveQuote();
            }}
            className="px-2 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
          >
            Thử lại API
          </button>
        </div>
      )}
      {parsed.note && (
        <p className="text-[11px] text-text-secondary">{parsed.note}</p>
      )}
    </div>
  );

  return isFullscreen && typeof document !== 'undefined'
    ? createPortal(chartCard, document.body)
    : chartCard;
});

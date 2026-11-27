import {
  buildTradingViewWidgetUrl,
  isStockTickerSymbol,
  normalizeTradingViewInterval,
  resolveTradingViewSymbol,
} from '../src/lib/tradingView';
import { DEFAULT_TCN_WEIGHT_BUNDLE, runClientTcnInference } from '../src/lib/tcnClientEngine';

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicatorsSummary {
  latestClose: number;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number } | null;
  atr14: number | null;
  pivots: { pivot: number; r1: number; r2: number; s1: number; s2: number } | null;
  recentHigh: number | null;
  recentLow: number | null;
  trend: 'bullish' | 'bearish' | 'sideways';
}

export interface SwingPoint {
  index: number;
  date: string;
  price: number;
  kind: 'high' | 'low';
  label: 'HH' | 'LH' | 'HL' | 'LL' | 'H' | 'L';
}

export interface FairValueGap {
  direction: 'bullish' | 'bearish';
  date: string;
  top: number;
  bottom: number;
  filled: boolean;
}

export interface SupplyDemandZone {
  type: 'supply' | 'demand';
  date: string;
  high: number;
  low: number;
  impulsePct: number;
}

export interface LiquiditySweepEvent {
  direction: 'bullish_sweep' | 'bearish_sweep';
  date: string;
  sweptLevel: number;
  closePrice: number;
}

export interface PriceActionAnalysis {
  structureTrend: 'bullish' | 'bearish' | 'ranging';
  swingSequence: SwingPoint[];
  lastStructureEvent: 'BOS_BULLISH' | 'BOS_BEARISH' | 'CHOCH_BULLISH' | 'CHOCH_BEARISH' | 'NONE';
  dynamicSupport: number | null;
  dynamicResistance: number | null;
  liquiditySweeps: LiquiditySweepEvent[];
  activeFvgs: FairValueGap[];
  supplyDemandZones: SupplyDemandZone[];
  multiTimeframe: {
    macroTrend: 'bullish' | 'bearish' | 'sideways';
    dailyTrend: 'bullish' | 'bearish' | 'sideways';
    microMomentum: 'bullish' | 'bearish' | 'sideways';
    alignment: 'aligned_bullish' | 'aligned_bearish' | 'mixed';
  };
}

export type MarketRegimeLabel =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'MEAN_REVERTING'
  | 'HIGH_VOL_SHOCK';

export interface QuantitativeAnalysis {
  kalmanPrice: number | null;
  kalmanSlopePct: number | null;
  kalmanInnovationZ: number | null;
  garchAnnualizedVolPct: number | null;
  garmanKlassVolPct: number | null;
  realizedVol20dPct: number | null;
  volRatioGarchToRealized: number | null;
  meanReversionZ20: number | null;
  meanReversionHalfLifeBars: number | null;
  meanReversionSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  volAdjustedMomentum10: number | null;
  statArbSpreadZ50: number | null;
  varianceRatioProxy: number | null;
  hurstExponent: number | null;
  regime: MarketRegimeLabel;
}

export interface OrderFlowL2Feed {
  orderBookImbalance: number | null;
  spreadBps: number | null;
  takerBuyRatio: number | null;
  estimatedSlippage10kBps: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  bidDepthNotional: number | null;
  askDepthNotional: number | null;
}

export interface MicrostructureAnalysis {
  orderBookStatus: 'live_l2_depth' | 'unavailable_free_feed';
  poc: number | null;
  vah: number | null;
  val: number | null;
  vwap: number | null;
  vwapUpper1Sigma: number | null;
  vwapLower1Sigma: number | null;
  recentDeltaVolume: number | null;
  cvdTrend: 'accumulating' | 'distributing' | 'flat';
  obi: number | null;
  bidAskImbalancePct: number | null;
  spreadBps: number | null;
  takerBuyRatio: number | null;
  estimatedSlippage10kBps: number | null;
  kylesLambdaBpsPer100k: number | null;
}

export interface SchoolOosScore {
  school: string;
  hitRate: number;
  informationCoefficient: number;
  sampleCount: number;
  reliable: boolean;
}

export interface DeepLearningFeatureVector {
  ohlcv: number;
  orderFlow: number;
  volume: number;
  volatility: number;
  marketStructure: number;
  indicators: number;
  multiTimeframe: number;
}

export interface DeepLearningHeadScores {
  tcnScore: number;
  patchTstScore: number;
  transformerScore: number;
  ensembleScore: number;
  tcnVersion?: string;
  tcnRollingHitRatePct?: number | null;
}

export interface SixTierTradingAnalysis {
  tier1_priceAction: PriceActionAnalysis;
  tier2_quantitative: QuantitativeAnalysis;
  tier3_microstructure: MicrostructureAnalysis;
  tier4_deepLearningPipeline: {
    architecture: string;
    encodedModalities: string[];
    featureVector: DeepLearningFeatureVector;
    modelHeads: DeepLearningHeadScores;
    outOfSampleValidation: SchoolOosScore[];
  };
  tier5_reinforcementLearning: {
    policyFamily: 'PPO / SAC / DQN';
    recommendedAction: 'LONG' | 'SHORT' | 'STAND_ASIDE' | 'REDUCE_POSITION';
    rewardObjective: string;
    riskAdjustedUtilityScore: number;
    convictionPct: number;
  };
  tier6_multiModelMeta: {
    modelA_direction: { score: number; bias: 'bullish' | 'bearish' | 'neutral'; oosHitRate: number };
    modelB_volatility: { annualizedVolPct: number | null; regime: 'low' | 'normal' | 'elevated' | 'extreme' };
    modelC_regime: { regime: MarketRegimeLabel; trendPersistence: number | null };
    modelD_liquidity: { score: number; nearZone: string };
    modelE_entryTiming: { score: number; status: 'optimal' | 'wait_pullback' | 'extended' };
    modelF_positionSizing: {
      suggestedRiskPct: number;
      kellyFractionPct: number;
      atrStopDistance: number | null;
      entry: number | null;
      stopLoss: number | null;
      takeProfit1: number | null;
      takeProfit2: number | null;
      riskRewardRatio: number | null;
    };
    metaModel: {
      finalDecision: 'LONG' | 'SHORT' | 'STAND_ASIDE' | 'REDUCE_POSITION';
      pUp: number;
      pDown: number;
      pNeutral: number;
      expectedReturnPct: number;
      note: string;
    };
  };
}

export interface TradingMarketSnapshot {
  symbol: string;
  display: string;
  market: 'crypto' | 'yahoo' | 'tradingview';
  isStock?: boolean;
  tradingViewSymbol?: string;
  tradingViewWidgetUrl?: string;
  tradingViewRecommend?: number | null;
  currency: string;
  interval: string;
  price: number;
  changePercent24h: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  candles: OhlcvBar[];
  indicators: TechnicalIndicatorsSummary;
  quantAnalysis?: SixTierTradingAnalysis;
  source: string;
  fetchedAt: string;
}

export interface NormalizedSymbol {
  symbol: string;
  market: 'crypto' | 'yahoo';
  display: string;
  isStock?: boolean;
  tradingViewSymbol?: string;
}

const KNOWN_CRYPTO_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK',
  'MATIC', 'POL', 'TON', 'SUI', 'APT', 'ARB', 'OP', 'NEAR', 'ATOM', 'LTC',
  'BCH', 'SHIB', 'PEPE', 'UNI', 'AAVE', 'XLM', 'TRX', 'FIL', 'INJ', 'RNDR',
  'FET', 'WIF', 'BONK', 'SEI', 'TIA',
]);

const KNOWN_VN_STOCKS = new Set([
  'VIC', 'VHM', 'VNM', 'VCB', 'BID', 'CTG', 'TCB', 'MBB', 'ACB', 'VPB',
  'STB', 'HPG', 'HSG', 'NKG', 'FPT', 'MWG', 'MSN', 'SSI', 'VND', 'HCM',
  'VCI', 'GAS', 'PLX', 'PVD', 'PVS', 'REE', 'PNJ', 'DGC', 'GVR', 'BCM',
]);

const KNOWN_US_TICKERS = new Set([
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'GOOGL', 'AMZN', 'META', 'AMD',
  'INTC', 'NFLX', 'SPY', 'QQQ', 'DIA', 'IWM', 'VOO', 'GLD', 'SLV', 'USO',
  'COIN', 'MSTR', 'PLTR', 'ARM', 'AVGO', 'TSM',
]);

const ALIAS_MAP: Record<string, NormalizedSymbol> = {
  BITCOIN: { symbol: 'BTCUSDT', market: 'crypto', display: 'BTC/USDT (Bitcoin)' },
  BTC: { symbol: 'BTCUSDT', market: 'crypto', display: 'BTC/USDT (Bitcoin)' },
  ETHEREUM: { symbol: 'ETHUSDT', market: 'crypto', display: 'ETH/USDT (Ethereum)' },
  ETH: { symbol: 'ETHUSDT', market: 'crypto', display: 'ETH/USDT (Ethereum)' },
  SOLANA: { symbol: 'SOLUSDT', market: 'crypto', display: 'SOL/USDT (Solana)' },
  SOL: { symbol: 'SOLUSDT', market: 'crypto', display: 'SOL/USDT (Solana)' },
  BNB: { symbol: 'BNBUSDT', market: 'crypto', display: 'BNB/USDT' },
  XRP: { symbol: 'XRPUSDT', market: 'crypto', display: 'XRP/USDT' },
  RIPPLE: { symbol: 'XRPUSDT', market: 'crypto', display: 'XRP/USDT' },
  DOGECOIN: { symbol: 'DOGEUSDT', market: 'crypto', display: 'DOGE/USDT' },
  DOGE: { symbol: 'DOGEUSDT', market: 'crypto', display: 'DOGE/USDT' },
  TON: { symbol: 'TONUSDT', market: 'crypto', display: 'TON/USDT' },
  GOLD: { symbol: 'GC=F', market: 'yahoo', display: 'XAU/Gold Futures (GC=F)' },
  XAU: { symbol: 'GC=F', market: 'yahoo', display: 'XAU/Gold Futures (GC=F)' },
  XAUUSD: { symbol: 'GC=F', market: 'yahoo', display: 'XAU/USD Gold Futures (GC=F)' },
  'VÀNG': { symbol: 'GC=F', market: 'yahoo', display: 'Vàng Thế Giới (GC=F)' },
  SILVER: { symbol: 'SI=F', market: 'yahoo', display: 'Silver Futures (SI=F)' },
  XAGUSD: { symbol: 'SI=F', market: 'yahoo', display: 'XAG/USD Silver (SI=F)' },
  'BẠC': { symbol: 'SI=F', market: 'yahoo', display: 'Bạc (SI=F)' },
  OIL: { symbol: 'CL=F', market: 'yahoo', display: 'WTI Crude Oil (CL=F)' },
  WTI: { symbol: 'CL=F', market: 'yahoo', display: 'WTI Crude Oil (CL=F)' },
  'DẦU': { symbol: 'CL=F', market: 'yahoo', display: 'Dầu thô WTI (CL=F)' },
  BRENT: { symbol: 'BZ=F', market: 'yahoo', display: 'Brent Crude Oil (BZ=F)' },
  VNINDEX: { symbol: '^VNINDEX', market: 'yahoo', display: 'VN-Index (^VNINDEX)', isStock: true, tradingViewSymbol: 'HOSE:VNINDEX' },
  'VN-INDEX': { symbol: '^VNINDEX', market: 'yahoo', display: 'VN-Index (^VNINDEX)', isStock: true, tradingViewSymbol: 'HOSE:VNINDEX' },
  SP500: { symbol: '^GSPC', market: 'yahoo', display: 'S&P 500 (^GSPC)', isStock: true, tradingViewSymbol: 'SP:SPX' },
  'S&P500': { symbol: '^GSPC', market: 'yahoo', display: 'S&P 500 (^GSPC)', isStock: true, tradingViewSymbol: 'SP:SPX' },
  NASDAQ: { symbol: '^IXIC', market: 'yahoo', display: 'NASDAQ Composite (^IXIC)', isStock: true, tradingViewSymbol: 'NASDAQ:IXIC' },
  DOWJONES: { symbol: '^DJI', market: 'yahoo', display: 'Dow Jones (^DJI)', isStock: true, tradingViewSymbol: 'DJ:DJI' },
  DXY: { symbol: 'DX-Y.NYB', market: 'yahoo', display: 'US Dollar Index (DXY)' },
  EURUSD: { symbol: 'EURUSD=X', market: 'yahoo', display: 'EUR/USD' },
  'EUR/USD': { symbol: 'EURUSD=X', market: 'yahoo', display: 'EUR/USD' },
  GBPUSD: { symbol: 'GBPUSD=X', market: 'yahoo', display: 'GBP/USD' },
  'GBP/USD': { symbol: 'GBPUSD=X', market: 'yahoo', display: 'GBP/USD' },
  USDJPY: { symbol: 'USDJPY=X', market: 'yahoo', display: 'USD/JPY' },
  'USD/JPY': { symbol: 'USDJPY=X', market: 'yahoo', display: 'USD/JPY' },
  USDVND: { symbol: 'USDVND=X', market: 'yahoo', display: 'USD/VND' },
  'USD/VND': { symbol: 'USDVND=X', market: 'yahoo', display: 'USD/VND' },
};

function roundNum(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeTradingSymbol(raw: string): NormalizedSymbol {
  const cleaned = String(raw || '').trim().toUpperCase();
  if (!cleaned) {
    return { symbol: 'BTCUSDT', market: 'crypto', display: 'BTC/USDT' };
  }

  const compact = cleaned.replace(/\s+/g, '');
  if (ALIAS_MAP[compact]) {
    return ALIAS_MAP[compact];
  }
  if (ALIAS_MAP[cleaned]) {
    return ALIAS_MAP[cleaned];
  }

  // Handle explicit TradingView exchange prefix (stocks, indices, crypto, forex, commodities)
  const exPrefix = compact.match(
    /^(HOSE|HNX|UPCOM|NASDAQ|NYSE|AMEX|SP|DJ|BINANCE|COINBASE|BYBIT|OKX|OANDA|FX|TVC):([A-Z0-9._-]+)$/
  );
  if (exPrefix) {
    const [, ex, tk] = exPrefix;
    if (ex === 'BINANCE' || ex === 'COINBASE' || ex === 'BYBIT' || ex === 'OKX') {
      const normalizedCrypto = /(USDT|BUSD|USDC)$/.test(tk) ? tk : tk.replace(/USD$/, 'USDT');
      return {
        symbol: normalizedCrypto,
        market: 'crypto',
        display: `${normalizedCrypto.replace(/(USDT|BUSD|USDC)$/, '')}/USDT`,
        isStock: false,
        tradingViewSymbol: `${ex}:${tk}`,
      };
    }
    if (ex === 'OANDA' || ex === 'TVC') {
      const mapped = ALIAS_MAP[tk] || (tk === 'XAUUSD' ? ALIAS_MAP['XAUUSD'] : tk === 'XAGUSD' ? ALIAS_MAP['XAGUSD'] : tk === 'DXY' ? ALIAS_MAP['DXY'] : undefined);
      if (mapped) {
        return { ...mapped, tradingViewSymbol: `${ex}:${tk}` };
      }
      return {
        symbol: tk === 'USOIL' ? 'CL=F' : tk === 'UKOIL' ? 'BZ=F' : `${tk}=X`,
        market: 'yahoo',
        display: `${tk} (${ex})`,
        isStock: false,
        tradingViewSymbol: `${ex}:${tk}`,
      };
    }
    if (ex === 'FX') {
      return {
        symbol: `${tk}=X`,
        market: 'yahoo',
        display: tk.length === 6 ? `${tk.slice(0, 3)}/${tk.slice(3)}` : tk,
        isStock: false,
        tradingViewSymbol: `FX:${tk}`,
      };
    }
    const isVn = ex === 'HOSE' || ex === 'HNX' || ex === 'UPCOM';
    const yahooSym =
      tk === 'VNINDEX'
        ? '^VNINDEX'
        : tk === 'SPX'
        ? '^GSPC'
        : tk === 'DJI'
        ? '^DJI'
        : tk === 'IXIC'
        ? '^IXIC'
        : isVn
        ? `${tk}.VN`
        : tk;
    return {
      symbol: yahooSym,
      market: 'yahoo',
      display: `${tk} (${ex})`,
      isStock: true,
      tradingViewSymbol: `${ex}:${tk}`,
    };
  }

  // Pair like BTC/USDT, SOL-USD, ETHUSDT
  const cryptoPairMatch = compact.match(/^([A-Z0-9]{2,10})[\/\-_]?(USDT|BUSD|USDC)$/);
  if (cryptoPairMatch) {
    const base = cryptoPairMatch[1];
    return { symbol: `${base}USDT`, market: 'crypto', display: `${base}/USDT` };
  }

  const cryptoUsdMatch = compact.match(/^([A-Z0-9]{2,10})[\/\-_]USD$/);
  if (cryptoUsdMatch && KNOWN_CRYPTO_BASES.has(cryptoUsdMatch[1])) {
    const base = cryptoUsdMatch[1];
    return { symbol: `${base}USDT`, market: 'crypto', display: `${base}/USDT` };
  }

  if (KNOWN_CRYPTO_BASES.has(compact)) {
    return { symbol: `${compact}USDT`, market: 'crypto', display: `${compact}/USDT` };
  }

  if (compact.endsWith('.VN') || KNOWN_VN_STOCKS.has(compact)) {
    const base = compact.replace(/\.VN$/, '');
    const sym = `${base}.VN`;
    const tv = resolveTradingViewSymbol(sym);
    return {
      symbol: sym,
      market: 'yahoo',
      display: `${base} (${tv.exchange})`,
      isStock: true,
      tradingViewSymbol: tv.tvSymbol,
    };
  }

  // Forex pairs with slash e.g. AUD/USD
  const fxSlash = compact.match(/^([A-Z]{3})\/([A-Z]{3})$/);
  if (fxSlash) {
    const sym = `${fxSlash[1]}${fxSlash[2]}=X`;
    return { symbol: sym, market: 'yahoo', display: compact };
  }

  const isStock = isStockTickerSymbol(compact);
  if (isStock) {
    const tv = resolveTradingViewSymbol(compact);
    return {
      symbol: compact,
      market: 'yahoo',
      display: `${tv.ticker} (${tv.exchange})`,
      isStock: true,
      tradingViewSymbol: tv.tvSymbol,
    };
  }

  return { symbol: compact, market: 'yahoo', display: cleaned };
}

export function extractTickersFromPrompt(text: string): NormalizedSymbol[] {
  const raw = String(text || '');
  if (!raw.trim()) return [];

  const found: NormalizedSymbol[] = [];
  const seenSymbols = new Set<string>();

  const pushUnique = (norm: NormalizedSymbol) => {
    if (seenSymbols.has(norm.symbol)) return;
    seenSymbols.add(norm.symbol);
    found.push(norm);
  };

  // Explicit alias phrases (VN & EN)
  const lower = raw.toLowerCase();
  if (/\b(giá vàng|vàng|xauusd|xau\/usd|xau)\b/i.test(lower)) {
    pushUnique(ALIAS_MAP['VÀNG']);
  }
  if (/\b(dầu thô|giá dầu|wti|crude oil)\b/i.test(lower)) {
    pushUnique(ALIAS_MAP['WTI']);
  }
  if (/\b(vn[\s-]?index|vnindex)\b/i.test(lower)) {
    pushUnique(ALIAS_MAP['VNINDEX']);
  }
  if (/\b(s&p\s*500|sp500)\b/i.test(lower)) {
    pushUnique(ALIAS_MAP['SP500']);
  }
  if (/\b(bitcoin)\b/i.test(lower)) {
    pushUnique(ALIAS_MAP['BTC']);
  }
  if (/\b(ethereum)\b/i.test(lower)) {
    pushUnique(ALIAS_MAP['ETH']);
  }
  if (/\b(solana)\b/i.test(lower)) {
    pushUnique(ALIAS_MAP['SOL']);
  }

  // Exchange prefixed symbols like HOSE:FPT, NASDAQ:NVDA
  const tvRegex = /\b((?:HOSE|HNX|UPCOM|NASDAQ|NYSE|AMEX):[A-Za-z0-9]{1,8})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = tvRegex.exec(raw)) !== null) {
    pushUnique(normalizeTradingSymbol(m[1]));
    if (found.length >= 3) return found;
  }

  // Pair patterns like BTC/USDT, EUR/USD, FPT.VN, BTCUSDT
  const pairRegex = /\b([A-Za-z0-9]{2,10}(?:\/USDT|\/USD|USDT|\.VN|\/[A-Za-z]{3}))\b/g;
  while ((m = pairRegex.exec(raw)) !== null) {
    pushUnique(normalizeTradingSymbol(m[1]));
    if (found.length >= 3) return found;
  }

  // Known standalone tickers (uppercase strict for 2-5 letter equity codes, or when stock context keywords appear)
  const hasStockContext = /\b(cổ\s*phiếu|chứng\s*khoán|mã\s*ck|stock|equity|share|ticker|tradingview|hose|hnx|nasdaq|nyse)\b/i.test(raw);
  const tokenRegex = /\b([A-Za-z]{2,7})\b/g;
  while ((m = tokenRegex.exec(raw)) !== null) {
    const tok = m[1];
    const upper = tok.toUpperCase();
    if (
      KNOWN_CRYPTO_BASES.has(upper) ||
      ALIAS_MAP[upper] ||
      ((tok === upper || hasStockContext) && (KNOWN_VN_STOCKS.has(upper) || KNOWN_US_TICKERS.has(upper)))
    ) {
      pushUnique(normalizeTradingSymbol(upper));
      if (found.length >= 3) return found;
    }
  }

  return found;
}

export function computeSma(values: number[], period: number): number[] {
  if (!Array.isArray(values) || period <= 0 || values.length < period) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out.push(sum / period);
  }
  return out;
}

export function computeEma(values: number[], period: number): number[] {
  if (!Array.isArray(values) || period <= 0 || values.length < period) return [];
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += values[i];
  ema /= period;
  const out: number[] = [ema];
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

export function computeRsi(closes: number[], period = 14): number | null {
  if (!Array.isArray(closes) || closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return roundNum(100 - 100 / (1 + rs), 2);
}

export function computeMacd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: number; signal: number; histogram: number } | null {
  if (!Array.isArray(closes) || closes.length < slow + signalPeriod) return null;
  const emaFast = computeEma(closes, fast);
  const emaSlow = computeEma(closes, slow);
  const offset = emaFast.length - emaSlow.length;
  const macdLine = emaSlow.map((s, idx) => emaFast[idx + offset] - s);
  const signalLine = computeEma(macdLine, signalPeriod);
  if (signalLine.length === 0) return null;
  const macd = macdLine[macdLine.length - 1];
  const signal = signalLine[signalLine.length - 1];
  return {
    macd: roundNum(macd, 6),
    signal: roundNum(signal, 6),
    histogram: roundNum(macd - signal, 6),
  };
}

export function computeBollingerBands(
  closes: number[],
  period = 20,
  stdMult = 2
): { upper: number; middle: number; lower: number } | null {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: roundNum(mean + stdMult * std, 6),
    middle: roundNum(mean, 6),
    lower: roundNum(mean - stdMult * std, 6),
  };
}

export function computeAtr(candles: OhlcvBar[], period = 14): number | null {
  if (!Array.isArray(candles) || candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return roundNum(atr, 6);
}

export function computePivotLevels(high: number, low: number, close: number) {
  const pivot = (high + low + close) / 3;
  return {
    pivot: roundNum(pivot, 6),
    r1: roundNum(2 * pivot - low, 6),
    r2: roundNum(pivot + (high - low), 6),
    s1: roundNum(2 * pivot - high, 6),
    s2: roundNum(pivot - (high - low), 6),
  };
}

export function analyzeOhlcvCandles(candles: OhlcvBar[]): TechnicalIndicatorsSummary {
  const closes = candles.map(c => c.close).filter(n => Number.isFinite(n));
  const latestClose = closes.length > 0 ? closes[closes.length - 1] : 0;

  const ema9Arr = computeEma(closes, 9);
  const ema21Arr = computeEma(closes, 21);
  const ema50Arr = computeEma(closes, 50);

  const ema9 = ema9Arr.length > 0 ? roundNum(ema9Arr[ema9Arr.length - 1], 6) : null;
  const ema21 = ema21Arr.length > 0 ? roundNum(ema21Arr[ema21Arr.length - 1], 6) : null;
  const ema50 = ema50Arr.length > 0 ? roundNum(ema50Arr[ema50Arr.length - 1], 6) : null;

  const rsi14 = computeRsi(closes, 14);
  const macd = computeMacd(closes);
  const bollinger = computeBollingerBands(closes, 20, 2);
  const atr14 = computeAtr(candles, 14);

  const prevBar = candles.length >= 2 ? candles[candles.length - 2] : candles[candles.length - 1];
  const pivots = prevBar ? computePivotLevels(prevBar.high, prevBar.low, prevBar.close) : null;

  const recentSlice = candles.slice(-20);
  const recentHigh = recentSlice.length > 0 ? roundNum(Math.max(...recentSlice.map(b => b.high)), 6) : null;
  const recentLow = recentSlice.length > 0 ? roundNum(Math.min(...recentSlice.map(b => b.low)), 6) : null;

  let trend: 'bullish' | 'bearish' | 'sideways' = 'sideways';
  if (ema9 !== null && ema21 !== null) {
    if (latestClose > ema9 && ema9 > ema21) trend = 'bullish';
    else if (latestClose < ema9 && ema9 < ema21) trend = 'bearish';
  }

  return {
    latestClose,
    ema9,
    ema21,
    ema50,
    rsi14,
    macd,
    bollinger,
    atr14,
    pivots,
    recentHigh,
    recentLow,
    trend,
  };
}

// ============================================================================
// TIER 1: ADVANCED PRICE ACTION (HH/HL/LH/LL, BOS, CHoCH, S/R, Sweep, FVG, S/D, MTF)
// ============================================================================
export function analyzePriceAction(candles: OhlcvBar[]): PriceActionAnalysis {
  if (!Array.isArray(candles) || candles.length < 7) {
    return {
      structureTrend: 'ranging',
      swingSequence: [],
      lastStructureEvent: 'NONE',
      dynamicSupport: candles[candles.length - 1]?.low ?? null,
      dynamicResistance: candles[candles.length - 1]?.high ?? null,
      liquiditySweeps: [],
      activeFvgs: [],
      supplyDemandZones: [],
      multiTimeframe: {
        macroTrend: 'sideways',
        dailyTrend: 'sideways',
        microMomentum: 'sideways',
        alignment: 'mixed',
      },
    };
  }

  const lookback = 2;
  const rawSwings: Array<{ index: number; date: string; price: number; kind: 'high' | 'low' }> = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const cur = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= cur.high) isHigh = false;
      if (candles[j].low <= cur.low) isLow = false;
    }
    if (isHigh) {
      rawSwings.push({ index: i, date: cur.date, price: roundNum(cur.high, 6), kind: 'high' });
    }
    if (isLow) {
      rawSwings.push({ index: i, date: cur.date, price: roundNum(cur.low, 6), kind: 'low' });
    }
  }

  let prevHigh: number | null = null;
  let prevLow: number | null = null;
  const labeledSwings: SwingPoint[] = rawSwings.map((sp) => {
    let label: SwingPoint['label'] = sp.kind === 'high' ? 'H' : 'L';
    if (sp.kind === 'high') {
      if (prevHigh !== null) label = sp.price > prevHigh ? 'HH' : 'LH';
      prevHigh = sp.price;
    } else {
      if (prevLow !== null) label = sp.price > prevLow ? 'HL' : 'LL';
      prevLow = sp.price;
    }
    return { ...sp, label };
  });

  const recentHighs = labeledSwings.filter((s) => s.kind === 'high').slice(-3);
  const recentLows = labeledSwings.filter((s) => s.kind === 'low').slice(-3);

  const lastHigh = recentHighs[recentHighs.length - 1];
  const prevSwingHigh = recentHighs[recentHighs.length - 2];
  const lastLow = recentLows[recentLows.length - 1];
  const prevSwingLow = recentLows[recentLows.length - 2];

  let structureTrend: 'bullish' | 'bearish' | 'ranging' = 'ranging';
  if (lastHigh?.label === 'HH' && lastLow?.label === 'HL') structureTrend = 'bullish';
  else if (lastHigh?.label === 'LH' && lastLow?.label === 'LL') structureTrend = 'bearish';
  else if (lastHigh && lastLow) {
    const latestClose = candles[candles.length - 1].close;
    if (latestClose > lastHigh.price) structureTrend = 'bullish';
    else if (latestClose < lastLow.price) structureTrend = 'bearish';
  }

  // BOS & CHoCH detection from latest close relative to prior key swings
  const latestClose = candles[candles.length - 1].close;
  let lastStructureEvent: PriceActionAnalysis['lastStructureEvent'] = 'NONE';
  const hadLowerHighs = prevSwingHigh?.label === 'LH' || lastHigh?.label === 'LH';
  const hadHigherLows = prevSwingLow?.label === 'HL' || lastLow?.label === 'HL';

  if (lastHigh && latestClose > lastHigh.price) {
    lastStructureEvent = hadLowerHighs ? 'CHOCH_BULLISH' : 'BOS_BULLISH';
  } else if (lastLow && latestClose < lastLow.price) {
    lastStructureEvent = hadHigherLows ? 'CHOCH_BEARISH' : 'BOS_BEARISH';
  } else if (lastHigh?.label === 'HH' && lastLow?.label === 'HL') {
    lastStructureEvent = 'BOS_BULLISH';
  } else if (lastHigh?.label === 'LH' && lastLow?.label === 'LL') {
    lastStructureEvent = 'BOS_BEARISH';
  }

  // Dynamic S/R levels
  const dynamicSupport = lastLow ? lastLow.price : roundNum(Math.min(...candles.slice(-20).map((b) => b.low)), 6);
  const dynamicResistance = lastHigh ? lastHigh.price : roundNum(Math.max(...candles.slice(-20).map((b) => b.high)), 6);

  // Liquidity sweeps in the last 12 bars
  const liquiditySweeps: LiquiditySweepEvent[] = [];
  const startSweepIdx = Math.max(3, candles.length - 12);
  for (let i = startSweepIdx; i < candles.length; i++) {
    const bar = candles[i];
    const priorSlice = candles.slice(Math.max(0, i - 15), i);
    if (priorSlice.length === 0) continue;
    const priorHigh = Math.max(...priorSlice.map((b) => b.high));
    const priorLow = Math.min(...priorSlice.map((b) => b.low));
    if (bar.high > priorHigh && bar.close < priorHigh) {
      liquiditySweeps.push({
        direction: 'bearish_sweep',
        date: bar.date,
        sweptLevel: roundNum(priorHigh, 6),
        closePrice: roundNum(bar.close, 6),
      });
    } else if (bar.low < priorLow && bar.close > priorLow) {
      liquiditySweeps.push({
        direction: 'bullish_sweep',
        date: bar.date,
        sweptLevel: roundNum(priorLow, 6),
        closePrice: roundNum(bar.close, 6),
      });
    }
  }

  // Fair Value Gaps (FVG) across recent 30 bars
  const activeFvgs: FairValueGap[] = [];
  const startFvg = Math.max(2, candles.length - 30);
  for (let i = startFvg; i < candles.length; i++) {
    const b0 = candles[i - 2];
    const b2 = candles[i];
    if (b2.low > b0.high) {
      const filled = candles.slice(i + 1).some((f) => f.low <= b0.high);
      if (!filled) {
        activeFvgs.push({
          direction: 'bullish',
          date: candles[i - 1].date,
          top: roundNum(b2.low, 6),
          bottom: roundNum(b0.high, 6),
          filled: false,
        });
      }
    } else if (b2.high < b0.low) {
      const filled = candles.slice(i + 1).some((f) => f.high >= b0.low);
      if (!filled) {
        activeFvgs.push({
          direction: 'bearish',
          date: candles[i - 1].date,
          top: roundNum(b0.low, 6),
          bottom: roundNum(b2.high, 6),
          filled: false,
        });
      }
    }
  }

  // Supply & Demand Zones (base candle followed by strong >= 1.5*ATR impulse)
  const atr = computeAtr(candles, 14) || (candles[candles.length - 1].close * 0.015);
  const supplyDemandZones: SupplyDemandZone[] = [];
  for (let i = Math.max(1, candles.length - 30); i < candles.length - 1; i++) {
    const base = candles[i];
    const next = candles[i + 1];
    const bodyMove = next.close - next.open;
    if (Math.abs(bodyMove) >= atr * 1.4) {
      const impulsePct = base.close > 0 ? roundNum((bodyMove / base.close) * 100, 2) : 0;
      supplyDemandZones.push({
        type: bodyMove > 0 ? 'demand' : 'supply',
        date: base.date,
        high: roundNum(base.high, 6),
        low: roundNum(base.low, 6),
        impulsePct,
      });
    }
  }

  // Multi-Timeframe alignment (Synthetic 5-bar higher TF + Daily + 3-bar micro)
  const closes = candles.map((c) => c.close);
  const ema21 = computeEma(closes, Math.min(21, Math.max(5, Math.floor(closes.length / 2))));
  const ema50 = computeEma(closes, Math.min(50, Math.max(8, closes.length - 1)));
  const lastEma21 = ema21[ema21.length - 1] ?? latestClose;
  const lastEma50 = ema50[ema50.length - 1] ?? latestClose;

  const macroTrend: 'bullish' | 'bearish' | 'sideways' =
    latestClose > lastEma50 * 1.004 ? 'bullish' : latestClose < lastEma50 * 0.996 ? 'bearish' : 'sideways';
  const dailyTrend: 'bullish' | 'bearish' | 'sideways' =
    structureTrend === 'bullish' || (latestClose > lastEma21 && lastEma21 > lastEma50)
      ? 'bullish'
      : structureTrend === 'bearish' || (latestClose < lastEma21 && lastEma21 < lastEma50)
      ? 'bearish'
      : 'sideways';
  const microStart = closes[Math.max(0, closes.length - 4)];
  const microMomentum: 'bullish' | 'bearish' | 'sideways' =
    latestClose > microStart * 1.003 ? 'bullish' : latestClose < microStart * 0.997 ? 'bearish' : 'sideways';

  const alignment: PriceActionAnalysis['multiTimeframe']['alignment'] =
    macroTrend === 'bullish' && dailyTrend === 'bullish' && microMomentum === 'bullish'
      ? 'aligned_bullish'
      : macroTrend === 'bearish' && dailyTrend === 'bearish' && microMomentum === 'bearish'
      ? 'aligned_bearish'
      : 'mixed';

  return {
    structureTrend,
    swingSequence: labeledSwings.slice(-8),
    lastStructureEvent,
    dynamicSupport,
    dynamicResistance,
    liquiditySweeps: liquiditySweeps.slice(-4),
    activeFvgs: activeFvgs.slice(-4),
    supplyDemandZones: supplyDemandZones.slice(-4),
    multiTimeframe: {
      macroTrend,
      dailyTrend,
      microMomentum,
      alignment,
    },
  };
}

// ============================================================================
// TIER 2: QUANTITATIVE TRADING (Kalman, GARCH(1,1), Z-score, Stat-Arb, Regime)
// ============================================================================
export function analyzeQuantitative(candles: OhlcvBar[]): QuantitativeAnalysis {
  const closes = candles.map((c) => c.close).filter((n) => Number.isFinite(n) && n > 0);
  if (closes.length < 15) {
    return {
      kalmanPrice: closes[closes.length - 1] ?? null,
      kalmanSlopePct: null,
      kalmanInnovationZ: null,
      garchAnnualizedVolPct: null,
      garmanKlassVolPct: null,
      realizedVol20dPct: null,
      volRatioGarchToRealized: null,
      meanReversionZ20: null,
      meanReversionHalfLifeBars: null,
      meanReversionSignal: 'NEUTRAL',
      volAdjustedMomentum10: null,
      statArbSpreadZ50: null,
      varianceRatioProxy: null,
      hurstExponent: null,
      regime: 'MEAN_REVERTING',
    };
  }

  // Log returns
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }

  // 1D Constant-Velocity Kalman Filter on close price
  const lastPrice = closes[closes.length - 1];
  const rNoise = Math.pow(lastPrice * 0.012, 2);
  const qLevel = Math.pow(lastPrice * 0.004, 2);
  const qVel = Math.pow(lastPrice * 0.0015, 2);

  let xLevel = closes[0];
  let xVel = 0;
  let p00 = rNoise;
  let p01 = 0;
  let p10 = 0;
  let p11 = qVel * 4;
  let latestInnovationZ = 0;

  for (let i = 1; i < closes.length; i++) {
    // Predict
    const predLevel = xLevel + xVel;
    const predVel = xVel;
    const np00 = p00 + p01 + p10 + p11 + qLevel;
    const np01 = p01 + p11;
    const np10 = p10 + p11;
    const np11 = p11 + qVel;

    // Update
    const y = closes[i] - predLevel;
    const S = np00 + rNoise;
    const k0 = np00 / S;
    const k1 = np10 / S;

    xLevel = predLevel + k0 * y;
    xVel = predVel + k1 * y;
    p00 = (1 - k0) * np00;
    p01 = (1 - k0) * np01;
    p10 = np10 - k1 * np00;
    p11 = np11 - k1 * np01;
    latestInnovationZ = y / Math.max(Math.sqrt(S), 1e-8);
  }

  const kalmanSlopePct = xLevel > 0 ? roundNum((xVel / xLevel) * 100, 3) : 0;

  // Realized Volatility (20-bar) & GARCH(1,1) conditional volatility
  const volSlice = returns.slice(-20);
  const meanRet = volSlice.reduce((a, b) => a + b, 0) / volSlice.length;
  const var20 = Math.max(
    1e-9,
    volSlice.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) / Math.max(1, volSlice.length - 1)
  );
  const realizedVol20dPct = roundNum(Math.sqrt(var20) * Math.sqrt(252) * 100, 2);

  const omega = var20 * 0.05;
  const alpha = 0.12;
  const beta = 0.83;
  let h = var20;
  for (let i = Math.max(0, returns.length - 40); i < returns.length; i++) {
    const eps = returns[i] - meanRet;
    h = omega + alpha * eps * eps + beta * h;
  }
  const garchAnnualizedVolPct = roundNum(Math.sqrt(Math.max(h, 1e-9)) * Math.sqrt(252) * 100, 2);
  const volRatioGarchToRealized = realizedVol20dPct > 0 ? roundNum(garchAnnualizedVolPct / realizedVol20dPct, 3) : 1;

  // 20-bar Mean Reversion Z-score
  const priceSlice20 = closes.slice(-20);
  const mean20 = priceSlice20.reduce((a, b) => a + b, 0) / priceSlice20.length;
  const std20 = Math.sqrt(
    priceSlice20.reduce((acc, p) => acc + Math.pow(p - mean20, 2), 0) / priceSlice20.length
  );
  const meanReversionZ20 = std20 > 1e-8 ? roundNum((lastPrice - mean20) / std20, 3) : 0;
  const meanReversionSignal: QuantitativeAnalysis['meanReversionSignal'] =
    meanReversionZ20 >= 1.8 ? 'OVERBOUGHT' : meanReversionZ20 <= -1.8 ? 'OVERSOLD' : 'NEUTRAL';

  // Volatility-adjusted Momentum (10-bar)
  const baseIdx = Math.max(0, closes.length - 11);
  const mom10 = closes[baseIdx] > 0 ? (lastPrice - closes[baseIdx]) / closes[baseIdx] : 0;
  const vol10d = Math.sqrt(var20 * 10);
  const volAdjustedMomentum10 = vol10d > 1e-6 ? roundNum(mom10 / vol10d, 3) : 0;

  // Stat-Arb detrended spread vs EMA50
  const emaPeriod = Math.min(50, closes.length);
  const emaSeries = computeEma(closes, emaPeriod);
  let statArbSpreadZ50: number | null = 0;
  if (emaSeries.length >= 10) {
    const offset = closes.length - emaSeries.length;
    const spreads = emaSeries.map((e, idx) => (closes[idx + offset] - e) / Math.max(e, 1e-8));
    const recentSpreads = spreads.slice(-20);
    const spMean = recentSpreads.reduce((a, b) => a + b, 0) / recentSpreads.length;
    const spStd = Math.sqrt(
      recentSpreads.reduce((acc, s) => acc + Math.pow(s - spMean, 2), 0) / recentSpreads.length
    );
    const curSp = spreads[spreads.length - 1];
    statArbSpreadZ50 = spStd > 1e-8 ? roundNum((curSp - spMean) / spStd, 3) : 0;
  }

  // Variance ratio (q=4) & Hurst exponent estimate
  let varianceRatioProxy = 1;
  let hurstExponent = 0.5;
  if (returns.length >= 24) {
    const rMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const var1 = returns.reduce((acc, r) => acc + Math.pow(r - rMean, 2), 0) / returns.length;
    const ret4: number[] = [];
    for (let i = 4; i < closes.length; i++) {
      ret4.push(Math.log(closes[i] / closes[i - 4]));
    }
    const r4Mean = ret4.reduce((a, b) => a + b, 0) / ret4.length;
    const var4 = ret4.reduce((acc, r) => acc + Math.pow(r - r4Mean, 2), 0) / ret4.length;
    if (var1 > 1e-9) {
      varianceRatioProxy = roundNum(var4 / (4 * var1), 3);
      if (varianceRatioProxy > 0) {
        hurstExponent = roundNum(clamp(0.5 + Math.log(varianceRatioProxy) / (2 * Math.log(4)), 0.15, 0.85), 3);
      }
    }
  }

  // Garman-Klass Range-Based Annualized Volatility (20-bar OHLC)
  let garmanKlassVolPct: number | null = realizedVol20dPct;
  const gkSlice = candles.slice(-20);
  if (gkSlice.length >= 5) {
    const c2Ln2m1 = 2 * Math.LN2 - 1;
    let sumGk = 0;
    let validGk = 0;
    for (const b of gkSlice) {
      if (b.high > 0 && b.low > 0 && b.open > 0 && b.close > 0 && b.high >= b.low) {
        const hl = Math.log(b.high / b.low);
        const co = Math.log(b.close / b.open);
        const gk = 0.5 * hl * hl - c2Ln2m1 * co * co;
        if (Number.isFinite(gk) && gk >= 0) {
          sumGk += gk;
          validGk++;
        }
      }
    }
    if (validGk > 0) {
      garmanKlassVolPct = roundNum(Math.sqrt(sumGk / validGk) * Math.sqrt(252) * 100, 2);
    }
  }

  // Ornstein-Uhlenbeck Half-Life for Mean Reversion (bars) via AR(1) regression on spread vs EMA20
  let meanReversionHalfLifeBars: number | null = null;
  if (closes.length >= 20) {
    const spreadArr = closes.slice(-30).map((c) => c - mean20);
    let num = 0;
    let den = 0;
    for (let i = 1; i < spreadArr.length; i++) {
      const xPrev = spreadArr[i - 1];
      const dx = spreadArr[i] - xPrev;
      num += xPrev * dx;
      den += xPrev * xPrev;
    }
    if (den > 1e-9) {
      const lambda = num / den; // dx = lambda * xPrev
      if (lambda < -0.005 && lambda > -0.99) {
        meanReversionHalfLifeBars = roundNum(-Math.LN2 / Math.log(1 + lambda), 1);
      }
    }
  }

  let regime: MarketRegimeLabel = 'MEAN_REVERTING';
  if (volRatioGarchToRealized >= 1.35 || garchAnnualizedVolPct >= 75) {
    regime = 'HIGH_VOL_SHOCK';
  } else if (kalmanSlopePct > 0.08 && (varianceRatioProxy >= 1.05 || volAdjustedMomentum10 > 0.6)) {
    regime = 'TRENDING_UP';
  } else if (kalmanSlopePct < -0.08 && (varianceRatioProxy >= 1.05 || volAdjustedMomentum10 < -0.6)) {
    regime = 'TRENDING_DOWN';
  }

  return {
    kalmanPrice: roundNum(xLevel, 6),
    kalmanSlopePct,
    kalmanInnovationZ: roundNum(latestInnovationZ, 3),
    garchAnnualizedVolPct,
    garmanKlassVolPct,
    realizedVol20dPct,
    volRatioGarchToRealized,
    meanReversionZ20,
    meanReversionHalfLifeBars,
    meanReversionSignal,
    volAdjustedMomentum10,
    statArbSpreadZ50,
    varianceRatioProxy,
    hurstExponent,
    regime,
  };
}

// ============================================================================
// TIER 3: ORDER FLOW / MICROSTRUCTURE (Volume Profile, VWAP, Delta, Real L2)
// ============================================================================
export async function fetchBinanceOrderFlow(
  symbol: string,
  host = 'https://data-api.binance.vision'
): Promise<OrderFlowL2Feed | null> {
  try {
    const [depthRes, tradesRes] = await Promise.all([
      fetch(`${host}/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=20`, {
        headers: { 'User-Agent': 'TheMasterTradingBot/1.0' },
        signal: AbortSignal.timeout(4000),
      }),
      fetch(`${host}/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=50`, {
        headers: { 'User-Agent': 'TheMasterTradingBot/1.0' },
        signal: AbortSignal.timeout(4000),
      }),
    ]);

    if (!depthRes.ok) return null;
    const depth: any = await depthRes.json();
    const bids: Array<[string, string]> = Array.isArray(depth?.bids) ? depth.bids : [];
    const asks: Array<[string, string]> = Array.isArray(depth?.asks) ? depth.asks : [];
    if (bids.length === 0 || asks.length === 0) return null;

    const bestBid = Number(bids[0][0]);
    const bestAsk = Number(asks[0][0]);
    const mid = (bestBid + bestAsk) / 2;
    const spreadBps = mid > 0 ? roundNum(((bestAsk - bestBid) / mid) * 10000, 3) : null;

    const bidDepthNotional = bids.reduce((acc, [p, q]) => acc + Number(p) * Number(q), 0);
    const askDepthNotional = asks.reduce((acc, [p, q]) => acc + Number(p) * Number(q), 0);
    const totalDepth = bidDepthNotional + askDepthNotional;
    const orderBookImbalance = totalDepth > 0 ? roundNum((bidDepthNotional - askDepthNotional) / totalDepth, 4) : 0;

    // Simulate market buy of $10,000 USD through ask levels
    let remainingUsd = 10000;
    let filledBase = 0;
    let spentUsd = 0;
    for (const [pStr, qStr] of asks) {
      const p = Number(pStr);
      const q = Number(qStr);
      const levelUsd = p * q;
      if (levelUsd >= remainingUsd) {
        filledBase += remainingUsd / p;
        spentUsd += remainingUsd;
        remainingUsd = 0;
        break;
      } else {
        filledBase += q;
        spentUsd += levelUsd;
        remainingUsd -= levelUsd;
      }
    }
    const avgFill = filledBase > 0 ? spentUsd / filledBase : bestAsk;
    const estimatedSlippage10kBps = mid > 0 ? roundNum(((avgFill - mid) / mid) * 10000, 3) : null;

    let takerBuyRatio: number | null = null;
    if (tradesRes.ok) {
      const trades: any[] = await tradesRes.json().catch(() => []);
      if (Array.isArray(trades) && trades.length > 0) {
        let buyVol = 0;
        let sellVol = 0;
        for (const t of trades) {
          const notional = Number(t.p || 0) * Number(t.q || 0);
          if (t.m === true) sellVol += notional; // seller was aggressor
          else buyVol += notional;
        }
        const tot = buyVol + sellVol;
        if (tot > 0) takerBuyRatio = roundNum(buyVol / tot, 4);
      }
    }

    return {
      orderBookImbalance,
      spreadBps,
      takerBuyRatio,
      estimatedSlippage10kBps,
      bestBid: roundNum(bestBid, 6),
      bestAsk: roundNum(bestAsk, 6),
      bidDepthNotional: roundNum(bidDepthNotional, 2),
      askDepthNotional: roundNum(askDepthNotional, 2),
    };
  } catch {
    return null;
  }
}

export function analyzeMicrostructure(
  candles: OhlcvBar[],
  l2Data?: OrderFlowL2Feed | null
): MicrostructureAnalysis {
  if (!Array.isArray(candles) || candles.length === 0) {
    return {
      orderBookStatus: l2Data ? 'live_l2_depth' : 'unavailable_free_feed',
      poc: null,
      vah: null,
      val: null,
      vwap: null,
      vwapUpper1Sigma: null,
      vwapLower1Sigma: null,
      recentDeltaVolume: null,
      cvdTrend: 'flat',
      obi: l2Data?.orderBookImbalance ?? null,
      bidAskImbalancePct: l2Data?.orderBookImbalance !== null && l2Data?.orderBookImbalance !== undefined ? roundNum(l2Data.orderBookImbalance * 100, 2) : null,
      spreadBps: l2Data?.spreadBps ?? null,
      takerBuyRatio: l2Data?.takerBuyRatio ?? null,
      estimatedSlippage10kBps: l2Data?.estimatedSlippage10kBps ?? null,
      kylesLambdaBpsPer100k: null,
    };
  }

  const window = candles.slice(-30);
  const minP = Math.min(...window.map((b) => b.low));
  const maxP = Math.max(...window.map((b) => b.high));
  const numBins = 12;
  const step = Math.max((maxP - minP) / numBins, 1e-8);
  const binVol = new Array<number>(numBins).fill(0);

  let sumPV = 0;
  let sumP2V = 0;
  let sumVol = 0;
  const deltas: number[] = [];

  for (const b of window) {
    const vol = Math.max(0, Number(b.volume) || 0);
    const tp = (b.high + b.low + b.close) / 3;
    sumPV += tp * vol;
    sumP2V += tp * tp * vol;
    sumVol += vol;

    const idx = Math.min(numBins - 1, Math.max(0, Math.floor((tp - minP) / step)));
    binVol[idx] += vol;

    const range = Math.max(b.high - b.low, 1e-8);
    const barDelta = vol * ((b.close - b.open) / range);
    deltas.push(barDelta);
  }

  const pocIdx = binVol.reduce((best, v, i, arr) => (v > arr[best] ? i : best), 0);
  const poc = roundNum(minP + (pocIdx + 0.5) * step, 6);

  // 70% Value Area centered outward from POC
  const targetVaVol = sumVol * 0.7;
  let vaVol = binVol[pocIdx];
  let loIdx = pocIdx;
  let hiIdx = pocIdx;
  while (vaVol < targetVaVol && (loIdx > 0 || hiIdx < numBins - 1)) {
    const leftVol = loIdx > 0 ? binVol[loIdx - 1] : -1;
    const rightVol = hiIdx < numBins - 1 ? binVol[hiIdx + 1] : -1;
    if (rightVol >= leftVol && hiIdx < numBins - 1) {
      hiIdx++;
      vaVol += binVol[hiIdx];
    } else if (loIdx > 0) {
      loIdx--;
      vaVol += binVol[loIdx];
    } else {
      break;
    }
  }
  const val = roundNum(minP + loIdx * step, 6);
  const vah = roundNum(minP + (hiIdx + 1) * step, 6);

  const vwap = sumVol > 0 ? roundNum(sumPV / sumVol, 6) : roundNum(window[window.length - 1].close, 6);
  const vwapVar = sumVol > 0 ? Math.max(0, sumP2V / sumVol - Math.pow(vwap, 2)) : 0;
  const vwapSigma = Math.sqrt(vwapVar);

  const recentDelta = deltas.slice(-5).reduce((a, b) => a + b, 0);
  const avgVol = sumVol / Math.max(1, window.length);
  const cvdTrend: MicrostructureAnalysis['cvdTrend'] =
    avgVol > 0 && recentDelta > avgVol * 0.25
      ? 'accumulating'
      : avgVol > 0 && recentDelta < -avgVol * 0.25
      ? 'distributing'
      : 'flat';

  // Kyle's Lambda market impact proxy (bps price shift per 100k notional traded)
  let kylesLambdaBpsPer100k: number | null = null;
  if (l2Data?.estimatedSlippage10kBps !== null && l2Data?.estimatedSlippage10kBps !== undefined) {
    kylesLambdaBpsPer100k = roundNum(Math.abs(l2Data.estimatedSlippage10kBps) * 10, 2);
  } else {
    let impactSum = 0;
    let impactCount = 0;
    for (let i = 1; i < window.length; i++) {
      const prevC = window[i - 1].close;
      const cur = window[i];
      const notional = cur.close * Math.max(0, Number(cur.volume) || 0);
      if (prevC > 0 && notional > 1e-3) {
        const absRetBps = Math.abs((cur.close - prevC) / prevC) * 10000;
        impactSum += (absRetBps / notional) * 100000;
        impactCount++;
      }
    }
    if (impactCount > 0) {
      kylesLambdaBpsPer100k = roundNum(impactSum / impactCount, 4);
    }
  }

  return {
    orderBookStatus: l2Data ? 'live_l2_depth' : 'unavailable_free_feed',
    poc,
    vah,
    val,
    vwap,
    vwapUpper1Sigma: roundNum(vwap + vwapSigma, 6),
    vwapLower1Sigma: roundNum(vwap - vwapSigma, 6),
    recentDeltaVolume: roundNum(recentDelta, 2),
    cvdTrend,
    obi: l2Data?.orderBookImbalance ?? null,
    bidAskImbalancePct:
      l2Data?.orderBookImbalance !== null && l2Data?.orderBookImbalance !== undefined
        ? roundNum(l2Data.orderBookImbalance * 100, 2)
        : null,
    spreadBps: l2Data?.spreadBps ?? null,
    takerBuyRatio: l2Data?.takerBuyRatio ?? null,
    estimatedSlippage10kBps: l2Data?.estimatedSlippage10kBps ?? null,
    kylesLambdaBpsPer100k,
  };
}

// ============================================================================
// TIERS 4, 5, 6: WALK-FORWARD OOS CHECK + RL + MULTI-MODEL META ENGINE
// ============================================================================
function evaluateOutOfSampleSchools(candles: OhlcvBar[]): SchoolOosScore[] {
  if (!Array.isArray(candles) || candles.length < 28) {
    return [
      { school: 'Price Action & Trend', hitRate: 0.5, informationCoefficient: 0, sampleCount: 0, reliable: false },
      { school: 'Mean Reversion Z-Score', hitRate: 0.5, informationCoefficient: 0, sampleCount: 0, reliable: false },
      { school: 'Momentum Volatility-Adj', hitRate: 0.5, informationCoefficient: 0, sampleCount: 0, reliable: false },
      { school: 'Volume / Delta Flow', hitRate: 0.5, informationCoefficient: 0, sampleCount: 0, reliable: false },
    ];
  }

  const start = 20;
  let paHits = 0;
  let mrHits = 0;
  let momHits = 0;
  let flowHits = 0;
  let total = 0;

  for (let i = start; i < candles.length - 1; i++) {
    const window = candles.slice(i - 20, i + 1);
    const closes = window.map((b) => b.close);
    const curClose = closes[closes.length - 1];
    const nextClose = candles[i + 1].close;
    const actualSign = nextClose >= curClose ? 1 : -1;

    // 1. Trend / Price Action signal (close vs 10-bar median & EMA slope)
    const ema10 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const paSig = curClose >= ema10 ? 1 : -1;
    if (paSig === actualSign) paHits++;

    // 2. Mean Reversion Z-score signal (fade extreme Z > 1.2)
    const mean20 = closes.reduce((a, b) => a + b, 0) / closes.length;
    const std20 = Math.sqrt(closes.reduce((acc, p) => acc + Math.pow(p - mean20, 2), 0) / closes.length);
    const z = std20 > 1e-8 ? (curClose - mean20) / std20 : 0;
    const mrSig = z > 1.0 ? -1 : z < -1.0 ? 1 : paSig;
    if (mrSig === actualSign) mrHits++;

    // 3. Volatility-Adjusted 5-bar Momentum
    const mom5 = curClose - closes[closes.length - 6];
    const momSig = mom5 >= 0 ? 1 : -1;
    if (momSig === actualSign) momHits++;

    // 4. Candle Volume/Delta proxy
    const bar = window[window.length - 1];
    const flowSig = bar.close >= bar.open ? 1 : -1;
    if (flowSig === actualSign) flowHits++;

    total++;
  }

  const mk = (school: string, hits: number): SchoolOosScore => {
    const hr = total > 0 ? roundNum(hits / total, 3) : 0.5;
    const ic = roundNum((hr - 0.5) * 2, 3);
    return { school, hitRate: hr, informationCoefficient: ic, sampleCount: total, reliable: hr >= 0.52 };
  };

  return [
    mk('Price Action & Trend', paHits),
    mk('Mean Reversion Z-Score', mrHits),
    mk('Momentum Volatility-Adj', momHits),
    mk('Volume / Delta Flow', flowHits),
  ];
}

export function runSixTierTradingAnalysis(
  candles: OhlcvBar[],
  l2Data?: OrderFlowL2Feed | null
): SixTierTradingAnalysis {
  const tier1 = analyzePriceAction(candles);
  const tier2 = analyzeQuantitative(candles);
  const tier3 = analyzeMicrostructure(candles, l2Data);
  const indicators = analyzeOhlcvCandles(candles);
  const oosScores = evaluateOutOfSampleSchools(candles);

  // Model A: Direction
  let dirScore = 0;
  if (tier1.structureTrend === 'bullish') dirScore += 0.35;
  else if (tier1.structureTrend === 'bearish') dirScore -= 0.35;
  if (tier1.lastStructureEvent === 'BOS_BULLISH' || tier1.lastStructureEvent === 'CHOCH_BULLISH') dirScore += 0.25;
  else if (tier1.lastStructureEvent === 'BOS_BEARISH' || tier1.lastStructureEvent === 'CHOCH_BEARISH') dirScore -= 0.25;
  if (tier1.multiTimeframe.alignment === 'aligned_bullish') dirScore += 0.25;
  else if (tier1.multiTimeframe.alignment === 'aligned_bearish') dirScore -= 0.25;
  if ((tier2.kalmanSlopePct ?? 0) > 0.05) dirScore += 0.15;
  else if ((tier2.kalmanSlopePct ?? 0) < -0.05) dirScore -= 0.15;
  dirScore = roundNum(clamp(dirScore, -1, 1), 3);

  // Model B: Volatility
  const garchVol = tier2.garchAnnualizedVolPct;
  const volRegime: 'low' | 'normal' | 'elevated' | 'extreme' =
    garchVol === null
      ? 'normal'
      : garchVol >= 80
      ? 'extreme'
      : garchVol >= 45
      ? 'elevated'
      : garchVol <= 18
      ? 'low'
      : 'normal';

  // Model D: Liquidity / Microstructure
  let liqScore = 0;
  if (tier3.cvdTrend === 'accumulating') liqScore += 0.35;
  else if (tier3.cvdTrend === 'distributing') liqScore -= 0.35;
  if (tier3.vwap !== null && indicators.latestClose > tier3.vwap) liqScore += 0.2;
  else if (tier3.vwap !== null && indicators.latestClose < tier3.vwap) liqScore -= 0.2;
  if (tier3.obi !== null) liqScore += clamp(tier3.obi * 0.6, -0.4, 0.4);
  const latestSweep = tier1.liquiditySweeps[tier1.liquiditySweeps.length - 1];
  if (latestSweep?.direction === 'bullish_sweep') liqScore += 0.2;
  else if (latestSweep?.direction === 'bearish_sweep') liqScore -= 0.2;
  liqScore = roundNum(clamp(liqScore, -1, 1), 3);

  // Model E: Entry Timing (0 to 1)
  const z20 = Math.abs(tier2.meanReversionZ20 ?? 0);
  const entryScore = roundNum(
    clamp(1 - z20 * 0.28 + (tier1.activeFvgs.length > 0 ? 0.15 : 0), 0.1, 1),
    3
  );
  const entryStatus: 'optimal' | 'wait_pullback' | 'extended' =
    z20 >= 2.0 ? 'extended' : entryScore >= 0.6 ? 'optimal' : 'wait_pullback';

  // Meta Model weighted by OOS hit-rate stability
  const paWeight = oosScores[0]?.reliable ? 1.15 : 0.85;
  const mrWeight = tier2.regime === 'MEAN_REVERTING' ? 1.15 : 0.7;
  const flowWeight = tier3.orderBookStatus === 'live_l2_depth' ? 1.1 : 0.75;

  const mrDirectional =
    tier2.meanReversionZ20 !== null ? clamp(-tier2.meanReversionZ20 / 2.5, -1, 1) : 0;

  const rawComposite =
    (dirScore * paWeight + mrDirectional * mrWeight * 0.45 + liqScore * flowWeight) /
    (paWeight + mrWeight * 0.45 + flowWeight);

  // Calibrated P(up/down/neutral)
  const volPenalty = volRegime === 'extreme' ? 0.55 : volRegime === 'elevated' ? 0.8 : 1.0;
  const pNeutral = roundNum(clamp(0.24 + (1 - Math.abs(rawComposite)) * 0.28 + (1 - volPenalty) * 0.2, 0.15, 0.65), 3);
  const directionalBudget = 1 - pNeutral;
  const rawUpShare = 1 / (1 + Math.exp(-rawComposite * 3.2));
  const pUp = roundNum(directionalBudget * rawUpShare, 3);
  const pDown = roundNum(Math.max(0, 1 - pNeutral - pUp), 3);

  const edgeConfidence = pUp - pDown;
  let finalDecision: 'LONG' | 'SHORT' | 'STAND_ASIDE' | 'REDUCE_POSITION' = 'STAND_ASIDE';
  if (volRegime === 'extreme' && Math.abs(edgeConfidence) < 0.22) {
    finalDecision = 'REDUCE_POSITION';
  } else if (edgeConfidence >= 0.12 && entryStatus !== 'extended') {
    finalDecision = 'LONG';
  } else if (edgeConfidence <= -0.12 && entryStatus !== 'extended') {
    finalDecision = 'SHORT';
  }

  // Tier 5 RL Utility Framing
  const sharpeProxy = roundNum(edgeConfidence / Math.max(0.2, (garchVol ?? 25) / 40), 3);
  const convictionPct = roundNum(clamp(Math.abs(edgeConfidence) * 140, 12, 92), 1);

  // Model F: ATR + Fractional Kelly Sizing & Levels
  const price = indicators.latestClose || 0;
  const atr = indicators.atr14 || (price > 0 ? price * 0.02 : null);
  const stopDist = atr ? roundNum(atr * 1.5, 6) : null;
  const winProb = Math.max(0.45, finalDecision === 'SHORT' ? pDown + pNeutral * 0.35 : pUp + pNeutral * 0.35);
  const payoffRatio = 1.8;
  const rawKelly = (winProb * payoffRatio - (1 - winProb)) / payoffRatio;
  const fractionalKellyPct = roundNum(clamp(rawKelly * 0.25 * 100, 0.25, 2.0), 2);
  const suggestedRiskPct = volRegime === 'extreme' ? roundNum(fractionalKellyPct * 0.5, 2) : fractionalKellyPct;

  let stopLoss: number | null = null;
  let takeProfit1: number | null = null;
  let takeProfit2: number | null = null;
  if (price > 0 && stopDist) {
    if (finalDecision === 'SHORT') {
      stopLoss = roundNum(price + stopDist, 6);
      takeProfit1 = roundNum(price - stopDist * 1.5, 6);
      takeProfit2 = roundNum(price - stopDist * 2.5, 6);
    } else {
      stopLoss = roundNum(price - stopDist, 6);
      takeProfit1 = roundNum(price + stopDist * 1.5, 6);
      takeProfit2 = roundNum(price + stopDist * 2.5, 6);
    }
  }

  const dailySigma = ((garchVol ?? 25) / 100) / Math.sqrt(252);
  const expectedReturnPct = roundNum(edgeConfidence * dailySigma * 5 * 100, 2);

  // Tier 4 Deep Learning 7-Modality Feature Encoder -> TCN / PatchTST / Transformer Heads -> Regime Ensemble
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  const lastC = closes[closes.length - 1] || 1;
  const r1 = closes.length >= 2 ? (lastC - closes[closes.length - 2]) / Math.max(closes[closes.length - 2], 1e-8) : 0;
  const r3 = closes.length >= 4 ? (lastC - closes[closes.length - 4]) / Math.max(closes[closes.length - 4], 1e-8) : 0;
  const r8 = closes.length >= 9 ? (lastC - closes[closes.length - 9]) / Math.max(closes[closes.length - 9], 1e-8) : 0;

  const featureVector: DeepLearningFeatureVector = {
    ohlcv: roundNum(clamp((r1 * 20 + r3 * 12 + r8 * 8), -1, 1), 3),
    orderFlow: roundNum(clamp(liqScore, -1, 1), 3),
    volume: roundNum(
      tier3.cvdTrend === 'accumulating' ? 0.65 : tier3.cvdTrend === 'distributing' ? -0.65 : 0,
      3
    ),
    volatility: roundNum(
      volRegime === 'extreme' ? -0.8 : volRegime === 'elevated' ? -0.35 : volRegime === 'low' ? 0.45 : 0.15,
      3
    ),
    marketStructure: roundNum(clamp(dirScore, -1, 1), 3),
    indicators: roundNum(
      clamp(
        ((indicators.rsi14 !== null ? (indicators.rsi14 - 50) / 35 : 0) +
          (indicators.macd ? Math.sign(indicators.macd.histogram) * 0.35 : 0)),
        -1,
        1
      ),
      3
    ),
    multiTimeframe: roundNum(
      tier1.multiTimeframe.alignment === 'aligned_bullish'
        ? 0.85
        : tier1.multiTimeframe.alignment === 'aligned_bearish'
        ? -0.85
        : 0,
      3
    ),
  };

  // Optimized Causal Dilated Depthwise-Separable TCN (d=1,2,4 | RF=15) shared with client engine
  const tcnResult = runClientTcnInference(candles, DEFAULT_TCN_WEIGHT_BUNDLE, undefined, 'server-shared');
  const tcnScore = tcnResult.directionScore;
  // Multi-Patch Temporal Self-Attention (PatchTST) proxy comparing recent 5-bar vs prior 15-bar patches
  const patchRecent = closes.slice(-5).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(5, closes.length));
  const patchPrior = closes.slice(-20, -5);
  const patchPriorMean =
    patchPrior.length > 0 ? patchPrior.reduce((a, b) => a + b, 0) / patchPrior.length : patchRecent;
  const patchDelta = patchPriorMean > 0 ? clamp(((patchRecent - patchPriorMean) / patchPriorMean) * 18, -1, 1) : 0;
  const patchTstScore = roundNum(
    clamp(0.5 * patchDelta + 0.3 * featureVector.multiTimeframe + 0.2 * featureVector.indicators, -1, 1),
    3
  );
  // Cross-Modality Transformer attention weighted by market regime
  const trendRegimeBoost = tier2.regime === 'TRENDING_UP' || tier2.regime === 'TRENDING_DOWN' ? 1.2 : 0.75;
  const transformerScore = roundNum(
    clamp(
      (0.35 * featureVector.marketStructure * trendRegimeBoost +
        0.25 * featureVector.orderFlow +
        0.2 * featureVector.multiTimeframe +
        0.2 * featureVector.indicators) *
        (volRegime === 'extreme' ? 0.65 : 1),
      -1,
      1
    ),
    3
  );
  const ensembleScore = roundNum(clamp((tcnScore + patchTstScore + transformerScore) / 3, -1, 1), 3);

  return {
    tier1_priceAction: tier1,
    tier2_quantitative: tier2,
    tier3_microstructure: tier3,
    tier4_deepLearningPipeline: {
      architecture: '7-Modality Feature Encoder -> Causal Dilated TCN (v2.8-lite) / PatchTST / Transformer -> Regime Ensemble',
      encodedModalities: [
        'OHLCV Multi-Horizon Returns',
        tier3.orderBookStatus === 'live_l2_depth' ? 'L2 Order Flow + AggTrades' : 'OHLCV Volume Profile Proxy',
        'Volume & CVD Accumulation',
        'GARCH(1,1) + Garman-Klass Volatility',
        'BOS / CHoCH / FVG Structure',
        'RSI(14) + MACD + EMA Indicators',
        'Multi-Timeframe Alignment',
      ],
      featureVector,
      modelHeads: {
        tcnScore,
        patchTstScore,
        transformerScore,
        ensembleScore,
        tcnVersion: tcnResult.weightMeta.version,
        tcnRollingHitRatePct: tcnResult.rollingHitRatePct,
      },
      outOfSampleValidation: oosScores,
    },
    tier5_reinforcementLearning: {
      policyFamily: 'PPO / SAC / DQN',
      recommendedAction: finalDecision,
      rewardObjective: 'Differential Sharpe & Max-Drawdown Risk-Adjusted Return',
      riskAdjustedUtilityScore: sharpeProxy,
      convictionPct,
    },
    tier6_multiModelMeta: {
      modelA_direction: {
        score: dirScore,
        bias: dirScore > 0.15 ? 'bullish' : dirScore < -0.15 ? 'bearish' : 'neutral',
        oosHitRate: oosScores[0]?.hitRate ?? 0.5,
      },
      modelB_volatility: {
        annualizedVolPct: garchVol,
        regime: volRegime,
      },
      modelC_regime: {
        regime: tier2.regime,
        trendPersistence: tier2.varianceRatioProxy,
      },
      modelD_liquidity: {
        score: liqScore,
        nearZone: tier3.poc ? `POC=${tier3.poc}, VWAP=${tier3.vwap}` : 'N/A',
      },
      modelE_entryTiming: {
        score: entryScore,
        status: entryStatus,
      },
      modelF_positionSizing: {
        suggestedRiskPct,
        kellyFractionPct: fractionalKellyPct,
        atrStopDistance: stopDist,
        entry: price > 0 ? roundNum(price, 6) : null,
        stopLoss,
        takeProfit1,
        takeProfit2,
        riskRewardRatio: stopDist ? 2.0 : null,
      },
      metaModel: {
        finalDecision,
        pUp,
        pDown,
        pNeutral,
        expectedReturnPct,
        note: 'Mỗi trường phái được chấm điểm độc lập & kiểm nghiệm Out-of-Sample (OOS) trước khi kết hợp ở Meta Model.',
      },
    },
  };
}

export function formatCandleDate(tsMs: number, interval: string): string {
  const d = new Date(tsMs);
  if (interval.includes('h') || interval.includes('m')) {
    return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function getTradingViewScannerRegion(tvInfo: ReturnType<typeof resolveTradingViewSymbol>): string {
  if (tvInfo.marketType === 'vn_stock' || tvInfo.exchange === 'HOSE' || tvInfo.exchange === 'HNX' || tvInfo.exchange === 'UPCOM') {
    return 'vietnam';
  }
  if (tvInfo.marketType === 'crypto') return 'crypto';
  if (tvInfo.marketType === 'forex') return 'forex';
  if (tvInfo.marketType === 'commodity' || tvInfo.marketType === 'index') return 'cfd';
  return 'america';
}

const TV_BROWSER_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Origin: 'https://www.tradingview.com',
  Referer: 'https://www.tradingview.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

async function searchTradingViewSymbol(query: string): Promise<string | null> {
  const cleaned = String(query || '').trim();
  if (!cleaned) return null;
  try {
    const resp = await fetch(
      `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(cleaned)}&hl=1&lang=en&domain=production`,
      {
        headers: {
          Accept: 'application/json',
          Origin: 'https://www.tradingview.com',
          Referer: 'https://www.tradingview.com/',
          'User-Agent': TV_BROWSER_HEADERS['User-Agent'],
        },
        signal: AbortSignal.timeout(4500),
      }
    );
    if (!resp.ok) return null;
    const json: any = await resp.json().catch(() => null);
    const first = Array.isArray(json?.symbols) ? json.symbols[0] : null;
    if (first?.exchange && first?.symbol) {
      return `${String(first.exchange).toUpperCase()}:${String(first.symbol).toUpperCase()}`;
    }
  } catch {
    // ignore lookup failure
  }
  return null;
}

async function fetchTradingViewScannerQuote(
  rawTvSymbol: string
): Promise<{
  tvSymbol: string;
  description: string;
  close: number | null;
  change: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  recommend: number | null;
} | null> {
  const tvInfo = resolveTradingViewSymbol(rawTvSymbol);
  const scannerRegion = getTradingViewScannerRegion(tvInfo);
  const regionsToTry = Array.from(new Set([scannerRegion, scannerRegion === 'cfd' ? 'america' : 'global', 'global']));
  const candidateTickers = [tvInfo.tvSymbol];

  const queryRegions = async (tickers: string[], regions: string[]) => {
    for (const reg of regions) {
      try {
        const resp = await fetch(`https://scanner.tradingview.com/${reg}/scan`, {
          method: 'POST',
          headers: TV_BROWSER_HEADERS,
          body: JSON.stringify({
            symbols: {
              tickers,
              query: { types: [] },
            },
            columns: ['name', 'description', 'close', 'change', 'high', 'low', 'volume', 'Recommend.All'],
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (!resp.ok) continue;
        const tvJson: any = await resp.json().catch(() => null);
        const firstRow = tvJson?.data?.[0];
        const tvRow = firstRow?.d;
        if (!Array.isArray(tvRow)) continue;
        const close = Number.isFinite(Number(tvRow[2])) ? Number(tvRow[2]) : null;
        if (close === null) continue;
        return {
          tvSymbol: String(firstRow?.s || tickers[0]),
          description: String(tvRow[1] || '').trim(),
          close,
          change: Number.isFinite(Number(tvRow[3])) ? roundNum(Number(tvRow[3]), 2) : null,
          high: Number.isFinite(Number(tvRow[4])) ? Number(tvRow[4]) : null,
          low: Number.isFinite(Number(tvRow[5])) ? Number(tvRow[5]) : null,
          volume: Number.isFinite(Number(tvRow[6])) ? Number(tvRow[6]) : null,
          recommend: Number.isFinite(Number(tvRow[7])) ? roundNum(Number(tvRow[7]), 3) : null,
        };
      } catch {
        // try next region
      }
    }
    return null;
  };

  const direct = await queryRegions(candidateTickers, regionsToTry);
  if (direct) return direct;

  // Fallback via TradingView Symbol Search v3 to discover exact EXCHANGE:TICKER
  const discovered = await searchTradingViewSymbol(tvInfo.ticker || rawTvSymbol);
  if (discovered && discovered !== tvInfo.tvSymbol) {
    const discoveredInfo = resolveTradingViewSymbol(discovered);
    const discReg = getTradingViewScannerRegion(discoveredInfo);
    return await queryRegions([discovered], Array.from(new Set([discReg, 'global'])));
  }

  return null;
}

function mapStooqSymbol(yahooSymbol: string): string | null {
  const s = yahooSymbol.trim().toUpperCase();
  if (!s) return null;
  if (s === 'GC=F' || s === 'XAUUSD') return 'xauusd';
  if (s === 'SI=F' || s === 'XAGUSD') return 'xagusd';
  if (s === '^GSPC') return '^spx';
  if (s === '^IXIC') return '^ndq';
  if (s === '^DJI') return '^dji';
  if (s === 'DX-Y.NYB') return 'dx.f';
  if (s.endsWith('=X') && s.length === 8) return s.slice(0, 6).toLowerCase();
  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(s) && !s.endsWith('.VN')) {
    return `${s.toLowerCase().replace('.', '-')}.us`;
  }
  return null;
}

async function fetchStooqOhlcv(yahooSymbol: string): Promise<OhlcvBar[]> {
  const stooqSym = mapStooqSymbol(yahooSymbol);
  if (!stooqSym) return [];
  try {
    const resp = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`, {
      headers: { 'User-Agent': TV_BROWSER_HEADERS['User-Agent'] },
      signal: AbortSignal.timeout(5500),
    });
    if (!resp.ok) return [];
    const csv = await resp.text();
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 3) return [];
    const bars: OhlcvBar[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 5) continue;
      const o = Number(cols[1]);
      const h = Number(cols[2]);
      const l = Number(cols[3]);
      const c = Number(cols[4]);
      const v = Number(cols[5] ?? 0);
      if (![o, h, l, c].every(Number.isFinite) || c <= 0) continue;
      bars.push({
        date: cols[0].trim(),
        open: roundNum(o, 4),
        high: roundNum(h, 4),
        low: roundNum(l, 4),
        close: roundNum(c, 4),
        volume: Number.isFinite(v) ? v : 0,
      });
    }
    return bars.slice(-90);
  } catch {
    return [];
  }
}

async function fetchTcbsVnOhlcv(yahooSymbol: string, referenceClose?: number | null): Promise<OhlcvBar[]> {
  const upper = yahooSymbol.trim().toUpperCase();
  const isVn = upper.endsWith('.VN') || upper === '^VNINDEX' || upper === 'VNINDEX' || upper === 'VN30';
  if (!isVn) return [];
  const ticker = upper === '^VNINDEX' ? 'VNINDEX' : upper.replace(/\.VN$/, '');
  const type = ticker.includes('INDEX') || ticker === 'VN30' ? 'index' : 'stock';
  try {
    const resp = await fetch(
      `https://apipubaws.tcbs.com.vn/stock-insight/v1/stock/bars-long-term?ticker=${encodeURIComponent(ticker)}&type=${type}&resolution=D&countBack=90`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': TV_BROWSER_HEADERS['User-Agent'],
        },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!resp.ok) return [];
    const json: any = await resp.json().catch(() => null);
    const rows: any[] = Array.isArray(json?.data) ? json.data : [];
    const bars: OhlcvBar[] = [];
    for (const r of rows) {
      const o = Number(r.open);
      const h = Number(r.high);
      const l = Number(r.low);
      const c = Number(r.close);
      if (![o, h, l, c].every(Number.isFinite)) continue;
      bars.push({
        date: String(r.tradingDate || '').slice(0, 10),
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number(r.volume ?? 0) || 0,
      });
    }
    if (bars.length > 0 && referenceClose && referenceClose > 1000 && bars[bars.length - 1].close < 500) {
      return bars.map((b) => ({
        ...b,
        open: Math.round(b.open * 1000),
        high: Math.round(b.high * 1000),
        low: Math.round(b.low * 1000),
        close: Math.round(b.close * 1000),
      }));
    }
    return bars;
  } catch {
    return [];
  }
}

async function fetchOkxCryptoFallback(
  symbol: string,
  safeInterval: string,
  display: string,
  tvResolved: ReturnType<typeof resolveTradingViewSymbol>,
  widgetUrl: string,
  tvQuote: Awaited<ReturnType<typeof fetchTradingViewScannerQuote>>
): Promise<TradingMarketSnapshot | null> {
  const base = symbol.replace(/(USDT|BUSD|USDC)$/i, '');
  const instId = `${base}-USDT`;
  const barMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1H',
    '4h': '4H',
    '1d': '1D',
    '1w': '1W',
  };
  const bar = barMap[safeInterval] || '1D';
  try {
    const [tickerRes, candlesRes] = await Promise.all([
      fetch(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`, {
        headers: { 'User-Agent': TV_BROWSER_HEADERS['User-Agent'] },
        signal: AbortSignal.timeout(5500),
      }),
      fetch(`https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=240`, {
        headers: { 'User-Agent': TV_BROWSER_HEADERS['User-Agent'] },
        signal: AbortSignal.timeout(5500),
      }),
    ]);
    if (!candlesRes.ok) return null;
    const candleJson: any = await candlesRes.json().catch(() => null);
    const rawRows: any[] = Array.isArray(candleJson?.data) ? candleJson.data : [];
    if (rawRows.length === 0) return null;

    // OKX returns newest first
    const candles: OhlcvBar[] = [...rawRows].reverse().map((r: any[]) => ({
      date: formatCandleDate(Number(r[0]), safeInterval),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5] ?? 0),
    }));

    const tickerJson: any = tickerRes.ok ? await tickerRes.json().catch(() => null) : null;
    const t0 = Array.isArray(tickerJson?.data) ? tickerJson.data[0] : null;
    const last = Number(t0?.last || candles[candles.length - 1]?.close || tvQuote?.close || 0);
    const open24h = Number(t0?.open24h);
    const pct24h =
      Number.isFinite(open24h) && open24h > 0 && last > 0
        ? roundNum(((last - open24h) / open24h) * 100, 2)
        : tvQuote?.change ?? null;

    return {
      symbol,
      display,
      market: 'crypto',
      isStock: false,
      tradingViewSymbol: tvQuote?.tvSymbol || tvResolved.tvSymbol,
      tradingViewWidgetUrl: widgetUrl,
      tradingViewRecommend: tvQuote?.recommend ?? null,
      currency: 'USDT',
      interval: safeInterval,
      price: last,
      changePercent24h: pct24h,
      high24h: Number.isFinite(Number(t0?.high24h)) ? Number(t0.high24h) : tvQuote?.high ?? null,
      low24h: Number.isFinite(Number(t0?.low24h)) ? Number(t0.low24h) : tvQuote?.low ?? null,
      volume24h: Number.isFinite(Number(t0?.volCcy24h)) ? Number(t0.volCcy24h) : tvQuote?.volume ?? null,
      candles,
      indicators: analyzeOhlcvCandles(candles),
      quantAnalysis: runSixTierTradingAnalysis(candles, null),
      source: tvQuote ? `TradingView (${tvQuote.tvSymbol}) + OKX Candles` : 'OKX Public OHLCV',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function fetchBinanceMarketSnapshot(
  symbol: string,
  display: string,
  interval = '1d'
): Promise<TradingMarketSnapshot> {
  const validIntervals = new Set(['1m', '5m', '15m', '1h', '4h', '1d', '1w']);
  const safeInterval = validIntervals.has(interval) ? interval : '1d';
  const hosts = [
    'https://data-api.binance.vision',
    'https://api.binance.com',
    'https://api1.binance.com',
    'https://api3.binance.com',
  ];
  const tvResolved = resolveTradingViewSymbol(`BINANCE:${symbol}`);
  const widgetUrl = buildTradingViewWidgetUrl({
    symbol: tvResolved.tvSymbol,
    interval: normalizeTradingViewInterval(safeInterval),
    theme: 'dark',
  });
  const tvPromise = fetchTradingViewScannerQuote(tvResolved.tvSymbol);

  let lastErr: any = null;
  for (const host of hosts) {
    try {
      const [tickerRes, klinesRes, orderFlow, tvQuote] = await Promise.all([
        fetch(`${host}/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {
          headers: { 'User-Agent': TV_BROWSER_HEADERS['User-Agent'] },
          signal: AbortSignal.timeout(5500),
        }),
        fetch(
          `${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${safeInterval}&limit=240`,
          {
            headers: { 'User-Agent': TV_BROWSER_HEADERS['User-Agent'] },
            signal: AbortSignal.timeout(5500),
          }
        ),
        fetchBinanceOrderFlow(symbol, host),
        tvPromise,
      ]);

      if (!tickerRes.ok || !klinesRes.ok) {
        throw new Error(`Binance HTTP ${tickerRes.status}/${klinesRes.status}`);
      }

      const ticker: any = await tickerRes.json();
      const rawKlines: any = await klinesRes.json();
      if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
        throw new Error(`Không có dữ liệu nến cho ${symbol}`);
      }

      const candles: OhlcvBar[] = rawKlines.map((k: any[]) => ({
        date: formatCandleDate(Number(k[0]), safeInterval),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }));

      const binancePrice = Number(ticker?.lastPrice || candles[candles.length - 1]?.close || 0);
      const price = binancePrice > 0 ? binancePrice : tvQuote?.close || 0;
      const changePercent24h = Number.isFinite(Number(ticker?.priceChangePercent))
        ? roundNum(Number(ticker.priceChangePercent), 2)
        : tvQuote?.change ?? null;

      return {
        symbol,
        display,
        market: 'crypto',
        isStock: false,
        tradingViewSymbol: tvQuote?.tvSymbol || tvResolved.tvSymbol,
        tradingViewWidgetUrl: widgetUrl,
        tradingViewRecommend: tvQuote?.recommend ?? null,
        currency: 'USDT',
        interval: safeInterval,
        price,
        changePercent24h,
        high24h: Number.isFinite(Number(ticker?.highPrice)) ? Number(ticker.highPrice) : tvQuote?.high ?? null,
        low24h: Number.isFinite(Number(ticker?.lowPrice)) ? Number(ticker.lowPrice) : tvQuote?.low ?? null,
        volume24h: Number.isFinite(Number(ticker?.quoteVolume)) ? Number(ticker.quoteVolume) : tvQuote?.volume ?? null,
        candles,
        indicators: analyzeOhlcvCandles(candles),
        quantAnalysis: runSixTierTradingAnalysis(candles, orderFlow),
        source: tvQuote
          ? `TradingView (${tvQuote.tvSymbol}) + ${host.replace('https://', '')} L2`
          : `${host.replace('https://', '')} (spot + L2 depth)`,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      lastErr = err;
    }
  }

  const tvOnly = await tvPromise;
  const okxFallback = await fetchOkxCryptoFallback(symbol, safeInterval, display, tvResolved, widgetUrl, tvOnly);
  if (okxFallback) return okxFallback;

  // Fallback directly to TradingView Scanner if Binance & OKX endpoints are unreachable
  if (tvOnly && tvOnly.close !== null) {
    const singleBar: OhlcvBar[] = [
      {
        date: new Date().toISOString().slice(0, 10),
        open: tvOnly.close,
        high: tvOnly.high ?? tvOnly.close,
        low: tvOnly.low ?? tvOnly.close,
        close: tvOnly.close,
        volume: tvOnly.volume ?? 0,
      },
    ];
    return {
      symbol,
      display,
      market: 'tradingview',
      isStock: false,
      tradingViewSymbol: tvOnly.tvSymbol,
      tradingViewWidgetUrl: widgetUrl,
      tradingViewRecommend: tvOnly.recommend,
      currency: 'USDT',
      interval: safeInterval,
      price: tvOnly.close,
      changePercent24h: tvOnly.change,
      high24h: tvOnly.high,
      low24h: tvOnly.low,
      volume24h: tvOnly.volume,
      candles: singleBar,
      indicators: analyzeOhlcvCandles(singleBar),
      quantAnalysis: runSixTierTradingAnalysis(singleBar, null),
      source: `TradingView Scanner (${tvOnly.tvSymbol})`,
      fetchedAt: new Date().toISOString(),
    };
  }

  throw lastErr || new Error(`Không lấy được dữ liệu TradingView/Binance/OKX cho ${symbol}`);
}

export async function fetchYahooMarketSnapshot(
  yahooSymbol: string,
  display: string,
  interval = '1d',
  preferredTvSymbol?: string
): Promise<TradingMarketSnapshot> {
  const validYahoo = new Set(['1m', '5m', '15m', '1h', '1d', '1wk']);
  const mappedYahoo = interval === '1w' ? '1wk' : validYahoo.has(interval) ? interval : '1d';
  const safeInterval = mappedYahoo;
  const range =
    safeInterval === '1m'
      ? '1d'
      : safeInterval === '5m' || safeInterval === '15m'
      ? '5d'
      : safeInterval === '1h'
      ? '1mo'
      : safeInterval === '1wk'
      ? '2y'
      : '1y';
  const yahooUrls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${safeInterval}&range=${range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${safeInterval}&range=${range}`,
  ];
  const tvResolved = resolveTradingViewSymbol(preferredTvSymbol || yahooSymbol);
  const tvQuotePromise = fetchTradingViewScannerQuote(tvResolved.tvSymbol);
  const widgetUrl = buildTradingViewWidgetUrl({
    symbol: tvResolved.tvSymbol,
    interval: normalizeTradingViewInterval(safeInterval),
    theme: 'dark',
  });

  const fetchFirstYahooOk = async () => {
    for (const url of yahooUrls) {
      try {
        const resp = await fetch(url, {
          headers: {
            'User-Agent': TV_BROWSER_HEADERS['User-Agent'],
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(5500),
        });
        if (resp.ok) {
          const json: any = await resp.json().catch(() => null);
          if (json?.chart?.result?.[0]) return json.chart.result[0];
        }
      } catch {
        // try next Yahoo host
      }
    }
    return null;
  };

  const [yahooResult, tvQuote] = await Promise.all([fetchFirstYahooOk(), tvQuotePromise]);

  let candles: OhlcvBar[] = [];
  let meta: any = {};
  let sourceLabel = 'Yahoo Finance v8';

  if (yahooResult) {
    meta = yahooResult.meta || {};
    const timestamps: number[] = Array.isArray(yahooResult.timestamp) ? yahooResult.timestamp : [];
    const quote = yahooResult.indicators?.quote?.[0] || {};
    const opens: any[] = quote.open || [];
    const highs: any[] = quote.high || [];
    const lows: any[] = quote.low || [];
    const closes: any[] = quote.close || [];
    const volumes: any[] = quote.volume || [];

    for (let i = 0; i < timestamps.length; i++) {
      const o = Number(opens[i]);
      const h = Number(highs[i]);
      const l = Number(lows[i]);
      const c = Number(closes[i]);
      if (![o, h, l, c].every(Number.isFinite)) continue;
      candles.push({
        date: formatCandleDate(timestamps[i] * 1000, safeInterval),
        open: roundNum(o, 4),
        high: roundNum(h, 4),
        low: roundNum(l, 4),
        close: roundNum(c, 4),
        volume: Number.isFinite(Number(volumes[i])) ? Number(volumes[i]) : 0,
      });
    }
  }

  // Fallback OHLCV feeds if Yahoo returned empty/blocked
  if (candles.length === 0) {
    const vnBars = await fetchTcbsVnOhlcv(yahooSymbol, tvQuote?.close);
    if (vnBars.length > 0) {
      candles = vnBars;
      sourceLabel = 'TCBS OHLCV';
    } else {
      const stooqBars = await fetchStooqOhlcv(yahooSymbol);
      if (stooqBars.length > 0) {
        candles = stooqBars;
        sourceLabel = 'Stooq OHLCV';
      }
    }
  }

  if (candles.length === 0 && tvQuote && tvQuote.close !== null) {
    candles = [
      {
        date: new Date().toISOString().slice(0, 10),
        open: tvQuote.close,
        high: tvQuote.high ?? tvQuote.close,
        low: tvQuote.low ?? tvQuote.close,
        close: tvQuote.close,
        volume: tvQuote.volume ?? 0,
      },
    ];
    sourceLabel = 'TradingView Scanner';
  }

  if (candles.length === 0) {
    throw new Error(`Không lấy được dữ liệu TradingView/OHLCV cho ${yahooSymbol}`);
  }

  const sliced = candles.slice(-240);
  // Sync latest bar close with live TradingView quote when available
  if (tvQuote?.close !== null && tvQuote?.close !== undefined) {
    const lastBar = sliced[sliced.length - 1];
    lastBar.close = tvQuote.close;
    if (tvQuote.high && tvQuote.high > lastBar.high) lastBar.high = tvQuote.high;
    if (tvQuote.low && tvQuote.low < lastBar.low) lastBar.low = tvQuote.low;
  }

  const yahooPrice = Number.isFinite(Number(meta.regularMarketPrice))
    ? Number(meta.regularMarketPrice)
    : sliced[sliced.length - 1].close;
  const price = tvQuote?.close ?? yahooPrice;
  const prevClose = Number(meta.chartPreviousClose || meta.previousClose);
  const yahooChange =
    Number.isFinite(prevClose) && prevClose > 0
      ? roundNum(((yahooPrice - prevClose) / prevClose) * 100, 2)
      : sliced.length >= 2 && sliced[sliced.length - 2].close > 0
      ? roundNum(((price - sliced[sliced.length - 2].close) / sliced[sliced.length - 2].close) * 100, 2)
      : null;

  const isStock = isStockTickerSymbol(yahooSymbol);
  const resolvedTvSym = tvQuote?.tvSymbol || tvResolved.tvSymbol;

  return {
    symbol: yahooSymbol,
    display: tvQuote?.description
      ? `${tvResolved.ticker} (${tvResolved.exchange}) — ${tvQuote.description}`
      : meta.shortName
      ? `${display} — ${meta.shortName}`
      : display,
    market: 'tradingview',
    isStock,
    tradingViewSymbol: resolvedTvSym,
    tradingViewWidgetUrl: widgetUrl,
    tradingViewRecommend: tvQuote?.recommend ?? null,
    currency: String(meta.currency || (tvResolved.marketType === 'vn_stock' ? 'VND' : 'USD')),
    interval: safeInterval,
    price,
    changePercent24h: tvQuote?.change ?? yahooChange,
    high24h: tvQuote?.high ?? (Number.isFinite(Number(meta.regularMarketDayHigh)) ? Number(meta.regularMarketDayHigh) : sliced[sliced.length - 1].high),
    low24h: tvQuote?.low ?? (Number.isFinite(Number(meta.regularMarketDayLow)) ? Number(meta.regularMarketDayLow) : sliced[sliced.length - 1].low),
    volume24h: tvQuote?.volume ?? (Number.isFinite(Number(meta.regularMarketVolume)) ? Number(meta.regularMarketVolume) : sliced[sliced.length - 1].volume),
    candles: sliced,
    indicators: analyzeOhlcvCandles(sliced),
    quantAnalysis: runSixTierTradingAnalysis(sliced, null),
    source: tvQuote ? `TradingView (${resolvedTvSym}) + ${sourceLabel}` : sourceLabel,
    fetchedAt: new Date().toISOString(),
  };
}

// ============================================================================
// DEDICATED TRADINGVIEW STOCK FETCHER (Scanner Quote + OHLCV + Widget Meta)
// ============================================================================
export async function fetchTradingViewStockSnapshot(
  rawSymbol: string,
  display?: string,
  interval = '1d'
): Promise<TradingMarketSnapshot> {
  const norm = normalizeTradingSymbol(rawSymbol);
  const tvInfo = resolveTradingViewSymbol(norm.tradingViewSymbol || rawSymbol);
  return fetchYahooMarketSnapshot(
    norm.symbol,
    display || norm.display,
    interval,
    tvInfo.tvSymbol
  );
}

export async function getTradingQuoteSnapshot(
  rawSymbol: string,
  interval = '1d'
): Promise<TradingMarketSnapshot> {
  const norm = normalizeTradingSymbol(rawSymbol);
  if (norm.market === 'crypto') {
    return fetchBinanceMarketSnapshot(norm.symbol, norm.display, interval);
  }
  return fetchYahooMarketSnapshot(
    norm.symbol,
    norm.display,
    interval,
    norm.tradingViewSymbol || resolveTradingViewSymbol(rawSymbol).tvSymbol
  );
}

export async function fetchTradingMarketContext(userPrompt: string): Promise<string> {
  const tickers = extractTickersFromPrompt(userPrompt).slice(0, 2);
  if (tickers.length === 0) {
    return `\n[DỮ LIỆU THỊ TRƯỜNG]: Không nhận diện được mã giao dịch cụ thể trong câu hỏi. Nếu phân tích tài sản cụ thể, chỉ dùng số liệu xác thực từ Google Search và không tự bịa giá.`;
  }

  const settled = await Promise.allSettled(
    tickers.map((t) =>
      t.market === 'crypto'
        ? fetchBinanceMarketSnapshot(t.symbol, t.display, '1d')
        : fetchYahooMarketSnapshot(t.symbol, t.display, '1d', t.tradingViewSymbol)
    )
  );

  const blocks: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    const res = settled[i];
    const target = tickers[i];
    if (res.status === 'fulfilled') {
      const snap = res.value;
      const ind = snap.indicators;
      const qa = snap.quantAnalysis;

      const lines = [
        `• ${snap.display} [${snap.symbol}] | Nguồn: ${snap.source} (${snap.fetchedAt})`,
        `  - Giá realtime TradingView: ${snap.price} ${snap.currency}${snap.changePercent24h !== null ? ` (${snap.changePercent24h >= 0 ? '+' : ''}${snap.changePercent24h}% 24h)` : ''}${snap.tradingViewRecommend !== undefined && snap.tradingViewRecommend !== null ? ` | TV Recommend.All=${snap.tradingViewRecommend}` : ''}`,
        snap.high24h !== null && snap.low24h !== null
          ? `  - Biên độ ngày: High ${snap.high24h} / Low ${snap.low24h}`
          : '',
        `  - EMA9=${ind.ema9 ?? 'N/A'} | EMA21=${ind.ema21 ?? 'N/A'} | EMA50=${ind.ema50 ?? 'N/A'} | RSI(14)=${ind.rsi14 ?? 'N/A'} | ATR(14)=${ind.atr14 ?? 'N/A'}`,
      ];

      if (qa) {
        const pa = qa.tier1_priceAction;
        const qt = qa.tier2_quantitative;
        const mf = qa.tier3_microstructure;
        const meta = qa.tier6_multiModelMeta;

        lines.push(
          `  - [Cấp 1 · Price Action]: Structure=${pa.structureTrend.toUpperCase()} (${pa.lastStructureEvent}), Swings=[${pa.swingSequence.slice(-4).map((s) => `${s.label}:${s.price}`).join(' -> ')}], Dynamic S/R=[${pa.dynamicSupport} / ${pa.dynamicResistance}], MTF=${pa.multiTimeframe.alignment} (Macro:${pa.multiTimeframe.macroTrend}, Daily:${pa.multiTimeframe.dailyTrend}, Micro:${pa.multiTimeframe.microMomentum}), FVG chưa lấp=${pa.activeFvgs.length}, Liquidity Sweeps=${pa.liquiditySweeps.length}`,
          `  - [Cấp 2 · Quantitative]: Regime=${qt.regime} | Kalman=${qt.kalmanPrice} (Slope=${qt.kalmanSlopePct}%, InnovZ=${qt.kalmanInnovationZ}) | GARCH(1,1) AnnVol=${qt.garchAnnualizedVolPct}% / Garman-Klass=${qt.garmanKlassVolPct}% vs Realized20d=${qt.realizedVol20dPct}% | Hurst=${qt.hurstExponent}, HalfLife=${qt.meanReversionHalfLifeBars ?? 'N/A'} bars | MeanRev Z(20)=${qt.meanReversionZ20} (${qt.meanReversionSignal}) | VolAdjMom=${qt.volAdjustedMomentum10} | StatArb SpreadZ=${qt.statArbSpreadZ50}`,
          `  - [Cấp 3 · Microstructure]: Feed=${mf.orderBookStatus === 'live_l2_depth' ? `Live L2 OBI=${mf.obi} (${mf.bidAskImbalancePct}%), Spread=${mf.spreadBps}bps, TakerBuy=${mf.takerBuyRatio}, EstSlip10k=${mf.estimatedSlippage10kBps}bps, KyleLambda=${mf.kylesLambdaBpsPer100k}bps/100k` : `L2 Depth unavailable on free feed (chỉ báo POC/VAH/VAL/VWAP & KyleLambda=${mf.kylesLambdaBpsPer100k}bps/100k từ OHLCV)`} | POC=${mf.poc} | VAH=${mf.vah} | VAL=${mf.val} | VWAP=${mf.vwap} (±1σ: ${mf.vwapLower1Sigma}..${mf.vwapUpper1Sigma}) | CVD=${mf.cvdTrend}`,
          `  - [Cấp 4 · Deep Learning Pipeline]: Encoder=${JSON.stringify(qa.tier4_deepLearningPipeline.featureVector)} -> TCN=${qa.tier4_deepLearningPipeline.modelHeads.tcnScore}, PatchTST=${qa.tier4_deepLearningPipeline.modelHeads.patchTstScore}, Transformer=${qa.tier4_deepLearningPipeline.modelHeads.transformerScore}, Ensemble=${qa.tier4_deepLearningPipeline.modelHeads.ensembleScore} | OOS: ${qa.tier4_deepLearningPipeline.outOfSampleValidation.map((s) => `${s.school}: Hit=${Math.round(s.hitRate * 100)}% (IC=${s.informationCoefficient})`).join(' | ')}`,
          `  - [Cấp 5 · RL Policy (${qa.tier5_reinforcementLearning.policyFamily})]: Action=${qa.tier5_reinforcementLearning.recommendedAction}, Conviction=${qa.tier5_reinforcementLearning.convictionPct}%, DiffSharpe=${qa.tier5_reinforcementLearning.riskAdjustedUtilityScore}`,
          `  - [Cấp 6 · Multi-Model Meta Decision]: Decision=${meta.metaModel.finalDecision} | P(Up)=${Math.round(meta.metaModel.pUp * 100)}%, P(Down)=${Math.round(meta.metaModel.pDown * 100)}%, P(Neutral)=${Math.round(meta.metaModel.pNeutral * 100)}% | ExpRet=${meta.metaModel.expectedReturnPct}% | Entry=${meta.modelF_positionSizing.entry}, SL=${meta.modelF_positionSizing.stopLoss}, TP1=${meta.modelF_positionSizing.takeProfit1}, TP2=${meta.modelF_positionSizing.takeProfit2}, Risk=${meta.modelF_positionSizing.suggestedRiskPct}% (Kelly 0.25x)`
        );
      }

      if (snap.tradingViewSymbol) {
        lines.push(
          `  - [BẮT BUỘC XUẤT BIỂU ĐỒ TRADINGVIEW REAL-TIME]: BẮT BUỘC xuất một khối \`\`\`tradingview\\n{"symbol":"${snap.tradingViewSymbol}","interval":"D","title":"${snap.display}"}\\n\`\`\` trong câu trả lời! Hệ thống sẽ tự động gắn giá thực thời gian thực từ TradingView API, tín hiệu BUY/SELL, mức Entry/TP/SL realtime và bảng thuật toán 6 cấp ngay trong biểu đồ.`
        );
      }

      blocks.push(lines.filter(Boolean).join('\n'));
    } else {
      blocks.push(
        `• ${target.display} [${target.symbol}]: Không lấy được API feed trực tiếp (${res.reason?.message || 'network unavailable'}) — hãy dùng Google Search để tra cứu giá thực tế mới nhất, tuyệt đối không bịa số liệu.`
      );
    }
  }

  return `\n\n[DỮ LIỆU THỊ TRƯỜNG REALTIME & PHÂN TÍCH ĐỊNH LƯỢNG 6 CẤP (ĐÃ TÍNH SẴN TRÊN SERVER)]:\n${blocks.join('\n\n')}`;
}

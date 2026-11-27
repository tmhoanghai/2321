export interface TradingViewResolvedSymbol {
  raw: string;
  tvSymbol: string;
  exchange: string;
  ticker: string;
  marketType: 'vn_stock' | 'us_stock' | 'index' | 'crypto' | 'commodity' | 'forex';
  isStock: boolean;
}

const VN_HOSE_SET = new Set([
  'VIC', 'VHM', 'VNM', 'VCB', 'BID', 'CTG', 'TCB', 'MBB', 'ACB', 'VPB',
  'STB', 'HPG', 'HSG', 'NKG', 'FPT', 'MWG', 'MSN', 'SSI', 'VND', 'HCM',
  'VCI', 'GAS', 'PLX', 'REE', 'PNJ', 'DGC', 'GVR', 'BCM', 'SAB', 'BVH',
  'HDB', 'TPB', 'VIB', 'LPB', 'SSB', 'EIB', 'MSB', 'OCB', 'VRE', 'VJC',
  'HVN', 'POW', 'NT2', 'KBC', 'KDH', 'NLG', 'DXG', 'PDR', 'DIG', 'DPM',
  'DCM', 'VHC', 'ANV', 'FRT', 'DGW', 'PNJ', 'GMD', 'HAH', 'VTP', 'CTR',
]);

const VN_HNX_SET = new Set([
  'SHS', 'PVS', 'IDC', 'CEO', 'MBS', 'BVS', 'TNG', 'VCS', 'NTP', 'LAS',
  'HUT', 'DTD', 'SZC',
]);

const US_NASDAQ_SET = new Set([
  'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOG', 'GOOGL', 'AMZN', 'META', 'AMD',
  'INTC', 'NFLX', 'QQQ', 'COIN', 'MSTR', 'PLTR', 'ARM', 'AVGO', 'ADBE',
  'PYPL', 'CSCO', 'PEP', 'COST', 'SBUX', 'QCOM', 'MU', 'AMAT', 'PANW',
  'CRWD', 'SMCI', 'MRVL', 'ABNB',
]);

const US_NYSE_SET = new Set([
  'TSM', 'JPM', 'BAC', 'V', 'MA', 'WMT', 'JNJ', 'PG', 'DIS', 'KO',
  'MCD', 'XOM', 'CVX', 'BA', 'CAT', 'GS', 'MS', 'BRK.B', 'UNH', 'ORCL',
  'IBM', 'NKE', 'UBER', 'SNOW', 'SHOP',
]);

const US_AMEX_ETF_SET = new Set(['SPY', 'DIA', 'IWM', 'VOO', 'GLD', 'SLV', 'USO', 'TLT']);

const INDEX_TV_MAP: Record<string, { tvSymbol: string; exchange: string; ticker: string }> = {
  '^VNINDEX': { tvSymbol: 'HOSE:VNINDEX', exchange: 'HOSE', ticker: 'VNINDEX' },
  VNINDEX: { tvSymbol: 'HOSE:VNINDEX', exchange: 'HOSE', ticker: 'VNINDEX' },
  VN30: { tvSymbol: 'HOSE:VN30', exchange: 'HOSE', ticker: 'VN30' },
  HNXINDEX: { tvSymbol: 'HNX:HNXINDEX', exchange: 'HNX', ticker: 'HNXINDEX' },
  '^GSPC': { tvSymbol: 'SP:SPX', exchange: 'SP', ticker: 'SPX' },
  SP500: { tvSymbol: 'SP:SPX', exchange: 'SP', ticker: 'SPX' },
  SPX: { tvSymbol: 'SP:SPX', exchange: 'SP', ticker: 'SPX' },
  '^IXIC': { tvSymbol: 'NASDAQ:IXIC', exchange: 'NASDAQ', ticker: 'IXIC' },
  IXIC: { tvSymbol: 'NASDAQ:IXIC', exchange: 'NASDAQ', ticker: 'IXIC' },
  '^DJI': { tvSymbol: 'DJ:DJI', exchange: 'DJ', ticker: 'DJI' },
  DJI: { tvSymbol: 'DJ:DJI', exchange: 'DJ', ticker: 'DJI' },
  'DX-Y.NYB': { tvSymbol: 'TVC:DXY', exchange: 'TVC', ticker: 'DXY' },
  DXY: { tvSymbol: 'TVC:DXY', exchange: 'TVC', ticker: 'DXY' },
};

const CRYPTO_TV_SHORTHAND = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK',
  'MATIC', 'POL', 'TON', 'SUI', 'APT', 'ARB', 'OP', 'NEAR', 'ATOM', 'LTC',
]);

const COMMODITY_TV_MAP: Record<string, { tvSymbol: string; exchange: string; ticker: string }> = {
  'GC=F': { tvSymbol: 'OANDA:XAUUSD', exchange: 'OANDA', ticker: 'XAUUSD' },
  XAUUSD: { tvSymbol: 'OANDA:XAUUSD', exchange: 'OANDA', ticker: 'XAUUSD' },
  XAU: { tvSymbol: 'OANDA:XAUUSD', exchange: 'OANDA', ticker: 'XAUUSD' },
  GOLD: { tvSymbol: 'OANDA:XAUUSD', exchange: 'OANDA', ticker: 'XAUUSD' },
  'VÀNG': { tvSymbol: 'OANDA:XAUUSD', exchange: 'OANDA', ticker: 'XAUUSD' },
  'SI=F': { tvSymbol: 'OANDA:XAGUSD', exchange: 'OANDA', ticker: 'XAGUSD' },
  XAGUSD: { tvSymbol: 'OANDA:XAGUSD', exchange: 'OANDA', ticker: 'XAGUSD' },
  'CL=F': { tvSymbol: 'TVC:USOIL', exchange: 'TVC', ticker: 'USOIL' },
  'BZ=F': { tvSymbol: 'TVC:UKOIL', exchange: 'TVC', ticker: 'UKOIL' },
};

export function resolveTradingViewSymbol(rawSymbol: string): TradingViewResolvedSymbol {
  const cleaned = String(rawSymbol || '').trim().toUpperCase();
  if (!cleaned) {
    return {
      raw: 'NASDAQ:NVDA',
      tvSymbol: 'NASDAQ:NVDA',
      exchange: 'NASDAQ',
      ticker: 'NVDA',
      marketType: 'us_stock',
      isStock: true,
    };
  }

  // Already has TradingView exchange prefix like HOSE:FPT, NASDAQ:AAPL
  const explicitMatch = cleaned.match(/^([A-Z0-9_]+):([A-Z0-9._-]+)$/);
  if (explicitMatch) {
    const exch = explicitMatch[1];
    const tkr = explicitMatch[2];
    const isCrypto = exch === 'BINANCE' || exch === 'COINBASE' || exch === 'BYBIT' || exch === 'OKX';
    const isFx = exch === 'FX' || exch === 'OANDA';
    const isVn = exch === 'HOSE' || exch === 'HNX' || exch === 'UPCOM';
    const isIdx = tkr === 'VNINDEX' || tkr === 'VN30' || tkr === 'SPX' || tkr === 'DJI' || tkr === 'IXIC';
    return {
      raw: cleaned,
      tvSymbol: `${exch}:${tkr}`,
      exchange: exch,
      ticker: tkr,
      marketType: isIdx ? 'index' : isCrypto ? 'crypto' : isFx ? 'forex' : isVn ? 'vn_stock' : 'us_stock',
      isStock: !isCrypto && !isFx,
    };
  }

  if (INDEX_TV_MAP[cleaned]) {
    const mapped = INDEX_TV_MAP[cleaned];
    return {
      raw: cleaned,
      ...mapped,
      marketType: 'index',
      isStock: true,
    };
  }

  if (COMMODITY_TV_MAP[cleaned]) {
    const mapped = COMMODITY_TV_MAP[cleaned];
    return {
      raw: cleaned,
      ...mapped,
      marketType: 'commodity',
      isStock: false,
    };
  }

  if (cleaned.endsWith('=X') && cleaned.length === 8) {
    const pair = cleaned.slice(0, 6);
    return {
      raw: cleaned,
      tvSymbol: `FX:${pair}`,
      exchange: 'FX',
      ticker: pair,
      marketType: 'forex',
      isStock: false,
    };
  }

  if (/^(EURUSD|GBPUSD|USDJPY|AUDUSD|USDCAD|USDCHF|NZDUSD|EURJPY|GBPJPY)$/.test(cleaned)) {
    return {
      raw: cleaned,
      tvSymbol: `FX:${cleaned}`,
      exchange: 'FX',
      ticker: cleaned,
      marketType: 'forex',
      isStock: false,
    };
  }

  if (/(USDT|BUSD|USDC)$/.test(cleaned) && cleaned.length >= 6) {
    return {
      raw: cleaned,
      tvSymbol: `BINANCE:${cleaned}`,
      exchange: 'BINANCE',
      ticker: cleaned,
      marketType: 'crypto',
      isStock: false,
    };
  }

  if (CRYPTO_TV_SHORTHAND.has(cleaned)) {
    return {
      raw: cleaned,
      tvSymbol: `BINANCE:${cleaned}USDT`,
      exchange: 'BINANCE',
      ticker: `${cleaned}USDT`,
      marketType: 'crypto',
      isStock: false,
    };
  }

  if (cleaned.endsWith('.VN')) {
    const base = cleaned.slice(0, -3);
    const exch = VN_HNX_SET.has(base) ? 'HNX' : 'HOSE';
    return {
      raw: cleaned,
      tvSymbol: `${exch}:${base}`,
      exchange: exch,
      ticker: base,
      marketType: 'vn_stock',
      isStock: true,
    };
  }

  if (VN_HOSE_SET.has(cleaned)) {
    return {
      raw: cleaned,
      tvSymbol: `HOSE:${cleaned}`,
      exchange: 'HOSE',
      ticker: cleaned,
      marketType: 'vn_stock',
      isStock: true,
    };
  }

  if (VN_HNX_SET.has(cleaned)) {
    return {
      raw: cleaned,
      tvSymbol: `HNX:${cleaned}`,
      exchange: 'HNX',
      ticker: cleaned,
      marketType: 'vn_stock',
      isStock: true,
    };
  }

  if (US_AMEX_ETF_SET.has(cleaned)) {
    return {
      raw: cleaned,
      tvSymbol: `AMEX:${cleaned}`,
      exchange: 'AMEX',
      ticker: cleaned,
      marketType: 'us_stock',
      isStock: true,
    };
  }

  if (US_NYSE_SET.has(cleaned)) {
    return {
      raw: cleaned,
      tvSymbol: `NYSE:${cleaned}`,
      exchange: 'NYSE',
      ticker: cleaned,
      marketType: 'us_stock',
      isStock: true,
    };
  }

  if (US_NASDAQ_SET.has(cleaned)) {
    return {
      raw: cleaned,
      tvSymbol: `NASDAQ:${cleaned}`,
      exchange: 'NASDAQ',
      ticker: cleaned,
      marketType: 'us_stock',
      isStock: true,
    };
  }

  return {
    raw: cleaned,
    tvSymbol: cleaned,
    exchange: 'STOCK',
    ticker: cleaned,
    marketType: 'us_stock',
    isStock: true,
  };
}

export function isStockTickerSymbol(rawSymbol: string): boolean {
  const resolved = resolveTradingViewSymbol(rawSymbol);
  return resolved.isStock;
}

export function normalizeTradingViewInterval(rawInterval?: string): string {
  const val = String(rawInterval || 'D').trim().toUpperCase();
  const map: Record<string, string> = {
    '1M': '1',
    '5M': '5',
    '15M': '15',
    '30M': '30',
    '1H': '60',
    '60M': '60',
    '4H': '240',
    '1D': 'D',
    D: 'D',
    DAILY: 'D',
    '1W': 'W',
    W: 'W',
    WEEKLY: 'W',
    M: 'M',
  };
  return map[val] || (/^(1|3|5|15|30|45|60|120|180|240|D|W|M)$/.test(val) ? val : 'D');
}

export function buildTradingViewWidgetUrl(options: {
  symbol: string;
  interval?: string;
  theme?: 'dark' | 'light';
  locale?: string;
  hideSideToolbar?: boolean;
}): string {
  const resolved = resolveTradingViewSymbol(options.symbol);
  const interval = normalizeTradingViewInterval(options.interval);
  const theme = options.theme === 'light' ? 'light' : 'dark';
  const params = new URLSearchParams({
    symbol: resolved.tvSymbol,
    interval,
    hidesidetoolbar: options.hideSideToolbar ? '1' : '0',
    symboledit: '1',
    saveimage: '0',
    toolbarbg: theme === 'light' ? 'f4f4f5' : '09090b',
    studies: 'RSI@tv-basicstudies',
    theme,
    style: '1',
    timezone: resolved.marketType === 'vn_stock' ? 'Asia/Ho_Chi_Minh' : 'Etc/UTC',
    withdateranges: '1',
    allow_symbol_change: '1',
    locale: options.locale || 'vi_VN',
  });
  return `https://s3.tradingview.com/widgetembed/?${params.toString()}`;
}

export function buildTradingViewExternalUrl(rawSymbol: string): string {
  const resolved = resolveTradingViewSymbol(rawSymbol);
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(resolved.tvSymbol)}`;
}

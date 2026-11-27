import { describe, it, expect } from 'vitest';
import { normalizeChartType, normalizeRadarData } from '../src/lib/chartData';
import { resolveTradingViewSymbol } from '../src/lib/tradingView';
import { normalizeTradingSymbol } from '../api/_tradingTools';
import { classifyDomainTld } from '../api/_mcpTools';
import { getSystemPrompt } from '../src/lib/neuralBridge';
import { AIMode, Language } from '../src/types';

describe('Radar Chart, TradingView Multi-Asset API, and Website TLD Safety', () => {
  it('normalizes Radar chart aliases and supports Recharts, Chart.js, and ECharts schemas', () => {
    expect(normalizeChartType('radar')).toBe('radar');
    expect(normalizeChartType('spider_chart')).toBe('radar');
    expect(normalizeChartType('biểu đồ mạng nhện')).toBe('radar');

    // Recharts object array without explicit xAxis or series
    const r1 = normalizeRadarData({
      type: 'radar',
      data: [
        { subject: 'Tốc độ', 'Model A': '88', 'Model B': 74 },
        { subject: 'Độ chính xác', 'Model A': 92, 'Model B': '81' },
        { subject: 'Ổn định', 'Model A': 85, 'Model B': 79 },
      ],
    });
    expect(r1.xKey).toBe('subject');
    expect(r1.series).toEqual(['Model A', 'Model B']);
    expect(r1.rows[0]['Model A']).toBe(88);

    // Chart.js schema { labels, datasets }
    const r2 = normalizeRadarData({
      type: 'radar',
      labels: ['Tấn công', 'Phòng thủ', 'Tốc độ'],
      datasets: [
        { label: 'Đội Xanh', data: [80, 90, 75] },
        { label: 'Đội Đỏ', data: [85, 70, 95] },
      ],
    });
    expect(r2.rows.length).toBe(3);
    expect(r2.series).toEqual(['Đội Xanh', 'Đội Đỏ']);
    expect(r2.rows[1]['Đội Xanh']).toBe(90);

    // ECharts / ApexCharts schema { categories, series: [{ name, data }] }
    const r3 = normalizeRadarData({
      type: 'radar',
      categories: ['UI', 'API', 'DB'],
      series: [{ name: 'Hệ thống', data: [95, 88, 91] }],
    } as any);
    expect(r3.rows.length).toBe(3);
    expect(r3.series).toEqual(['Hệ thống']);
    expect(r3.rows[2]['Hệ thống']).toBe(91);
  });

  it('resolves stocks, crypto, gold, and forex symbols cleanly for TradingView API', () => {
    expect(resolveTradingViewSymbol('BTC').tvSymbol).toBe('BINANCE:BTCUSDT');
    expect(resolveTradingViewSymbol('BINANCE:ETHUSDT').tvSymbol).toBe('BINANCE:ETHUSDT');
    expect(resolveTradingViewSymbol('GOLD').tvSymbol).toBe('OANDA:XAUUSD');
    expect(resolveTradingViewSymbol('EURUSD').tvSymbol).toBe('FX:EURUSD');
    expect(resolveTradingViewSymbol('FPT').tvSymbol).toBe('HOSE:FPT');
    expect(resolveTradingViewSymbol('NVDA').tvSymbol).toBe('NASDAQ:NVDA');

    const normBtc = normalizeTradingSymbol('BINANCE:BTCUSDT');
    expect(normBtc.market).toBe('crypto');
    expect(normBtc.symbol).toBe('BTCUSDT');
    expect(normBtc.tradingViewSymbol).toBe('BINANCE:BTCUSDT');

    const normGold = normalizeTradingSymbol('OANDA:XAUUSD');
    expect(normGold.symbol).toBe('GC=F');
    expect(normGold.tradingViewSymbol).toBe('OANDA:XAUUSD');

    const normFpt = normalizeTradingSymbol('HOSE:FPT');
    expect(normFpt.market).toBe('yahoo');
    expect(normFpt.symbol).toBe('FPT.VN');
    expect(normFpt.tradingViewSymbol).toBe('HOSE:FPT');
  });

  it('classifies domain TLDs accurately for safe website discovery & simulation', () => {
    expect(classifyDomainTld('chinhphu.gov.vn').tldCategory).toBe('trusted');
    expect(classifyDomainTld('stanford.edu').tldCategory).toBe('trusted');
    expect(classifyDomainTld('wikipedia.org').tldCategory).toBe('standard');
    expect(classifyDomainTld('promo-check.xyz').tldCategory).toBe('caution');
    expect(classifyDomainTld('free-claim.tk').tldCategory).toBe('high_risk');
    expect(classifyDomainTld('198.51.100.12').tldCategory).toBe('high_risk');
  });

  it('instructs AI to emit tradingview charts for price requests and scanned Markdown links for website discovery', () => {
    const tradingPrompt = getSystemPrompt(AIMode.TRADING, Language.VIETNAMESE, '', '', false, 2);
    expect(tradingPrompt).toContain('```tradingview');
    expect(tradingPrompt).toContain('TP1/TP2');
    expect(tradingPrompt).toContain('BUY / SELL');

    const chatPrompt = getSystemPrompt(AIMode.CHAT, Language.VIETNAMESE, '', '', false, 1);
    expect(chatPrompt).toContain('hộp mô phỏng website');
    expect(chatPrompt).toContain('ĐỒ THỊ GIÁ TRADINGVIEW REAL-TIME');
  });
});

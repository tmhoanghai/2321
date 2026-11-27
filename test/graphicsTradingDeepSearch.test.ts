import { describe, it, expect } from 'vitest';
import http from 'node:http';
import handler from '../api/index';
import { AIMode, Language, WorkspaceFile } from '../src/types';
import {
  buildCanvasCommandsHtml,
  buildPythonVisualRunnerHtml,
  hasPythonVisualLibrary,
} from '../src/lib/graphicsGameRunner';
import { runCppProject, runJavaProject } from '../src/lib/polyglotRunner';
import {
  WORKSPACE_TEMPLATES,
  buildWorkspaceProject,
  runWorkspaceBuildCheck,
} from '../src/lib/workspaceBuilder';
import {
  analyzeMicrostructure,
  analyzeOhlcvCandles,
  analyzePriceAction,
  analyzeQuantitative,
  computeAtr,
  computeBollingerBands,
  computeEma,
  computeMacd,
  computePivotLevels,
  computeRsi,
  extractTickersFromPrompt,
  normalizeTradingSymbol,
  OhlcvBar,
  runSixTierTradingAnalysis,
} from '../api/_tradingTools';
import {
  buildTradingViewWidgetUrl,
  isStockTickerSymbol,
  resolveTradingViewSymbol,
} from '../src/lib/tradingView';
import {
  computeDdosMapLayout,
  normalizeChartType,
} from '../src/lib/chartData';
import { getSystemPrompt } from '../src/lib/neuralBridge';

const mk = (path: string, content: string): WorkspaceFile => ({
  path,
  name: path.split('/').pop() || path,
  mimeType: 'text/plain',
  size: content.length,
  content,
  isBinary: false,
});

async function callServerlessHandler(url: string, method = 'GET', body?: any) {
  const server = http.createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  try {
    const resp = await fetch(`http://127.0.0.1:${addr.port}${url}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    return { status: resp.status, text };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('Cross-Language Graphics & Game Runners', () => {
  it('detects Python visual libraries (pygame, turtle, matplotlib) and ignores plain scripts', () => {
    expect(hasPythonVisualLibrary('import pygame\npygame.init()')).toBe(true);
    expect(hasPythonVisualLibrary('from turtle import *\nforward(100)')).toBe(true);
    expect(hasPythonVisualLibrary('import matplotlib.pyplot as plt')).toBe(true);
    expect(hasPythonVisualLibrary('print("hello world")')).toBe(false);
  });

  it('builds self-contained HTML5 Pyodide canvas runner and command canvas renderer', () => {
    const html = buildPythonVisualRunnerHtml(
      [mk('main.py', 'import pygame\npygame.init()\nprint("ready")')],
      'main.py'
    );
    expect(html).toContain('pyodide.js');
    expect(html).toContain('tm-stage');
    expect(html).toContain('console-toggle');
    expect(html).toContain('matplotlib');

    const cmdHtml = buildCanvasCommandsHtml(
      [
        { op: 'clear', args: ['#0b1220'] },
        { op: 'color', args: ['#38bdf8'] },
        { op: 'fillRect', args: [20, 30, 120, 80] },
        { op: 'fillCircle', args: [200, 140, 40] },
        { op: 'text', args: ['Graphics2D OK', 50, 220] },
      ],
      'Canvas Test'
    );
    expect(cmdHtml).toContain('Graphics2D OK');
    expect(cmdHtml).toContain('fillRect');
  });

  it('builds workspace pygame-arcade template into interactive web mode cleanly', () => {
    const tpl = WORKSPACE_TEMPLATES.find((t) => t.id === 'pygame-arcade');
    expect(tpl).toBeDefined();
    const check = runWorkspaceBuildCheck(tpl!.files, tpl!.folderName);
    expect(check.ok).toBe(true);

    const built = buildWorkspaceProject(tpl!.files);
    expect(built.mode).toBe('web');
    expect(built.html).toContain('pyodide.js');
    expect(built.framework).toContain('Python Graphics');
  });

  it('records C++ graphics.h and raylib.h drawCommands cleanly', () => {
    const bgiRes = runCppProject([
      mk(
        'bgi.cpp',
        `#include <graphics.h>
        int main() {
          initgraph(0, 0, "");
          setcolor(YELLOW);
          circle(300, 200, 50);
          rectangle(100, 100, 220, 180);
          outtextxy(120, 50, "BGI Frame");
          return 0;
        }`
      ),
    ]);
    expect(bgiRes.ok).toBe(true);
    expect(bgiRes.drawCommands && bgiRes.drawCommands.length).toBeGreaterThanOrEqual(4);
    expect(bgiRes.drawCommands?.some((c) => c.op === 'circle')).toBe(true);
    expect(bgiRes.drawCommands?.some((c) => c.op === 'text' && c.args[0] === 'BGI Frame')).toBe(true);

    const rayRes = runCppProject([
      mk(
        'game.cpp',
        `#include "raylib.h"
        int main() {
          InitWindow(640, 400, "Demo");
          while (!WindowShouldClose()) {
            BeginDrawing();
            ClearBackground(BLACK);
            DrawRectangle(40, 50, 100, 60, BLUE);
            DrawCircle(320, 200, 35, RED);
            DrawText("Raylib OK", 20, 20, 20, WHITE);
            EndDrawing();
          }
          return 0;
        }`
      ),
    ]);
    expect(rayRes.ok).toBe(true);
    expect(rayRes.drawCommands?.some((c) => c.op === 'fillRect')).toBe(true);
    expect(rayRes.drawCommands?.some((c) => c.op === 'fillCircle')).toBe(true);
    expect(rayRes.drawCommands?.some((c) => c.op === 'text' && c.args[0] === 'Raylib OK')).toBe(true);
  });

  it('records Java Swing/AWT Graphics2D drawCommands cleanly', () => {
    const javaRes = runJavaProject([
      mk(
        'CanvasDemo.java',
        `import javax.swing.*;
        import java.awt.*;
        public class CanvasDemo extends JPanel {
          @Override
          protected void paintComponent(Graphics g) {
            super.paintComponent(g);
            Graphics2D g2 = (Graphics2D) g;
            g2.setColor(Color.CYAN);
            g2.fillRect(30, 40, 140, 90);
            g2.setColor(Color.ORANGE);
            g2.fillOval(220, 100, 80, 80);
            g2.drawString("Swing Render", 30, 200);
          }
          public static void main(String[] args) {
            JFrame frame = new JFrame("Java Game");
            frame.add(new CanvasDemo());
            frame.setSize(640, 420);
            frame.setVisible(true);
          }
        }`
      ),
    ]);
    expect(javaRes.ok).toBe(true);
    expect(javaRes.drawCommands && javaRes.drawCommands.length).toBeGreaterThanOrEqual(3);
    expect(javaRes.drawCommands?.some((c) => c.op === 'fillRect')).toBe(true);
    expect(javaRes.drawCommands?.some((c) => c.op === 'fillOval')).toBe(true);
    expect(javaRes.drawCommands?.some((c) => c.op === 'text' && c.args[0] === 'Swing Render')).toBe(true);
  });
});

describe('Trading AI Engine & Indicators', () => {
  it('normalizes symbols and extracts trading tickers from VN/EN prompts', () => {
    expect(normalizeTradingSymbol('btc')).toMatchObject({ symbol: 'BTCUSDT', market: 'crypto' });
    expect(normalizeTradingSymbol('ETH/USDT')).toMatchObject({ symbol: 'ETHUSDT', market: 'crypto' });
    expect(normalizeTradingSymbol('vàng')).toMatchObject({ symbol: 'GC=F', market: 'yahoo' });
    expect(normalizeTradingSymbol('vnindex')).toMatchObject({ symbol: '^VNINDEX', market: 'yahoo' });
    expect(normalizeTradingSymbol('FPT')).toMatchObject({ symbol: 'FPT.VN', market: 'yahoo' });

    const extracted = extractTickersFromPrompt('Phân tích BTC và giá vàng hôm nay kèm cổ phiếu NVDA');
    expect(extracted.map((t) => t.symbol)).toEqual(expect.arrayContaining(['GC=F', 'BTCUSDT', 'NVDA']));
  });

  it('computes EMA, RSI, MACD, Bollinger, ATR, and Pivot Levels accurately', () => {
    const candles: OhlcvBar[] = Array.from({ length: 60 }, (_, idx) => {
      const base = 100 + idx * 1.2 + Math.sin(idx / 3) * 2;
      return {
        date: `2026-01-${String((idx % 28) + 1).padStart(2, '0')}`,
        open: base - 0.5,
        high: base + 2.0,
        low: base - 1.5,
        close: base,
        volume: 1000 + idx * 20,
      };
    });

    const closes = candles.map((c) => c.close);
    const ema9 = computeEma(closes, 9);
    const rsi14 = computeRsi(closes, 14);
    const macd = computeMacd(closes);
    const bb = computeBollingerBands(closes, 20, 2);
    const atr = computeAtr(candles, 14);
    const pivots = computePivotLevels(110, 100, 105);
    const summary = analyzeOhlcvCandles(candles);

    expect(ema9.length).toBeGreaterThan(10);
    expect(rsi14).not.toBeNull();
    expect(rsi14!).toBeGreaterThan(50);
    expect(rsi14!).toBeLessThanOrEqual(100);
    expect(macd).not.toBeNull();
    expect(bb).not.toBeNull();
    expect(bb!.upper).toBeGreaterThan(bb!.middle);
    expect(bb!.middle).toBeGreaterThan(bb!.lower);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
    expect(pivots.pivot).toBe(105);
    expect(pivots.r1).toBe(110);
    expect(pivots.s1).toBe(100);
    expect(summary.trend).toBe('bullish');
  });

  it('validates /api/trading/quote parameter handling and injects Trading & Deep Search prompt rules', async () => {
    const missing = await callServerlessHandler('/api/trading/quote');
    expect(missing.status).toBe(400);
    expect(missing.text).toContain('Thiếu mã tài sản');

    const tradingPrompt = getSystemPrompt(AIMode.TRADING, Language.VIETNAMESE, '', '', false, 2);
    expect(tradingPrompt).toContain('Chế độ Trading AI');
    expect(tradingPrompt).toContain('candlestick');

    const researchPrompt = getSystemPrompt(AIMode.RESEARCH, Language.VIETNAMESE, '', '', false, 2);
    expect(researchPrompt).toContain('Deep Search');
  });

  it('resolves TradingView symbols for VN/US stocks and validates /api/trading/stock-chart', async () => {
    expect(isStockTickerSymbol('FPT')).toBe(true);
    expect(isStockTickerSymbol('NVDA')).toBe(true);
    expect(isStockTickerSymbol('BTCUSDT')).toBe(false);

    expect(resolveTradingViewSymbol('FPT')).toMatchObject({ tvSymbol: 'HOSE:FPT', exchange: 'HOSE', marketType: 'vn_stock' });
    expect(resolveTradingViewSymbol('VNINDEX')).toMatchObject({ tvSymbol: 'HOSE:VNINDEX' });
    expect(resolveTradingViewSymbol('NVDA')).toMatchObject({ tvSymbol: 'NASDAQ:NVDA', exchange: 'NASDAQ', marketType: 'us_stock' });

    const widgetUrl = buildTradingViewWidgetUrl({ symbol: 'HOSE:FPT', interval: 'D', theme: 'dark' });
    expect(widgetUrl).toContain('tradingview.com/widgetembed/');
    expect(widgetUrl).toContain('symbol=HOSE%3AFPT');

    const missingTv = await callServerlessHandler('/api/trading/stock-chart');
    expect(missingTv.status).toBe(400);
    expect(missingTv.text).toContain('Thiếu mã chứng khoán');
  });

  it('runs all 6 quantitative trading tiers and keeps L2 order-book honesty when L2 feed is absent', () => {
    const candles: OhlcvBar[] = Array.from({ length: 65 }, (_, idx) => {
      const wave = Math.sin(idx / 3.2) * 3.5;
      const trend = idx * 0.9;
      const open = 100 + trend + wave - 0.6;
      const close = 100 + trend + wave + 0.7;
      return {
        date: `2026-02-${String((idx % 28) + 1).padStart(2, '0')}`,
        open,
        high: Math.max(open, close) + 1.8,
        low: Math.min(open, close) - 1.5,
        close,
        volume: 15000 + idx * 450,
      };
    });

    const pa = analyzePriceAction(candles);
    expect(pa.swingSequence.length).toBeGreaterThan(2);
    expect(['bullish', 'bearish', 'ranging']).toContain(pa.structureTrend);

    const quant = analyzeQuantitative(candles);
    expect(quant.kalmanPrice).not.toBeNull();
    expect(quant.garchAnnualizedVolPct).toBeGreaterThan(0);
    expect(quant.meanReversionZ20).not.toBeNull();
    expect(['TRENDING_UP', 'TRENDING_DOWN', 'MEAN_REVERTING', 'HIGH_VOL_SHOCK']).toContain(quant.regime);

    const microNoL2 = analyzeMicrostructure(candles, null);
    expect(microNoL2.orderBookStatus).toBe('unavailable_free_feed');
    expect(microNoL2.obi).toBeNull();
    expect(microNoL2.poc).toBeGreaterThan(0);
    expect(microNoL2.vwap).toBeGreaterThan(0);

    const full = runSixTierTradingAnalysis(candles, null);
    expect(full.tier4_deepLearningPipeline.outOfSampleValidation.length).toBeGreaterThanOrEqual(4);
    expect(full.tier5_reinforcementLearning.policyFamily).toBe('PPO / SAC / DQN');
    const meta = full.tier6_multiModelMeta.metaModel;
    expect(meta.pUp + meta.pDown + meta.pNeutral).toBeCloseTo(1, 2);
    expect(['LONG', 'SHORT', 'STAND_ASIDE', 'REDUCE_POSITION']).toContain(meta.finalDecision);
    expect(full.tier6_multiModelMeta.modelF_positionSizing.stopLoss).not.toBeNull();
  });
});

describe('DDoS Cyber Attack Map & Bug-Free Code Validation', () => {
  it('normalizes ddos_map chart payloads and projects geo arcs cleanly', () => {
    expect(normalizeChartType('ddos')).toBe('ddos_map');
    expect(normalizeChartType('attack_map')).toBe('ddos_map');

    const layout = computeDdosMapLayout({
      type: 'ddos_map',
      unit: 'Gbps',
      attacks: [
        { source: 'CN', target: 'VN', type: 'SYN Flood', volume: 145 },
        { source: 'RU', target: 'US', type: 'UDP Amplification', volume: 220 },
        { source: 'BR', target: 'SG', type: 'HTTP Flood', volume: 85 },
      ],
    });

    expect(layout.landPaths.length).toBeGreaterThanOrEqual(6);
    expect(layout.arcs).toHaveLength(3);
    expect(layout.totalVolume).toBe(450);
    expect(layout.arcs[0].pathD).toContain('M ');
    expect(layout.arcs[0].pathD).toContain(' Q ');
    expect(layout.targets.length).toBe(3);
  });

  it('catches placeholder comments, TS-in-JS, unclosed parens, and unbalanced JSX tags', () => {
    const placeholderCheck = runWorkspaceBuildCheck([
      mk('src/App.tsx', 'export default function App() {\n  // ...\n  return <div>Hi</div>;\n}'),
    ]);
    expect(placeholderCheck.ok).toBe(false);
    expect(placeholderCheck.errors.some((e) => e.includes('placeholder'))).toBe(true);

    const tsInJsCheck = runWorkspaceBuildCheck([
      mk('src/helper.js', 'interface UserProps { name: string }\nexport const x = 1;'),
    ]);
    expect(tsInJsCheck.ok).toBe(false);
    expect(tsInJsCheck.errors.some((e) => e.includes('TypeScript'))).toBe(true);

    const parenCheck = runWorkspaceBuildCheck([
      mk('src/calc.ts', 'export function f(a: number) { return (a + 1; }'),
    ]);
    expect(parenCheck.ok).toBe(false);
    expect(parenCheck.errors.some((e) => e.includes("')'"))).toBe(true);

    const jsxCheck = runWorkspaceBuildCheck([
      mk('src/App.tsx', 'export default function App() { return <div><span>Hi</span>; }'),
    ]);
    expect(jsxCheck.ok).toBe(false);
    expect(jsxCheck.errors.some((e) => e.includes('JSX <div>'))).toBe(true);
  });
});


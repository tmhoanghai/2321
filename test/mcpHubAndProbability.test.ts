import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateBinomialDistribution,
  generatePoissonDistribution,
  generateNormalDistribution,
  normalCdf,
  bayesTheorem,
  combinations,
  toRechartsConfigJson,
} from '../src/lib/probabilityMath';
import {
  assertSafePublicHttpUrl,
  analyzeMusicDisambiguation,
  runFacebookMcpAction,
} from '../api/_mcpTools';
import {
  parseAiMcpDirectives,
  stripAllMcpDirectives,
} from '../src/lib/mcpHubClient';
import { buildWorkspaceProject } from '../src/lib/workspaceBuilder';
import { WorkspaceFile } from '../src/types';

describe('Probability & Chart Math utilities', () => {
  it('computes exact combinatorics, binomial, poisson, normal CDF, and Bayes theorem', () => {
    expect(combinations(5, 2)).toBe(10);

    const binom = generateBinomialDistribution(4, 0.5);
    const sumP = binom.points.reduce((acc, p) => acc + p.probability, 0);
    expect(sumP).toBeCloseTo(1, 5);
    expect(binom.mean).toBeCloseTo(2, 5);

    const pois = generatePoissonDistribution(3, 12);
    expect(pois.points[3].probability).toBeCloseTo(0.2240418, 4);

    expect(normalCdf(0, 0, 1)).toBeCloseTo(0.5, 4);
    expect(normalCdf(1.96, 0, 1)).toBeCloseTo(0.975, 2);

    const bayes = bayesTheorem(0.01, 0.99, 0.05);
    expect(bayes.pAGivenB).toBeCloseTo(0.166666, 4);

    const normSummary = generateNormalDistribution(0, 1, 15);
    const normChartJson = JSON.parse(
      toRechartsConfigJson(normSummary, 'Normal N(0,1)', 'line')
    );
    expect(normChartJson.type).toBe('line');
    expect(normChartJson.data.length).toBe(15);
  });
});

describe('MCP Safety Scanner, Disambiguation & Facebook Helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks localhost, private IPv4 ranges, and cloud metadata IPs against SSRF', async () => {
    await expect(assertSafePublicHttpUrl('http://localhost:3000/test')).rejects.toThrow();
    await expect(assertSafePublicHttpUrl('http://127.0.0.1:8080')).rejects.toThrow();
    await expect(assertSafePublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(assertSafePublicHttpUrl('http://10.0.0.5/admin')).rejects.toThrow();
  });

  it('detects ambiguous duplicate song names by distinct artists vs explicit artist query', () => {
    const sampleTracks = [
      { id: 'v1', title: 'Chờ Đợi Có Đáng Sợ', thumbnail: '', channelTitle: 'Andiez Official', sourceUrl: '' },
      { id: 'v2', title: 'Chờ Đợi Có Đáng Sợ (Cover)', thumbnail: '', channelTitle: 'Mỹ Tâm', sourceUrl: '' },
      { id: 'v3', title: 'Chờ Đợi Có Đáng Sợ Remix', thumbnail: '', channelTitle: 'DJ Hoang', sourceUrl: '' },
    ];

    const ambiguousResult = analyzeMusicDisambiguation('Chờ Đợi Có Đáng Sợ', sampleTracks);
    expect(ambiguousResult.ambiguous).toBe(true);
    expect(ambiguousResult.candidates.length).toBeGreaterThanOrEqual(2);

    const specificResult = analyzeMusicDisambiguation('Chờ Đợi Có Đáng Sợ Andiez', sampleTracks);
    expect(specificResult.ambiguous).toBe(false);
  });

  it('builds Facebook Share dialog safely without exposing server secrets', async () => {
    const fb: any = await runFacebookMcpAction('build_share_post', {
      message: 'Chia sẻ công cụ AI mới',
      link: 'https://example.com',
    });
    expect(fb.ok).toBe(true);
    expect(fb.mode).toBe('share_dialog');
    expect(fb.shareUrl).toContain('facebook.com/sharer/sharer.php');
  });

  it('inspects user token, lists managed Facebook pages, and extracts Page slug safely', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const url = String(input);
      if (url.includes('/v21.0/me/accounts')) {
        return new Response(
          JSON.stringify({
            data: [
              { id: '998877', name: 'HoangHai Dev Page', category: 'Software', access_token: 'page_tok_1' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/v21.0/me/permissions')) {
        return new Response(
          JSON.stringify({ data: [{ permission: 'pages_manage_posts', status: 'granted' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/v21.0/me?')) {
        return new Response(
          JSON.stringify({ id: '112233', name: 'Hoang Hai' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ error: { message: 'unexpected url' } }), { status: 404 });
    });

    const inspected: any = await runFacebookMcpAction('inspect_token', {}, 'user_tok_abc');
    expect(inspected.ok).toBe(true);
    expect(inspected.user.name).toBe('Hoang Hai');
    expect(inspected.pages).toHaveLength(1);
    expect(inspected.pages[0].id).toBe('998877');
    expect(inspected.pages[0].accessToken).toBe('page_tok_1');
    expect(fetchSpy).toHaveBeenCalled();

    const slugLookup: any = await runFacebookMcpAction('lookup_page', {
      query: 'https://www.facebook.com/hoanghai.dev/',
    });
    expect(slugLookup.ok).toBe(true);
    expect(slugLookup.page.id).toBe('hoanghai.dev');

    await expect(
      runFacebookMcpAction('lookup_page', { query: 'https://evil.example.com/page' })
    ).rejects.toThrow();
  });

  it('parses and strips MCP_WEB, MCP_FORM, MCP_FACEBOOK directives', () => {
    const sample =
      'Đã quét liên kết xong.\n[[MCP_WEB:{"url":"https://example.com"}]]\n[[MCP_FORM:{"url":"https://docs.google.com/forms/d/e/test/viewform"}]]';
    const parsed = parseAiMcpDirectives(sample);
    expect(parsed.directives.web?.url).toBe('https://example.com');
    expect(parsed.directives.form?.url).toContain('docs.google.com/forms');
    expect(parsed.cleanedText).toBe('Đã quét liên kết xong.');
    expect(stripAllMcpDirectives('Đang mở... [[MCP_WEB:{"url":')).toBe('Đang mở...');
  });
});

describe('WorkspaceBuilder ES-module HTML+JS & React Router/Recharts reliability', () => {
  it('routes HTML apps referencing ES-module scripts through modular Babel runner cleanly', () => {
    const files: WorkspaceFile[] = [
      {
        path: 'index.html',
        name: 'index.html',
        mimeType: 'text/html',
        size: 120,
        content: '<!DOCTYPE html><html><body><div id="root"></div><script type="module" src="./main.js"></script></body></html>',
      },
      {
        path: 'main.js',
        name: 'main.js',
        mimeType: 'text/javascript',
        size: 80,
        content: 'import { greet } from "./utils.js"; document.getElementById("root").textContent = greet("TM");',
      },
      {
        path: 'utils.js',
        name: 'utils.js',
        mimeType: 'text/javascript',
        size: 60,
        content: 'export const greet = (n) => "Hello " + n;',
      },
    ];

    const res = buildWorkspaceProject(files);
    expect(res.mode).toBe('web');
    expect(res.html).toContain('requireModule');
    expect(res.html).toContain('utils.js');
  });

  it('provides shims for react-router-dom and recharts in modular React builds', () => {
    const files: WorkspaceFile[] = [
      {
        path: 'src/App.tsx',
        name: 'App.tsx',
        mimeType: 'text/typescript',
        size: 200,
        content: `
          import React from 'react';
          import { BrowserRouter, Routes, Route } from 'react-router-dom';
          import { ResponsiveContainer, BarChart, Bar } from 'recharts';
          export default function App() {
            return <BrowserRouter><Routes><Route path="/" element={<div>OK</div>} /></Routes></BrowserRouter>;
          }
        `,
      },
    ];

    const res = buildWorkspaceProject(files);
    expect(res.mode).toBe('web');
    expect(res.html).toContain('react-router-dom');
    expect(res.html).toContain('recharts');
  });
});

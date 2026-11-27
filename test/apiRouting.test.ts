import { describe, it, expect } from 'vitest';
import http from 'node:http';
import handler from '../api/index';

async function callServerlessHandler(url: string, method = 'GET', body?: any) {
  const server = http.createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
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
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

describe('Vercel Serverless API Routing (/api/index)', () => {
  it('routes direct /api/health and Vercel rewritten /api/index?__vpath=health to 200 OK', async () => {
    const direct = await callServerlessHandler('/api/health');
    expect(direct.status).toBe(200);
    expect(JSON.parse(direct.text)).toMatchObject({
      status: 'ok',
      model: 'gemini-3-flash-preview',
      fallbackModels: expect.arrayContaining(['gemini-3-flash-preview', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']),
    });

    const rewritten = await callServerlessHandler('/api/index?__vpath=health');
    expect(rewritten.status).toBe(200);
    expect(JSON.parse(rewritten.text)).toMatchObject({
      status: 'ok',
      model: 'gemini-3-flash-preview',
      fallbackModels: expect.arrayContaining(['gemini-3-flash-preview', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']),
    });
  });

  it('routes Vercel rewritten /api/index?__vpath=v2/kernel/neural-matrix-compute without 404', async () => {
    const res = await callServerlessHandler(
      '/api/index?__vpath=v2/kernel/neural-matrix-compute',
      'POST',
      { contents: [] }
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dữ liệu hội thoại gửi lên không hợp lệ');
  });

  it('exposes Facebook OAuth status and rejects invalid CSRF state on callback', async () => {
    const statusRes = await callServerlessHandler('/api/auth/facebook/status');
    expect(statusRes.status).toBe(200);
    expect(JSON.parse(statusRes.text)).toMatchObject({
      explorerUrl: 'https://developers.facebook.com/tools/explorer/',
    });

    const cbRes = await callServerlessHandler('/api/auth/facebook/callback?code=fake&state=invalid_state');
    expect(cbRes.status).toBe(200);
    expect(cbRes.text).toContain('FB_OAUTH_ERROR');

    const customUrlRes = await callServerlessHandler('/api/auth/facebook/url', 'POST', {
      appId: '123456789012345',
      appSecret: 'temp_secret_value',
      apiVersion: 'v21.0',
      scope: 'public_profile,pages_show_list',
    });
    expect(customUrlRes.status).toBe(200);
    const customUrlJson = JSON.parse(customUrlRes.text);
    expect(customUrlJson.url).toContain('facebook.com/v21.0/dialog/oauth');
    expect(customUrlJson.url).toContain('client_id=123456789012345');

    const ssrfCustom = await callServerlessHandler('/api/mcp/custom-link', 'POST', {
      url: 'http://127.0.0.1:3000/api/health',
      method: 'GET',
    });
    expect(ssrfCustom.status).toBe(400);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startMcpDebugCall,
  finishMcpDebugCall,
  getMcpDebugEvents,
  clearMcpDebugEvents,
  sanitizeDebugPayload,
} from '../api/_mcpDebug';
import {
  TM_LINKED_GOOGLE_STORAGE_KEY,
  TM_LINKED_FACEBOOK_STORAGE_KEY,
  sanitizeFacebookPagesForLocal,
  saveLocalGoogleLink,
  loadLocalGoogleLink,
  clearLocalGoogleLink,
  saveLocalFacebookLink,
  loadLocalFacebookLink,
  clearLocalFacebookLink,
} from '../src/lib/linkedAccountsStorage';
import { extractFilesFromMarkdown } from '../src/lib/fileGenerator';
import { buildWorkspaceProject, runWorkspaceBuildCheck } from '../src/lib/workspaceBuilder';
import { getSystemPrompt } from '../src/lib/neuralBridge';
import { AIMode, Language, WorkspaceFile } from '../src/types';

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('MCP Debug Telemetry & Redaction', () => {
  beforeEach(() => {
    clearMcpDebugEvents();
  });

  it('tracks active -> ok/error lifecycle and redacts sensitive credentials', () => {
    const redacted = sanitizeDebugPayload({
      Authorization: 'Bearer super_secret_jwt_token_123',
      accessToken: 'EAAG_raw_facebook_token',
      appSecret: 'fb_app_secret_999',
      nested: {
        url: 'https://graph.facebook.com/v21.0/me?access_token=EAAG12345&fields=id,name',
        pageId: '100200300',
      },
    }) as any;

    expect(redacted.Authorization).toBe('[REDACTED]');
    expect(redacted.accessToken).toBe('[REDACTED]');
    expect(redacted.appSecret).toBe('[REDACTED]');
    expect(redacted.nested.url).toContain('access_token=[REDACTED]');
    expect(redacted.nested.pageId).toBe('100200300');

    const callId = startMcpDebugCall({
      source: 'mcp_jsonrpc',
      endpoint: '/api/mcp/hub',
      method: 'POST',
      toolName: 'facebook_graph_action',
      params: {
        action: 'list_pages',
        accessToken: 'EAAG_SECRET_SHOULD_HIDE',
      },
    });

    const activeList = getMcpDebugEvents();
    expect(activeList.length).toBe(1);
    expect(activeList[0].status).toBe('active');
    expect((activeList[0].params as any).accessToken).toBe('[REDACTED]');

    const finished = finishMcpDebugCall(callId, {
      httpStatus: 200,
      rawResponse: {
        jsonrpc: '2.0',
        result: { pages: [{ id: '123', access_token: 'PAGE_SECRET_TOK' }] },
      },
    });

    expect(finished).not.toBeNull();
    expect(finished?.status).toBe('ok');
    expect((finished?.rawResponse as any).result.pages[0].access_token).toBe('[REDACTED]');

    clearMcpDebugEvents();
    expect(getMcpDebugEvents().length).toBe(0);
  });
});

describe('Local Linked Accounts Storage (Google & Facebook)', () => {
  beforeEach(() => {
    const memStorage = createMemoryStorage();
    vi.stubGlobal('window', { localStorage: memStorage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists Google metadata locally without YouTube playlist fields and clears cleanly', () => {
    saveLocalGoogleLink({
      email: 'user@example.com',
      displayName: 'Hoang Hai',
      photoURL: 'https://example.com/avatar.png',
    });

    const loaded = loadLocalGoogleLink();
    expect(loaded).not.toBeNull();
    expect(loaded?.email).toBe('user@example.com');
    expect(loaded?.displayName).toBe('Hoang Hai');

    const raw = (window as any).localStorage.getItem(TM_LINKED_GOOGLE_STORAGE_KEY);
    expect(raw).toContain('Hoang Hai');

    clearLocalGoogleLink();
    expect(loadLocalGoogleLink()).toBeNull();
  });

  it('persists Facebook parameters/pages locally while stripping raw access tokens', () => {
    const sanitizedPages = sanitizeFacebookPagesForLocal([
      { id: 'p1', name: 'My Page', accessToken: 'SECRET_PAGE_TOKEN' } as any,
    ]);
    expect((sanitizedPages[0] as any).accessToken).toBeUndefined();

    saveLocalFacebookLink({
      accountUser: { id: 'u1', name: 'FB User' },
      pages: [{ id: 'p1', name: 'My Page', accessToken: 'SECRET_PAGE_TOKEN' } as any],
      pageId: 'p1',
      appId: '1234567890',
      apiVersion: 'v21.0',
      scope: 'public_profile,pages_show_list',
    });

    const loaded = loadLocalFacebookLink();
    expect(loaded?.accountUser?.name).toBe('FB User');
    expect(loaded?.pages[0].id).toBe('p1');
    expect((loaded?.pages[0] as any).accessToken).toBeUndefined();

    const raw = (window as any).localStorage.getItem(TM_LINKED_FACEBOOK_STORAGE_KEY);
    expect(raw).not.toContain('SECRET_PAGE_TOKEN');

    clearLocalFacebookLink();
    expect(loadLocalFacebookLink()).toBeNull();
  });
});

describe('Folder Code Extraction, Workspace Runner & Prompt Integrity', () => {
  it('extracts filenames cleanly across backticks, bold, ./, and inline comments', () => {
    const md = [
      'FILENAME: `./src/App.tsx`',
      '```tsx',
      'export default function App() { return <div>Hello</div>; }',
      '```',
      '',
      '```ts',
      '// FILENAME: **src/utils/math.ts**',
      'export const add = (a: number, b: number) => a + b;',
      '```',
    ].join('\n');

    const files = extractFilesFromMarkdown(md);
    expect(files.length).toBe(2);
    expect(files[0].filename).toBe('src/App.tsx');
    expect(files[1].filename).toBe('src/utils/math.ts');
    expect(files[1].content).toContain('export const add');
  });

  it('injects process shim & RunnerErrorBoundary for React workspaces and catches brace errors', () => {
    const makeWsFile = (path: string, content: string): WorkspaceFile => ({
      path,
      name: path.split('/').pop() || path,
      mimeType: 'text/plain',
      size: content.length,
      content,
      isBinary: false,
    });

    const validFiles: WorkspaceFile[] = [
      makeWsFile('index.html', '<html><body><div id="root"></div></body></html>'),
      makeWsFile(
        'src/App.tsx',
        `import React from 'react'; export default function App() { return <main>Ready</main>; }`
      ),
    ];

    const built = buildWorkspaceProject(validFiles);
    expect(built.mode).toBe('web');
    expect(built.html).toContain('window.process');
    expect(built.html).toContain('RunnerErrorBoundary');

    const checkValid = runWorkspaceBuildCheck(validFiles);
    expect(checkValid.ok).toBe(true);

    const brokenFiles: WorkspaceFile[] = [
      makeWsFile('index.html', '<html><body><div id="root"></div></body></html>'),
      makeWsFile('src/App.tsx', `export default function App() { return <div>Broken; }`),
    ];
    const brokenBraceFiles: WorkspaceFile[] = [
      makeWsFile('index.html', '<html><body><div id="root"></div></body></html>'),
      makeWsFile('src/App.tsx', `export default function App() { if (true) { return <div />; `),
    ];

    const checkBroken = runWorkspaceBuildCheck(brokenBraceFiles);
    expect(checkBroken.ok).toBe(false);
    expect(checkBroken.errors.some((e) => e.includes('src/App.tsx'))).toBe(true);
    expect(checkValid.errors.length).toBe(0);
    expect(brokenFiles.length).toBe(2);
  });

  it('includes runnable folder coding & difficult-language translation rules in system prompt', () => {
    const prompt = getSystemPrompt(AIMode.CODE, Language.VIETNAMESE, '', '', false, 2);
    expect(prompt).toContain('CHẠY ĐƯỢC TRONG FOLDER');
    expect(prompt).toContain('Tiếng vùng miền');
    expect(prompt).toContain('Hán-Việt');
    expect(prompt).toContain('Cổ ngữ');
  });
});

import { stripMusicDirectives } from './mcpMusicClient';

export interface WebSafetyCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface WebSafetyReport {
  url: string;
  finalUrl: string;
  hostname: string;
  tld?: string;
  tldCategory?: 'trusted' | 'standard' | 'caution' | 'high_risk';
  isHttps: boolean;
  safeLevel: 'safe' | 'caution' | 'dangerous';
  score: number;
  warnings: string[];
  checks?: WebSafetyCheckItem[];
  flags: {
    phishing: boolean;
    malwareScript: boolean;
    inappropriateContent: boolean;
    insecureHttp: boolean;
  };
  embeddable: boolean;
  embedReason?: string;
  title: string;
  description: string;
  checkedAt: string;
}

export interface WebSnapshotData {
  safety: WebSafetyReport;
  title: string;
  textContent: string;
  links: { text: string; href: string }[];
  headings?: { level: string; text: string }[];
  stats?: {
    linkCount: number;
    imageCount: number;
    scriptCount: number;
    formCount: number;
    responseTimeMs: number;
  };
}

export interface GoogleFormField {
  entryId: string;
  label: string;
  description?: string;
  type: 'short_text' | 'paragraph' | 'multiple_choice' | 'checkboxes' | 'dropdown' | 'linear_scale' | 'unknown';
  required: boolean;
  options: string[];
}

export interface GoogleFormSchema {
  formUrl: string;
  submitUrl: string;
  title: string;
  description: string;
  fields: GoogleFormField[];
}

export interface FacebookPageSummary {
  id: string;
  name: string;
  category?: string;
  accessToken?: string;
  picture?: string;
  tasks?: string[];
  link?: string;
  followersCount?: number;
}

export interface FacebookTokenInspectResult {
  ok: boolean;
  mode: 'graph_api';
  tokenType: 'user_token' | 'page_or_profile_token';
  user: {
    id: string;
    name: string;
    picture?: string;
  };
  permissions: Array<{ permission: string; status: string }>;
  pages: FacebookPageSummary[];
  note?: string;
  accessToken?: string;
}

export interface FacebookOAuthStatus {
  oauthConfigured: boolean;
  explorerUrl: string;
  debuggerUrl: string;
}

export interface FacebookMcpResult {
  ok: boolean;
  mode: 'share_dialog' | 'graph_api' | 'graph_ready' | 'slug_extracted';
  shareUrl?: string;
  pageId?: string;
  postId?: string;
  data?: any;
  page?: FacebookPageSummary;
  user?: { id: string; name: string; picture?: string };
  pages?: FacebookPageSummary[];
  permissions?: Array<{ permission: string; status: string }>;
  tokenType?: 'user_token' | 'page_or_profile_token';
  preview?: {
    message: string;
    link?: string;
  };
  note?: string;
}

export interface AiMcpDirectives {
  web?: { url: string };
  form?: { url: string; answers?: Record<string, string | string[]> };
  facebook?: { action?: string; message?: string; link?: string; pageId?: string };
}

export function isSafeHttpUrlClient(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function stripAllMcpDirectives(text: string): string {
  if (!text) return text;
  let cleaned = stripMusicDirectives(text);
  cleaned = cleaned
    .replace(/\[\[MCP_(?:WEB|FORM|FACEBOOK):[\s\S]*?\]\]/g, '')
    .replace(/\[\[MCP_(?:WEB|FORM|FACEBOOK):[^\]]*$/g, '')
    .trim();
  return cleaned;
}

export function parseAiMcpDirectives(text: string): {
  cleanedText: string;
  directives: AiMcpDirectives;
} {
  const directives: AiMcpDirectives = {};
  if (!text) return { cleanedText: '', directives };

  const regex = /\[\[MCP_(WEB|FORM|FACEBOOK):(\{[\s\S]*?\})\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const kind = match[1];
    try {
      const parsed = JSON.parse(match[2]);
      if (kind === 'WEB' && typeof parsed?.url === 'string' && parsed.url.trim()) {
        directives.web = { url: parsed.url.trim() };
      } else if (kind === 'FORM' && typeof parsed?.url === 'string' && parsed.url.trim()) {
        directives.form = {
          url: parsed.url.trim(),
          answers: parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : undefined,
        };
      } else if (kind === 'FACEBOOK' && parsed && typeof parsed === 'object') {
        directives.facebook = {
          action: typeof parsed.action === 'string' ? parsed.action : 'build_share_post',
          message: typeof parsed.message === 'string' ? parsed.message : '',
          link: typeof parsed.link === 'string' ? parsed.link : undefined,
          pageId: typeof parsed.pageId === 'string' ? parsed.pageId : undefined,
        };
      }
    } catch {
      // Ignore malformed MCP directive JSON
    }
  }

  return {
    cleanedText: stripAllMcpDirectives(text),
    directives,
  };
}

export async function scanWebsiteSafety(url: string): Promise<WebSafetyReport> {
  const res = await fetch(`/api/mcp/web/scan?url=${encodeURIComponent(url.trim())}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Lỗi quét website (${res.status})`);
  }
  return data as WebSafetyReport;
}

export async function fetchWebsiteSnapshot(url: string): Promise<WebSnapshotData> {
  const res = await fetch(`/api/mcp/web/snapshot?url=${encodeURIComponent(url.trim())}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Không thể đọc nội dung website (${res.status})`);
  }
  return data as WebSnapshotData;
}

export async function inspectGoogleForm(url: string): Promise<GoogleFormSchema> {
  const res = await fetch('/api/mcp/google-form/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Không thể đọc Google Form (${res.status})`);
  }
  return data as GoogleFormSchema;
}

export async function submitGoogleForm(
  url: string,
  answers: Record<string, string | string[]>
): Promise<{ submitted: boolean; status: number; submitUrl: string; message: string }> {
  const res = await fetch('/api/mcp/google-form/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim(), answers }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Không thể gửi Google Form (${res.status})`);
  }
  return data;
}

export async function aiGenerateGoogleFormAnswers(
  schema: GoogleFormSchema,
  userProfileHint?: string,
  language: string = 'Vietnamese'
): Promise<Record<string, string | string[]>> {
  const res = await fetch('/api/mcp/google-form/ai-fill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schema, userProfileHint, language }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `AI không thể tự điền Form (${res.status})`);
  }
  return (data?.answers && typeof data.answers === 'object') ? data.answers : {};
}

export async function getFacebookOAuthStatus(): Promise<FacebookOAuthStatus> {
  const res = await fetch('/api/auth/facebook/status');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Không thể kiểm tra trạng thái liên kết Facebook.');
  }
  return data as FacebookOAuthStatus;
}

export async function getFacebookOAuthUrl(customConfig?: {
  appId?: string;
  appSecret?: string;
  scope?: string;
  apiVersion?: string;
}): Promise<{ url?: string; error?: string; needsManualToken?: boolean; redirectUri?: string }> {
  const hasCustom = Boolean(
    customConfig?.appId?.trim() ||
    customConfig?.appSecret?.trim() ||
    customConfig?.scope?.trim() ||
    customConfig?.apiVersion?.trim()
  );

  const res = await fetch('/api/auth/facebook/url', hasCustom
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customConfig),
      }
    : undefined);

  const data = await res.json();
  if (!res.ok) {
    return {
      error: data?.error || 'Chưa mở đăng nhập Facebook trực tiếp.',
      needsManualToken: Boolean(data?.needsManualToken),
    };
  }
  return { url: data?.url, redirectUri: data?.redirectUri };
}

export async function testCustomLinkEndpoint(params: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bearerToken?: string;
  body?: string;
}): Promise<{ ok: boolean; status: number; finalUrl: string; data: any }> {
  const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.bearerToken?.trim()) {
    reqHeaders['Authorization'] = `Bearer ${params.bearerToken.trim()}`;
  }
  const res = await fetch('/api/mcp/custom-link', {
    method: 'POST',
    headers: reqHeaders,
    body: JSON.stringify({
      url: params.url.trim(),
      method: params.method || 'GET',
      headers: params.headers,
      body: params.body,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Lỗi kết nối (${res.status})`);
  }
  return data;
}

export async function claimFacebookOAuthCode(claimCode: string): Promise<FacebookTokenInspectResult> {
  const res = await fetch('/api/auth/facebook/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimCode }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Không hoàn tất được liên kết Facebook.');
  }
  return data as FacebookTokenInspectResult;
}

export async function callFacebookMcp(
  action: 'build_share_post' | 'publish_page_post' | 'get_page_info' | 'inspect_token' | 'list_pages' | 'lookup_page',
  payload: { message?: string; link?: string; pageId?: string; query?: string },
  pageAccessToken?: string
): Promise<FacebookMcpResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (pageAccessToken && pageAccessToken.trim()) {
    headers['Authorization'] = `Bearer ${pageAccessToken.trim()}`;
  }
  const res = await fetch('/api/mcp/facebook', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Lỗi Facebook MCP (${res.status})`);
  }
  return data as FacebookMcpResult;
}

export async function listMcpHubTools(): Promise<Array<{ name: string; description: string }>> {
  const res = await fetch('/api/mcp/hub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.result?.tools) ? data.result.tools : [];
}

export async function callMcpHubTool(name: string, args: Record<string, any>): Promise<any> {
  const res = await fetch('/api/mcp/hub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const data = await res.json();
  if (data?.error) {
    throw new Error(data.error.message || 'MCP Hub tool failed');
  }
  return data?.result?.structuredContent ?? data?.result;
}

export type McpDebugStatus = 'active' | 'ok' | 'error';

export interface McpDebugEvent {
  id: string;
  timestamp: string;
  updatedAt: string;
  source: 'mcp_jsonrpc' | 'mcp_rest';
  endpoint: string;
  method: string;
  toolName: string;
  status: McpDebugStatus;
  httpStatus?: number;
  durationMs?: number;
  params: unknown;
  rawResponse?: unknown;
  error?: string;
}

export async function fetchMcpDebugEvents(): Promise<McpDebugEvent[]> {
  const res = await fetch('/api/mcp/debug/events');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return Array.isArray(data?.events) ? (data.events as McpDebugEvent[]) : [];
}

export async function clearMcpDebugEvents(): Promise<void> {
  const res = await fetch('/api/mcp/debug/clear', { method: 'POST' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

export function subscribeMcpDebugStream(handlers: {
  onSnapshot?: (events: McpDebugEvent[]) => void;
  onUpsert?: (event: McpDebugEvent) => void;
  onClear?: () => void;
  onStatusChange?: (connected: boolean) => void;
}): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const es = new EventSource('/api/mcp/debug/stream');
  es.onopen = () => handlers.onStatusChange?.(true);
  es.onerror = () => handlers.onStatusChange?.(false);
  es.onmessage = (msg) => {
    try {
      const payload = JSON.parse(msg.data);
      if (payload?.type === 'snapshot' && Array.isArray(payload.events)) {
        handlers.onSnapshot?.(payload.events as McpDebugEvent[]);
      } else if (payload?.type === 'upsert' && payload.event) {
        handlers.onUpsert?.(payload.event as McpDebugEvent);
      } else if (payload?.type === 'clear') {
        handlers.onClear?.();
      }
    } catch {
      // Ignore malformed SSE frames
    }
  };

  return () => {
    try {
      es.close();
    } catch {
      // ignore
    }
    handlers.onStatusChange?.(false);
  };
}


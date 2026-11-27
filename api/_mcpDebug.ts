import type { Response } from 'express';

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

const MAX_EVENTS = 150;
const SENSITIVE_KEY_RE =
  /^(?:authorization|cookie|set-cookie|token|access_?token|refresh_?token|bearer_?token|id_?token|secret|app_?secret|client_?secret|api_?key|apikey|password|passwd|session_?secret|private_?key)$/i;
const SENSITIVE_KEY_PARTIAL_RE =
  /(?:access_?token|bearer_?token|app_?secret|client_?secret|api_?key|password|authorization|private_?key|secret)/i;

const events: McpDebugEvent[] = [];
const activeStartedAt = new Map<string, number>();
const sseClients = new Set<Response>();

function redactString(input: string): string {
  let out = input
    .replace(/(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_token|token|client_secret|appsecret_proof|key|apikey|api_key)=)[^&\s]+/gi, '$1[REDACTED]');
  if (out.length > 16000) {
    out = `${out.slice(0, 16000)}\n... [truncated ${out.length - 16000} chars]`;
  }
  return out;
}

export function sanitizeDebugPayload(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return String(value);

  if (depth >= 6) return '[MaxDepth]';
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    const sliced = value.slice(0, 80).map((item) => sanitizeDebugPayload(item, depth + 1, seen));
    if (value.length > 80) {
      sliced.push(`... (${value.length - 80} more items)`);
    }
    return sliced;
  }

  const out: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [k, v] of entries.slice(0, 100)) {
    if (SENSITIVE_KEY_RE.test(k) || SENSITIVE_KEY_PARTIAL_RE.test(k)) {
      if (v === undefined || v === null || v === '') {
        out[k] = v;
      } else {
        out[k] = '[REDACTED]';
      }
    } else {
      out[k] = sanitizeDebugPayload(v, depth + 1, seen);
    }
  }
  if (entries.length > 100) {
    out._truncatedKeys = entries.length - 100;
  }
  return out;
}

function broadcastSse(payload: Record<string, unknown>) {
  if (sseClients.size === 0) return;
  const serialized = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of Array.from(sseClients)) {
    try {
      if (client.writableEnded || client.destroyed) {
        sseClients.delete(client);
        continue;
      }
      client.write(serialized);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function startMcpDebugCall(input: {
  source: 'mcp_jsonrpc' | 'mcp_rest';
  endpoint: string;
  method: string;
  toolName: string;
  params: unknown;
}): string {
  const nowIso = new Date().toISOString();
  const id = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const event: McpDebugEvent = {
    id,
    timestamp: nowIso,
    updatedAt: nowIso,
    source: input.source,
    endpoint: input.endpoint,
    method: input.method.toUpperCase(),
    toolName: input.toolName || input.endpoint,
    status: 'active',
    params: sanitizeDebugPayload(input.params ?? {}),
  };

  activeStartedAt.set(id, Date.now());
  events.unshift(event);
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }

  broadcastSse({ type: 'upsert', event });
  return id;
}

export function finishMcpDebugCall(
  id: string,
  outcome: {
    httpStatus?: number;
    rawResponse?: unknown;
    error?: string;
  }
): McpDebugEvent | null {
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  const current = events[idx];
  if (current.status !== 'active') return current;

  const startedMs = activeStartedAt.get(id);
  activeStartedAt.delete(id);
  const durationMs = startedMs ? Math.max(0, Date.now() - startedMs) : undefined;

  const rpcErrMsg =
    outcome.rawResponse &&
    typeof outcome.rawResponse === 'object' &&
    (outcome.rawResponse as any).error?.message
      ? String((outcome.rawResponse as any).error.message)
      : undefined;

  const restErrMsg =
    outcome.rawResponse &&
    typeof outcome.rawResponse === 'object' &&
    typeof (outcome.rawResponse as any).error === 'string'
      ? String((outcome.rawResponse as any).error)
      : undefined;

  const finalError = outcome.error || rpcErrMsg || restErrMsg;
  const httpStatus = outcome.httpStatus ?? 200;
  const isError = Boolean(finalError) || httpStatus >= 400;

  const updated: McpDebugEvent = {
    ...current,
    updatedAt: new Date().toISOString(),
    status: isError ? 'error' : 'ok',
    httpStatus,
    durationMs,
    rawResponse:
      outcome.rawResponse !== undefined
        ? sanitizeDebugPayload(outcome.rawResponse)
        : undefined,
    error: finalError ? redactString(finalError) : undefined,
  };

  events[idx] = updated;
  broadcastSse({ type: 'upsert', event: updated });
  return updated;
}

export function getMcpDebugEvents(): McpDebugEvent[] {
  return events.slice();
}

export function clearMcpDebugEvents(): void {
  events.length = 0;
  activeStartedAt.clear();
  broadcastSse({ type: 'clear' });
}

export function attachMcpDebugSseClient(res: Response): () => void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  sseClients.add(res);
  try {
    res.write(`data: ${JSON.stringify({ type: 'snapshot', events: getMcpDebugEvents() })}\n\n`);
  } catch {
    sseClients.delete(res);
  }

  const keepAlive = setInterval(() => {
    try {
      if (res.writableEnded || res.destroyed) {
        clearInterval(keepAlive);
        sseClients.delete(res);
        return;
      }
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      sseClients.delete(res);
    }
  }, 15000);

  const cleanup = () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  };

  return cleanup;
}

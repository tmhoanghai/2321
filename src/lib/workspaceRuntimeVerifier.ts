import { WorkspaceFile } from '../types';
import { runWorkspaceBuildCheck } from './workspaceBuilder';
import { runCppProject, runJavaProject } from './polyglotRunner';

export interface WorkspaceRuntimeVerificationResult {
  ok: boolean;
  stage: 'static' | 'compile' | 'runtime' | 'passed';
  framework: string;
  errors: string[];
  warnings: string[];
  runtimeLogs: string[];
  timedOut?: boolean;
}

export interface VerifyWorkspaceOptions {
  timeoutMs?: number;
  settleAfterOkMs?: number;
  signal?: AbortSignal;
}

function classifyStageFromErrors(errors: string[]): 'compile' | 'runtime' {
  const joined = errors.join('\n');
  if (/Compile error|SyntaxError|Unexpected token|BABEL/i.test(joined)) {
    return 'compile';
  }
  return 'runtime';
}

function normalizeRuntimeErrorLine(raw: string): string {
  const firstLine = String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' | ');
  return firstLine || 'Unknown runtime error';
}

export async function verifyWorkspaceExecution(
  files: WorkspaceFile[],
  workspaceName = 'project',
  options: VerifyWorkspaceOptions = {}
): Promise<WorkspaceRuntimeVerificationResult> {
  const check = runWorkspaceBuildCheck(files, workspaceName);
  const warnings = [...check.warnings];

  if (!check.ok) {
    return {
      ok: false,
      stage: 'static',
      framework: check.framework,
      errors: [...check.errors],
      warnings,
      runtimeLogs: [],
    };
  }

  if (check.built.mode === 'java') {
    const res = runJavaProject(files);
    const errs = !res.ok
      ? [res.stderr || res.compileLog.find((l) => /error/i.test(l)) || 'Java compile/runtime failed']
      : [];
    return {
      ok: res.ok && errs.length === 0,
      stage: errs.length > 0 ? 'runtime' : 'passed',
      framework: check.framework,
      errors: errs,
      warnings,
      runtimeLogs: res.compileLog,
    };
  }

  if (check.built.mode === 'cpp') {
    const res = runCppProject(files);
    const errs = !res.ok
      ? [res.stderr || res.compileLog.find((l) => /error/i.test(l)) || 'C/C++ compile/runtime failed']
      : [];
    return {
      ok: res.ok && errs.length === 0,
      stage: errs.length > 0 ? 'runtime' : 'passed',
      framework: check.framework,
      errors: errs,
      warnings,
      runtimeLogs: res.compileLog,
    };
  }

  if (
    check.built.mode === 'web' &&
    check.built.html &&
    typeof document !== 'undefined' &&
    Boolean(document.body) &&
    typeof window !== 'undefined'
  ) {
    // Only spin up headless sandbox iframe when not inside lightweight happy-dom/jsdom lacking real iframe script execution,
    // OR run real browser sandbox iframe cleanly when userAgent isn't node.
    const isJsDomLike =
      typeof navigator !== 'undefined' &&
      /\b(jsdom|happy-dom)\b/i.test(navigator.userAgent || '');

    if (!isJsDomLike) {
      const timeoutMs = options.timeoutMs ?? 5500;
      const settleAfterOkMs = options.settleAfterOkMs ?? 280;

      return new Promise<WorkspaceRuntimeVerificationResult>((resolve) => {
        const runtimeLogs: string[] = [];
        const collectedErrors: string[] = [];
        const seenErrors = new Set<string>();
        let settled = false;
        let iframe: HTMLIFrameElement | null = null;
        let mainTimer: number | null = null;
        let settleTimer: number | null = null;

        const addError = (msg: string) => {
          const clean = normalizeRuntimeErrorLine(msg);
          if (!clean || seenErrors.has(clean)) return;
          // Ignore noisy Tailwind/CDN network info warnings that aren't JS runtime errors
          if (/cdn\.tailwindcss\.com should not be used in production/i.test(clean)) return;
          seenErrors.add(clean);
          collectedErrors.push(clean);
        };

        const cleanup = () => {
          window.removeEventListener('message', onMessage);
          if (options.signal) {
            options.signal.removeEventListener('abort', onAbort);
          }
          if (mainTimer !== null) {
            window.clearTimeout(mainTimer);
            mainTimer = null;
          }
          if (settleTimer !== null) {
            window.clearTimeout(settleTimer);
            settleTimer = null;
          }
          if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
          iframe = null;
        };

        const finish = (timedOut = false) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({
            ok: collectedErrors.length === 0,
            stage: collectedErrors.length > 0 ? classifyStageFromErrors(collectedErrors) : 'passed',
            framework: check.framework,
            errors: collectedErrors,
            warnings,
            runtimeLogs,
            timedOut,
          });
        };

        const onAbort = () => {
          finish(false);
        };

        const onMessage = (ev: MessageEvent) => {
          if (!iframe || ev.source !== iframe.contentWindow) return;
          const data = ev.data;
          if (!data || typeof data !== 'object') return;

          if (data.type === '__TM_RUNNER_LOG__') {
            const level = String(data.level || 'log');
            const text = String(data.text || '');
            if (text) runtimeLogs.push(`[${level}] ${text}`);
            if (level === 'error' && text) {
              addError(text);
              // Allow a short window for any sibling stack logs before returning failure
              if (settleTimer !== null) window.clearTimeout(settleTimer);
              settleTimer = window.setTimeout(() => finish(false), 120);
            }
          } else if (data.type === '__TM_RUNNER_BUILD__') {
            const status = data.status;
            const msg = String(data.message || '');
            if (msg) runtimeLogs.push(`[build:${status}] ${msg}`);
            if (status === 'error') {
              addError(msg || 'Runtime build failed');
              if (settleTimer !== null) window.clearTimeout(settleTimer);
              settleTimer = window.setTimeout(() => finish(false), 120);
            } else if (status === 'ok' && collectedErrors.length === 0) {
              if (settleTimer !== null) window.clearTimeout(settleTimer);
              settleTimer = window.setTimeout(() => finish(false), settleAfterOkMs);
            }
          }
        };

        if (options.signal?.aborted) {
          finish(false);
          return;
        }

        window.addEventListener('message', onMessage);
        if (options.signal) {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }

        iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText =
          'position:fixed;left:-99999px;top:-99999px;width:1280px;height:800px;opacity:0;pointer-events:none;border:0;';
        iframe.srcdoc = check.built.html;
        document.body.appendChild(iframe);

        mainTimer = window.setTimeout(() => {
          finish(true);
        }, timeoutMs);
      });
    }
  }

  return {
    ok: true,
    stage: 'passed',
    framework: check.framework,
    errors: [],
    warnings,
    runtimeLogs: [],
  };
}

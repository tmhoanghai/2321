import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Tablet,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Theme } from '../types';
import {
  fetchWebsiteSnapshot,
  isSafeHttpUrlClient,
  scanWebsiteSafety,
  WebSafetyReport,
  WebSnapshotData,
} from '../lib/mcpHubClient';

interface WebSimulationBoxProps {
  isOpen: boolean;
  url: string;
  theme: Theme;
  onClose: () => void;
  onOpenFullHub?: (url: string) => void;
}

type SimToolTab = 'live' | 'dom' | 'security';
type SimViewport = 'desktop' | 'tablet' | 'mobile';

function resolveSimulationIframeUrl(rawUrl: string): {
  isYouTubeEmbed: boolean;
  embedUrl: string;
} {
  if (!rawUrl) return { isYouTubeEmbed: false, embedUrl: '' };
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
        return { isYouTubeEmbed: true, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
      }
    }
    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      const v = parsed.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{6,20}$/.test(v)) {
        return { isYouTubeEmbed: true, embedUrl: `https://www.youtube-nocookie.com/embed/${v}?rel=0` };
      }
      const list = parsed.searchParams.get('list');
      if (list && /^[A-Za-z0-9_-]{8,64}$/.test(list)) {
        return { isYouTubeEmbed: true, embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}` };
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') && parts[1] && /^[A-Za-z0-9_-]{6,20}$/.test(parts[1])) {
        return { isYouTubeEmbed: true, embedUrl: `https://www.youtube-nocookie.com/embed/${parts[1]}?rel=0` };
      }
    }
  } catch {
    // ignore
  }
  return { isYouTubeEmbed: false, embedUrl: rawUrl };
}

function formatTldCategory(cat?: WebSafetyReport['tldCategory']): { label: string; cls: string } {
  switch (cat) {
    case 'trusted':
      return { label: 'Uy tín cao', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
    case 'caution':
      return { label: 'Cần lưu ý', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10' };
    case 'high_risk':
      return { label: 'Rủi ro cao', cls: 'text-rose-400 border-rose-500/30 bg-rose-500/10' };
    default:
      return { label: 'Phổ thông', cls: 'text-text-secondary border-border-color bg-primary/40' };
  }
}

function safetyBadge(level?: WebSafetyReport['safeLevel']): { label: string; cls: string } {
  if (level === 'safe') {
    return { label: 'An toàn', cls: 'text-emerald-400 border-emerald-500/35 bg-emerald-500/10' };
  }
  if (level === 'caution') {
    return { label: 'Cần lưu ý', cls: 'text-amber-400 border-amber-500/35 bg-amber-500/10' };
  }
  return { label: 'Cảnh báo', cls: 'text-rose-400 border-rose-500/35 bg-rose-500/10' };
}

export const WebSimulationBox: React.FC<WebSimulationBoxProps> = ({
  isOpen,
  url,
  theme,
  onClose,
  onOpenFullHub,
}) => {
  const [inputUrl, setInputUrl] = useState(url);
  const [activeTool, setActiveTool] = useState<SimToolTab>('live');
  const [viewport, setViewport] = useState<SimViewport>('desktop');
  const [expanded, setExpanded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<WebSafetyReport | null>(null);
  const [snapshot, setSnapshot] = useState<WebSnapshotData | null>(null);
  const [allowRiskyLive, setAllowRiskyLive] = useState(false);
  const [copied, setCopied] = useState(false);

  const isLight = theme === Theme.LIGHT;

  const inspectAndSimulate = useCallback(async (rawTarget: string) => {
    const trimmed = rawTarget.trim();
    if (!trimmed) return;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (!isSafeHttpUrlClient(normalized)) {
      setError('Chỉ hỗ trợ mô phỏng các liên kết http:// hoặc https:// hợp lệ.');
      return;
    }

    setInputUrl(normalized);
    setLoading(true);
    setError(null);
    setAllowRiskyLive(false);

    try {
      const snap = await fetchWebsiteSnapshot(normalized);
      setSnapshot(snap);
      setReport(snap.safety);
      const ytDirect = resolveSimulationIframeUrl(snap.safety.finalUrl || normalized);
      // If site blocks iframe embedding (except YouTube embeddable player) or is dangerous, switch to DOM view
      if ((!snap.safety.embeddable && !ytDirect.isYouTubeEmbed) || snap.safety.safeLevel === 'dangerous') {
        setActiveTool('dom');
      } else {
        setActiveTool('live');
      }
    } catch (snapErr: any) {
      // Fallback to header/safety scan only if snapshot body extraction failed
      try {
        const rep = await scanWebsiteSafety(normalized);
        setReport(rep);
        setSnapshot(null);
        const ytFallback = resolveSimulationIframeUrl(rep.finalUrl || normalized);
        setActiveTool(ytFallback.isYouTubeEmbed && rep.safeLevel !== 'dangerous' ? 'live' : 'security');
      } catch (scanErr: any) {
        setError(scanErr?.message || snapErr?.message || 'Không thể kiểm tra & mô phỏng website này.');
        setReport(null);
        setSnapshot(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !url) return;
    void inspectAndSimulate(url);
  }, [isOpen, url, inspectAndSimulate]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expanded) setExpanded(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, expanded, onClose]);

  if (!isOpen) return null;

  const badge = safetyBadge(report?.safeLevel);
  const tldBadge = formatTldCategory(report?.tldCategory);
  const safeLiveUrl =
    report && isSafeHttpUrlClient(report.finalUrl) ? report.finalUrl : '';
  const ytResolved = resolveSimulationIframeUrl(safeLiveUrl || inputUrl);
  const liveIframeSrc = ytResolved.isYouTubeEmbed ? ytResolved.embedUrl : safeLiveUrl;
  const effectiveEmbeddable = ytResolved.isYouTubeEmbed ? true : Boolean(report?.embeddable);
  const hasRealWarning = Boolean(
    report && (report.safeLevel !== 'safe' || report.warnings.length > 0)
  );

  const iframeMaxWidthClass =
    viewport === 'mobile'
      ? 'w-[375px] max-w-full mx-auto'
      : viewport === 'tablet'
      ? 'w-[768px] max-w-full mx-auto'
      : 'w-full';

  const handleCopyUrl = () => {
    const val = report?.finalUrl || inputUrl;
    if (!val) return;
    navigator.clipboard?.writeText(val).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  return (
    <div
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/55 ${
        expanded ? 'p-0' : 'p-3 sm:p-4'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Hộp mô phỏng Website an toàn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex flex-col shadow-2xl transition-all ${
          expanded
            ? 'w-screen h-[100dvh] max-w-none rounded-none border-0'
            : 'w-full max-w-2xl h-[74vh] rounded-xl border'
        } ${
          isLight
            ? 'bg-white border-gray-200 text-gray-900'
            : 'bg-zinc-950 border-zinc-800 text-zinc-100'
        }`}
      >
        {/* Top Bar: Title + URL bar + Controls */}
        <div className="px-3.5 py-2.5 border-b border-border-color flex items-center gap-2">
          <Globe size={15} className="text-text-secondary shrink-0" />
          <form
            className="flex-1 flex items-center gap-1.5 min-w-0"
            onSubmit={(e) => {
              e.preventDefault();
              void inspectAndSimulate(inputUrl);
            }}
          >
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com"
              className={`flex-1 min-w-0 px-2.5 py-1 rounded-lg border text-xs font-mono outline-none ${
                isLight
                  ? 'bg-gray-50 border-gray-300 text-gray-900 focus:border-gray-500'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-600'
              }`}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-2.5 py-1 rounded-lg border border-border-color text-xs font-medium hover:bg-secondary transition-colors whitespace-nowrap shrink-0"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : 'Quét'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-text-primary transition-colors"
            title={expanded ? 'Thu nhỏ (Esc)' : 'Xem toàn màn hình'}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border-color text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Đóng"
          >
            <X size={14} />
          </button>
        </div>

        {/* Status + Tool Strip */}
        <div className="px-3.5 py-2 border-b border-border-color flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTool('live')}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                activeTool === 'live'
                  ? isLight
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-950 border-white font-medium'
                  : 'border-border-color text-text-secondary hover:text-text-primary'
              }`}
            >
              Mô phỏng Live
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('dom')}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                activeTool === 'dom'
                  ? isLight
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-950 border-white font-medium'
                  : 'border-border-color text-text-secondary hover:text-text-primary'
              }`}
            >
              Cấu trúc & Đọc
            </button>
            <button
              type="button"
              onClick={() => setActiveTool('security')}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                activeTool === 'security'
                  ? isLight
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-950 border-white font-medium'
                  : 'border-border-color text-text-secondary hover:text-text-primary'
              }`}
            >
              Quét đuôi & Bảo mật
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
            {report && hasRealWarning && (
              <>
                <span className={`px-2 py-0.5 rounded border ${tldBadge.cls}`}>
                  {report.tld || '.web'} · {tldBadge.label}
                </span>
                <span className={`px-2 py-0.5 rounded border ${badge.cls}`}>
                  {report.score}/100 · {badge.label}
                </span>
              </>
            )}

            <button
              type="button"
              onClick={handleCopyUrl}
              className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary"
              title="Sao chép URL"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>

            <button
              type="button"
              onClick={() => void inspectAndSimulate(inputUrl)}
              className="p-1 rounded border border-border-color text-text-secondary hover:text-text-primary"
              title="Quét lại"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            </button>

            {safeLiveUrl && report?.safeLevel !== 'dangerous' && (
              <a
                href={safeLiveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border-color text-text-secondary hover:text-text-primary"
                title="Mở tab trình duyệt"
              >
                <span>Mở ngoài</span>
                <ExternalLink size={11} />
              </a>
            )}

            {onOpenFullHub && (
              <button
                type="button"
                onClick={() => onOpenFullHub(report?.finalUrl || inputUrl)}
                className="px-2 py-0.5 rounded border border-border-color text-text-secondary hover:text-text-primary"
              >
                Hub
              </button>
            )}
          </div>
        </div>

        {/* Viewport switcher for Live Mode */}
        {activeTool === 'live' && (
          <div className="px-3.5 py-1.5 border-b border-border-color/70 flex items-center justify-between gap-2 text-[11px] text-text-secondary">
            <span>Khung trình duyệt cách ly (Sandbox)</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                className={`p-1 rounded border ${viewport === 'desktop' ? 'border-text-primary text-text-primary' : 'border-transparent hover:border-border-color'}`}
                title="Desktop"
              >
                <Monitor size={13} />
              </button>
              <button
                type="button"
                onClick={() => setViewport('tablet')}
                className={`p-1 rounded border ${viewport === 'tablet' ? 'border-text-primary text-text-primary' : 'border-transparent hover:border-border-color'}`}
                title="Tablet (768px)"
              >
                <Tablet size={13} />
              </button>
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                className={`p-1 rounded border ${viewport === 'mobile' ? 'border-text-primary text-text-primary' : 'border-transparent hover:border-border-color'}`}
                title="Mobile (375px)"
              >
                <Smartphone size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3.5">
          {loading && !report && (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-text-secondary">
              <Loader2 size={20} className="animate-spin" />
              <span>Đang quét đuôi tên miền, HTTPS & trích xuất mô phỏng...</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg border border-rose-500/35 bg-rose-500/10 text-xs text-rose-400">
              {error}
            </div>
          )}

          {!loading && !error && activeTool === 'live' && report && (
            <div className="h-full flex flex-col gap-2">
              {report.safeLevel === 'dangerous' && !allowRiskyLive ? (
                <div className="p-4 rounded-lg border border-rose-500/35 bg-rose-500/10 space-y-2.5 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-rose-400">
                    <ShieldAlert size={16} />
                    <span>Đã chặn tải Live vì phát hiện dấu hiệu rủi ro</span>
                  </div>
                  <p className="text-text-secondary">
                    Hệ thống khuyến nghị xem bằng thẻ &ldquo;Cấu trúc & Đọc&rdquo; để kiểm tra nội dung an toàn trước.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTool('dom')}
                      className="px-3 py-1.5 rounded-lg border border-border-color bg-secondary text-text-primary"
                    >
                      Chuyển sang Cấu trúc & Đọc
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllowRiskyLive(true)}
                      className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-400"
                    >
                      Vẫn mở Sandbox
                    </button>
                  </div>
                </div>
              ) : !effectiveEmbeddable && !allowRiskyLive ? (
                <div className="p-4 rounded-lg border border-border-color bg-secondary/40 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-semibold text-text-primary">
                    <Globe size={15} className="text-text-secondary" />
                    <span>Website không cho phép nhúng iframe trực tiếp</span>
                  </div>
                  <p className="text-text-secondary">
                    {report.embedReason || 'Máy chủ đích bật X-Frame-Options hoặc CSP frame-ancestors.'}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTool('dom')}
                      className="px-3 py-1.5 rounded-lg border border-border-color bg-secondary text-text-primary"
                    >
                      Xem Mô phỏng Cấu trúc (DOM)
                    </button>
                    {safeLiveUrl && (
                      <a
                        href={safeLiveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-color text-text-secondary hover:text-text-primary"
                      >
                        <span>Mở trên tab mới</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              ) : liveIframeSrc ? (
                <div className={`flex-1 min-h-[340px] rounded-lg border border-border-color overflow-hidden bg-black ${iframeMaxWidthClass}`}>
                  <iframe
                    key={`${liveIframeSrc}-${viewport}`}
                    src={liveIframeSrc}
                    title={`Simulation ${report.title}`}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    className="w-full h-full min-h-[340px] border-0"
                  />
                </div>
              ) : null}
            </div>
          )}

          {!loading && !error && activeTool === 'dom' && (
            <div className="space-y-3 text-xs">
              {snapshot ? (
                <>
                  <div className="p-3 rounded-lg border border-border-color bg-secondary/40 space-y-1">
                    <div className="text-sm font-semibold text-text-primary">{snapshot.title}</div>
                    <div className="text-[11px] font-mono text-text-secondary break-all">{snapshot.safety.finalUrl}</div>
                    {snapshot.safety.description && (
                      <p className="text-text-secondary pt-1">{snapshot.safety.description}</p>
                    )}
                    {snapshot.stats && (
                      <div className="flex flex-wrap gap-3 pt-2 text-[11px] font-mono tabular-nums text-text-secondary">
                        <span>Links: {snapshot.stats.linkCount}</span>
                        <span>Images: {snapshot.stats.imageCount}</span>
                        <span>Scripts: {snapshot.stats.scriptCount}</span>
                        <span>Forms: {snapshot.stats.formCount}</span>
                        <span>{snapshot.stats.responseTimeMs} ms</span>
                      </div>
                    )}
                  </div>

                  {snapshot.headings && snapshot.headings.length > 0 && (
                    <div className="p-3 rounded-lg border border-border-color space-y-1.5">
                      <div className="font-semibold text-text-primary">Cấu trúc đề mục</div>
                      <div className="space-y-1">
                        {snapshot.headings.map((h, i) => (
                          <div key={i} className="flex items-baseline gap-2 text-[11px]">
                            <span className="font-mono text-text-secondary shrink-0">{h.level}</span>
                            <span className="text-text-primary">{h.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {snapshot.textContent && (
                    <div className="p-3 rounded-lg border border-border-color space-y-1.5">
                      <div className="font-semibold text-text-primary">Nội dung văn bản an toàn</div>
                      <p className="whitespace-pre-wrap text-text-secondary leading-relaxed max-h-64 overflow-y-auto">
                        {snapshot.textContent}
                      </p>
                    </div>
                  )}

                  {snapshot.links && snapshot.links.length > 0 && (
                    <div className="p-3 rounded-lg border border-border-color space-y-1.5">
                      <div className="font-semibold text-text-primary">
                        Điều hướng nhanh trong Simulation Box ({snapshot.links.length} liên kết)
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {snapshot.links.map((lk, idx) =>
                          isSafeHttpUrlClient(lk.href) ? (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => void inspectAndSimulate(lk.href)}
                              className="text-left px-2.5 py-1.5 rounded border border-border-color/70 hover:bg-secondary transition-colors truncate"
                              title={lk.href}
                            >
                              <div className="font-medium text-text-primary truncate">{lk.text}</div>
                              <div className="text-[10px] font-mono text-text-secondary truncate">{lk.href}</div>
                            </button>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 rounded-lg border border-border-color text-text-secondary">
                  Không trích xuất được DOM văn bản từ trang này. Hãy xem tab &ldquo;Quét đuôi & Bảo mật&rdquo;.
                </div>
              )}
            </div>
          )}

          {!loading && !error && activeTool === 'security' && report && (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg border border-border-color flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {report.safeLevel === 'safe' ? (
                    <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
                  ) : (
                    <ShieldAlert size={18} className="text-amber-400 shrink-0" />
                  )}
                  <div>
                    <div className="font-semibold text-text-primary">{report.hostname}</div>
                    <div className="text-[11px] font-mono text-text-secondary">
                      Đuôi miền: {report.tld || '—'} · HTTPS: {report.isHttps ? 'Có' : 'Không'}
                    </div>
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-base font-semibold">{report.score}/100</div>
                  <div className="text-[10px] text-text-secondary">{badge.label}</div>
                </div>
              </div>

              {report.checks && report.checks.length > 0 && (
                <div className="rounded-lg border border-border-color divide-y divide-border-color/70">
                  {report.checks.map((chk) => (
                    <div key={chk.id} className="px-3 py-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-text-primary">{chk.label}</div>
                        <div className="text-[11px] text-text-secondary">{chk.detail}</div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono shrink-0 ${
                          chk.status === 'pass'
                            ? 'text-emerald-400 border-emerald-500/30'
                            : chk.status === 'warn'
                            ? 'text-amber-400 border-amber-500/30'
                            : 'text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {chk.status === 'pass' ? (
                          <span className="inline-flex items-center gap-1"><CheckCircle2 size={10} /> Đạt</span>
                        ) : chk.status === 'warn' ? 'Lưu ý' : 'Cảnh báo'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {report.warnings.length > 0 && (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 space-y-1">
                  <div className="font-semibold text-amber-400">Chi tiết cảnh báo</div>
                  {report.warnings.map((w, i) => (
                    <div key={i} className="text-[11px] text-text-secondary">
                      • {w}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

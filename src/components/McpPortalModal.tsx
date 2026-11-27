import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Globe,
  FileSpreadsheet,
  Share2,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Send,
  RefreshCw,
  LogOut,
  Play,
  Link2,
  Search,
  KeyRound,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Activity,
  Trash2,
  Pause,
  Copy,
  Check,
} from 'lucide-react';
import { Theme } from '../types';
import {
  aiGenerateGoogleFormAnswers,
  callFacebookMcp,
  callMcpHubTool,
  claimFacebookOAuthCode,
  clearMcpDebugEvents,
  FacebookMcpResult,
  FacebookPageSummary,
  fetchMcpDebugEvents,
  fetchWebsiteSnapshot,
  getFacebookOAuthStatus,
  getFacebookOAuthUrl,
  GoogleFormSchema,
  inspectGoogleForm,
  isSafeHttpUrlClient,
  listMcpHubTools,
  McpDebugEvent,
  scanWebsiteSafety,
  submitGoogleForm,
  subscribeMcpDebugStream,
  testCustomLinkEndpoint,
  WebSafetyReport,
  WebSnapshotData,
} from '../lib/mcpHubClient';
import {
  clearLocalFacebookLink,
  loadLocalFacebookLink,
  saveLocalFacebookLink,
} from '../lib/linkedAccountsStorage';

export type McpPortalTab = 'web' | 'form' | 'hub' | 'debug';

interface McpPortalModalProps {
  isOpen: boolean;
  initialTab?: McpPortalTab;
  initialWebUrl?: string;
  initialFormUrl?: string;
  initialFormAnswers?: Record<string, string | string[]>;
  initialFbDraft?: { message?: string; link?: string; pageId?: string };
  theme: Theme;
  language?: string;
  googleUser?: { email?: string | null; displayName?: string | null; photoURL?: string | null } | null;
  googleAuthLoading?: boolean;
  googleError?: string | null;
  onGoogleSignIn?: () => void;
  onGoogleSignOut?: () => void;
  onClose: () => void;
}

export const McpPortalModal: React.FC<McpPortalModalProps> = ({
  isOpen,
  initialTab = 'web',
  initialWebUrl = '',
  initialFormUrl = '',
  initialFormAnswers,
  initialFbDraft,
  theme,
  language = 'Vietnamese',
  googleUser = null,
  googleAuthLoading = false,
  googleError = null,
  onGoogleSignIn,
  onGoogleSignOut,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<McpPortalTab>(initialTab);

  // Web viewer & scanner state
  const [webUrl, setWebUrl] = useState(initialWebUrl);
  const [webScanning, setWebScanning] = useState(false);
  const [webReport, setWebReport] = useState<WebSafetyReport | null>(null);
  const [webError, setWebError] = useState<string | null>(null);
  const [allowRiskyPreview, setAllowRiskyPreview] = useState(false);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [snapshotData, setSnapshotData] = useState<WebSnapshotData | null>(null);

  // Google Form state (supports both Manual fill & AI auto-fill)
  const [formUrl, setFormUrl] = useState(initialFormUrl);
  const [formLoading, setFormLoading] = useState(false);
  const [formSchema, setFormSchema] = useState<GoogleFormSchema | null>(null);
  const [formAnswers, setFormAnswers] = useState<Record<string, string | string[]>>({});
  const [formFillMode, setFormFillMode] = useState<'manual' | 'ai'>('manual');
  const [formAiHint, setFormAiHint] = useState('');
  const [formAiFilling, setFormAiFilling] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formResult, setFormResult] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Connections Hub & Facebook state (credentials/tokens held in React memory only; non-secret info cached locally)
  const initialLocalFb = loadLocalFacebookLink();
  const [hubTools, setHubTools] = useState<Array<{ name: string; description: string }>>([]);
  const [fbMessage, setFbMessage] = useState(initialFbDraft?.message || initialLocalFb?.message || '');
  const [fbLink, setFbLink] = useState(initialFbDraft?.link || initialLocalFb?.link || '');
  const [fbPageId, setFbPageId] = useState(initialFbDraft?.pageId || initialLocalFb?.pageId || '');
  const [fbToken, setFbToken] = useState('');
  const [fbAppId, setFbAppId] = useState(initialLocalFb?.appId || '');
  const [fbAppSecret, setFbAppSecret] = useState('');
  const [fbApiVersion, setFbApiVersion] = useState(initialLocalFb?.apiVersion || 'v21.0');
  const [fbScope, setFbScope] = useState(
    initialLocalFb?.scope || 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts'
  );
  const [fbParamsOpen, setFbParamsOpen] = useState(false);
  const [fbAccountUser, setFbAccountUser] = useState<{ id: string; name: string; picture?: string } | null>(
    initialLocalFb?.accountUser || null
  );
  const [fbPages, setFbPages] = useState<FacebookPageSummary[]>(initialLocalFb?.pages || []);
  const [fbPermissions, setFbPermissions] = useState<Array<{ permission: string; status: string }>>(
    initialLocalFb?.permissions || []
  );
  const [fbPageFilter, setFbPageFilter] = useState('');
  const [fbPageLookupInput, setFbPageLookupInput] = useState('');
  const [fbTokenFinderOpen, setFbTokenFinderOpen] = useState(false);
  const [fbTokenHelpQuery, setFbTokenHelpQuery] = useState('');
  const [fbTokenHelpResult, setFbTokenHelpResult] = useState<string | null>(null);
  const [fbTokenHelpLoading, setFbTokenHelpLoading] = useState(false);
  const [fbOAuthConfigured, setFbOAuthConfigured] = useState<boolean | null>(null);
  const [fbAuthLoading, setFbAuthLoading] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);
  const [fbResult, setFbResult] = useState<FacebookMcpResult | null>(null);
  const [fbError, setFbError] = useState<string | null>(null);

  // Live MCP Debugging Feed state
  const [debugEvents, setDebugEvents] = useState<McpDebugEvent[]>([]);
  const [debugConnected, setDebugConnected] = useState(false);
  const [debugPaused, setDebugPaused] = useState(false);
  const [debugSearch, setDebugSearch] = useState('');
  const [debugStatusFilter, setDebugStatusFilter] = useState<'all' | 'active' | 'ok' | 'error'>('all');
  const [expandedDebugIds, setExpandedDebugIds] = useState<Record<string, boolean>>({});
  const [copiedDebugId, setCopiedDebugId] = useState<string | null>(null);

  // Custom API / Webhook link parameters (held in RAM only)
  const [customLinkOpen, setCustomLinkOpen] = useState(false);
  const [customLinkUrl, setCustomLinkUrl] = useState('');
  const [customLinkMethod, setCustomLinkMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('GET');
  const [customLinkToken, setCustomLinkToken] = useState('');
  const [customLinkHeaders, setCustomLinkHeaders] = useState('');
  const [customLinkBody, setCustomLinkBody] = useState('');
  const [customLinkLoading, setCustomLinkLoading] = useState(false);
  const [customLinkResult, setCustomLinkResult] = useState<{ ok: boolean; status: number; finalUrl: string; data: any } | null>(null);
  const [customLinkError, setCustomLinkError] = useState<string | null>(null);

  // Google search quick test inside Hub
  const [googleSearchQ, setGoogleSearchQ] = useState('');
  const [googleSearchRes, setGoogleSearchRes] = useState<any>(null);
  const [googleSearchLoading, setGoogleSearchLoading] = useState(false);

  const isLight = theme === Theme.LIGHT;
  const isPixel = theme === Theme.PIXEL;

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    void listMcpHubTools().then(setHubTools);
    void getFacebookOAuthStatus()
      .then((status) => setFbOAuthConfigured(status.oauthConfigured))
      .catch(() => setFbOAuthConfigured(false));
  }, [isOpen]);

  // Persist non-secret Facebook connection profile & config locally
  useEffect(() => {
    const hasMeaningfulFb =
      Boolean(fbAccountUser) ||
      fbPages.length > 0 ||
      Boolean(fbPageId.trim()) ||
      Boolean(fbAppId.trim()) ||
      Boolean(fbMessage.trim()) ||
      Boolean(fbLink.trim());
    if (!hasMeaningfulFb) return;
    saveLocalFacebookLink({
      accountUser: fbAccountUser,
      pages: fbPages,
      permissions: fbPermissions,
      pageId: fbPageId,
      appId: fbAppId,
      apiVersion: fbApiVersion,
      scope: fbScope,
      message: fbMessage,
      link: fbLink,
      lastNote: fbResult?.note,
    });
  }, [fbAccountUser, fbPages, fbPermissions, fbPageId, fbAppId, fbApiVersion, fbScope, fbMessage, fbLink, fbResult?.note]);

  // Live SSE feed for Debug MCP tab
  useEffect(() => {
    if (!isOpen || activeTab !== 'debug') return;
    let active = true;
    void fetchMcpDebugEvents()
      .then((list) => {
        if (active) setDebugEvents(list);
      })
      .catch(() => {
        // ignore initial fetch error; SSE will retry
      });

    if (debugPaused) {
      setDebugConnected(false);
      return () => {
        active = false;
      };
    }

    const unsubscribe = subscribeMcpDebugStream({
      onSnapshot: (list) => {
        if (active) setDebugEvents(list);
      },
      onUpsert: (evt) => {
        if (!active) return;
        setDebugEvents((prev) => {
          const idx = prev.findIndex((x) => x.id === evt.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = evt;
            return next;
          }
          return [evt, ...prev].slice(0, 150);
        });
      },
      onClear: () => {
        if (active) setDebugEvents([]);
      },
      onStatusChange: (connected) => {
        if (active) setDebugConnected(connected);
      },
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isOpen, activeTab, debugPaused]);

  const handleScanAndOpenWeb = async (targetUrl?: string) => {
    const raw = (targetUrl ?? webUrl).trim();
    if (!raw) return;
    const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setWebUrl(normalized);
    setWebScanning(true);
    setWebError(null);
    setWebReport(null);
    setAllowRiskyPreview(false);
    setSnapshotMode(false);
    setSnapshotData(null);

    try {
      const report = await scanWebsiteSafety(normalized);
      setWebReport(report);
      if (!report.embeddable && report.safeLevel !== 'dangerous') {
        const snap = await fetchWebsiteSnapshot(normalized);
        setSnapshotData(snap);
        setSnapshotMode(true);
      }
    } catch (err: any) {
      setWebError(err?.message || 'Không thể kiểm tra trang web này.');
    } finally {
      setWebScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen && initialWebUrl && initialWebUrl.trim()) {
      void handleScanAndOpenWeb(initialWebUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialWebUrl]);

  const handleInspectForm = async (targetUrl?: string, prefillAnswers?: Record<string, string | string[]>) => {
    const raw = (targetUrl ?? formUrl).trim();
    if (!raw) return;
    setFormUrl(raw);
    setFormLoading(true);
    setFormError(null);
    setFormResult(null);
    try {
      const schema = await inspectGoogleForm(raw);
      setFormSchema(schema);
      const nextAnswers: Record<string, string | string[]> = {};
      for (const field of schema.fields) {
        if (prefillAnswers && prefillAnswers[field.entryId] !== undefined) {
          nextAnswers[field.entryId] = prefillAnswers[field.entryId];
        } else if (prefillAnswers && prefillAnswers[field.label] !== undefined) {
          nextAnswers[field.entryId] = prefillAnswers[field.label];
        } else {
          nextAnswers[field.entryId] = field.type === 'checkboxes' ? [] : '';
        }
      }
      setFormAnswers(nextAnswers);
    } catch (err: any) {
      setFormError(err?.message || 'Không thể đọc Google Form.');
    } finally {
      setFormLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && initialFormUrl && initialFormUrl.trim()) {
      void handleInspectForm(initialFormUrl, initialFormAnswers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFormUrl]);

  useEffect(() => {
    if (isOpen && initialFbDraft) {
      if (initialFbDraft.message) setFbMessage(initialFbDraft.message);
      if (initialFbDraft.link) setFbLink(initialFbDraft.link);
      if (initialFbDraft.pageId) setFbPageId(initialFbDraft.pageId);
    }
  }, [isOpen, initialFbDraft]);

  const handleSubmitForm = async (overrideAnswers?: Record<string, string | string[]>) => {
    if (!formSchema) return;
    setFormSubmitting(true);
    setFormError(null);
    setFormResult(null);
    try {
      const res = await submitGoogleForm(formSchema.formUrl, overrideAnswers || formAnswers);
      setFormResult(res.message || 'Đã gửi phản hồi thành công!');
    } catch (err: any) {
      setFormError(err?.message || 'Gửi form thất bại.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleAiFillForm = async (andSubmit: boolean = false) => {
    if (!formSchema) return;
    setFormAiFilling(true);
    setFormError(null);
    setFormResult(null);
    try {
      const generated = await aiGenerateGoogleFormAnswers(formSchema, formAiHint, language);
      const merged = { ...formAnswers, ...generated };
      setFormAnswers(merged);
      if (andSubmit) {
        await handleSubmitForm(merged);
      } else {
        setFormResult('AI đã điền xong các câu hỏi bên dưới. Bạn có thể xem lại hoặc sửa rồi bấm Gửi Form.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'AI không thể điền Form này.');
    } finally {
      setFormAiFilling(false);
    }
  };

  useEffect(() => {
    const handleFbOAuthMessage = async (event: MessageEvent) => {
      const origin = String(event.origin || '');
      const allowedOrigin =
        origin === window.location.origin ||
        origin.endsWith('.run.app') ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      if (!allowedOrigin) return;

      const payload = event.data;
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'FB_OAUTH_ERROR') {
        setFbAuthLoading(false);
        setFbError(String(payload.error || 'Liên kết Facebook bị hủy hoặc thất bại.'));
        return;
      }

      if (payload.type === 'FB_OAUTH_CLAIM' && typeof payload.claimCode === 'string') {
        setFbAuthLoading(true);
        setFbError(null);
        try {
          const claimed = await claimFacebookOAuthCode(payload.claimCode);
          setFbAccountUser(claimed.user);
          setFbPages(claimed.pages || []);
          setFbPermissions(claimed.permissions || []);
          if (claimed.pages && claimed.pages.length > 0) {
            const firstPage = claimed.pages[0];
            setFbPageId(firstPage.id);
            setFbToken(firstPage.accessToken || claimed.accessToken || '');
          } else if (claimed.accessToken) {
            setFbToken(claimed.accessToken);
            if (claimed.user?.id) setFbPageId(claimed.user.id);
          }
          setFbResult({
            ok: true,
            mode: 'graph_api',
            user: claimed.user,
            pages: claimed.pages,
            note: claimed.note || `Đã liên kết Facebook (${claimed.user.name}).`,
          });
        } catch (err: any) {
          setFbError(err?.message || 'Không hoàn tất được liên kết Facebook.');
        } finally {
          setFbAuthLoading(false);
        }
      }
    };

    window.addEventListener('message', handleFbOAuthMessage);
    return () => window.removeEventListener('message', handleFbOAuthMessage);
  }, []);

  const handleFacebookOAuthLogin = async () => {
    setFbAuthLoading(true);
    setFbError(null);
    setFbResult(null);
    try {
      const { url, error, needsManualToken } = await getFacebookOAuthUrl({
        appId: fbAppId.trim() || undefined,
        appSecret: fbAppSecret.trim() || undefined,
        apiVersion: fbApiVersion.trim() || undefined,
        scope: fbScope.trim() || undefined,
      });
      if (!url) {
        setFbAuthLoading(false);
        if (needsManualToken) {
          setFbParamsOpen(true);
        }
        setFbError(error || 'Chưa có App ID / App Secret Facebook.');
        return;
      }
      const popup = window.open(url, 'fb_oauth_popup', 'width=620,height=720');
      if (!popup) {
        setFbAuthLoading(false);
        setFbError('Trình duyệt đã chặn cửa sổ bật lên. Vui lòng cho phép popup hoặc tự dán Token bên dưới.');
      }
    } catch (err: any) {
      setFbAuthLoading(false);
      setFbError(err?.message || 'Không mở được đăng nhập Facebook.');
    }
  };

  const handleTestCustomLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customLinkUrl.trim()) return;
    setCustomLinkLoading(true);
    setCustomLinkError(null);
    setCustomLinkResult(null);
    try {
      let parsedHeaders: Record<string, string> | undefined;
      if (customLinkHeaders.trim()) {
        try {
          const obj = JSON.parse(customLinkHeaders);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            parsedHeaders = obj;
          } else {
            throw new Error('Headers phải là JSON object.');
          }
        } catch (err: any) {
          throw new Error(err?.message || 'Headers JSON không hợp lệ.');
        }
      }
      const res = await testCustomLinkEndpoint({
        url: customLinkUrl.trim(),
        method: customLinkMethod,
        headers: parsedHeaders,
        bearerToken: customLinkToken.trim() || undefined,
        body: customLinkMethod !== 'GET' ? customLinkBody.trim() || undefined : undefined,
      });
      setCustomLinkResult(res);
    } catch (err: any) {
      setCustomLinkError(err?.message || 'Không gọi được endpoint đã nhập.');
    } finally {
      setCustomLinkLoading(false);
    }
  };

  const handleFacebookDisconnect = () => {
    setFbToken('');
    setFbAppSecret('');
    setFbPageId('');
    setFbAppId('');
    setFbMessage('');
    setFbLink('');
    setFbAccountUser(null);
    setFbPages([]);
    setFbPermissions([]);
    setFbResult(null);
    setFbError(null);
    clearLocalFacebookLink();
  };

  const handleInspectFacebookToken = async () => {
    if (!fbToken.trim()) {
      setFbError('Vui lòng dán Access Token của bạn vào ô Token trước khi quét.');
      setFbTokenFinderOpen(true);
      return;
    }
    setFbLoading(true);
    setFbError(null);
    setFbResult(null);
    try {
      const res = await callFacebookMcp('inspect_token', {}, fbToken);
      if (res.user) setFbAccountUser(res.user);
      if (Array.isArray(res.pages)) {
        setFbPages(res.pages);
        if (res.pages.length === 1) {
          setFbPageId(res.pages[0].id);
          if (res.pages[0].accessToken) setFbToken(res.pages[0].accessToken);
        }
      }
      if (Array.isArray(res.permissions)) setFbPermissions(res.permissions);
      setFbResult(res);
    } catch (err: any) {
      setFbError(err?.message || 'Token không hợp lệ hoặc đã hết hạn.');
    } finally {
      setFbLoading(false);
    }
  };

  const handleSelectFacebookPage = (page: FacebookPageSummary) => {
    setFbPageId(page.id);
    if (page.accessToken) {
      setFbToken(page.accessToken);
    }
    setFbError(null);
    setFbResult({
      ok: true,
      mode: 'graph_api',
      pageId: page.id,
      page,
      data: page,
      note: `Đã chọn Page "${page.name}" (ID: ${page.id})${page.accessToken ? ' và tự điền Page Access Token.' : '.'}`,
    });
  };

  const handleLookupFacebookPage = async () => {
    const q = fbPageLookupInput.trim();
    if (!q) return;
    setFbLoading(true);
    setFbError(null);
    try {
      const res = await callFacebookMcp('lookup_page', { query: q }, fbToken || undefined);
      if (res.page?.id) {
        setFbPageId(res.page.id);
      }
      setFbResult(res);
    } catch (err: any) {
      setFbError(err?.message || 'Không tìm thấy Facebook Page.');
    } finally {
      setFbLoading(false);
    }
  };

  const handleSearchTokenGuide = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = fbTokenHelpQuery.trim() || 'cách lấy Facebook Page Access Token Graph API Explorer';
    setFbTokenHelpLoading(true);
    setFbTokenHelpResult(null);
    try {
      const res = await callMcpHubTool('google_search', { query: q });
      setFbTokenHelpResult(res?.answer || 'Không tìm thấy kết quả.');
    } catch (err: any) {
      setFbTokenHelpResult(err?.message || 'Lỗi tra cứu hướng dẫn.');
    } finally {
      setFbTokenHelpLoading(false);
    }
  };

  const handleFacebookAction = async (action: 'build_share_post' | 'publish_page_post' | 'get_page_info') => {
    setFbLoading(true);
    setFbError(null);
    setFbResult(null);
    try {
      const res = await callFacebookMcp(
        action,
        { message: fbMessage, link: fbLink, pageId: fbPageId || undefined },
        fbToken || undefined
      );
      setFbResult(res);
    } catch (err: any) {
      setFbError(err?.message || 'Lỗi xử lý liên kết Facebook.');
    } finally {
      setFbLoading(false);
    }
  };

  const handleGoogleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleSearchQ.trim()) return;
    setGoogleSearchLoading(true);
    try {
      const res = await callMcpHubTool('google_search', { query: googleSearchQ.trim() });
      setGoogleSearchRes(res);
    } catch (err: any) {
      setGoogleSearchRes({ answer: err?.message || 'Lỗi tìm kiếm' });
    } finally {
      setGoogleSearchLoading(false);
    }
  };

  if (!isOpen) return null;

  const canRenderIframe =
    webReport &&
    isSafeHttpUrlClient(webReport.finalUrl) &&
    webReport.embeddable &&
    (webReport.safeLevel !== 'dangerous' || allowRiskyPreview);

  return (
    <div className="fixed inset-0 z-[120] bg-black/75 flex items-center justify-center p-2 sm:p-5">
      <div
        className={`w-full max-w-5xl h-[92dvh] sm:h-[86vh] flex flex-col border shadow-2xl overflow-hidden ${
          isPixel
            ? 'rounded-none border-2 border-emerald-400 bg-[#18181b] text-emerald-300'
            : isLight
            ? 'rounded-2xl border-zinc-200 bg-white text-zinc-900'
            : 'rounded-2xl border-white/10 bg-zinc-950 text-zinc-100'
        }`}
      >
        {/* Minimalist Header & Tabs */}
        <div
          className={`flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b ${
            isLight ? 'border-zinc-200 bg-zinc-50/70' : 'border-white/10 bg-white/[0.02]'
          }`}
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {[
              { id: 'web' as McpPortalTab, label: 'Mở & Quét Web', icon: Globe },
              { id: 'form' as McpPortalTab, label: 'Google Form', icon: FileSpreadsheet },
              { id: 'hub' as McpPortalTab, label: 'Liên kết (Google / Facebook)', icon: Share2 },
              { id: 'debug' as McpPortalTab, label: 'Debug MCP', icon: Activity },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors shrink-0 ${
                    isPixel ? 'rounded-none' : 'rounded-lg'
                  } ${
                    active
                      ? isLight
                        ? 'bg-zinc-900 text-white'
                        : 'bg-white text-zinc-950'
                      : isLight
                      ? 'text-zinc-600 hover:bg-zinc-200/70'
                      : 'text-zinc-400 hover:bg-white/10 hover:text-zinc-100'
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-zinc-500/15 transition-colors"
            title="Đóng"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: SAFE WEB VIEWER + AUTO SECURITY SCANNER */}
          {activeTab === 'web' && (
            <div className="flex flex-col h-full gap-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleScanAndOpenWeb();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  placeholder="Nhập URL website để tự động quét an toàn và mở xem (VD: https://example.com)..."
                  className={`flex-1 px-3 py-2 text-xs border outline-none ${
                    isPixel ? 'rounded-none' : 'rounded-xl'
                  } ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                      : 'bg-white/5 border-white/10 text-zinc-100'
                  }`}
                />
                <button
                  type="submit"
                  disabled={webScanning}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors shrink-0 ${
                    isPixel ? 'rounded-none' : 'rounded-xl'
                  } ${
                    isLight
                      ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                      : 'bg-white text-zinc-950 hover:bg-zinc-200'
                  } disabled:opacity-50`}
                >
                  {webScanning ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  <span>Quét & Mở</span>
                </button>
              </form>

              {webError && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} />
                  <span>{webError}</span>
                </div>
              )}

              {webReport && (
                <div
                  className={`p-3 rounded-xl border space-y-2 ${
                    webReport.safeLevel === 'safe'
                      ? 'border-emerald-500/30 bg-emerald-500/10'
                      : webReport.safeLevel === 'caution'
                      ? 'border-amber-500/30 bg-amber-500/10'
                      : 'border-red-500/40 bg-red-500/15'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      {webReport.safeLevel === 'safe' ? (
                        <ShieldCheck size={16} className="text-emerald-500" />
                      ) : (
                        <ShieldAlert
                          size={16}
                          className={webReport.safeLevel === 'dangerous' ? 'text-red-500' : 'text-amber-500'}
                        />
                      )}
                      <span>
                        {webReport.safeLevel === 'safe'
                          ? 'Trang web an toàn'
                          : webReport.safeLevel === 'caution'
                          ? 'Cần thận trọng khi truy cập'
                          : 'CẢNH BÁO NGUY HIỂM / ĐỘC HẠI'}
                      </span>
                      <span className="font-mono text-[11px] opacity-80">
                        ({webReport.score}/100)
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px]">
                      {webReport.embeddable && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!snapshotData) {
                              const snap = await fetchWebsiteSnapshot(webReport.finalUrl);
                              setSnapshotData(snap);
                            }
                            setSnapshotMode((v) => !v);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-current/20 hover:bg-white/10 transition-colors"
                        >
                          {snapshotMode ? 'Chế độ trình duyệt' : 'Chế độ đọc sạch'}
                        </button>
                      )}
                      {isSafeHttpUrlClient(webReport.finalUrl) && (
                        <a
                          href={webReport.finalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-current/20 hover:bg-white/10"
                        >
                          <span>Tab mới</span>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </div>

                  {webReport.warnings.length > 0 && (
                    <ul className="text-xs space-y-1 pl-5 list-disc opacity-90">
                      {webReport.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}

                  {webReport.safeLevel === 'dangerous' && !allowRiskyPreview && (
                    <div className="pt-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-red-400">
                        Hệ thống đã tạm chặn tự động mở trang này để bảo vệ bạn.
                      </span>
                      <button
                        type="button"
                        onClick={() => setAllowRiskyPreview(true)}
                        className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium shrink-0"
                      >
                        Vẫn tiếp tục mở
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Content area: Iframe or Safe Reader Snapshot */}
              {snapshotMode && snapshotData ? (
                <div
                  className={`flex-1 rounded-xl border p-4 overflow-y-auto space-y-3 ${
                    isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="text-sm font-semibold">{snapshotData.title || webReport?.hostname}</div>
                  {webReport?.embedReason && (
                    <div className="text-[11px] opacity-65">{webReport.embedReason}</div>
                  )}
                  <p className="text-xs leading-relaxed whitespace-pre-wrap opacity-90">
                    {snapshotData.textContent || 'Không trích xuất được văn bản từ trang này.'}
                  </p>
                </div>
              ) : canRenderIframe ? (
                <iframe
                  title={webReport.title || webReport.hostname}
                  src={webReport.finalUrl}
                  sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                  referrerPolicy="no-referrer"
                  className="flex-1 w-full min-h-[380px] rounded-xl border border-zinc-500/20 bg-white"
                />
              ) : !webReport && !webScanning ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-65 text-xs space-y-2">
                  <ShieldCheck size={28} />
                  <p>
                    Dán bất kỳ liên kết nào để tự động kiểm tra mã độc, lừa đảo, nội dung không phù hợp trước khi hiển thị.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 2: GOOGLE FORM INSPECTOR & AUTO-FILL */}
          {activeTab === 'form' && (
            <div className="space-y-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleInspectForm();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="Dán link Google Form (docs.google.com/forms/... hoặc forms.gle/...)"
                  className={`flex-1 px-3 py-2 text-xs border outline-none ${
                    isPixel ? 'rounded-none' : 'rounded-xl'
                  } ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                      : 'bg-white/5 border-white/10 text-zinc-100'
                  }`}
                />
                <button
                  type="submit"
                  disabled={formLoading}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium shrink-0 ${
                    isPixel ? 'rounded-none' : 'rounded-xl'
                  } ${
                    isLight
                      ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                      : 'bg-white text-zinc-950 hover:bg-zinc-200'
                  } disabled:opacity-50`}
                >
                  {formLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  <span>Đọc Form</span>
                </button>
              </form>

              {formError && (
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs">
                  {formError}
                </div>
              )}

              {formResult && (
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>{formResult}</span>
                </div>
              )}

              {formSchema && (
                <div className="space-y-3">
                  <div
                    className={`p-3.5 rounded-xl border space-y-3 ${
                      isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">{formSchema.title}</h3>
                        {formSchema.description && (
                          <p className="text-xs opacity-75 mt-1">{formSchema.description}</p>
                        )}
                      </div>

                      {/* Manual vs AI Fill Switch */}
                      <div
                        className={`inline-flex p-0.5 rounded-lg border text-[11px] shrink-0 ${
                          isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-black/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setFormFillMode('manual')}
                          className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                            formFillMode === 'manual'
                              ? isLight
                                ? 'bg-zinc-900 text-white'
                                : 'bg-white text-zinc-950'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          Tự điền
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormFillMode('ai')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                            formFillMode === 'ai'
                              ? isLight
                                ? 'bg-zinc-900 text-white'
                                : 'bg-white text-zinc-950'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          <SlidersHorizontal size={11} />
                          <span>AI điền giúp</span>
                        </button>
                      </div>
                    </div>

                    {formFillMode === 'ai' && (
                      <div className="pt-2 border-t border-current/10 flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={formAiHint}
                          onChange={(e) => setFormAiHint(e.target.value)}
                          placeholder="Gợi ý cho AI (VD: Họ tên, lớp, chọn phương án đồng ý... hoặc để trống)"
                          className={`flex-1 px-3 py-1.5 text-xs border rounded-lg outline-none ${
                            isLight
                              ? 'bg-white border-zinc-200 text-zinc-900'
                              : 'bg-white/5 border-white/10 text-zinc-100'
                          }`}
                        />
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={formAiFilling || formSubmitting}
                            onClick={() => void handleAiFillForm(false)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${
                              isLight
                                ? 'border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-900'
                                : 'border-white/15 bg-white/5 hover:bg-white/10 text-zinc-100'
                            } disabled:opacity-50`}
                          >
                            {formAiFilling ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            <span>AI tự điền</span>
                          </button>
                          <button
                            type="button"
                            disabled={formAiFilling || formSubmitting}
                            onClick={() => void handleAiFillForm(true)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg ${
                              isLight
                                ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                                : 'bg-white text-zinc-950 hover:bg-zinc-200'
                            } disabled:opacity-50`}
                          >
                            <Send size={12} />
                            <span>AI điền & Gửi</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {formSchema.fields.map((field) => {
                      const val = formAnswers[field.entryId];
                      return (
                        <div
                          key={field.entryId}
                          className={`p-3.5 rounded-xl border space-y-2 ${
                            isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.02]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-medium">
                              {field.label}
                              {field.required && <span className="text-red-500 ml-1">*</span>}
                            </label>
                            <span className="text-[10px] font-mono opacity-50">{field.entryId}</span>
                          </div>

                          {field.options.length > 0 && field.type === 'checkboxes' ? (
                            <div className="flex flex-wrap gap-2">
                              {field.options.map((opt) => {
                                const arr = Array.isArray(val) ? val : [];
                                const checked = arr.includes(opt);
                                return (
                                  <label
                                    key={opt}
                                    className="inline-flex items-center gap-1.5 text-xs cursor-pointer px-2.5 py-1 rounded-lg border border-current/15"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) => {
                                        const next = e.target.checked
                                          ? [...arr, opt]
                                          : arr.filter((x) => x !== opt);
                                        setFormAnswers((prev) => ({ ...prev, [field.entryId]: next }));
                                      }}
                                    />
                                    <span>{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : field.options.length > 0 ? (
                            <select
                              value={typeof val === 'string' ? val : ''}
                              onChange={(e) =>
                                setFormAnswers((prev) => ({ ...prev, [field.entryId]: e.target.value }))
                              }
                              className={`w-full px-3 py-2 text-xs border rounded-lg outline-none ${
                                isLight
                                  ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                                  : 'bg-zinc-900 border-white/10 text-zinc-100'
                              }`}
                            >
                              <option value="">-- Chọn đáp án --</option>
                              {field.options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : field.type === 'paragraph' ? (
                            <textarea
                              rows={3}
                              value={typeof val === 'string' ? val : ''}
                              onChange={(e) =>
                                setFormAnswers((prev) => ({ ...prev, [field.entryId]: e.target.value }))
                              }
                              placeholder="Nhập câu trả lời..."
                              className={`w-full px-3 py-2 text-xs border rounded-lg outline-none ${
                                isLight
                                  ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                                  : 'bg-white/5 border-white/10 text-zinc-100'
                              }`}
                            />
                          ) : (
                            <input
                              type="text"
                              value={typeof val === 'string' ? val : ''}
                              onChange={(e) =>
                                setFormAnswers((prev) => ({ ...prev, [field.entryId]: e.target.value }))
                              }
                              placeholder="Nhập câu trả lời..."
                              className={`w-full px-3 py-2 text-xs border rounded-lg outline-none ${
                                isLight
                                  ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                                  : 'bg-white/5 border-white/10 text-zinc-100'
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] opacity-65">
                      {formFillMode === 'manual'
                        ? 'Bạn đang tự điền — kiểm tra kỹ rồi bấm Gửi Form.'
                        : 'Bạn vẫn có thể sửa bất kỳ ô nào trước khi bấm Gửi Form.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleSubmitForm()}
                      disabled={formSubmitting || formAiFilling}
                      className={`flex items-center gap-2 px-4 py-2 text-xs font-medium ${
                        isPixel ? 'rounded-none' : 'rounded-xl'
                      } ${
                        isLight
                          ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                          : 'bg-white text-zinc-950 hover:bg-zinc-200'
                      } disabled:opacity-50`}
                    >
                      {formSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      <span>Gửi Form</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIÊN KẾT (GOOGLE, FACEBOOK, TOOLS) */}
          {activeTab === 'hub' && (
            <div className="space-y-4">
              {/* 1. Google Account Link */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link2 size={14} className="text-red-400" />
                    <span className="text-xs font-semibold">Google</span>
                  </div>
                  {googleUser ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                      Đã liên kết
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-60">Chưa liên kết</span>
                  )}
                </div>

                {googleUser ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {googleUser.photoURL && (
                          <img src={googleUser.photoURL} alt="" className="w-7 h-7 rounded-full shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">
                            {googleUser.displayName || googleUser.email || 'Tài khoản Google'}
                          </div>
                          {googleUser.email && (
                            <div className="text-[10px] opacity-60 truncate">
                              {googleUser.email} • Đã lưu trên thiết bị (Local)
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onGoogleSignOut && (
                          <button
                            type="button"
                            onClick={onGoogleSignOut}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10"
                            title="Ngắt liên kết Google"
                          >
                            <LogOut size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    {googleError && <div className="text-[11px] text-red-400">{googleError}</div>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] opacity-75">
                      Đăng nhập Google để liên kết tài khoản cá nhân và đồng bộ kho thư mục local trên thiết bị.
                    </p>
                    {onGoogleSignIn && (
                      <button
                        type="button"
                        onClick={onGoogleSignIn}
                        disabled={googleAuthLoading}
                        className="gsi-material-button max-w-xs"
                      >
                        <div className="gsi-material-button-content-wrapper">
                          <div className="gsi-material-button-icon">
                            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                              <path fill="none" d="M0 0h48v48H0z" />
                            </svg>
                          </div>
                          <span>{googleAuthLoading ? 'Đang liên kết...' : 'Sign in with Google'}</span>
                        </div>
                      </button>
                    )}
                    {googleError && <div className="text-[11px] text-red-400">{googleError}</div>}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-500/15 flex gap-1.5">
                  <input
                    type="text"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="Link Google Form mặc định..."
                    className={`flex-1 px-2.5 py-1.5 text-xs border rounded-lg outline-none ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        : 'bg-white/5 border-white/10 text-zinc-100'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (formUrl.trim()) {
                        setActiveTab('form');
                        void handleInspectForm(formUrl);
                      }
                    }}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border shrink-0 whitespace-nowrap ${
                      isLight
                        ? 'border-zinc-300 hover:bg-zinc-100'
                        : 'border-white/15 hover:bg-white/10'
                    }`}
                  >
                    Mở Form
                  </button>
                </div>
              </div>

              {/* 2. Facebook Connection & Self-Search Token */}
              <div
                className={`p-4 rounded-xl border space-y-3 ${
                  isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Share2 size={14} className="text-blue-400" />
                    <span className="text-xs font-semibold">Facebook — Liên kết & Tự tìm Token</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(fbAccountUser || fbResult?.data?.name || fbPageId.trim()) ? (
                      <>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                          {fbResult?.data?.name || fbAccountUser?.name || `Page ${fbPageId}`}
                          {!fbToken.trim() && fbAccountUser ? ' (Local)' : ''}
                        </span>
                        <button
                          type="button"
                          onClick={handleFacebookDisconnect}
                          className="p-1 rounded-lg text-red-400 hover:bg-red-500/10"
                          title="Ngắt liên kết Facebook"
                        >
                          <LogOut size={13} />
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] opacity-60">Chưa liên kết</span>
                    )}
                  </div>
                </div>

                {/* Quick Link Actions: OAuth Popup OR Self-Search Token */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={fbAuthLoading}
                    onClick={() => void handleFacebookOAuthLogin()}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      fbOAuthConfigured === false
                        ? isLight
                          ? 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                          : 'border border-white/15 text-zinc-200 hover:bg-white/10'
                        : 'bg-[#1877F2] text-white hover:bg-[#166FE5]'
                    } disabled:opacity-50`}
                  >
                    {fbAuthLoading ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
                    <span>{fbAuthLoading ? 'Đang kết nối...' : 'Đăng nhập Facebook'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFbParamsOpen((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isLight
                        ? 'border-zinc-300 hover:bg-zinc-100 text-zinc-800'
                        : 'border-white/15 hover:bg-white/10 text-zinc-200'
                    }`}
                  >
                    <SlidersHorizontal size={13} />
                    <span>Thông số cấu hình</span>
                    {fbParamsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFbTokenFinderOpen((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      isLight
                        ? 'border-zinc-300 hover:bg-zinc-100 text-zinc-800'
                        : 'border-white/15 hover:bg-white/10 text-zinc-200'
                    }`}
                  >
                    <KeyRound size={13} />
                    <span>Tự tìm Token & Page ID</span>
                    {fbTokenFinderOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border transition-colors ${
                      isLight
                        ? 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                        : 'border-white/10 text-zinc-300 hover:bg-white/5'
                    }`}
                  >
                    <span>Lấy Token trên Meta</span>
                    <ExternalLink size={11} />
                  </a>
                </div>

                {/* User-supplied Facebook App Parameters */}
                {fbParamsOpen && (
                  <div
                    className={`p-3 rounded-xl border space-y-2.5 text-xs ${
                      isLight ? 'border-zinc-200 bg-zinc-50/80' : 'border-white/10 bg-black/25'
                    }`}
                  >
                    <div className="text-[11px] font-medium opacity-80">
                      Tự nhập thông số Meta App để dùng nút Đăng nhập Facebook (chỉ giữ trong RAM phiên hiện tại)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={fbAppId}
                        onChange={(e) => setFbAppId(e.target.value)}
                        placeholder="Facebook App ID (bỏ trống nếu dùng cấu hình server)"
                        className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                          isLight
                            ? 'bg-white border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                      <input
                        type="password"
                        value={fbAppSecret}
                        onChange={(e) => setFbAppSecret(e.target.value)}
                        placeholder="Facebook App Secret (RAM)"
                        className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                          isLight
                            ? 'bg-white border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                      <input
                        type="text"
                        value={fbScope}
                        onChange={(e) => setFbScope(e.target.value)}
                        placeholder="OAuth Scope (phân cách bằng dấu phẩy)"
                        className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                          isLight
                            ? 'bg-white border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                      <input
                        type="text"
                        value={fbApiVersion}
                        onChange={(e) => setFbApiVersion(e.target.value)}
                        placeholder="Graph Version (vd: v21.0)"
                        className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                          isLight
                            ? 'bg-white border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                    </div>
                    <div className="text-[10px] opacity-65 font-mono break-all">
                      Redirect URI: {typeof window !== 'undefined' ? `${window.location.origin}/api/auth/facebook/callback` : '/api/auth/facebook/callback'}
                    </div>
                  </div>
                )}

                {/* Self-Search Token & Page Finder Drawer */}
                {fbTokenFinderOpen && (
                  <div
                    className={`p-3 rounded-xl border space-y-3 text-xs ${
                      isLight ? 'border-zinc-200 bg-zinc-50/80' : 'border-white/10 bg-black/25'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-[11px] opacity-85">
                        1. Tự lấy Token từ Meta Graph API Explorer (chỉ giữ trong RAM, không lưu ổ cứng)
                      </div>
                      <div className="text-[11px] opacity-65 leading-relaxed">
                        Mở{' '}
                        <a
                          href="https://developers.facebook.com/tools/explorer/"
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-medium"
                        >
                          Graph API Explorer
                        </a>
                        {' '}→ chọn App → <b>Get Token</b> → <b>Get Page Access Token</b> (bật{' '}
                        <code>pages_show_list</code>, <code>pages_manage_posts</code>) → copy dán vào ô Token bên dưới rồi bấm{' '}
                        <b>Quét Page từ Token</b>.{' '}
                        <a
                          href="https://developers.facebook.com/tools/debug/accesstoken/"
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Debug Token
                        </a>
                      </div>
                    </div>

                    {/* Lookup Page ID by URL / username */}
                    <div className="space-y-1.5">
                      <div className="font-medium text-[11px] opacity-85">
                        2. Tìm Page ID từ link hoặc tên @username Facebook
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={fbPageLookupInput}
                          onChange={(e) => setFbPageLookupInput(e.target.value)}
                          placeholder="Ví dụ: https://facebook.com/tenpage hoặc @tenpage"
                          className={`flex-1 px-3 py-1.5 text-xs border rounded-lg outline-none ${
                            isLight
                              ? 'bg-white border-zinc-200 text-zinc-900'
                              : 'bg-white/5 border-white/10 text-zinc-100'
                          }`}
                        />
                        <button
                          type="button"
                          disabled={fbLoading}
                          onClick={() => void handleLookupFacebookPage()}
                          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border ${
                            isLight
                              ? 'border-zinc-300 bg-white hover:bg-zinc-100'
                              : 'border-white/15 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <Search size={12} />
                          <span>Tìm Page ID</span>
                        </button>
                      </div>
                    </div>

                    {/* Search guides / token help via Google Search */}
                    <form onSubmit={handleSearchTokenGuide} className="space-y-1.5">
                      <div className="font-medium text-[11px] opacity-85">
                        3. Tra cứu nhanh cách lấy Token / sửa lỗi quyền Facebook
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={fbTokenHelpQuery}
                          onChange={(e) => setFbTokenHelpQuery(e.target.value)}
                          placeholder="Nhập từ khóa tìm kiếm (mặc định: cách lấy Page Access Token)..."
                          className={`flex-1 px-3 py-1.5 text-xs border rounded-lg outline-none ${
                            isLight
                              ? 'bg-white border-zinc-200 text-zinc-900'
                              : 'bg-white/5 border-white/10 text-zinc-100'
                          }`}
                        />
                        <button
                          type="submit"
                          disabled={fbTokenHelpLoading}
                          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg ${
                            isLight
                              ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                              : 'bg-white text-zinc-950 hover:bg-zinc-200'
                          }`}
                        >
                          {fbTokenHelpLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                          <span>Tìm hướng dẫn</span>
                        </button>
                      </div>
                    </form>

                    {fbTokenHelpResult && (
                      <div
                        className={`p-2.5 rounded-lg border text-[11px] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto ${
                          isLight ? 'bg-white border-zinc-200 text-zinc-800' : 'bg-black/30 border-white/10 text-zinc-200'
                        }`}
                      >
                        {fbTokenHelpResult}
                      </div>
                    )}
                  </div>
                )}

                {/* Connected account + searchable Page selector */}
                {(fbAccountUser || fbPages.length > 0) && (
                  <div
                    className={`p-3 rounded-xl border space-y-2 ${
                      isLight ? 'border-zinc-200 bg-zinc-50/60' : 'border-white/10 bg-white/[0.02]'
                    }`}
                  >
                    {fbAccountUser && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {fbAccountUser.picture && (
                            <img src={fbAccountUser.picture} alt="" className="w-6 h-6 rounded-full shrink-0" />
                          )}
                          <span className="text-xs font-medium truncate">
                            {fbAccountUser.name} ({fbAccountUser.id})
                          </span>
                        </div>
                        {fbPermissions.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {fbPermissions
                              .filter((p) => p.status === 'granted')
                              .slice(0, 4)
                              .map((p) => (
                                <span
                                  key={p.permission}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono"
                                >
                                  {p.permission}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {fbPages.length > 0 && (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={fbPageFilter}
                          onChange={(e) => setFbPageFilter(e.target.value)}
                          placeholder={`Lọc trong ${fbPages.length} Facebook Page của bạn...`}
                          className={`w-full px-2.5 py-1 text-[11px] border rounded-lg outline-none ${
                            isLight
                              ? 'bg-white border-zinc-200 text-zinc-900'
                              : 'bg-black/25 border-white/10 text-zinc-100'
                          }`}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                          {fbPages
                            .filter((p) => {
                              const q = fbPageFilter.trim().toLowerCase();
                              if (!q) return true;
                              return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
                            })
                            .map((page) => {
                              const selected = fbPageId === page.id;
                              return (
                                <button
                                  key={page.id}
                                  type="button"
                                  onClick={() => handleSelectFacebookPage(page)}
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-colors ${
                                    selected
                                      ? isLight
                                        ? 'border-zinc-900 bg-zinc-900 text-white'
                                        : 'border-white bg-white text-zinc-950'
                                      : isLight
                                      ? 'border-zinc-200 hover:bg-white'
                                      : 'border-white/10 hover:bg-white/10'
                                  }`}
                                >
                                  {page.picture && (
                                    <img src={page.picture} alt="" className="w-5 h-5 rounded-full shrink-0" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium truncate">{page.name}</div>
                                    <div className="text-[10px] opacity-65 font-mono truncate">{page.id}</div>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <textarea
                  rows={3}
                  value={fbMessage}
                  onChange={(e) => setFbMessage(e.target.value)}
                  placeholder="Nội dung bài viết Facebook..."
                  className={`w-full px-3 py-2 text-xs border rounded-lg outline-none ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                      : 'bg-white/5 border-white/10 text-zinc-100'
                  }`}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={fbLink}
                    onChange={(e) => setFbLink(e.target.value)}
                    placeholder="Link đính kèm (tùy chọn)"
                    className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        : 'bg-white/5 border-white/10 text-zinc-100'
                    }`}
                  />
                  <input
                    type="text"
                    value={fbPageId}
                    onChange={(e) => setFbPageId(e.target.value)}
                    placeholder="Facebook Page ID"
                    className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        : 'bg-white/5 border-white/10 text-zinc-100'
                    }`}
                  />
                  <input
                    type="password"
                    value={fbToken}
                    onChange={(e) => setFbToken(e.target.value)}
                    placeholder="User hoặc Page Token (chỉ giữ trong RAM)"
                    className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        : 'bg-white/5 border-white/10 text-zinc-100'
                    }`}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={fbLoading}
                    onClick={() => void handleInspectFacebookToken()}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      isLight
                        ? 'border-zinc-300 hover:bg-zinc-100'
                        : 'border-white/15 hover:bg-white/10'
                    }`}
                  >
                    Quét Page từ Token
                  </button>
                  <button
                    type="button"
                    disabled={fbLoading}
                    onClick={() => handleFacebookAction('get_page_info')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      isLight
                        ? 'border-zinc-300 hover:bg-zinc-100'
                        : 'border-white/15 hover:bg-white/10'
                    }`}
                  >
                    Kiểm tra Page
                  </button>
                  <button
                    type="button"
                    disabled={fbLoading}
                    onClick={() => handleFacebookAction('build_share_post')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      isLight
                        ? 'border-zinc-300 hover:bg-zinc-100'
                        : 'border-white/15 hover:bg-white/10'
                    }`}
                  >
                    Tạo link Chia sẻ
                  </button>
                  <button
                    type="button"
                    disabled={fbLoading}
                    onClick={() => handleFacebookAction('publish_page_post')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                      isLight
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                        : 'bg-white text-zinc-950 hover:bg-zinc-200'
                    }`}
                  >
                    {fbLoading ? 'Đang gửi...' : 'Đăng lên Facebook Page'}
                  </button>
                </div>

                {fbError && <div className="text-xs text-red-400">{fbError}</div>}

                {fbResult && (
                  <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs space-y-1.5">
                    <div>
                      {fbResult.note ||
                        (fbResult.data?.name
                          ? `Đã liên kết Page: ${fbResult.data.name} (ID: ${fbResult.data.id || fbResult.pageId})`
                          : 'Đã xử lý liên kết Facebook thành công.')}
                    </div>
                    {fbResult.shareUrl && isSafeHttpUrlClient(fbResult.shareUrl) && (
                      <a
                        href={fbResult.shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 underline font-medium"
                      >
                        <span>Mở hộp thoại đăng bài Facebook</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                    {fbResult.postId && (
                      <div className="font-mono text-[11px]">Post ID: {fbResult.postId}</div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Google Search */}
              <div
                className={`p-4 rounded-xl border space-y-2.5 ${
                  isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <div className="text-xs font-semibold">Google Search</div>
                <form onSubmit={handleGoogleSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={googleSearchQ}
                    onChange={(e) => setGoogleSearchQ(e.target.value)}
                    placeholder="Tra cứu nhanh qua Google Search..."
                    className={`flex-1 px-3 py-1.5 text-xs border rounded-lg outline-none ${
                      isLight
                        ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                        : 'bg-white/5 border-white/10 text-zinc-100'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={googleSearchLoading}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                      isLight
                        ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                        : 'bg-white text-zinc-950 hover:bg-zinc-200'
                    }`}
                  >
                    {googleSearchLoading ? 'Đang tìm...' : 'Tìm'}
                  </button>
                </form>
                {googleSearchRes && (
                  <div className="text-xs leading-relaxed whitespace-pre-wrap opacity-90 pt-1">
                    {googleSearchRes.answer}
                  </div>
                )}
              </div>

              {/* 4. Custom API / Webhook Connector */}
              <div
                className={`p-4 rounded-xl border space-y-2.5 ${
                  isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCustomLinkOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-xs font-semibold"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal size={14} className="text-emerald-400" />
                    <span>Liên kết tùy chỉnh (tự nhập Endpoint / Token / Thông số)</span>
                  </div>
                  {customLinkOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {customLinkOpen && (
                  <form onSubmit={handleTestCustomLink} className="space-y-2.5 pt-1">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={customLinkMethod}
                        onChange={(e) => setCustomLinkMethod(e.target.value as any)}
                        className={`px-2.5 py-1.5 text-xs border rounded-lg outline-none ${
                          isLight
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                            : 'bg-zinc-900 border-white/10 text-zinc-100'
                        }`}
                      >
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                      <input
                        type="url"
                        value={customLinkUrl}
                        onChange={(e) => setCustomLinkUrl(e.target.value)}
                        placeholder="https://api.example.com/endpoint..."
                        className={`flex-1 px-3 py-1.5 text-xs border rounded-lg outline-none ${
                          isLight
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="password"
                        value={customLinkToken}
                        onChange={(e) => setCustomLinkToken(e.target.value)}
                        placeholder="Bearer Token / API Key (RAM)"
                        className={`px-3 py-1.5 text-xs border rounded-lg outline-none ${
                          isLight
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                      <input
                        type="text"
                        value={customLinkHeaders}
                        onChange={(e) => setCustomLinkHeaders(e.target.value)}
                        placeholder='Headers JSON (vd: {"X-Custom":"1"})'
                        className={`px-3 py-1.5 text-xs font-mono border rounded-lg outline-none ${
                          isLight
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                    </div>

                    {customLinkMethod !== 'GET' && (
                      <textarea
                        rows={2}
                        value={customLinkBody}
                        onChange={(e) => setCustomLinkBody(e.target.value)}
                        placeholder='Body JSON (vd: {"message":"hello"})'
                        className={`w-full px-3 py-1.5 text-xs font-mono border rounded-lg outline-none ${
                          isLight
                            ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                            : 'bg-white/5 border-white/10 text-zinc-100'
                        }`}
                      />
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={customLinkLoading}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                          isLight
                            ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                            : 'bg-white text-zinc-950 hover:bg-zinc-200'
                        }`}
                      >
                        {customLinkLoading ? 'Đang gửi...' : 'Kiểm tra kết nối'}
                      </button>
                    </div>

                    {customLinkError && <div className="text-xs text-red-400">{customLinkError}</div>}
                    {customLinkResult && (
                      <pre
                        className={`p-2.5 rounded-lg border text-[11px] font-mono overflow-x-auto max-h-40 ${
                          isLight ? 'bg-zinc-50 border-zinc-200 text-zinc-800' : 'bg-black/30 border-white/10 text-zinc-200'
                        }`}
                      >
                        {`HTTP ${customLinkResult.status}\n${
                          typeof customLinkResult.data === 'string'
                            ? customLinkResult.data
                            : JSON.stringify(customLinkResult.data, null, 2)
                        }`}
                      </pre>
                    )}
                  </form>
                )}
              </div>

              {/* Active Connector Tools */}
              {hubTools.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {hubTools.map((tool) => (
                    <div
                      key={tool.name}
                      className={`p-2.5 rounded-xl border text-xs ${
                        isLight ? 'border-zinc-200 bg-zinc-50' : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="font-mono font-semibold text-[11px]">{tool.name}</div>
                      <div className="opacity-70 text-[11px] mt-0.5 line-clamp-2">{tool.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LIVE MCP DEBUGGING FEED */}
          {activeTab === 'debug' && (
            <div className="flex flex-col h-full gap-3">
              {/* Top Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      debugPaused
                        ? 'bg-amber-400'
                        : debugConnected
                        ? 'bg-emerald-500'
                        : 'bg-zinc-500'
                    }`}
                  />
                  <span className="font-medium">
                    {debugPaused
                      ? 'Đang tạm dừng feed'
                      : debugConnected
                      ? 'Live stream đang hoạt động'
                      : 'Đang kết nối luồng...'}
                  </span>
                  <span className="text-[11px] font-mono opacity-60">
                    ({debugEvents.filter((e) => e.status === 'active').length} đang chạy / {debugEvents.length} lượt gọi)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDebugPaused((p) => !p)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border ${
                      isLight
                        ? 'border-zinc-300 bg-white hover:bg-zinc-100'
                        : 'border-white/15 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    {debugPaused ? <Play size={12} /> : <Pause size={12} />}
                    <span>{debugPaused ? 'Tiếp tục' : 'Tạm dừng'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void fetchMcpDebugEvents().then(setDebugEvents).catch(() => {});
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border ${
                      isLight
                        ? 'border-zinc-300 bg-white hover:bg-zinc-100'
                        : 'border-white/15 bg-white/5 hover:bg-white/10'
                    }`}
                    title="Làm mới"
                  >
                    <RefreshCw size={12} />
                    <span>Làm mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void clearMcpDebugEvents()
                        .then(() => setDebugEvents([]))
                        .catch(() => {});
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={12} />
                    <span>Xóa log</span>
                  </button>
                </div>
              </div>

              {/* Search + Status Filter */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={debugSearch}
                  onChange={(e) => setDebugSearch(e.target.value)}
                  placeholder="Lọc theo tên tool, endpoint hoặc tham số..."
                  className={`flex-1 px-3 py-1.5 text-xs border outline-none ${
                    isPixel ? 'rounded-none' : 'rounded-xl'
                  } ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                      : 'bg-white/5 border-white/10 text-zinc-100'
                  }`}
                />
                <div className="flex items-center gap-1 shrink-0 overflow-x-auto">
                  {(['all', 'active', 'ok', 'error'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setDebugStatusFilter(st)}
                      className={`px-2.5 py-1.5 text-[11px] font-medium rounded-lg border capitalize ${
                        debugStatusFilter === st
                          ? isLight
                            ? 'bg-zinc-900 text-white border-zinc-900'
                            : 'bg-white text-zinc-950 border-white'
                          : isLight
                          ? 'border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                          : 'border-white/10 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      {st === 'all' ? 'Tất cả' : st === 'active' ? 'Đang chạy' : st === 'ok' ? 'OK' : 'Lỗi'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event List */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                {(() => {
                  const q = debugSearch.trim().toLowerCase();
                  const filtered = debugEvents.filter((evt) => {
                    if (debugStatusFilter !== 'all' && evt.status !== debugStatusFilter) return false;
                    if (!q) return true;
                    return (
                      evt.toolName.toLowerCase().includes(q) ||
                      evt.endpoint.toLowerCase().includes(q) ||
                      JSON.stringify(evt.params || {}).toLowerCase().includes(q)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-xs opacity-60 space-y-1.5">
                        <Activity size={24} className="mx-auto opacity-70" />
                        <p>Chưa có lời gọi MCP nào khớp bộ lọc. Hãy thử quét web, đọc form hoặc phát nhạc để xem luồng dữ liệu live.</p>
                      </div>
                    );
                  }

                  return filtered.map((evt) => {
                    const isExpanded = Boolean(expandedDebugIds[evt.id]) || evt.status === 'active';
                    const timeStr = new Date(evt.timestamp).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });
                    const copyText = JSON.stringify(
                      {
                        toolName: evt.toolName,
                        endpoint: evt.endpoint,
                        method: evt.method,
                        status: evt.status,
                        httpStatus: evt.httpStatus,
                        durationMs: evt.durationMs,
                        params: evt.params,
                        rawResponse: evt.rawResponse,
                        error: evt.error,
                      },
                      null,
                      2
                    );

                    return (
                      <div
                        key={evt.id}
                        className={`rounded-xl border text-xs overflow-hidden ${
                          isLight ? 'border-zinc-200 bg-white' : 'border-white/10 bg-white/[0.02]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDebugIds((prev) => ({ ...prev, [evt.id]: !isExpanded }))
                            }
                            className="flex flex-wrap items-center gap-2 text-left flex-1 min-w-0"
                          >
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold uppercase ${
                                evt.status === 'active'
                                  ? 'bg-amber-500/15 text-amber-400'
                                  : evt.status === 'error'
                                  ? 'bg-red-500/15 text-red-400'
                                  : 'bg-emerald-500/15 text-emerald-400'
                              }`}
                            >
                              {evt.status === 'active'
                                ? 'ACTIVE'
                                : `${evt.httpStatus || 200}`}
                            </span>
                            <span className="font-mono font-semibold truncate">{evt.toolName}</span>
                            <span className="text-[10px] font-mono opacity-60 truncate">
                              {evt.method} {evt.endpoint}
                            </span>
                          </button>

                          <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono opacity-65">
                            {evt.durationMs !== undefined && <span>{evt.durationMs}ms</span>}
                            <span>{timeStr}</span>
                            <button
                              type="button"
                              onClick={() => {
                                void navigator.clipboard.writeText(copyText);
                                setCopiedDebugId(evt.id);
                                setTimeout(() => setCopiedDebugId((cur) => (cur === evt.id ? null : cur)), 1500);
                              }}
                              className="p-1 rounded hover:bg-zinc-500/15"
                              title="Sao chép payload"
                            >
                              {copiedDebugId === evt.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDebugIds((prev) => ({ ...prev, [evt.id]: !isExpanded }))
                              }
                              className="p-1 rounded hover:bg-zinc-500/15"
                            >
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div
                            className={`px-3 pb-3 pt-2 border-t space-y-2 ${
                              isLight ? 'border-zinc-100 bg-zinc-50/70' : 'border-white/5 bg-black/25'
                            }`}
                          >
                            <div>
                              <div className="text-[10px] font-mono uppercase opacity-60 mb-1">Parameters</div>
                              <pre
                                className={`p-2 rounded-lg border text-[11px] font-mono overflow-x-auto max-h-40 ${
                                  isLight
                                    ? 'bg-white border-zinc-200 text-zinc-800'
                                    : 'bg-black/40 border-white/10 text-zinc-200'
                                }`}
                              >
                                {JSON.stringify(evt.params ?? {}, null, 2)}
                              </pre>
                            </div>

                            {evt.error && (
                              <div className="text-[11px] text-red-400 font-mono break-words">
                                Error: {evt.error}
                              </div>
                            )}

                            <div>
                              <div className="text-[10px] font-mono uppercase opacity-60 mb-1">
                                Raw Server Response
                              </div>
                              <pre
                                className={`p-2 rounded-lg border text-[11px] font-mono overflow-x-auto max-h-56 ${
                                  isLight
                                    ? 'bg-white border-zinc-200 text-zinc-800'
                                    : 'bg-black/40 border-white/10 text-zinc-200'
                                }`}
                              >
                                {evt.status === 'active'
                                  ? 'Đang chờ phản hồi từ server...'
                                  : evt.rawResponse !== undefined
                                  ? typeof evt.rawResponse === 'string'
                                    ? evt.rawResponse
                                    : JSON.stringify(evt.rawResponse, null, 2)
                                  : '(empty)'}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


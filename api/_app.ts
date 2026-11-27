import express from "express";
import path from "path";
import fs from "fs/promises";
import crypto from "node:crypto";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  ONE_BILLION_VIEWS,
  analyzeMusicDisambiguation,
  callCustomConnectorEndpoint,
  fetchSafeWebsiteSnapshot,
  fetchYouTubeViewStats,
  inspectFacebookTokenAndPages,
  inspectGoogleForm,
  parseLyricsResponseBlocks,
  resolveMusicUrl,
  runFacebookMcpAction,
  scanWebsiteSafety,
  sortMusicTracksByPopularity,
  submitGoogleForm,
} from "./_mcpTools";
import {
  attachMcpDebugSseClient,
  clearMcpDebugEvents,
  finishMcpDebugCall,
  getMcpDebugEvents,
  startMcpDebugCall,
} from "./_mcpDebug";
import {
  extractTickersFromPrompt,
  fetchTradingMarketContext,
  fetchTradingViewStockSnapshot,
  getTradingQuoteSnapshot,
} from "./_tradingTools";
import { DEFAULT_TCN_WEIGHT_BUNDLE } from "../src/lib/tcnClientEngine";

dotenv.config();

let cachedApp: any = null;

const PRIMARY_FLASH_MODEL = 'gemini-3-flash-preview';

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Không tìm thấy API trên máy chủ. Vui lòng thiết lập biến môi trường .");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const VALID_ACTIVE_FALLBACK_MODELS = [
  'gemini-3-flash-preview',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveModelForTask(requestedModel?: string) {
  const clean = String(requestedModel || '').trim();
  if (
    clean === 'gemini-3-flash-preview' ||
    clean === 'gemini-4-hydrogen' ||
    clean === 'gemini-3.1-flash-lite' ||
    clean === 'gemini-2.5-flash' ||
    clean === 'gemini-2.5-flash-lite'
  ) {
    return clean;
  }
  return PRIMARY_FLASH_MODEL;
}

function buildCombinedAbortSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!externalSignal) return timeoutSignal;
  if (typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any([externalSignal, timeoutSignal]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (externalSignal.aborted || timeoutSignal.aborted) {
    controller.abort();
    return controller.signal;
  }
  externalSignal.addEventListener('abort', onAbort, { once: true });
  timeoutSignal.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}

function isNotFoundModelError(err: any) {
  const msg = String(err?.message || err || '');
  return err?.status === 404 || err?.code === 404 || msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found');
}

function isRetryableOrFallbackError(err: any) {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = Number(err?.status || err?.code || 0);
  return (
    isNotFoundModelError(err) ||
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('aborted') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  );
}

function isTransientHighDemandError(err: any) {
  const msg = String(err?.message || err || '').toLowerCase();
  const status = Number(err?.status || err?.code || 0);
  return (
    status === 503 ||
    status === 502 ||
    status === 504 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  buildParams: (model: string, abortSignal: AbortSignal) => any,
  options?: {
    models?: string[];
    timeoutMs?: number;
    externalSignal?: AbortSignal;
  }
) {
  const candidateModels = Array.from(
    new Set((options?.models && options.models.length > 0 ? options.models : VALID_ACTIVE_FALLBACK_MODELS))
  );
  const timeoutMs = options?.timeoutMs ?? 20000;
  let primaryError: any = null;
  let lastError: any = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    const maxAttempts = i === 0 ? 2 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (options?.externalSignal?.aborted) {
        throw Object.assign(new Error('Request aborted by client'), { name: 'AbortError' });
      }
      if (attempt > 0) {
        await sleep(350 + Math.floor(Math.random() * 250));
      }
      try {
        const signal = buildCombinedAbortSignal(timeoutMs, options?.externalSignal);
        const params = buildParams(model, signal);
        const mergedConfig = {
          ...(params?.config || {}),
          abortSignal: signal,
        };
        return await ai.models.generateContent({
          ...params,
          model,
          config: mergedConfig,
        });
      } catch (err: any) {
        if (!primaryError) primaryError = err;
        lastError = err;
        console.warn(`[AI Fallback] model=${model} attempt=${attempt + 1} status=${err?.status || err?.code || 'ERR'}:`, String(err?.message || err).slice(0, 240));
        if (options?.externalSignal?.aborted) {
          throw err;
        }
        if (attempt + 1 < maxAttempts && isTransientHighDemandError(err)) {
          continue;
        }
        if (!isRetryableOrFallbackError(err)) {
          throw err;
        }
        break;
      }
    }
  }

  throw primaryError || lastError || new Error('Không thể kết nối tới mô hình AI nào.');
}

function formatReadableApiError(err: any): string {
  let raw = String(err?.message || err || 'Lỗi kết nối máy chủ API').trim();
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = JSON.parse(raw);
      const inner = parsed?.error?.message || parsed?.message;
      if (typeof inner === 'string' && inner.trim()) {
        raw = inner.trim();
        continue;
      }
    } catch {
      break;
    }
  }
  if (/high demand|unavailable|503|timed out|timeout/i.test(raw)) {
    return 'Hệ thống AI đang có lượng truy cập cao tạm thời (503). Vui lòng thử gửi lại sau vài giây.';
  }
  if (/quota|resource_exhausted|429/i.test(raw)) {
    return 'Hệ thống AI đang chạm giới hạn lưu lượng tạm thời (429). Vui lòng thử lại sau ít phút.';
  }
  return raw;
}

const INLINE_MEDIA_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MULTIMODAL_MIME_PREFIXES = ['image/', 'audio/', 'video/', 'application/pdf'];

function normalizeServerMediaMime(rawMime?: string): string {
  const clean = String(rawMime || '').split(';')[0].trim().toLowerCase();
  if (clean === 'audio/mp3' || clean === 'audio/x-mp3' || clean === 'audio/mpeg3' || clean === 'audio/x-mpeg') return 'audio/mpeg';
  if (clean === 'audio/x-wav' || clean === 'audio/wave') return 'audio/wav';
  if (clean === 'audio/x-m4a' || clean === 'audio/m4a') return 'audio/mp4';
  if (clean === 'video/x-mp4' || clean === 'application/mp4') return 'video/mp4';
  if (clean === 'image/jpg') return 'image/jpeg';
  return clean;
}

async function prepareContentsForGeminiMedia(ai: GoogleGenAI, rawContents: any): Promise<{
  contents: any;
  hasAudioOrVideo: boolean;
  cleanup: () => Promise<void>;
}> {
  const uploadedFileNames: string[] = [];
  let hasAudioOrVideo = false;

  if (!Array.isArray(rawContents)) {
    return {
      contents: rawContents,
      hasAudioOrVideo: false,
      cleanup: async () => {},
    };
  }

  const nextContents = await Promise.all(
    rawContents.map(async (turn: any) => {
      if (!turn || !Array.isArray(turn.parts)) return turn;
      const nextParts = await Promise.all(
        turn.parts.map(async (part: any) => {
          if (!part?.inlineData?.data) return part;
          const mimeType = normalizeServerMediaMime(part.inlineData.mimeType);
          const isAllowed = ALLOWED_MULTIMODAL_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
          if (!isAllowed) {
            throw Object.assign(new Error(`Định dạng tệp "${mimeType || 'unknown'}" không được hỗ trợ phân tích đa phương thức.`), {
              status: 400,
            });
          }

          if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) {
            hasAudioOrVideo = true;
          }

          const approxDecodedBytes = Math.floor((part.inlineData.data.length * 3) / 4);
          if (approxDecodedBytes <= INLINE_MEDIA_UPLOAD_THRESHOLD_BYTES) {
            return {
              ...part,
              inlineData: {
                ...part.inlineData,
                mimeType,
              },
            };
          }

          const buffer = Buffer.from(part.inlineData.data, 'base64');
          const blob = new Blob([buffer], { type: mimeType });
          const uploaded = await ai.files.upload({
            file: blob,
            config: { mimeType },
          });

          if (!uploaded?.name || !uploaded?.uri) {
            throw new Error(`Không thể tải tệp phương tiện (${mimeType}) lên hệ thống phân tích.`);
          }

          uploadedFileNames.push(uploaded.name);
          let fileInfo: any = uploaded;
          const deadline = Date.now() + 45000;
          while (String(fileInfo?.state || '').toUpperCase() === 'PROCESSING' && Date.now() < deadline) {
            await sleep(1500);
            fileInfo = await ai.files.get({ name: uploaded.name });
          }

          if (String(fileInfo?.state || '').toUpperCase() === 'FAILED') {
            throw new Error(`Xử lý tệp ${mimeType} trên máy chủ thất bại.`);
          }

          return {
            fileData: {
              fileUri: fileInfo.uri || uploaded.uri,
              mimeType,
            },
          };
        })
      );
      return { ...turn, parts: nextParts };
    })
  );

  const cleanup = async () => {
    await Promise.allSettled(
      uploadedFileNames.map((name) => ai.files.delete({ name }))
    );
  };

  return { contents: nextContents, hasAudioOrVideo, cleanup };
}

export async function createApiApp() {
  if (cachedApp) return cachedApp;
  const app = express();

  app.use(express.json({ limit: '65mb' }));

  const usersFile = path.join(process.cwd(), 'users.json');
  const tmpUsersFile = '/tmp/themaster_users.json';

  const loadUsers = async () => {
    for (const candidate of [tmpUsersFile, usersFile]) {
      try {
        const data = await fs.readFile(candidate, 'utf8');
        return JSON.parse(data);
      } catch {
        // Try next location
      }
    }
    return {};
  };

  const saveUsers = async (users: any) => {
    const payload = JSON.stringify(users, null, 2);
    try {
      await fs.writeFile(usersFile, payload);
    } catch {
      try {
        await fs.writeFile(tmpUsersFile, payload);
      } catch {
        // Ignore on read-only environments
      }
    }
  };

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      model: PRIMARY_FLASH_MODEL,
      fallbackModels: VALID_ACTIVE_FALLBACK_MODELS,
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/trading/quote", async (req, res) => {
    const rawSymbol = String(req.query.symbol || req.query.q || '').trim();
    const interval = String(req.query.interval || '1d').trim();
    if (!rawSymbol) {
      return res.status(400).json({ error: "Thiếu mã tài sản giao dịch (symbol)." });
    }
    try {
      const snapshot = await getTradingQuoteSnapshot(rawSymbol, interval);
      res.json({ ok: true, ...snapshot });
    } catch (err: any) {
      res.status(502).json({
        ok: false,
        error: err?.message || `Không lấy được dữ liệu thị trường cho ${rawSymbol}.`,
      });
    }
  });

  app.get("/api/trading/stock-chart", async (req, res) => {
    const rawSymbol = String(req.query.symbol || req.query.q || '').trim();
    const interval = String(req.query.interval || '1d').trim();
    if (!rawSymbol) {
      return res.status(400).json({ error: "Thiếu mã chứng khoán (symbol)." });
    }
    try {
      const snapshot = await fetchTradingViewStockSnapshot(rawSymbol, undefined, interval);
      res.json({ ok: true, ...snapshot });
    } catch (err: any) {
      res.status(502).json({
        ok: false,
        error: err?.message || `Không lấy được biểu đồ TradingView cho ${rawSymbol}.`,
      });
    }
  });

  app.get("/api/trading/tcn-weights", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({
      ok: true,
      weights: DEFAULT_TCN_WEIGHT_BUNDLE,
    });
  });

  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body || {};

    const AD_EMAIL = Buffer.from("dG1ob2FuZ2hhaTJAZ21haWwuY29t", 'base64').toString();
    const AD_PASS = Buffer.from("aHVlNzk1MzIx", 'base64').toString();

    if (email === AD_EMAIL && password === AD_PASS) {
      return res.json({
        user: {
          email: AD_EMAIL,
          username: "TMkingreal",
          role: "admin"
        }
      });
    }

    const users = await loadUsers();
    const user = users[email];

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Email hoặc mật khẩu không chính xác. Vui lòng đăng ký nếu chưa có tài khoản." });
    }

    res.json({
      user: {
        email,
        username: user.username,
        role: "user"
      }
    });
  });

  app.post("/api/auth/signup", async (req, res) => {
    const { email, username, password } = req.body || {};

    const users = await loadUsers();
    if (users[email]) {
      return res.status(400).json({ error: "Email đã được đăng ký." });
    }

    users[email] = { username, password };
    await saveUsers(users);

    res.json({
      user: {
        email,
        username,
        role: "user"
      }
    });
  });

  app.post("/api/auth/google-local", async (req, res) => {
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    const rawName = String(req.body?.username || '').trim();
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ error: "Vui lòng nhập đúng địa chỉ Email Google hợp lệ." });
    }

    const AD_EMAIL = Buffer.from("dG1ob2FuZ2hhaTJAZ21haWwuY29t", 'base64').toString();
    const users = await loadUsers();
    const existing = users[rawEmail];
    const resolvedName = rawName || existing?.username || rawEmail.split('@')[0];

    if (!existing) {
      users[rawEmail] = { username: resolvedName, password: '', provider: 'google' };
      await saveUsers(users);
    }

    res.json({
      user: {
        email: rawEmail,
        username: rawEmail === AD_EMAIL ? "TMkingreal" : resolvedName,
        role: rawEmail === AD_EMAIL ? "admin" : "user",
        provider: "google"
      }
    });
  });

  app.post("/api/generate-image", async (req, res) => {
    const { prompt } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: "Thiếu prompt mô tả ảnh." });
    }

    try {
      const seed = Math.floor(Math.random() * 1000000);
      const imageUrl = `https://picsum.photos/seed/${seed}/1024/1024`;
      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Image Gen Error:", error);
      res.status(500).json({ error: "Lỗi tạo ảnh." });
    }
  });

  app.post("/api/v2/kernel/transcribe", async (req, res) => {
    const { audioBase64, mimeType, language } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: "Thiếu dữ liệu âm thanh." });
    }
    try {
      const ai = getGenAI();
      const promptText = `Transcribe the spoken audio accurately in ${language || 'Vietnamese or English'}. Return ONLY the exact transcribed text, with proper punctuation and no extra commentary.`;
      const parts = [
        { inlineData: { mimeType: mimeType || 'audio/webm', data: audioBase64 } },
        { text: promptText }
      ];

      const response = await generateContentWithFallback(
        ai,
        () => ({ contents: { parts } }),
        {
          models: ['gemini-3.5-transcribe', ...VALID_ACTIVE_FALLBACK_MODELS],
          timeoutMs: 25000,
        }
      );

      res.json({ text: (response.text || '').trim() });
    } catch (error: any) {
      console.error("Transcribe error:", error);
      res.status(500).json({ error: formatReadableApiError(error) });
    }
  });

  app.get("/api/v2/kernel/image-proxy", async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: "Missing url" });
    }
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ error: "Invalid URL protocol" });
      }
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('172.16.') ||
        host.endsWith('.local')
      ) {
        return res.status(403).json({ error: "Blocked private host" });
      }
      const imgResp = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'TheMasterDocBuilder/1.0' },
      });
      if (!imgResp.ok) {
        return res.status(imgResp.status).json({ error: "Failed to fetch remote image" });
      }
      const contentType = imgResp.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/')) {
        return res.status(400).json({ error: "URL is not an image" });
      }
      const arrayBuf = await imgResp.arrayBuffer();
      if (arrayBuf.byteLength > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "Image too large" });
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(Buffer.from(arrayBuf));
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Image proxy error" });
    }
  });

  app.post("/api/v2/kernel/neural-matrix-compute", async (req, res) => {
    const { contents, config, mode, model, language, webSearch } = req.body || {};

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    if (!Array.isArray(contents) || contents.length === 0) {
      res.write(`data: ${JSON.stringify({ error: "Dữ liệu hội thoại gửi lên không hợp lệ." })}\n\n`);
      res.end();
      return;
    }

    // Immediate SSE comment frame + periodic keepalive prevents proxy/gateway 503 idle timeouts
    res.write(': stream-open\n\n');
    const clientAbortController = new AbortController();
    const onResClose = () => {
      if (!res.writableFinished) {
        clientAbortController.abort();
      }
    };
    res.on('close', onResClose);
    const keepAliveTimer = setInterval(() => {
      if (!res.writableEnded && !clientAbortController.signal.aborted) {
        res.write(': ping\n\n');
      }
    }, 7000);

    let cleanupUploadedMedia: (() => Promise<void>) | null = null;
    try {
      const ai = getGenAI();
      const mediaPrep = await prepareContentsForGeminiMedia(ai, contents);
      const preparedContents = mediaPrep.contents;
      const hasAudioOrVideo = mediaPrep.hasAudioOrVideo;
      cleanupUploadedMedia = mediaPrep.cleanup;

      const now = new Date();
      const targetLang = language || 'Vietnamese';
      const serverTimeNote = `\n[THỜI GIAN HỆ THỐNG CHÍNH XÁC]: Hiện tại là ${now.toLocaleDateString('en-US')} (${now.toLocaleDateString('vi-VN')}), ${now.toLocaleTimeString('vi-VN', { hour12: false })} (ISO: ${now.toISOString()}). Chỉ sử dụng mốc thời gian này khi người dùng hỏi về ngày giờ hoặc thông tin thời sự.\n[NGÔN NGỮ SUY LUẬN & TRẢ LỜI]: Khi suy nghĩ (thinking) và khi trả lời, BẮT BUỘC sử dụng ngôn ngữ: ${targetLang}.\n[BẢO MẬT CHỦ SỞ HỮU]: Chủ sở hữu chỉ được gọi là TMkingreal hoặc king. Tuyệt đối KHÔNG tiết lộ tên thật, tuổi, năm sinh, ngày sinh, nơi ở, trường học, email hay mạng xã hội cá nhân.`;
      let systemInstruction = ((config?.systemInstruction || '').trim() + serverTimeNote).trim();

      const lastUserRawText = (() => {
        const last = contents[contents.length - 1];
        if (!last?.parts) return '';
        return last.parts.map((p: any) => p.text || '').join(' ').trim();
      })();
      const lastUserText = lastUserRawText.toLowerCase();

      const explicitWebSearch = Boolean(
        webSearch ||
        config?.enableSearch ||
        config?.enableDeepSearch ||
        (Array.isArray(config?.tools) && config.tools.length > 0)
      );

      const isTradingMode = mode === "Trading" || mode === "trading";
      const isDeepMode = mode === "Deep" || mode === "deep";
      const isResearchMode = mode === "Research" || mode === "research";
      const isFastMode = model === 'gemini-3.5-flash' || mode === 'Fast';

      const isWebDiscoveryPrompt =
        /\b(tìm\s+(?:các\s+)?(?:trang\s+)?web(?:site)?|gợi\s+ý\s+(?:trang\s+)?web|website\s+nào|trang\s+web\s+nào|tìm\s+link|tìm\s+trang|web\s+nào\s+tốt|find\s+(?:a\s+)?website|recommend\s+(?:a\s+)?(?:web)?site)\b/i.test(lastUserText);

      const wantsTradingViewOrPrice =
        isTradingMode ||
        (/(tradingview|biểu đồ giá|đồ thị giá|mua\s*\/?\s*bán|buy\s*\/?\s*sell|\btp\b|\bsl\b|chốt lời|cắt lỗ|phân tích kỹ thuật|nến|giá\s+(?:btc|eth|sol|vàng|gold|xau|fpt|vcb|aapl|nvda|eurusd))/i.test(lastUserRawText) &&
          extractTickersFromPrompt(lastUserRawText).length > 0);

      const needsSearch =
        explicitWebSearch ||
        isResearchMode ||
        isTradingMode ||
        isWebDiscoveryPrompt ||
        wantsTradingViewOrPrice ||
        /\b(tin tức|thời tiết|giá vàng|giá bitcoin|giá btc|giá eth|tỷ giá|chứng khoán|vnindex|phân tích kỹ thuật|news|weather|stock price|crypto price|tra cứu|tìm kiếm web|google search)\b/i.test(lastUserText);

      const isDeepSearch =
        lastUserRawText.length >= 4 &&
        (isResearchMode || Boolean(config?.enableDeepSearch) || (isDeepMode && needsSearch));

      const preCollectedSources: { title: string; uri: string }[] = [];
      const seenSourceUris = new Set<string>();

      const pushUniqueSources = (items: any[]) => {
        const newlyAdded: { title: string; uri: string }[] = [];
        for (const item of items) {
          if (!item?.uri || seenSourceUris.has(item.uri)) continue;
          seenSourceUris.add(item.uri);
          const clean = { title: String(item.title || 'Web Source'), uri: String(item.uri) };
          preCollectedSources.push(clean);
          newlyAdded.push(clean);
        }
        return newlyAdded;
      };

      // Stage 0 (Trading): Inject real live quotes & computed technical indicators when available
      if (wantsTradingViewOrPrice && lastUserRawText) {
        try {
          res.write(`data: ${JSON.stringify({ text: "", thought: "Đang tải dữ liệu giá thực tế TradingView API & tính toán 6 cấp định lượng...\n", sources: [] })}\n\n`);
          const tradingCtx = await fetchTradingMarketContext(lastUserRawText);
          if (tradingCtx) {
            systemInstruction += tradingCtx;
          }
        } catch (tradingErr) {
          console.warn("Trading context fetch warning:", tradingErr);
        }
      }

      // Stage 1 & 2 (Upgraded Deep Search): Query decomposition -> parallel Google Search grounding -> synthesized briefing
      if (isDeepSearch && !clientAbortController.signal.aborted) {
        try {
          res.write(`data: ${JSON.stringify({ text: "", thought: "Deep Search: Đang phân rã truy vấn và tìm kiếm song song nhiều nguồn Google Search...\n", sources: [] })}\n\n`);

          let subQueries: string[] = [];
          try {
            const decompRes = await generateContentWithFallback(
              ai,
              () => ({
                contents: `Phân rã câu hỏi sau thành 2 đến 3 truy vấn tìm kiếm Google Search ngắn gọn, súc tích, không trùng lặp để tra cứu thông tin thực tế đa chiều (ngày hiện tại: ${now.toLocaleDateString('en-US')}). Câu hỏi: "${lastUserRawText.slice(0, 600)}"`,
                config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      queries: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                    required: ['queries'],
                  },
                },
              }),
              {
                timeoutMs: 12000,
                externalSignal: clientAbortController.signal,
              }
            );
            const parsedQ = JSON.parse((decompRes.text || '{}').trim());
            if (Array.isArray(parsedQ?.queries)) {
              subQueries = parsedQ.queries
                .map((q: any) => String(q || '').trim())
                .filter((q: string) => q.length >= 3)
                .slice(0, 3);
            }
          } catch {
            // Fallback heuristic queries if decomposition step fails
          }

          if (subQueries.length === 0) {
            const cleanBase = lastUserRawText.slice(0, 180);
            subQueries = [cleanBase, `${cleanBase} latest data statistics ${now.getFullYear()}`];
          }

          const parallelSearches = await Promise.allSettled(
            subQueries.map((subQ) =>
              generateContentWithFallback(
                ai,
                () => ({
                  contents: `Tìm kiếm Google Search và tóm tắt súc tích các số liệu, sự kiện, nguồn đối chiếu chính xác cho truy vấn sau (không bịa đặt): "${subQ}"`,
                  config: {
                    tools: [{ googleSearch: {} }],
                  },
                }),
                {
                  timeoutMs: 14000,
                  externalSignal: clientAbortController.signal,
                }
              )
            )
          );

          const findings: string[] = [];
          const newlyFoundSources: { title: string; uri: string }[] = [];

          parallelSearches.forEach((settled, idx) => {
            if (settled.status !== 'fulfilled') return;
            const resp = settled.value;
            const snippet = String(resp.text || '').trim().slice(0, 1800);
            const chunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const mappedSources = chunks
              .map((c: any) => (c?.web?.uri ? { title: c.web.title || 'Web Source', uri: c.web.uri } : null))
              .filter(Boolean);
            newlyFoundSources.push(...pushUniqueSources(mappedSources));
            if (snippet) {
              findings.push(`[Hướng tìm kiếm #${idx + 1}: "${subQueries[idx]}"]\n${snippet}`);
            }
          });

          if (findings.length > 0) {
            const sourceListNote = preCollectedSources
              .slice(0, 12)
              .map((s, idx) => `[${idx + 1}] ${s.title} — ${s.uri}`)
              .join('\n');
            systemInstruction += `\n\n[KẾT QUẢ DEEP SEARCH ĐA LUỒNG (${findings.length} luồng tìm kiếm, ${preCollectedSources.length} nguồn web)]:\n${findings.join('\n\n')}${sourceListNote ? `\n\nDanh sách nguồn đã xác thực:\n${sourceListNote}` : ''}\n\nYÊU CẦU TỔNG HỢP DEEP SEARCH: Đối chiếu chéo các số liệu từ các nguồn trên, loại bỏ thông tin nhiễu, trình bày có cấu trúc rõ ràng và trích dẫn nguồn cụ thể khi nêu số liệu.`;

            res.write(
              `data: ${JSON.stringify({
                text: "",
                thought: `Đã tổng hợp ${findings.length} luồng tìm kiếm (${preCollectedSources.length} nguồn web). Đang đối chiếu và viết phân tích chi tiết...\n`,
                sources: newlyFoundSources,
              })}\n\n`
            );
          }
        } catch (deepErr) {
          console.warn("Deep search pre-stage skipped:", deepErr);
        }
      }

      // Stage 2.5 (Website Discovery Safety & TLD Scan): Find & verify real URLs before final output
      if (isWebDiscoveryPrompt && !clientAbortController.signal.aborted) {
        try {
          res.write(`data: ${JSON.stringify({ text: "", thought: "Đang tìm website phù hợp và quét đuôi tên miền / độ an toàn từng link...\n", sources: [] })}\n\n`);

          if (preCollectedSources.length === 0) {
            const webFinderResp = await generateContentWithFallback(
              ai,
              () => ({
                contents: `Tìm 4-5 website thực tế uy tín đáp ứng nhu cầu sau của người dùng (trả về URL đầy đủ): "${lastUserRawText.slice(0, 400)}"`,
                config: {
                  tools: [{ googleSearch: {} }],
                },
              }),
              {
                timeoutMs: 12000,
                externalSignal: clientAbortController.signal,
              }
            );
            const chunks = webFinderResp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const mapped = chunks
              .map((c: any) => (c?.web?.uri ? { title: c.web.title || 'Website', uri: c.web.uri } : null))
              .filter(Boolean);
            const added = pushUniqueSources(mapped);
            const urlMatches = String(webFinderResp.text || '').match(/https?:\/\/[^\s)\]>"]+/gi) || [];
            if (urlMatches.length > 0) {
              const directAdded = pushUniqueSources(urlMatches.map((u) => ({ title: 'Website', uri: u })));
              added.push(...directAdded);
            }
            if (added.length > 0) {
              res.write(`data: ${JSON.stringify({ text: "", thought: "", sources: added })}\n\n`);
            }
          }

          const candidates = preCollectedSources.slice(0, 4);
          if (candidates.length > 0) {
            const scanResults = await Promise.allSettled(
              candidates.map((c) =>
                Promise.race([
                  scanWebsiteSafety(c.uri),
                  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500)),
                ])
              )
            );
            const verifiedLines: string[] = [];
            scanResults.forEach((r, idx) => {
              if (r.status === 'fulfilled') {
                const rep = r.value;
                const hasWarn = rep.safeLevel !== 'safe' || rep.warnings.length > 0;
                verifiedLines.push(
                  hasWarn
                    ? `- ${rep.finalUrl} | Tiêu đề: ${rep.title} | Đuôi miền: ${rep.tld} | Trạng thái: ${rep.safeLevel} (${rep.score}/100) | Cảnh báo: ${rep.warnings.join('; ') || 'Cần lưu ý'}`
                    : `- ${rep.finalUrl} | Tiêu đề: ${rep.title} | Đuôi miền: ${rep.tld} | Sạch (không có cảnh báo)`
                );
              } else {
                verifiedLines.push(`- ${candidates[idx].uri}`);
              }
            });
            systemInstruction += `\n\n[DANH SÁCH WEBSITE ĐÃ KIỂM TRA]:\n${verifiedLines.join('\n')}\n\nHƯỚNG DẪN TRÌNH BÀY LINK: Hiển thị danh sách website gọn gàng bằng Markdown link chuẩn [Tên website](https://...) kèm mô tả ngắn. Với các link sạch không có cảnh báo, KHÔNG in các dòng cảnh báo/điểm quét rườm rà; chỉ ghi lưu ý ngắn gọn nếu link có cảnh báo thực tế (hoặc để người dùng xem chi tiết khi mở hộp mô phỏng). Hỗ trợ đầy đủ link YouTube nếu người dùng tìm video.`;
          }
        } catch (webScanErr) {
          console.warn("Web discovery safety pre-scan skipped:", webScanErr);
        }
      }

      const streamTimeoutMs = hasAudioOrVideo ? 120000 : 35000;
      const runStreamWithModel = async (targetModel: string, disableSearchTool = false) => {
        const signal = buildCombinedAbortSignal(streamTimeoutMs, clientAbortController.signal);
        const reqConfig: any = {
          systemInstruction,
          abortSignal: signal,
        };

        if (needsSearch && !disableSearchTool) {
          reqConfig.tools = [{ googleSearch: {} }];
        }

        const isFlashLite = targetModel.includes('flash-lite');
        const supportsThinkingLevel =
          targetModel.includes('gemini-4') || targetModel.includes('gemini-3');

        if (supportsThinkingLevel) {
          let level = ThinkingLevel.MEDIUM;
          if (isFastMode || isFlashLite) {
            level = ThinkingLevel.LOW;
          } else if (isDeepMode || isResearchMode || isTradingMode || isDeepSearch) {
            level = ThinkingLevel.HIGH;
          }
          reqConfig.thinkingConfig = {
            thinkingLevel: level,
            includeThoughts: !isFlashLite,
          };
        }

        return await ai.models.generateContentStream({
          model: targetModel,
          contents: preparedContents,
          config: reqConfig,
        });
      };

      const initialModel = resolveModelForTask(model);
      const candidateModels = Array.from(new Set([initialModel, ...VALID_ACTIVE_FALLBACK_MODELS]));
      let primaryError: any = null;
      let lastError: any = null;
      let completedStream = false;
      let sentModelStreamChunk = false;

      for (let i = 0; i < candidateModels.length; i++) {
        const m = candidateModels[i];
        const maxAttempts = i === 0 ? 2 : 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (clientAbortController.signal.aborted) break;
          if (attempt > 0) {
            await sleep(400 + Math.floor(Math.random() * 250));
          }
          try {
            let streamResult: any;
            try {
              streamResult = await runStreamWithModel(m, false);
            } catch (toolErr: any) {
              const errStatus = Number(toolErr?.status || toolErr?.code || 0);
              const errMsg = String(toolErr?.message || '').toLowerCase();
              if (needsSearch && errStatus === 400 && /tool|search|grounding/i.test(errMsg)) {
                streamResult = await runStreamWithModel(m, true);
              } else {
                throw toolErr;
              }
            }
            for await (const chunk of streamResult) {
              if (clientAbortController.signal.aborted) break;
              const parts = chunk.candidates?.[0]?.content?.parts || [];
              let text = "";
              let thought = "";

              for (const p of parts as any[]) {
                if (p.thought && p.text) {
                  thought += p.text;
                } else if (p.text) {
                  text += p.text;
                }
              }

              if (!text && !thought && chunk.text) {
                text = chunk.text;
              }

              let sources: any[] = [];
              const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
              if (groundingChunks) {
                const rawMapped = groundingChunks
                  .map((c: any) => (c.web ? { title: c.web.title, uri: c.web.uri } : null))
                  .filter(Boolean);
                sources = pushUniqueSources(rawMapped);
              }

              if (text || thought || sources.length > 0) {
                sentModelStreamChunk = true;
                res.write(`data: ${JSON.stringify({ text, thought, sources })}\n\n`);
              }
            }
            completedStream = true;
            break;
          } catch (err: any) {
            if (!primaryError) primaryError = err;
            lastError = err;
            console.warn(`[AI Stream Fallback] model=${m} attempt=${attempt + 1} status=${err?.status || err?.code || 'ERR'}:`, String(err?.message || err).slice(0, 240));
            if (clientAbortController.signal.aborted || sentModelStreamChunk) {
              throw err;
            }
            if (attempt + 1 < maxAttempts && isTransientHighDemandError(err)) {
              continue;
            }
            if (!isRetryableOrFallbackError(err)) {
              throw err;
            }
            break;
          }
        }

        if (completedStream || clientAbortController.signal.aborted) {
          break;
        }
      }

      if (!completedStream && !clientAbortController.signal.aborted) {
        throw primaryError || lastError || new Error("Không thể kết nối tới mô hình AI nào.");
      }

      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } catch (error: any) {
      if (!clientAbortController.signal.aborted && !res.writableEnded) {
        console.error("Server API Chat Stream Error:", error);
        const errData = { error: formatReadableApiError(error) };
        res.write(`data: ${JSON.stringify(errData)}\n\n`);
        res.end();
      }
    } finally {
      if (cleanupUploadedMedia) {
        await cleanupUploadedMedia();
      }
      clearInterval(keepAliveTimer);
      res.off('close', onResClose);
    }
  });

  app.post("/api/v2/kernel/cognitive-tensor", async (req, res) => {
    const { contents, config, model } = req.body || {};

    try {
      const ai = getGenAI();
      const initialModel = resolveModelForTask(model);
      const candidates = Array.from(new Set([initialModel, ...VALID_ACTIVE_FALLBACK_MODELS]));

      const result = await generateContentWithFallback(
        ai,
        () => ({
          contents,
          config: config?.systemInstruction && config.systemInstruction.trim()
            ? { systemInstruction: config.systemInstruction.trim() }
            : {},
        }),
        {
          models: candidates,
          timeoutMs: 22000,
        }
      );

      res.json({ text: result.text || "" });
    } catch (error: any) {
      console.error("Server API Single Chat Error:", error);
      const errMsg = String(error?.message || '').toLowerCase();
      const rawCode = Number(error?.status || error?.code || 0);
      const status =
        rawCode === 429 || /quota|resource_exhausted|429/.test(errMsg)
          ? 429
          : isTransientHighDemandError(error)
          ? 503
          : 500;
      res.status(status).json({ error: formatReadableApiError(error) });
    }
  });

  app.get("/api/chess/profile", async (_req, res) => {
    try {
      const username = "tm_kingreal";
      const headers = {
        'User-Agent': 'TheMasterWorkspace/1.0 (player: tm_kingreal)'
      };

      const profileRes = await fetch(`https://api.chess.com/pub/player/${username}`, { headers });
      if (!profileRes.ok) {
        throw new Error(`Profile fetch failed with status: ${profileRes.status}`);
      }
      const profileData: any = await profileRes.json();

      let statsData = {};
      try {
        const statsRes = await fetch(`https://api.chess.com/pub/player/${username}/stats`, { headers });
        if (statsRes.ok) statsData = await statsRes.json();
      } catch (e) {
        console.error("Stats fetch error:", e);
      }

      let clubsData = { clubs: [] };
      try {
        const clubsRes = await fetch(`https://api.chess.com/pub/player/${username}/clubs`, { headers });
        if (clubsRes.ok) clubsData = await clubsRes.json();
      } catch (e) {
        console.error("Clubs fetch error:", e);
      }

      const sanitizedProfile = {
        ...profileData,
        name: 'TMkingreal',
        username: 'tm_kingreal',
        location: undefined
      };

      res.json({
        profile: sanitizedProfile,
        stats: statsData,
        clubs: clubsData.clubs || []
      });
    } catch (error: any) {
      console.error("Chess.com API Error:", error);
      res.status(500).json({ error: error.message || "Lỗi kết nối với máy chủ Chess.com hoặc người chơi không tồn tại." });
    }
  });

  const MUSIC_WEB_ORIGIN = 'https://test1-gamma-navy-38.vercel.app';

  const fetchNcMusicSearch = async (query: string) => {
    const cleanQ = query.trim();
    if (!cleanQ) return [];

    const [ncSettled, ytStatsSettled] = await Promise.allSettled([
      fetch(`${MUSIC_WEB_ORIGIN}/api/search?q=${encodeURIComponent(cleanQ)}`, {
        headers: { 'User-Agent': 'TheMasterMCPMusic/1.0' },
        signal: AbortSignal.timeout(7000),
      }).then(async (resp) => {
        if (!resp.ok) {
          throw new Error(`NCmusicplayer search failed (${resp.status})`);
        }
        return resp.json();
      }),
      fetchYouTubeViewStats(cleanQ),
    ]);

    if (ncSettled.status === 'rejected') {
      throw ncSettled.reason;
    }

    const raw = ncSettled.value;
    if (!Array.isArray(raw)) return [];
    const ytStats = ytStatsSettled.status === 'fulfilled' ? ytStatsSettled.value : new Map();

    const mapped = raw
      .filter((item: any) => item && typeof item.id === 'string' && item.id.trim() && item.title)
      .slice(0, 15)
      .map((item: any) => {
        const vid = String(item.id);
        const stat = ytStats.get(vid);
        return {
          id: vid,
          title: String(item.title),
          thumbnail: String(item.thumbnail || ''),
          channelTitle: String(item.channelTitle || 'NCmusicplayer'),
          sourceUrl: MUSIC_WEB_ORIGIN,
          viewCount: stat?.viewCount,
        };
      });

    const existingIds = new Set(mapped.map((t) => t.id));
    const qTokens = cleanQ.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
    for (const [vid, stat] of ytStats.entries()) {
      if (existingIds.has(vid)) continue;
      if (stat.viewCount < ONE_BILLION_VIEWS) continue;
      const titleLower = (stat.title || '').toLowerCase();
      if (qTokens.length === 0 || qTokens.some((tok) => titleLower.includes(tok))) {
        existingIds.add(vid);
        mapped.push({
          id: vid,
          title: stat.title || cleanQ,
          thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          channelTitle: stat.channelTitle || 'YouTube',
          sourceUrl: `https://www.youtube.com/watch?v=${vid}`,
          viewCount: stat.viewCount,
        });
      }
    }

    return sortMusicTracksByPopularity(mapped).slice(0, 12);
  };

  const fetchNcMusicSuggestions = async (query: string) => {
    const cleanQ = query.trim();
    if (!cleanQ) return [];
    const resp = await fetch(`${MUSIC_WEB_ORIGIN}/api/suggestions?q=${encodeURIComponent(cleanQ)}`, {
      headers: { 'User-Agent': 'TheMasterMCPMusic/1.0' },
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data.map((s: any) => String(s)).slice(0, 8) : [];
  };

  // Live MCP Debugging Endpoints & Telemetry Middleware
  app.get("/api/mcp/debug/events", (_req, res) => {
    res.json({ events: getMcpDebugEvents() });
  });

  app.post("/api/mcp/debug/clear", (_req, res) => {
    clearMcpDebugEvents();
    res.json({ ok: true });
  });

  app.get("/api/mcp/debug/stream", (req, res) => {
    const detach = attachMcpDebugSseClient(res);
    req.on("close", detach);
  });

  app.use("/api/mcp", (req, res, next) => {
    if (req.method === "OPTIONS" || req.path.startsWith("/debug")) {
      return next();
    }

    const endpoint = `/api/mcp${req.path === "/" ? "" : req.path}`;
    const isJsonRpc = endpoint === "/api/mcp/music" || endpoint === "/api/mcp/hub";
    const bodyObj = req.body && typeof req.body === "object" ? req.body : {};

    let toolName = endpoint.replace(/^\/api\/mcp\/?/, "") || "mcp";
    let paramsPayload: unknown = {};

    if (isJsonRpc) {
      const rpcMethod = String(bodyObj.method || "rpc");
      toolName =
        rpcMethod === "tools/call" && bodyObj.params?.name
          ? String(bodyObj.params.name)
          : rpcMethod;
      paramsPayload =
        rpcMethod === "tools/call"
          ? bodyObj.params?.arguments ?? {}
          : bodyObj.params ?? {};
    } else {
      const hasQuery = req.query && Object.keys(req.query).length > 0;
      const hasBody = bodyObj && Object.keys(bodyObj).length > 0;
      paramsPayload = hasQuery && hasBody
        ? { query: req.query, body: bodyObj }
        : hasBody
        ? bodyObj
        : hasQuery
        ? req.query
        : {};
    }

    const debugId = startMcpDebugCall({
      source: isJsonRpc ? "mcp_jsonrpc" : "mcp_rest",
      endpoint,
      method: req.method,
      toolName,
      params: paramsPayload,
    });

    let settled = false;
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);

    const finalize = (payload: unknown) => {
      if (settled) return;
      settled = true;
      finishMcpDebugCall(debugId, {
        httpStatus: res.statusCode || 200,
        rawResponse: payload,
      });
    };

    res.json = ((body: any) => {
      finalize(body);
      return origJson(body);
    }) as any;

    res.send = ((body: any) => {
      if (!settled) {
        let parsed = body;
        if (typeof body === "string") {
          try {
            parsed = JSON.parse(body);
          } catch {
            // Keep string payload if not JSON
          }
        }
        finalize(parsed);
      }
      return origSend(body);
    }) as any;

    res.on("finish", () => {
      if (!settled) {
        finalize(undefined);
      }
    });

    res.on("close", () => {
      if (!settled && !res.writableEnded) {
        settled = true;
        finishMcpDebugCall(debugId, {
          httpStatus: res.statusCode || 499,
          error: "Client closed connection before response completed",
        });
      }
    });

    next();
  });

  app.get("/api/mcp/music/search", async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ error: "Thiếu từ khóa tìm bài hát (q)." });
    }
    try {
      const tracks = await fetchNcMusicSearch(q);
      res.json({ tracks, source: MUSIC_WEB_ORIGIN });
    } catch (error: any) {
      res.status(502).json({ error: error?.message || "Không thể tìm nhạc từ NCmusicplayer." });
    }
  });

  app.post("/api/mcp/music", async (req, res) => {
    const { id = null, method, params = {} } = req.body || {};

    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'ncmusicplayer-mcp', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
    }

    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'music_search',
              description: `Tìm kiếm bài hát từ website phát nhạc ${MUSIC_WEB_ORIGIN} kèm kiểm tra trùng tên tác giả/ban nhạc`,
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Tên bài hát hoặc nghệ sĩ' },
                },
                required: ['query'],
              },
            },
            {
              name: 'music_suggestions',
              description: `Gợi ý từ khóa tìm nhạc từ ${MUSIC_WEB_ORIGIN}`,
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
                required: ['query'],
              },
            },
            {
              name: 'music_resolve_url',
              description: 'Giải mã link video hoặc danh sách phát (playlist) YouTube để phát nhạc nền',
              inputSchema: {
                type: 'object',
                properties: {
                  url: { type: 'string', description: 'URL YouTube video hoặc playlist' },
                },
                required: ['url'],
              },
            },
            {
              name: 'music_player_control',
              description: `Điều khiển trình phát nhạc nền kết nối với ${MUSIC_WEB_ORIGIN} hoặc link YouTube (play, pause, resume, next, prev, stop, loop)`,
              inputSchema: {
                type: 'object',
                properties: {
                  action: { type: 'string', enum: ['play', 'pause', 'resume', 'next', 'prev', 'stop', 'loop'] },
                  query: { type: 'string', description: 'Từ khóa bài hát hoặc link YouTube khi action=play' },
                  url: { type: 'string', description: 'Link video hoặc playlist YouTube' },
                  mode: { type: 'string', enum: ['off', 'one', 'all'], description: 'Chế độ loop khi action=loop' },
                },
                required: ['action'],
              },
            },
            {
              name: 'music_lyrics',
              description: 'Tra cứu lời bài hát chính xác từ Google Search và dịch sang ngôn ngữ mục tiêu',
              inputSchema: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Tên bài hát' },
                  artist: { type: 'string', description: 'Tên ca sĩ / ban nhạc' },
                  targetLang: { type: 'string', description: 'Ngôn ngữ đích để dịch (ví dụ Vietnamese)' },
                },
                required: ['title'],
              },
            },
          ],
        },
      });
    }

    if (method === 'tools/call') {
      const toolName = String(params?.name || '');
      const args = (params?.arguments && typeof params.arguments === 'object') ? params.arguments : {};

      try {
        if (toolName === 'music_search') {
          const query = String(args.query || '').trim();
          const tracks = await fetchNcMusicSearch(query);
          const disambiguation = analyzeMusicDisambiguation(query, tracks);
          const structured = { query, tracks, disambiguation };
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(structured) }],
              structuredContent: structured,
            },
          });
        }

        if (toolName === 'music_suggestions') {
          const query = String(args.query || '').trim();
          const suggestions = await fetchNcMusicSuggestions(query);
          const structured = { query, suggestions };
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(structured) }],
              structuredContent: structured,
            },
          });
        }

        if (toolName === 'music_resolve_url') {
          const rawUrl = String(args.url || args.query || '').trim();
          const resolved = await resolveMusicUrl(rawUrl);
          const structured = { url: rawUrl, playlistId: resolved.playlistId, tracks: resolved.tracks };
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(structured) }],
              structuredContent: structured,
            },
          });
        }

        if (toolName === 'music_player_control') {
          const action = String(args.action || 'play').toLowerCase();
          const query = typeof args.query === 'string' ? args.query.trim() : '';
          const rawUrl = typeof args.url === 'string' ? args.url.trim() : '';
          const candidateUrl = rawUrl || (/^https?:\/\/\S+/i.test(query) ? query : '');

          if (action === 'play' && candidateUrl) {
            const resolved = await resolveMusicUrl(candidateUrl);
            const structured = {
              action,
              query: candidateUrl,
              url: candidateUrl,
              playlistId: resolved.playlistId,
              tracks: resolved.tracks,
            };
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify(structured) }],
                structuredContent: structured,
              },
            });
          }

          const tracks = action === 'play' && query ? await fetchNcMusicSearch(query) : undefined;
          const disambiguation = tracks && !args.confirmedArtist ? analyzeMusicDisambiguation(query, tracks) : undefined;
          const structured = { action, query, tracks, disambiguation };
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(structured) }],
              structuredContent: structured,
            },
          });
        }

        if (toolName === 'music_lyrics') {
          const songTitle = String(args.title || args.query || '').trim();
          const artist = String(args.artist || '').trim();
          const targetLang = String(args.targetLang || 'Vietnamese').trim();
          const structured = await lookupAccurateLyrics({ title: songTitle, artist, targetLang });
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(structured) }],
              structuredContent: structured,
            },
          });
        }

        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
      } catch (err: any) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32000, message: err?.message || 'MCP music execution error' },
        });
      }
    }

    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unsupported MCP method: ${String(method || '')}` },
    });
  });

  const lookupAccurateLyrics = async ({
    title,
    artist,
    targetLang,
  }: {
    title: string;
    artist?: string;
    targetLang?: string;
  }) => {
    const cleanTitle = String(title || '').trim();
    const cleanArtist = String(artist || '').trim();
    const lang = String(targetLang || 'Vietnamese').trim();
    if (!cleanTitle) {
      throw new Error('Cần tên bài hát để tìm lời.');
    }

    const ai = getGenAI();
    const searchQueryPrompt = [
      `Use Google Search to look up the exact official lyrics of the song "${cleanTitle}"${
        cleanArtist ? ` by "${cleanArtist}"` : ''
      }.`,
      `Rules:`,
      `1. Retrieve accurate, verified lyrics from reputable lyrics sources via Google Search. Do NOT invent or paraphrase missing lines.`,
      `2. Keep the original song structure and line breaks.`,
      `3. Provide a natural, accurate, line-by-line or stanza-aligned translation into ${lang}. (If the original lyrics are already mostly in ${lang}, keep an accurate refined/annotated ${lang} version or explain any foreign chorus phrases faithfully.)`,
      `4. Respond using ONLY these exact section markers so the UI can separate Original Lyrics and Translation cleanly:`,
      `TITLE: <canonical song title>`,
      `ARTIST: <artist name>`,
      `ORIGINAL_LANGUAGE: <language of original song>`,
      `===ORIGINAL_LYRICS===`,
      `<exact original lyrics here>`,
      `===TRANSLATED_LYRICS===`,
      `<accurate translation into ${lang} here>`,
    ].join('\n');

    const result = await generateContentWithFallback(
      ai,
      () => ({
        contents: searchQueryPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
      { timeoutMs: 20000 }
    );

    const parsed = parseLyricsResponseBlocks(result.text || '');
    const rawChunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const seenUris = new Set<string>();
    const sources = rawChunks
      .map((c: any) => (c?.web?.uri ? { title: String(c.web.title || 'Lyrics Source'), uri: String(c.web.uri) } : null))
      .filter((item: any): item is { title: string; uri: string } => {
        if (!item || seenUris.has(item.uri)) return false;
        seenUris.add(item.uri);
        return true;
      });

    return {
      title: parsed.detectedTitle || cleanTitle,
      artist: parsed.detectedArtist || cleanArtist || 'Unknown Artist',
      targetLang: lang,
      detectedLanguage: parsed.detectedLanguage || '',
      originalLyrics: parsed.originalLyrics || 'Không tìm thấy lời gốc chính xác cho bài hát này.',
      translatedLyrics: parsed.translatedLyrics || '',
      sources,
    };
  };

  app.post("/api/mcp/music/lyrics", async (req, res) => {
    const { title, artist, targetLang } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Thiếu tên bài hát cần tìm lời." });
    }
    try {
      const data = await lookupAccurateLyrics({
        title: String(title),
        artist: artist ? String(artist) : undefined,
        targetLang: targetLang ? String(targetLang) : 'Vietnamese',
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: formatReadableApiError(err) || "Không thể tra cứu lời bài hát." });
    }
  });

  app.post("/api/mcp/music/resolve", async (req, res) => {
    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: "Thiếu URL YouTube hoặc playlist." });
    }
    try {
      const resolved = await resolveMusicUrl(rawUrl);
      res.json(resolved);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Không thể giải mã link nhạc." });
    }
  });

  app.get("/api/mcp/web/scan", async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url) {
      return res.status(400).json({ error: "Thiếu tham số url cần quét." });
    }
    try {
      const report = await scanWebsiteSafety(url);
      res.json(report);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Lỗi kiểm tra an toàn website." });
    }
  });

  app.get("/api/mcp/web/snapshot", async (req, res) => {
    const url = String(req.query.url || '').trim();
    if (!url) {
      return res.status(400).json({ error: "Thiếu tham số url." });
    }
    try {
      const data = await fetchSafeWebsiteSnapshot(url);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Không thể đọc nội dung website." });
    }
  });

  app.post("/api/mcp/google-form/inspect", async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!url) {
      return res.status(400).json({ error: "Thiếu link Google Form." });
    }
    try {
      const schema = await inspectGoogleForm(url);
      res.json(schema);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Không thể đọc cấu trúc Google Form." });
    }
  });

  app.post("/api/mcp/google-form/submit", async (req, res) => {
    const url = String(req.body?.url || '').trim();
    const answers = (req.body?.answers && typeof req.body.answers === 'object') ? req.body.answers : {};
    if (!url) {
      return res.status(400).json({ error: "Thiếu link Google Form." });
    }
    try {
      const result = await submitGoogleForm(url, answers);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Không thể gửi Google Form." });
    }
  });

  app.post("/api/mcp/google-form/ai-fill", async (req, res) => {
    const schema = req.body?.schema;
    const userProfileHint = String(req.body?.userProfileHint || '').trim();
    const language = String(req.body?.language || 'Vietnamese').trim();

    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      return res.status(400).json({ error: "Form chưa có trường câu hỏi hợp lệ để AI điền." });
    }

    try {
      const ai = getGenAI();
      const fieldSpecs = schema.fields.map((f: any) => ({
        entryId: String(f.entryId),
        label: String(f.label || ''),
        type: String(f.type || 'short_text'),
        required: Boolean(f.required),
        options: Array.isArray(f.options) ? f.options : [],
      }));

      const prompt = [
        `Hãy đóng vai trò trợ lý điền Google Form chính xác, tự nhiên và lịch sự bằng ngôn ngữ: ${language}.`,
        `Tiêu đề Form: "${schema.title || ''}"`,
        schema.description ? `Mô tả Form: "${schema.description}"` : '',
        userProfileHint
          ? `Thông tin/yêu cầu người dùng cung cấp: "${userProfileHint}"`
          : `Người dùng chưa nhập thông tin riêng -> hãy tự điền câu trả lời hợp lý, lịch sự, mang tính mẫu chuẩn (nếu có lựa chọn options thì chọn phương án phù hợp).`,
        `Danh sách câu hỏi:`,
        JSON.stringify(fieldSpecs, null, 2),
        `Quy tắc bắt buộc:`,
        `- Trả về DUY NHẤT một JSON object hợp lệ dạng: { "answers": { "<entryId>": <value> } }`,
        `- Key phải trùng KHỚP 100% với "entryId" của từng trường.`,
        `- Nếu trường có mảng "options" khác rỗng:`,
        `  + Với type="checkboxes": trả về mảng string chỉ gồm các phần tử nằm CHÍNH XÁC trong "options".`,
        `  + Với các type lựa chọn khác: trả về đúng 1 string nằm CHÍNH XÁC trong "options".`,
        `- Với trường text/paragraph: trả về string ngắn gọn, rõ ràng, phù hợp câu hỏi.`,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await generateContentWithFallback(
        ai,
        () => ({
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        }),
        { timeoutMs: 20000 }
      );

      const rawText = (result.text || '{}').trim();
      const parsed = JSON.parse(rawText);
      const rawAnswers = parsed?.answers && typeof parsed.answers === 'object' ? parsed.answers : parsed;

      const sanitized: Record<string, string | string[]> = {};
      for (const f of fieldSpecs) {
        const val = rawAnswers?.[f.entryId];
        if (val === undefined || val === null) continue;
        if (f.type === 'checkboxes') {
          const arr = Array.isArray(val) ? val.map(String) : [String(val)];
          sanitized[f.entryId] = f.options.length > 0 ? arr.filter((x: string) => f.options.includes(x)) : arr;
        } else {
          const str = String(Array.isArray(val) ? val[0] ?? '' : val);
          if (f.options.length > 0 && !f.options.includes(str)) {
            sanitized[f.entryId] = f.options[0] || '';
          } else {
            sanitized[f.entryId] = str;
          }
        }
      }

      res.json({ answers: sanitized });
    } catch (err: any) {
      res.status(500).json({ error: formatReadableApiError(err) || "AI không thể tạo câu trả lời cho Form này." });
    }
  });

  // Facebook OAuth & Token Self-Search Endpoints
  const fbOAuthStates = new Map<
    string,
    {
      redirectUri: string;
      clientId: string;
      clientSecret: string;
      apiVersion: string;
      expiresAt: number;
    }
  >();
  const fbOAuthClaims = new Map<string, { accessToken: string; expiresAt: number }>();

  const pruneExpiredFbAuthMaps = () => {
    const now = Date.now();
    for (const [k, v] of fbOAuthStates.entries()) {
      if (v.expiresAt <= now) fbOAuthStates.delete(k);
    }
    for (const [k, v] of fbOAuthClaims.entries()) {
      if (v.expiresAt <= now) fbOAuthClaims.delete(k);
    }
  };

  const resolveFbRedirectUri = (req: express.Request): string => {
    const envAppUrl = String(process.env.APP_URL || '').trim().replace(/\/+$/, '');
    if (envAppUrl) {
      return `${envAppUrl}/api/auth/facebook/callback`;
    }
    const protoHeader = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
    const hostHeader = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
    return `${protoHeader || 'https'}://${hostHeader}/api/auth/facebook/callback`;
  };

  const buildFbOAuthStartUrl = (req: express.Request, customBody?: any) => {
    const customAppId = String(customBody?.appId || '').trim();
    const customAppSecret = String(customBody?.appSecret || '').trim();
    const rawVersion = String(customBody?.apiVersion || 'v21.0').trim();
    const apiVersion = /^v\d{1,2}\.\d{1,2}$/.test(rawVersion) ? rawVersion : 'v21.0';
    const rawScope = String(
      customBody?.scope || 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts'
    ).trim();
    const safeScope = rawScope
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^[a-z0-9_]{2,64}$/i.test(s))
      .join(',') || 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts';

    const clientId = customAppId || String(process.env.FACEBOOK_APP_ID || '').trim();
    const clientSecret = customAppSecret || String(process.env.FACEBOOK_APP_SECRET || '').trim();

    if (clientId && !/^[a-zA-Z0-9._-]{4,64}$/.test(clientId)) {
      return { status: 400, payload: { error: 'Facebook App ID không hợp lệ.' } };
    }

    if (!clientId || !clientSecret) {
      return {
        status: 400,
        payload: {
          needsManualToken: true,
          error:
            "Chưa có Facebook App ID / App Secret. Hãy tự nhập App ID & App Secret trong mục 'Thông số cấu hình' hoặc dùng mục 'Tự tìm Token & Page ID' ngay bên dưới!",
        },
      };
    }

    pruneExpiredFbAuthMaps();
    const state = crypto.randomBytes(24).toString('hex');
    const redirectUri = resolveFbRedirectUri(req);
    fbOAuthStates.set(state, {
      redirectUri,
      clientId,
      clientSecret,
      apiVersion,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: safeScope,
    });

    return {
      status: 200,
      payload: {
        url: `https://www.facebook.com/${apiVersion}/dialog/oauth?${params.toString()}`,
        redirectUri,
      },
    };
  };

  app.get("/api/auth/facebook/status", (_req, res) => {
    const oauthConfigured = Boolean(
      String(process.env.FACEBOOK_APP_ID || '').trim() &&
      String(process.env.FACEBOOK_APP_SECRET || '').trim()
    );
    res.json({
      oauthConfigured,
      explorerUrl: 'https://developers.facebook.com/tools/explorer/',
      debuggerUrl: 'https://developers.facebook.com/tools/debug/accesstoken/',
    });
  });

  app.get("/api/auth/facebook/url", (req, res) => {
    const result = buildFbOAuthStartUrl(req);
    res.status(result.status).json(result.payload);
  });

  app.post("/api/auth/facebook/url", (req, res) => {
    const result = buildFbOAuthStartUrl(req, req.body || {});
    res.status(result.status).json(result.payload);
  });

  app.get(["/api/auth/facebook/callback", "/api/auth/facebook/callback/"], async (req, res) => {
    pruneExpiredFbAuthMaps();
    const renderPopupFinish = (payload: Record<string, any>) => {
      const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px;text-align:center;">
<p>Đang hoàn tất liên kết Facebook...</p>
<script>
try {
  if (window.opener) {
    window.opener.postMessage(${safeJson}, '*');
  }
} catch (e) {}
window.close();
</script>
</body></html>`);
    };

    const fbErr = String(req.query.error_description || req.query.error || '').trim();
    if (fbErr) {
      return renderPopupFinish({ type: 'FB_OAUTH_ERROR', error: fbErr.slice(0, 200) });
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    const storedState = state ? fbOAuthStates.get(state) : undefined;
    if (state) fbOAuthStates.delete(state);

    if (!code || !storedState || storedState.expiresAt <= Date.now()) {
      return renderPopupFinish({
        type: 'FB_OAUTH_ERROR',
        error: 'Phiên xác thực Facebook không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.',
      });
    }

    const clientId = storedState.clientId || String(process.env.FACEBOOK_APP_ID || '').trim();
    const clientSecret = storedState.clientSecret || String(process.env.FACEBOOK_APP_SECRET || '').trim();
    const apiVersion = storedState.apiVersion || 'v21.0';
    if (!clientId || !clientSecret) {
      return renderPopupFinish({
        type: 'FB_OAUTH_ERROR',
        error: 'Thiếu thông số Facebook App ID / App Secret.',
      });
    }

    try {
      const tokenBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: storedState.redirectUri,
        code,
      });
      const tokenResp = await fetch(`https://graph.facebook.com/${apiVersion}/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
        signal: AbortSignal.timeout(9000),
      });
      const tokenJson: any = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok || !tokenJson?.access_token) {
        return renderPopupFinish({
          type: 'FB_OAUTH_ERROR',
          error: tokenJson?.error?.message || 'Không đổi được mã xác thực Facebook.',
        });
      }

      const claimCode = crypto.randomBytes(24).toString('hex');
      fbOAuthClaims.set(claimCode, {
        accessToken: String(tokenJson.access_token),
        expiresAt: Date.now() + 3 * 60 * 1000,
      });

      return renderPopupFinish({ type: 'FB_OAUTH_CLAIM', claimCode });
    } catch (err: any) {
      return renderPopupFinish({
        type: 'FB_OAUTH_ERROR',
        error: err?.message || 'Lỗi kết nối Facebook OAuth.',
      });
    }
  });

  app.post("/api/auth/facebook/claim", async (req, res) => {
    pruneExpiredFbAuthMaps();
    const claimCode = String(req.body?.claimCode || '').trim();
    const entry = claimCode ? fbOAuthClaims.get(claimCode) : undefined;
    if (claimCode) fbOAuthClaims.delete(claimCode);

    if (!entry || entry.expiresAt <= Date.now()) {
      return res.status(400).json({ error: "Mã liên kết Facebook đã hết hạn hoặc đã sử dụng." });
    }

    try {
      const inspection = await inspectFacebookTokenAndPages(entry.accessToken);
      res.json({
        ...inspection,
        accessToken: entry.accessToken,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Không thể đọc thông tin tài khoản Facebook." });
    }
  });

  app.post("/api/mcp/facebook", async (req, res) => {
    const { action = 'build_share_post', message, link, pageId, query } = req.body || {};
    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    try {
      const data = await runFacebookMcpAction(
        action,
        { message, link, pageId, query },
        bearerToken || undefined
      );
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Lỗi kết nối Facebook MCP." });
    }
  });

  app.post("/api/mcp/custom-link", async (req, res) => {
    const { url, method = 'GET', headers, body } = req.body || {};
    const authHeader = String(req.headers.authorization || '');
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    if (!url || !String(url).trim()) {
      return res.status(400).json({ error: "Vui lòng nhập URL liên kết." });
    }
    try {
      const result = await callCustomConnectorEndpoint({
        url: String(url),
        method: String(method || 'GET'),
        headers: headers && typeof headers === 'object' ? headers : undefined,
        bearerToken: bearerToken || undefined,
        body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Không kết nối được tới endpoint đã nhập." });
    }
  });

  app.post("/api/mcp/hub", async (req, res) => {
    const { id = null, method, params = {} } = req.body || {};

    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'themaster-mcp-hub', version: '2.0.0' },
          capabilities: { tools: {} },
        },
      });
    }

    if (method === 'tools/list') {
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            { name: 'web_security_scan', description: 'Quét độ an toàn, mã độc, lừa đảo và nội dung không phù hợp của website', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
            { name: 'google_form_inspect', description: 'Đọc danh sách câu hỏi & entry ID từ link Google Form', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
            { name: 'google_form_submit', description: 'Tự động điền và gửi Google Form', inputSchema: { type: 'object', properties: { url: { type: 'string' }, answers: { type: 'object' } }, required: ['url', 'answers'] } },
            { name: 'google_search', description: 'Tìm kiếm thông tin thực tế qua Google Search grounding', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
            { name: 'facebook_action', description: 'Tạo liên kết chia sẻ hoặc đăng bài lên Facebook Page qua MCP', inputSchema: { type: 'object', properties: { action: { type: 'string' }, message: { type: 'string' }, link: { type: 'string' }, pageId: { type: 'string' } }, required: ['action'] } },
            { name: 'music_resolve_url', description: 'Phân tích link video hoặc playlist YouTube để phát nhạc nền', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
          ],
        },
      });
    }

    if (method === 'tools/call') {
      const toolName = String(params?.name || '');
      const args = (params?.arguments && typeof params.arguments === 'object') ? params.arguments : {};
      try {
        let structured: any = {};
        if (toolName === 'web_security_scan') {
          structured = await scanWebsiteSafety(String(args.url || ''));
        } else if (toolName === 'google_form_inspect') {
          structured = await inspectGoogleForm(String(args.url || ''));
        } else if (toolName === 'google_form_submit') {
          structured = await submitGoogleForm(String(args.url || ''), args.answers || {});
        } else if (toolName === 'facebook_action') {
          const authHeader = String(req.headers.authorization || '');
          const bearerToken = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
          structured = await runFacebookMcpAction(args.action || 'build_share_post', args, bearerToken || undefined);
        } else if (toolName === 'music_resolve_url') {
          structured = await resolveMusicUrl(String(args.url || ''));
        } else if (toolName === 'google_search') {
          const ai = getGenAI();
          const result = await generateContentWithFallback(
            ai,
            () => ({
              contents: String(args.query || ''),
              config: { tools: [{ googleSearch: {} }] },
            }),
            { timeoutMs: 20000 }
          );
          const sources = (result.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
            .map((c: any) => (c.web ? { title: c.web.title, uri: c.web.uri } : null))
            .filter(Boolean);
          structured = { query: String(args.query || ''), answer: result.text || '', sources };
        } else {
          return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown MCP hub tool: ${toolName}` } });
        }

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(structured) }],
            structuredContent: structured,
          },
        });
      } catch (err: any) {
        return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err?.message || 'MCP Hub tool failed' } });
      }
    }

    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unsupported MCP hub method: ${String(method || '')}` } });
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: `Không tìm thấy API endpoint: ${req.method} ${req.originalUrl}` });
  });

  cachedApp = app;
  return app;
}

export default async function handler(req: any, res: any) {
  if (typeof req?.url === 'string') {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const vpath = parsed.searchParams.get('__vpath');
      if (vpath !== null) {
        parsed.searchParams.delete('__vpath');
        const cleanSub = vpath.replace(/^\/+/, '');
        const qs = parsed.searchParams.toString();
        req.url = `/api/${cleanSub}${qs ? `?${qs}` : ''}`;
      }
    } catch {
      // Leave req.url untouched on malformed URL
    }
  }
  const app = await createApiApp();
  return app(req, res);
}

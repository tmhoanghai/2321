import dns from 'node:dns/promises';
import net from 'node:net';

export const MUSIC_WEB_ORIGIN = 'https://test1-gamma-navy-38.vercel.app';

export interface MusicTrackResult {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  sourceUrl: string;
  playlistId?: string;
  viewCount?: number;
}

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
  tld: string;
  tldCategory: 'trusted' | 'standard' | 'caution' | 'high_risk';
  isHttps: boolean;
  safeLevel: 'safe' | 'caution' | 'dangerous';
  score: number;
  warnings: string[];
  checks: WebSafetyCheckItem[];
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

function isPrivateOrBlockedIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '');
  if (clean === '::1' || clean === '::' || clean.startsWith('fe80:') || clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }
  const v4 = net.isIPv4(clean);
  if (!v4) return false;
  const parts = clean.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  const trimmed = String(rawUrl || '').trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('URL không hợp lệ.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Chỉ hỗ trợ giao thức http:// hoặc https://.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    throw new Error('Không được phép truy cập địa chỉ nội bộ.');
  }

  if (net.isIP(host) && isPrivateOrBlockedIp(host)) {
    throw new Error('Không được phép truy cập dải IP nội bộ hoặc metadata.');
  }

  try {
    const records = await dns.lookup(host, { all: true });
    for (const rec of records) {
      if (isPrivateOrBlockedIp(rec.address)) {
        throw new Error('Tên miền trỏ về địa chỉ IP nội bộ không hợp lệ.');
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('nội bộ') || err?.message?.includes('IP')) {
      throw err;
    }
  }

  return parsed;
}

export async function safePublicFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxBytes = 1_500_000,
  maxRedirects = 4
): Promise<{ response: Response; finalUrl: string; bodyText: string }> {
  let currentUrl = (await assertSafePublicHttpUrl(rawUrl)).toString();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const resp = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(8500),
      headers: {
        'User-Agent': 'TheMasterMCPScanner/1.0 (+https://vercel.app)',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        ...(init.headers || {}),
      },
    });

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) break;
      const nextUrl = new URL(loc, currentUrl).toString();
      currentUrl = (await assertSafePublicHttpUrl(nextUrl)).toString();
      continue;
    }

    const buf = await resp.arrayBuffer();
    const sliced = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const bodyText = new TextDecoder('utf-8', { fatal: false }).decode(sliced);
    return { response: resp, finalUrl: currentUrl, bodyText };
  }

  throw new Error('Quá nhiều lượt chuyển hướng URL.');
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function classifyDomainTld(host: string): {
  tld: string;
  tldCategory: WebSafetyReport['tldCategory'];
  detail: string;
} {
  if (net.isIP(host)) {
    return { tld: 'IP', tldCategory: 'high_risk', detail: 'Truy cập trực tiếp bằng địa chỉ IP thay vì tên miền.' };
  }
  const parts = host.toLowerCase().split('.').filter(Boolean);
  const last1 = parts.length >= 1 ? `.${parts[parts.length - 1]}` : '';
  const last2 = parts.length >= 2 ? `.${parts.slice(-2).join('.')}` : last1;

  const multiPartTrust = ['.gov.vn', '.edu.vn', '.org.vn', '.ac.uk', '.gov.uk', '.edu.au', '.gov.au', '.co.jp', '.go.jp', '.com.vn', '.net.vn'];
  const tld = multiPartTrust.includes(last2) ? last2 : last1;

  if (/\.(gov|edu|mil|ac)(\.[a-z]{2})?$/i.test(tld) || tld === '.org.vn') {
    return { tld, tldCategory: 'trusted', detail: `Đuôi tên miền ${tld} thuộc nhóm cơ quan/giáo dục/tổ chức uy tín cao.` };
  }
  if (/\.(tk|ml|ga|cf|gq|zip|mov|click|top|work|loan|cfd|sbs|cyou)$/i.test(tld)) {
    return { tld, tldCategory: 'high_risk', detail: `Đuôi tên miền ${tld} thường bị lạm dụng cho trang giả mạo hoặc spam.` };
  }
  if (/\.(xyz|info|biz|online|site|club|live|icu|vip|pw|cc|ws)$/i.test(tld)) {
    return { tld, tldCategory: 'caution', detail: `Đuôi tên miền ${tld} cần kiểm tra kỹ độ tin cậy trước khi nhập dữ liệu.` };
  }
  return { tld: tld || host, tldCategory: 'standard', detail: `Đuôi tên miền phổ biến (${tld || host}).` };
}

export async function scanWebsiteSafety(rawUrl: string): Promise<WebSafetyReport> {
  const parsed = await assertSafePublicHttpUrl(rawUrl);
  const warnings: string[] = [];
  const checks: WebSafetyCheckItem[] = [];
  let score = 100;

  const flags = {
    phishing: false,
    malwareScript: false,
    inappropriateContent: false,
    insecureHttp: parsed.protocol !== 'https:',
  };

  const host = parsed.hostname.toLowerCase();
  const fullLower = parsed.toString().toLowerCase();
  const tldInfo = classifyDomainTld(host);

  if (tldInfo.tldCategory === 'high_risk') {
    score -= 18;
    warnings.push(tldInfo.detail);
    checks.push({ id: 'tld', label: `Đuôi miền (${tldInfo.tld})`, status: 'fail', detail: tldInfo.detail });
  } else if (tldInfo.tldCategory === 'caution') {
    score -= 8;
    warnings.push(tldInfo.detail);
    checks.push({ id: 'tld', label: `Đuôi miền (${tldInfo.tld})`, status: 'warn', detail: tldInfo.detail });
  } else {
    checks.push({ id: 'tld', label: `Đuôi miền (${tldInfo.tld})`, status: 'pass', detail: tldInfo.detail });
  }

  if (flags.insecureHttp) {
    score -= 22;
    warnings.push('Trang web sử dụng HTTP không mã hóa (thiếu HTTPS). Không nên nhập mật khẩu hay thông tin nhạy cảm.');
    checks.push({ id: 'https', label: 'Giao thức HTTPS/TLS', status: 'fail', detail: 'Không có mã hóa HTTPS.' });
  } else {
    checks.push({ id: 'https', label: 'Giao thức HTTPS/TLS', status: 'pass', detail: 'Kết nối được mã hóa HTTPS.' });
  }

  if (host.includes('xn--')) {
    score -= 25;
    flags.phishing = true;
    warnings.push('Tên miền dùng mã hóa Punycode (xn--), có nguy cơ giả mạo tên miền (IDN homograph).');
    checks.push({ id: 'punycode', label: 'Kiểm tra giả mạo ký tự', status: 'fail', detail: 'Phát hiện Punycode (xn--).' });
  } else if (net.isIP(host)) {
    score -= 20;
    flags.phishing = true;
    warnings.push('URL truy cập trực tiếp bằng địa chỉ IP thay vì tên miền chính thức.');
    checks.push({ id: 'punycode', label: 'Tên miền hợp lệ', status: 'fail', detail: 'URL trỏ tới địa chỉ IP trần.' });
  } else if (host.split('.').length >= 5) {
    score -= 15;
    flags.phishing = true;
    warnings.push('Cấu trúc tên miền phụ quá sâu (thường gặp ở trang lừa đảo/phishing).');
    checks.push({ id: 'punycode', label: 'Cấu trúc tên miền', status: 'warn', detail: 'Tên miền phụ phân cấp quá sâu.' });
  } else {
    checks.push({ id: 'punycode', label: 'Cấu trúc tên miền', status: 'pass', detail: 'Tên miền rõ ràng, không dấu hiệu IDN homograph.' });
  }

  if (/\.(tk|ml|ga|cf|gq|top|xyz|click|zip|mov)$/i.test(host) && /(login|verify|bank|wallet|facebook|google|apple|paypal|momo|zalopay|vcb)/i.test(fullLower)) {
    score -= 40;
    flags.phishing = true;
    warnings.push('Phát hiện dấu hiệu giả mạo thương hiệu đăng nhập / ngân hàng trên tên miền rủi ro cao.');
  }

  let finalUrl = parsed.toString();
  let title = host;
  let description = '';
  let embeddable = true;
  let embedReason = '';

  try {
    const { response, finalUrl: resolvedUrl, bodyText } = await safePublicFetch(parsed.toString());
    finalUrl = resolvedUrl;

    const xfo = (response.headers.get('x-frame-options') || '').toLowerCase();
    const csp = (response.headers.get('content-security-policy') || '').toLowerCase();
    if (xfo.includes('deny') || xfo.includes('sameorigin')) {
      embeddable = false;
      embedReason = `Website thiết lập X-Frame-Options: ${xfo.toUpperCase()} nên sẽ mô phỏng qua chế độ Đọc & Cấu trúc an toàn.`;
    } else if (/frame-ancestors\s+[^;]*('none'|'self')/i.test(csp)) {
      embeddable = false;
      embedReason = 'Website giới hạn nhúng khung qua Content-Security-Policy (frame-ancestors).';
    }

    const titleMatch = bodyText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()).slice(0, 140) || host;
    }

    const descMatch =
      bodyText.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      bodyText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (descMatch?.[1]) {
      description = decodeHtmlEntities(descMatch[1].trim()).slice(0, 260);
    }

    const visibleText = bodyText
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    if (/(eval\s*\(\s*atob\s*\(|document\.write\s*\(\s*unescape|coinhive|cryptonight|webminer)/i.test(bodyText)) {
      score -= 40;
      flags.malwareScript = true;
      warnings.push('Phát hiện mã JavaScript bị làm rối bất thường (eval/atob) hoặc dấu hiệu đào tiền ảo trên trình duyệt.');
    }

    if (/<iframe[^>]+(?:width\s*=\s*["']?0["']?|height\s*=\s*["']?0["']?|display\s*:\s*none)/i.test(bodyText)) {
      score -= 20;
      flags.malwareScript = true;
      warnings.push('Trang web chứa iframe ẩn kích thước 0px.');
    }

    if (/(?:location\.href|window\.open)[^;\n]{0,120}\.(exe|scr|bat|msi|vbs|apk)\b/i.test(bodyText)) {
      score -= 35;
      flags.malwareScript = true;
      warnings.push('Phát hiện liên kết tự động tải tệp thực thi nguy hiểm (.exe/.bat/.apk).');
    }

    if (/<input[^>]+type=["']password["']/i.test(bodyText) && !finalUrl.startsWith('https://')) {
      score -= 35;
      flags.phishing = true;
      warnings.push('Trang chứa ô nhập mật khẩu nhưng không dùng kết nối HTTPS an toàn.');
    }

    const badMatches = [
      { re: /\b(tài xỉu|cá cược|cá độ|nhà cái uy tín|nổ hũ|casino trực tuyến|xóc đĩa|lô đề online|bet88|kubet|789bet)\b/i, msg: 'Nội dung liên quan cờ bạc / cá độ trực tuyến không phù hợp.' },
      { re: /\b(xxx|porn|hentai|sex video|phim người lớn|18\+ clip|nude cam)\b/i, msg: 'Phát hiện từ khóa nội dung người lớn (18+ / NSFW).' },
      { re: /\b(trúng thưởng iphone|nhận thưởng ngay|nạp thẻ nhận quà|hack nick|hack tài khoản|keylogger|rat trojan|ransomware)\b/i, msg: 'Phát hiện dấu hiệu nội dung lừa đảo trúng thưởng hoặc công cụ xâm nhập độc hại.' },
    ];

    for (const rule of badMatches) {
      if (rule.re.test(title.toLowerCase()) || rule.re.test(visibleText.slice(0, 25000))) {
        score -= 35;
        flags.inappropriateContent = true;
        warnings.push(rule.msg);
      }
    }

    checks.push({
      id: 'script',
      label: 'Quét mã nguồn & liên kết tải',
      status: flags.malwareScript ? 'fail' : 'pass',
      detail: flags.malwareScript ? 'Phát hiện đoạn mã hoặc điều hướng tải bất thường.' : 'Không phát hiện mã làm rối hoặc tải tệp thực thi nguy hiểm.',
    });
    checks.push({
      id: 'content',
      label: 'Kiểm tra giả mạo & nội dung',
      status: flags.phishing || flags.inappropriateContent ? 'fail' : 'pass',
      detail: flags.phishing || flags.inappropriateContent ? 'Có từ khóa rủi ro hoặc dấu hiệu lừa đảo.' : 'Nội dung sạch, chưa phát hiện dấu hiệu giả mạo.',
    });
  } catch (err: any) {
    score -= 15;
    embeddable = false;
    embedReason = err?.message || 'Không thể tải trước nội dung trang web.';
    warnings.push(`Không thể quét sâu nội dung trang: ${embedReason}`);
    checks.push({
      id: 'fetch',
      label: 'Tải kiểm tra nội dung',
      status: 'warn',
      detail: embedReason,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const safeLevel: WebSafetyReport['safeLevel'] =
    score < 55 || flags.malwareScript || flags.phishing || flags.inappropriateContent
      ? 'dangerous'
      : score < 85 || flags.insecureHttp
      ? 'caution'
      : 'safe';

  return {
    url: parsed.toString(),
    finalUrl,
    hostname: host,
    tld: tldInfo.tld,
    tldCategory: tldInfo.tldCategory,
    isHttps: finalUrl.startsWith('https://'),
    safeLevel,
    score,
    warnings,
    checks,
    flags,
    embeddable,
    embedReason,
    title,
    description,
    checkedAt: new Date().toISOString(),
  };
}

export async function fetchSafeWebsiteSnapshot(rawUrl: string) {
  const startedAt = Date.now();
  const report = await scanWebsiteSafety(rawUrl);
  const { bodyText } = await safePublicFetch(report.finalUrl);
  const responseTimeMs = Math.max(1, Date.now() - startedAt);

  const headings: Array<{ level: string; text: string }> = [];
  const headingRegex = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(bodyText)) !== null && headings.length < 18) {
    const text = decodeHtmlEntities(hMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 140);
    if (text) {
      headings.push({ level: hMatch[1].toUpperCase(), text });
    }
  }

  const links: Array<{ text: string; href: string }> = [];
  const seenHrefs = new Set<string>();
  const linkRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let lMatch: RegExpExecArray | null;
  while ((lMatch = linkRegex.exec(bodyText)) !== null && links.length < 24) {
    const rawHref = lMatch[1].trim();
    if (!rawHref || /^(?:javascript|data|vbscript|mailto|tel):/i.test(rawHref)) continue;
    try {
      const resolved = new URL(rawHref, report.finalUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
      const hrefStr = resolved.toString();
      if (seenHrefs.has(hrefStr)) continue;
      seenHrefs.add(hrefStr);
      const text = decodeHtmlEntities(lMatch[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 100);
      links.push({
        text: text || resolved.hostname + (resolved.pathname !== '/' ? resolved.pathname : ''),
        href: hrefStr,
      });
    } catch {
      // ignore invalid href
    }
  }

  const imageCount = (bodyText.match(/<img\b/gi) || []).length;
  const scriptCount = (bodyText.match(/<script\b/gi) || []).length;
  const formCount = (bodyText.match(/<form\b/gi) || []).length;

  const cleanText = decodeHtmlEntities(
    bodyText
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  ).slice(0, 8000);

  return {
    safety: report,
    title: report.title,
    textContent: cleanText,
    links,
    headings,
    stats: {
      linkCount: links.length,
      imageCount,
      scriptCount,
      formCount,
      responseTimeMs,
    },
  };
}

function mapGoogleFormType(typeCode: number): GoogleFormField['type'] {
  switch (typeCode) {
    case 0:
      return 'short_text';
    case 1:
      return 'paragraph';
    case 2:
      return 'multiple_choice';
    case 3:
      return 'dropdown';
    case 4:
      return 'checkboxes';
    case 5:
      return 'linear_scale';
    default:
      return 'unknown';
  }
}

function extractBalancedArray(source: string, startIdx: number): string | null {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

export async function inspectGoogleForm(rawUrl: string): Promise<GoogleFormSchema> {
  const parsed = await assertSafePublicHttpUrl(rawUrl);
  if (!/(^|\.)(docs\.google\.com|forms\.gle)$/i.test(parsed.hostname)) {
    throw new Error('Link không phải Google Form (hỗ trợ docs.google.com/forms hoặc forms.gle).');
  }

  const { finalUrl, bodyText } = await safePublicFetch(parsed.toString());
  const finalParsed = new URL(finalUrl);
  if (!/(^|\.)docs\.google\.com$/i.test(finalParsed.hostname) || !finalParsed.pathname.includes('/forms')) {
    throw new Error('Không phân tích được cấu trúc Google Form từ URL này.');
  }

  const submitUrl = finalUrl
    .replace(/\/viewform(\?.*)?$/i, '/formResponse')
    .replace(/\/prefill(\?.*)?$/i, '/formResponse');

  const markerIdx = bodyText.indexOf('FB_PUBLIC_LOAD_DATA_');
  if (markerIdx === -1) {
    throw new Error('Google Form này yêu cầu đăng nhập hoặc không công khai FB_PUBLIC_LOAD_DATA_.');
  }
  const arrStart = bodyText.indexOf('[', markerIdx);
  const rawArr = arrStart !== -1 ? extractBalancedArray(bodyText, arrStart) : null;
  if (!rawArr) {
    throw new Error('Không đọc được danh sách câu hỏi trong Google Form.');
  }

  const data = JSON.parse(rawArr);
  const formBody = Array.isArray(data?.[1]) ? data[1] : [];
  const description = typeof formBody?.[0] === 'string' ? formBody[0] : '';
  const rawQuestions = Array.isArray(formBody?.[1]) ? formBody[1] : [];
  const title =
    (typeof formBody?.[8] === 'string' && formBody[8]) ||
    (typeof data?.[3] === 'string' && data[3]) ||
    decodeHtmlEntities((bodyText.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Google Form').trim());

  const fields: GoogleFormField[] = [];
  for (const q of rawQuestions) {
    if (!Array.isArray(q)) continue;
    const label = typeof q[1] === 'string' ? q[1].trim() : '';
    const qDesc = typeof q[2] === 'string' ? q[2].trim() : undefined;
    const typeCode = Number(q[3]);
    const answerMeta = Array.isArray(q[4]) ? q[4] : [];
    for (const meta of answerMeta) {
      if (!Array.isArray(meta) || meta[0] === undefined || meta[0] === null) continue;
      const entryId = `entry.${meta[0]}`;
      const required = Boolean(meta[2] === 1);
      const rawOptions = Array.isArray(meta[1]) ? meta[1] : [];
      const options = rawOptions
        .map((opt: any) => (Array.isArray(opt) && typeof opt[0] === 'string' ? opt[0].trim() : ''))
        .filter(Boolean);
      fields.push({
        entryId,
        label: label || entryId,
        description: qDesc,
        type: mapGoogleFormType(typeCode),
        required,
        options,
      });
    }
  }

  return {
    formUrl: finalUrl,
    submitUrl: submitUrl.includes('/formResponse') ? submitUrl : `${finalUrl.replace(/\/$/, '')}/formResponse`,
    title,
    description,
    fields,
  };
}

export async function submitGoogleForm(
  formUrl: string,
  answers: Record<string, string | string[]>
): Promise<{
  ok: boolean;
  status: number;
  formTitle: string;
  submitUrl: string;
  submittedFields: Array<{ entryId: string; label: string; value: string }>;
  message: string;
}> {
  const schema = await inspectGoogleForm(formUrl);
  const params = new URLSearchParams();
  const submittedFields: Array<{ entryId: string; label: string; value: string }> = [];

  for (const [rawKey, rawVal] of Object.entries(answers || {})) {
    const keyLower = rawKey.trim().toLowerCase();
    const matchedField =
      schema.fields.find(f => f.entryId.toLowerCase() === keyLower) ||
      schema.fields.find(f => f.label.toLowerCase() === keyLower) ||
      schema.fields.find(f => f.label.toLowerCase().includes(keyLower) || keyLower.includes(f.label.toLowerCase()));

    const targetEntry = matchedField?.entryId || (rawKey.startsWith('entry.') ? rawKey : '');
    if (!targetEntry) continue;

    if (Array.isArray(rawVal)) {
      for (const item of rawVal) {
        params.append(targetEntry, String(item));
      }
      submittedFields.push({
        entryId: targetEntry,
        label: matchedField?.label || targetEntry,
        value: rawVal.join(', '),
      });
    } else {
      const valStr = String(rawVal ?? '');
      params.append(targetEntry, valStr);
      submittedFields.push({
        entryId: targetEntry,
        label: matchedField?.label || targetEntry,
        value: valStr,
      });
    }
  }

  if (submittedFields.length === 0) {
    throw new Error('Không khớp được trường câu hỏi nào trong Google Form để điền.');
  }

  params.set('fvv', '1');
  params.set('pageHistory', '0');

  const postResp = await fetch(schema.submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'TheMasterMCPFormFiller/1.0',
    },
    body: params.toString(),
    signal: AbortSignal.timeout(9000),
  });

  const respHtml = await postResp.text();
  const recorded =
    postResp.ok &&
    !/class=["']freebirdFormviewerViewResponseErrorMessage|required/i.test(respHtml);

  return {
    ok: recorded,
    status: postResp.status,
    formTitle: schema.title,
    submitUrl: schema.submitUrl,
    submittedFields,
    message: recorded
      ? `Đã gửi thành công ${submittedFields.length} trường vào "${schema.title}".`
      : `Google Form trả về HTTP ${postResp.status}. Vui lòng kiểm tra các câu hỏi bắt buộc hoặc đăng nhập.`,
  };
}

export async function resolveMusicUrl(rawUrl: string): Promise<{
  playlistId?: string;
  tracks: MusicTrackResult[];
}> {
  const parsed = await assertSafePublicHttpUrl(rawUrl);
  const host = parsed.hostname.toLowerCase();

  const isYouTube =
    /(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com|youtube-nocookie\.com)$/i.test(host);

  if (!isYouTube) {
    throw new Error('Hiện hỗ trợ phát qua link YouTube video hoặc YouTube playlist.');
  }

  let videoId = '';
  if (host.includes('youtu.be')) {
    videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
  } else if (parsed.pathname.startsWith('/shorts/')) {
    videoId = parsed.pathname.split('/')[2] || '';
  } else if (parsed.pathname.startsWith('/embed/')) {
    videoId = parsed.pathname.split('/')[2] || '';
  } else {
    videoId = parsed.searchParams.get('v') || '';
  }

  const playlistId = parsed.searchParams.get('list') || undefined;
  const tracks: MusicTrackResult[] = [];
  const seen = new Set<string>();

  if (playlistId) {
    try {
      const { bodyText } = await safePublicFetch(
        `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`
      );
      const regex = /"playlistVideoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"[\s\S]{0,1800}?"title":\{"runs":\[\{"text":"((?:\\.|[^"])*)"\}\][\s\S]{0,1200}?(?:"shortBylineText":\{"runs":\[\{"text":"((?:\\.|[^"])*)"|"longBylineText":\{"runs":\[\{"text":"((?:\\.|[^"])*)")?/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(bodyText)) !== null && tracks.length < 30) {
        const vid = match[1];
        if (!vid || seen.has(vid)) continue;
        seen.add(vid);
        const title = (match[2] || `Track ${tracks.length + 1}`).replace(/\\"/g, '"').replace(/\\u0026/g, '&');
        const author = (match[3] || match[4] || 'YouTube Playlist').replace(/\\"/g, '"').replace(/\\u0026/g, '&');
        tracks.push({
          id: vid,
          title,
          channelTitle: author,
          thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
          sourceUrl: rawUrl,
          playlistId,
        });
      }
    } catch {
      // Fall back to playlistId playback via YT IFrame player + optional seed video
    }
  }

  if (videoId && !seen.has(videoId)) {
    let title = 'YouTube Track';
    let channelTitle = 'YouTube';
    try {
      const oembedResp = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (oembedResp.ok) {
        const meta: any = await oembedResp.json();
        if (meta?.title) title = String(meta.title);
        if (meta?.author_name) channelTitle = String(meta.author_name);
      }
    } catch {
      // Keep defaults
    }

    tracks.unshift({
      id: videoId,
      title,
      channelTitle,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      sourceUrl: rawUrl,
      playlistId,
    });
  }

  if (tracks.length === 0 && playlistId) {
    tracks.push({
      id: `playlist:${playlistId}`,
      title: `YouTube Playlist (${playlistId.slice(0, 14)})`,
      channelTitle: 'YouTube Playlist',
      thumbnail: '',
      sourceUrl: rawUrl,
      playlistId,
    });
  }

  return { playlistId, tracks };
}

export function analyzeMusicDisambiguation(query: string, tracks: MusicTrackResult[]): {
  ambiguous: boolean;
  reason?: string;
  candidates: Array<{ channelTitle: string; track: MusicTrackResult }>;
} {
  const cleanQ = query.toLowerCase().trim();
  if (!cleanQ || tracks.length <= 1) {
    return { ambiguous: false, candidates: [] };
  }

  const byArtist = new Map<string, MusicTrackResult>();
  for (const t of tracks) {
    const artist = (t.channelTitle || '').trim();
    const key = artist.toLowerCase();
    if (!artist || key === 'ncmusicplayer' || byArtist.has(key)) continue;
    byArtist.set(key, t);
  }

  const distinct = Array.from(byArtist.values());
  if (distinct.length < 2) {
    return { ambiguous: false, candidates: [] };
  }

  // If the user already included a specific artist/channel name inside the query, no disambiguation needed
  const queryMatchesArtist = distinct.some(t => {
    const tokens = t.channelTitle
      .toLowerCase()
      .replace(/official|vevo|music|channel|records|entertainment/gi, '')
      .trim()
      .split(/\s+/)
      .filter(w => w.length >= 2);
    return tokens.length > 0 && tokens.some(tok => cleanQ.includes(tok));
  });

  if (queryMatchesArtist || cleanQ.split(/\s+/).length >= 12) {
    return { ambiguous: false, candidates: [] };
  }

  // Check if multiple distinct artists have tracks matching the requested song keywords
  const qWords = cleanQ.split(/\s+/).filter(w => w.length >= 2);
  const matchingArtists = distinct.filter(t => {
    const titleLower = t.title.toLowerCase();
    return qWords.every(w => titleLower.includes(w));
  });

  if (matchingArtists.length >= 2) {
    return {
      ambiguous: true,
      reason: `Tên bài hát "${query}" khớp nhiều tác giả / ban nhạc khác nhau.`,
      candidates: matchingArtists.slice(0, 5).map(t => ({
        channelTitle: t.channelTitle,
        track: t,
      })),
    };
  }

  return { ambiguous: false, candidates: [] };
}

export interface FacebookPageSummary {
  id: string;
  name: string;
  category?: string;
  accessToken?: string;
  picture?: string;
  tasks?: string[];
}

export interface FacebookTokenInspection {
  ok: true;
  mode: 'graph_api';
  tokenType: 'user_token' | 'page_or_profile_token';
  user: {
    id: string;
    name: string;
    picture?: string;
  };
  permissions: Array<{ permission: string; status: string }>;
  pages: FacebookPageSummary[];
  note: string;
}

function normalizeFacebookSlug(rawQuery: string): string {
  const trimmed = String(rawQuery || '').trim();
  if (!trimmed) {
    throw new Error('Vui lòng nhập link Page, @username hoặc Page ID Facebook.');
  }

  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('facebook.com') || trimmed.includes('fb.com')) {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed: URL;
    try {
      parsed = new URL(withProto);
    } catch {
      throw new Error('Link Facebook không hợp lệ.');
    }
    const host = parsed.hostname.toLowerCase();
    if (!/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(host)) {
      throw new Error('Chỉ hỗ trợ đường dẫn thuộc facebook.com hoặc fb.com.');
    }
    const profileIdParam = parsed.searchParams.get('id');
    if (profileIdParam && /^\d{4,30}$/.test(profileIdParam.trim())) {
      candidate = profileIdParam.trim();
    } else {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const first = segments[0] || '';
      if (first === 'pages' && segments[2] && /^\d{4,30}$/.test(segments[2])) {
        candidate = segments[2];
      } else {
        candidate = first;
      }
    }
  } else if (candidate.startsWith('@')) {
    candidate = candidate.slice(1);
  }

  candidate = candidate.trim();
  if (!/^[a-zA-Z0-9._-]{1,120}$/.test(candidate)) {
    throw new Error('Tên Page hoặc Page ID không hợp lệ.');
  }
  return candidate;
}

export async function inspectFacebookTokenAndPages(accessToken: string): Promise<FacebookTokenInspection> {
  const token = String(accessToken || '').trim();
  if (!token) {
    throw new Error('Vui lòng dán Facebook Access Token để kiểm tra và tìm Page.');
  }

  const meResp = await fetch(
    'https://graph.facebook.com/v21.0/me?fields=id,name,picture.type(normal){url}',
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8500),
    }
  );
  const meData: any = await meResp.json().catch(() => ({}));
  if (!meResp.ok || !meData?.id) {
    throw new Error(meData?.error?.message || `Facebook Graph HTTP ${meResp.status}`);
  }

  let pages: FacebookPageSummary[] = [];
  try {
    const accResp = await fetch(
      'https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token,picture.type(small){url},tasks&limit=50',
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8500),
      }
    );
    const accData: any = await accResp.json().catch(() => ({}));
    if (accResp.ok && Array.isArray(accData?.data)) {
      pages = accData.data
        .filter((p: any) => p?.id && p?.name)
        .map((p: any) => ({
          id: String(p.id),
          name: String(p.name),
          category: typeof p.category === 'string' ? p.category : undefined,
          accessToken: typeof p.access_token === 'string' ? p.access_token : undefined,
          picture: typeof p?.picture?.data?.url === 'string' ? p.picture.data.url : undefined,
          tasks: Array.isArray(p.tasks) ? p.tasks.map(String) : undefined,
        }));
    }
  } catch {
    // Non-fatal: token may already be a Page Access Token
  }

  let permissions: Array<{ permission: string; status: string }> = [];
  try {
    const permResp = await fetch('https://graph.facebook.com/v21.0/me/permissions', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    const permData: any = await permResp.json().catch(() => ({}));
    if (permResp.ok && Array.isArray(permData?.data)) {
      permissions = permData.data
        .filter((item: any) => item?.permission && item?.status)
        .map((item: any) => ({
          permission: String(item.permission),
          status: String(item.status),
        }));
    }
  } catch {
    // Ignore optional permissions lookup error
  }

  const isUserToken = pages.length > 0 || permissions.length > 0;
  const note =
    pages.length > 0
      ? `Tìm thấy ${pages.length} Facebook Page thuộc tài khoản "${meData.name}". Chọn 1 Page để tự điền Page ID & Page Token.`
      : isUserToken
      ? `Đã xác thực tài khoản "${meData.name}", nhưng chưa thấy Page nào (cần quyền pages_show_list / là quản trị viên Page).`
      : `Token hợp lệ cho "${meData.name}" (ID: ${meData.id}) — có thể dùng trực tiếp làm Page ID & Token.`;

  return {
    ok: true,
    mode: 'graph_api',
    tokenType: isUserToken ? 'user_token' : 'page_or_profile_token',
    user: {
      id: String(meData.id),
      name: String(meData.name || 'Facebook Account'),
      picture: typeof meData?.picture?.data?.url === 'string' ? meData.picture.data.url : undefined,
    },
    permissions,
    pages,
    note,
  };
}

export async function lookupFacebookPage(queryOrUrl: string, accessToken?: string) {
  const slug = normalizeFacebookSlug(queryOrUrl);
  const token = String(accessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();

  if (!token) {
    return {
      ok: true,
      mode: 'slug_extracted' as const,
      page: {
        id: slug,
        name: slug,
        link: `https://www.facebook.com/${encodeURIComponent(slug)}`,
      },
      note: `Đã trích xuất định danh Page "${slug}". Hãy dán Access Token phía trên để tra cứu chính xác ID số từ Facebook Graph API.`,
    };
  }

  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(slug)}?fields=id,name,category,link,followers_count,fan_count`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    }
  );
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.id) {
    throw new Error(data?.error?.message || `Không tìm thấy Page "${slug}" qua Graph API (HTTP ${resp.status}).`);
  }

  return {
    ok: true,
    mode: 'graph_api' as const,
    page: {
      id: String(data.id),
      name: String(data.name || slug),
      category: typeof data.category === 'string' ? data.category : undefined,
      link: typeof data.link === 'string' ? data.link : `https://www.facebook.com/${encodeURIComponent(String(data.id))}`,
      followersCount: typeof data.followers_count === 'number' ? data.followers_count : undefined,
    },
    note: `Đã tìm thấy Page "${data.name || slug}" — ID: ${data.id}`,
  };
}

export async function runFacebookMcpAction(
  action: 'build_share_post' | 'publish_page_post' | 'get_page_info' | 'inspect_token' | 'list_pages' | 'lookup_page',
  payload: { message?: string; link?: string; pageId?: string; query?: string },
  runtimePageToken?: string
) {
  const message = String(payload?.message || '').trim();
  const link = String(payload?.link || '').trim();
  const token = String(runtimePageToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  const rawPageId = String(payload?.pageId || process.env.FACEBOOK_PAGE_ID || 'me').trim();
  const pageId = rawPageId === 'me' ? 'me' : normalizeFacebookSlug(rawPageId);

  if (action === 'inspect_token' || action === 'list_pages') {
    return await inspectFacebookTokenAndPages(token);
  }

  if (action === 'lookup_page') {
    const query = String(payload?.query || payload?.pageId || '').trim();
    return await lookupFacebookPage(query, token || undefined);
  }

  if (action === 'build_share_post' || !token) {
    const shareParams = new URLSearchParams();
    if (link) shareParams.set('u', link);
    if (message) shareParams.set('quote', message);
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?${shareParams.toString()}`;
    return {
      ok: true,
      mode: token ? 'graph_ready' : 'share_dialog',
      action,
      message,
      link,
      shareUrl,
      preview: { message, link },
      note: token
        ? 'Đã tạo bản nháp bài đăng Facebook.'
        : 'Chưa có Page Access Token — đã tạo sẵn liên kết Facebook Share Dialog để đăng nhanh an toàn.',
    };
  }

  if (action === 'get_page_info') {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}?fields=id,name,followers_count,link`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error?.message || `Facebook Graph HTTP ${resp.status}`);
    }
    return { ok: true, mode: 'graph_api', pageId: String(data?.id || pageId), data, page: data, preview: { message, link } };
  }

  if (action === 'publish_page_post') {
    if (!message && !link) {
      throw new Error('Cần nội dung bài viết hoặc đường dẫn để đăng lên Facebook Page.');
    }
    const body = new URLSearchParams();
    if (message) body.set('message', message);
    if (link) body.set('link', link);

    const resp = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/feed`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(9000),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data?.error?.message || `Facebook publish HTTP ${resp.status}`);
    }
    return { ok: true, mode: 'graph_api', postId: data?.id, pageId, message, link, preview: { message, link } };
  }

  throw new Error(`Unsupported Facebook MCP action: ${action}`);
}

export function parseLyricsResponseBlocks(rawText: string): {
  detectedTitle: string;
  detectedArtist: string;
  detectedLanguage: string;
  originalLyrics: string;
  translatedLyrics: string;
} {
  const text = String(rawText || '').trim();
  const titleMatch = text.match(/^TITLE:\s*(.+)$/im);
  const artistMatch = text.match(/^ARTIST:\s*(.+)$/im);
  const langMatch = text.match(/^ORIGINAL_LANGUAGE:\s*(.+)$/im);

  const origIdx = text.indexOf('===ORIGINAL_LYRICS===');
  const transIdx = text.indexOf('===TRANSLATED_LYRICS===');

  let originalLyrics = '';
  let translatedLyrics = '';

  if (origIdx !== -1) {
    const startOrig = origIdx + '===ORIGINAL_LYRICS==='.length;
    originalLyrics = (transIdx !== -1 && transIdx > startOrig
      ? text.slice(startOrig, transIdx)
      : text.slice(startOrig)
    ).trim();
  }
  if (transIdx !== -1) {
    translatedLyrics = text.slice(transIdx + '===TRANSLATED_LYRICS==='.length).trim();
  }

  if (!originalLyrics && !translatedLyrics) {
    originalLyrics = text;
  }

  return {
    detectedTitle: titleMatch?.[1]?.trim() || '',
    detectedArtist: artistMatch?.[1]?.trim() || '',
    detectedLanguage: langMatch?.[1]?.trim() || '',
    originalLyrics,
    translatedLyrics,
  };
}

export const ONE_BILLION_VIEWS = 1_000_000_000;

export function parseYouTubeViewCount(rawText: string): number {
  const s = String(rawText || '').trim();
  if (!s) return 0;

  // Abbreviated counts like "1.5B views", "850M views", "420K views", "1,2 tỷ lượt xem", "450 Tr"
  const abbrMatch = s.match(
    /(\d+(?:[.,]\d+)?)\s*(b|m|k|tỷ|tỉ|ty|ti|triệu|trieu|tr|nghìn|nghin|n)(?=$|\s|views?|lượt)/iu
  );
  if (abbrMatch) {
    const num = Number(abbrMatch[1].replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) return 0;
    const unit = abbrMatch[2].toLowerCase();
    if (unit === 'b' || unit === 'tỷ' || unit === 'tỉ' || unit === 'ty' || unit === 'ti') {
      return Math.round(num * 1_000_000_000);
    }
    if (unit === 'm' || unit === 'triệu' || unit === 'trieu' || unit === 'tr') {
      return Math.round(num * 1_000_000);
    }
    if (unit === 'k' || unit === 'nghìn' || unit === 'nghin' || unit === 'n') {
      return Math.round(num * 1_000);
    }
    return Math.round(num);
  }

  // Exact integer/comma-separated counts like "9,181,242,846 views"
  const exactMatch = s.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)/);
  if (exactMatch) {
    const digitsOnly = exactMatch[1].replace(/[.,]/g, '');
    const n = Number(digitsOnly);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  return 0;
}

export function sortMusicTracksByPopularity<T extends { viewCount?: number }>(tracks: T[]): T[] {
  return tracks
    .map((track, idx) => ({ track, idx }))
    .sort((a, b) => {
      const av = Number(a.track.viewCount || 0);
      const bv = Number(b.track.viewCount || 0);
      const aBillion = av >= ONE_BILLION_VIEWS ? 1 : 0;
      const bBillion = bv >= ONE_BILLION_VIEWS ? 1 : 0;

      // Tier 1: Tracks >= 1B views ALWAYS come first, sorted descending
      if (aBillion !== bBillion) {
        return bBillion - aBillion;
      }
      if (aBillion === 1 && bBillion === 1) {
        if (bv !== av) return bv - av;
        return a.idx - b.idx;
      }

      // Tier 2: Known view counts (< 1B) sorted descending
      if ((av > 0 || bv > 0) && av !== bv) {
        return bv - av;
      }
      return a.idx - b.idx;
    })
    .map((entry) => entry.track);
}

export async function fetchYouTubeViewStats(
  query: string
): Promise<Map<string, { viewCount: number; title?: string; channelTitle?: string }>> {
  const map = new Map<string, { viewCount: number; title?: string; channelTitle?: string }>();
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return map;

  try {
    const resp = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanQ)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TheMasterBot/1.0)',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (!resp.ok) return map;
    const html = await resp.text();
    const regex =
      /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"[\s\S]{0,2800}?"title":\{"runs":\[\{"text":"((?:\\.|[^"])*)"\}[\s\S]{0,2200}?"viewCountText":\{"simpleText":"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null && map.size < 20) {
      const videoId = m[1];
      if (!videoId || map.has(videoId)) continue;
      const viewCount = parseYouTubeViewCount(m[3]);
      if (viewCount <= 0) continue;
      const title = m[2]
        .replace(/\\"/g, '"')
        .replace(/\\u0026/g, '&')
        .trim();
      map.set(videoId, { viewCount, title });
    }
  } catch {
    // Non-fatal: search falls back to base track list cleanly
  }

  return map;
}

export async function callCustomConnectorEndpoint(params: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  bearerToken?: string;
  body?: string;
}) {
  const parsed = await assertSafePublicHttpUrl(params.url);
  const method = String(params.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error(`Phương thức HTTP không hỗ trợ: ${method}`);
  }

  const reqHeaders: Record<string, string> = {
    Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
  };
  if (params.headers && typeof params.headers === 'object') {
    for (const [k, v] of Object.entries(params.headers)) {
      const cleanK = String(k || '').trim();
      if (!cleanK || cleanK.toLowerCase() === 'host' || cleanK.toLowerCase() === 'content-length') continue;
      reqHeaders[cleanK] = String(v ?? '');
    }
  }
  if (params.bearerToken && params.bearerToken.trim()) {
    reqHeaders['Authorization'] = `Bearer ${params.bearerToken.trim()}`;
  }
  if (method !== 'GET' && params.body && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const { response, finalUrl, bodyText } = await safePublicFetch(
    parsed.toString(),
    {
      method,
      headers: reqHeaders,
      body: method !== 'GET' && params.body ? params.body : undefined,
    },
    120_000,
    2
  );

  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(bodyText);
  } catch {
    // Keep text preview when non-JSON
  }

  return {
    ok: response.ok,
    status: response.status,
    finalUrl,
    data: parsedJson ?? bodyText.slice(0, 4000),
  };
}


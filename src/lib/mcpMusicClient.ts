export const MUSIC_WEB_BASE_URL = 'https://test1-gamma-navy-38.vercel.app';

export interface MusicTrack {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  sourceUrl?: string;
  playlistId?: string;
  viewCount?: number;
}

export interface MusicDisambiguationCandidate {
  channelTitle: string;
  track: MusicTrack;
}

export interface MusicDisambiguationInfo {
  ambiguous: boolean;
  reason?: string;
  candidates: MusicDisambiguationCandidate[];
}

export type MusicLoopMode = 'off' | 'one' | 'all';

export type MusicCommandAction =
  | 'play'
  | 'pause'
  | 'resume'
  | 'next'
  | 'prev'
  | 'stop'
  | 'loop'
  | 'lyrics';

export interface MusicDirective {
  action: MusicCommandAction;
  query?: string;
  url?: string;
  confirmedArtist?: boolean;
  loopMode?: MusicLoopMode | 'toggle';
  mode?: MusicLoopMode;
  autoRecommend?: boolean;
  targetLang?: string;
}

export interface McpMusicToolResult {
  action?: MusicCommandAction;
  query?: string;
  url?: string;
  playlistId?: string;
  tracks?: MusicTrack[];
  suggestions?: string[];
  disambiguation?: MusicDisambiguationInfo;
  error?: string;
}

export interface SongLyricsResult {
  title: string;
  artist: string;
  targetLang: string;
  detectedLanguage?: string;
  originalLyrics: string;
  translatedLyrics: string;
  sources: Array<{ title: string; uri: string }>;
}

const VALID_ACTIONS = new Set<MusicCommandAction>([
  'play',
  'pause',
  'resume',
  'next',
  'prev',
  'stop',
  'loop',
  'lyrics',
]);

export function isYouTubeMusicUrl(raw: string): boolean {
  if (!raw) return false;
  return /^https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch|playlist|shorts|live|embed)|youtu\.be\/)/i.test(
    raw.trim()
  );
}

export function extractYouTubeUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/(?:(?:www|m|music)\.)?(?:youtube\.com\/[^\s]+|youtu\.be\/[^\s]+)/i);
  if (!match) return null;
  return match[0].replace(/[),.;!?]+$/, '');
}

export function stripMusicDirectives(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[\[MCP_MUSIC:[\s\S]*?\]\]/g, '')
    .replace(/\[\[MCP_MUSIC:[^\]]*$/g, '')
    .trim();
}

export function parseAiMusicDirective(text: string): {
  cleanedText: string;
  directive: MusicDirective | null;
} {
  if (!text) return { cleanedText: '', directive: null };
  let directive: MusicDirective | null = null;
  const regex = /\[\[MCP_MUSIC:(\{[\s\S]*?\})\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const action = String(parsed?.action || '').toLowerCase() as MusicCommandAction;
      if (VALID_ACTIONS.has(action)) {
        const next: MusicDirective = {
          action,
          query: typeof parsed?.query === 'string' ? parsed.query.trim() : undefined,
        };
        if (typeof parsed?.url === 'string' && parsed.url.trim()) {
          next.url = parsed.url.trim();
        }
        if (parsed?.confirmedArtist === true) {
          next.confirmedArtist = true;
        }
        const rawLoop = String(parsed?.mode || parsed?.loopMode || '').toLowerCase();
        if (rawLoop === 'off' || rawLoop === 'one' || rawLoop === 'all') {
          next.loopMode = rawLoop;
          next.mode = rawLoop;
        }
        directive = next;
      }
    } catch {
      // Ignore malformed JSON directive
    }
  }

  return {
    cleanedText: stripMusicDirectives(text),
    directive,
  };
}

export function detectDirectMusicCommand(rawText: string): MusicDirective | null {
  const text = rawText.trim();
  if (!text || text.length > 260) return null;
  const lower = text.toLowerCase();

  // Direct pasted YouTube video or playlist URL
  const ytUrl = extractYouTubeUrlFromText(text);
  if (ytUrl) {
    const withoutUrl = text.replace(ytUrl, '').trim();
    if (
      !withoutUrl ||
      /^(?:bật|mở|phát|nghe|play|nhạc|playlist|list|link|dán|chạy)/i.test(withoutUrl) ||
      /(?:nhạc|playlist|list\s*nhạc|bài\s*hát|phát\s*nền)/i.test(withoutUrl)
    ) {
      return { action: 'play', url: ytUrl, query: ytUrl };
    }
  }

  // Loop controls (local 0-token)
  if (
    /^(?:hãy\s+|làm\s+ơn\s+|giúp\s+(?:tôi|mình)\s+)?(?:tắt|ngừng|dừng|bỏ|hủy)\s*(?:chế\s*độ\s*)?(?:loop|lặp(?:\s*lại)?|repeat)(?:\s*(?:nhạc|bài))?[.!?]*$/i.test(
      lower
    ) ||
    /^loop\s+off[.!?]*$/i.test(lower)
  ) {
    return { action: 'loop', loopMode: 'off' };
  }
  if (
    /^(?:hãy\s+|giúp\s+(?:tôi|mình)\s+)?(?:bật\s+|mở\s+|chọn\s+)?(?:chế\s*độ\s*)?(?:loop|lặp(?:\s*lại)?|repeat)\s*(?:1\s*bài|một\s*bài|bài\s*này|one|single|1)(?:\s*(?:đi|nhé|nha))?[.!?]*$/i.test(
      lower
    ) ||
    /^(?:lặp\s*bài\s*này|lặp\s*1\s*bài|loop\s*1)[.!?]*$/i.test(lower)
  ) {
    return { action: 'loop', loopMode: 'one' };
  }
  if (
    /^(?:hãy\s+|giúp\s+(?:tôi|mình)\s+)?(?:bật\s+|mở\s+|chọn\s+)?(?:chế\s*độ\s*)?(?:loop|lặp(?:\s*lại)?|repeat)\s*(?:danh\s*sách|playlist|list|tất\s*cả|all)(?:\s*(?:đi|nhé|nha))?[.!?]*$/i.test(
      lower
    )
  ) {
    return { action: 'loop', loopMode: 'all' };
  }
  if (
    /^(?:hãy\s+|giúp\s+(?:tôi|mình)\s+)?(?:bật|mở|cho\s*có)\s+(?:chế\s*độ\s*)?(?:loop|lặp(?:\s*lại)?|repeat)(?:\s*(?:nó|bài|nhạc))?(?:\s*(?:cho\s*(?:tôi|mình)|đi|nhé|nha))?[.!?]*$/i.test(
      lower
    ) ||
    /^(?:loop|lặp\s*lại|repeat)[.!?]*$/i.test(lower)
  ) {
    return { action: 'loop', loopMode: 'toggle' };
  }

  // Generic playback without a specific song title -> Taste algorithm auto-pick (local 0-token)
  if (
    /^(?:hãy\s+|làm\s+ơn\s+|giúp\s+(?:tôi|mình)\s+)?(?:bật|mở|phát|nghe|chơi|play)\s*(?:giúp\s+(?:tôi|mình)\s*)?(?:một\s*|1\s*)?(?:nhạc|bài|bài\s*hát|ca\s*khúc|bài\s*nào\s*(?:đó|cũng\s*được)|bài\s*gì\s*đó|nhạc\s*gì\s*đó|nhạc\s*nền|nhạc\s*hợp\s*gu|bài\s*hợp\s*gu|theo\s*gu|ngẫu\s*nhiên)?(?:\s*(?:hợp\s*gu|theo\s*gu|ngẫu\s*nhiên|chill|nền|đi|nhé|nha|lên|nào|giúp\s+(?:tôi|mình)|cho\s+(?:tôi|mình)))*[.!?]*$/i.test(
      lower
    ) ||
    /^(?:gợi\s*ý\s*(?:và\s*)?(?:bật|mở|phát)?\s*(?:nhạc|bài(?:\s*hát)?)|nghe\s*gì\s*bây\s*giờ)[.!?]*$/i.test(
      lower
    )
  ) {
    return { action: 'play', autoRecommend: true };
  }

  // Lyrics search / translation command
  const lyricsMatch = text.match(
    /^(?:hãy\s+|giúp\s+(?:tôi|mình)\s+)?(?:tìm\s*(?:và\s*dịch\s*)?lời|lời\s*bài(?:\s*hát)?|lyrics|dịch\s*lời(?:\s*bài(?:\s*hát)?)?|translate\s*lyrics)(?:\s+(?:bài(?:\s*hát)?|của))?(?:\s+(.+?))?[.!?]*$/i
  );
  if (lyricsMatch) {
    const rawTarget = (lyricsMatch[1] || '').trim();
    const isCurrentRef = /^(?:này|đang\s*phát|hiện\s*tại|this\s*song)$/i.test(rawTarget);
    return {
      action: 'lyrics',
      query: isCurrentRef ? '' : rawTarget,
    };
  }

  if (/^(tạm\s*dừng|dừng|pause)(\s+(nhạc|bài(\s*hát)?|music|player))?[.!?]*$/i.test(lower)) {
    return { action: 'pause' };
  }
  if (/^(tắt|ngừng|stop|đóng)(\s+(nhạc|bài(\s*hát)?|music|player))[.!?]*$/i.test(lower)) {
    return { action: 'stop' };
  }
  if (/^(tiếp\s*tục|phát\s*tiếp|chơi\s*tiếp|resume)(\s+(nhạc|bài(\s*hát)?|music))?[.!?]*$/i.test(lower)) {
    return { action: 'resume' };
  }
  if (/^(qua\s*bài|chuyển\s*bài|bài\s*tiếp(\s*theo)?|next(\s*(bài|nhạc|track|song))?|skip)[.!?]*$/i.test(lower)) {
    return { action: 'next' };
  }
  if (/^(bài\s*trước|quay\s*lại\s*bài|lùi\s*bài|prev(ious)?(\s*(track|song))?)[.!?]*$/i.test(lower)) {
    return { action: 'prev' };
  }

  const playMatch = text.match(
    /^(?:hãy\s+|làm\s+ơn\s+|giúp\s+(?:tôi|mình)\s+)?(?:bật|mở|phát|nghe|play)\s+(?:giúp\s+(?:tôi|mình)\s+)?(?:bài\s*hát\s+|bài\s+|nhạc\s+|ca\s*khúc\s+)?(.+?)(?:\s+(?:nền|chạy\s*nền|nhé|nha|đi|giúp\s+(?:tôi|mình)|cho\s+(?:tôi|mình)))*[.!?]*$/i
  );
  if (playMatch && playMatch[1]) {
    const q = playMatch[1]
      .replace(/^(?:cho\s+(?:tôi|mình)\s+|giúp\s+(?:tôi|mình)\s+|bài\s+|nhạc\s+)/i, '')
      .trim();
    if (q && q.length >= 2 && !/^(code|file|folder|web|app|terminal|console|modal|link\s+http|playlist\s+(?:của\s+(?:tôi|mình)|riêng)|my\s+playlist)/i.test(q)) {
      if (isYouTubeMusicUrl(q)) {
        return { action: 'play', url: q, query: q };
      }
      return { action: 'play', query: q };
    }
  }

  return null;
}

export async function callMusicMcpTool(
  toolName:
    | 'music_search'
    | 'music_suggestions'
    | 'music_resolve_url'
    | 'music_player_control'
    | 'music_lyrics',
  args: Record<string, any>
): Promise<McpMusicToolResult> {
  const res = await fetch('/api/mcp/music', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP music HTTP ${res.status}`);
  }

  const payload = await res.json();
  if (payload?.error) {
    throw new Error(payload.error.message || 'MCP music tool error');
  }

  const structured = payload?.result?.structuredContent;
  if (structured && typeof structured === 'object') {
    return structured as McpMusicToolResult;
  }

  const textItem = payload?.result?.content?.[0]?.text;
  if (typeof textItem === 'string') {
    try {
      return JSON.parse(textItem) as McpMusicToolResult;
    } catch {
      return {};
    }
  }

  return {};
}

export async function fetchSongLyrics(params: {
  title: string;
  artist?: string;
  targetLang?: string;
}): Promise<SongLyricsResult> {
  const res = await fetch('/api/mcp/music/lyrics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Lyrics lookup HTTP ${res.status}`);
  }
  return data as SongLyricsResult;
}

import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import handler from '../api/index';
import {
  detectDirectMusicCommand,
  parseAiMusicDirective,
  stripMusicDirectives,
} from '../src/lib/mcpMusicClient';
import {
  assertSafePublicHttpUrl,
  parseLyricsResponseBlocks,
  parseYouTubeViewCount,
  sortMusicTracksByPopularity,
} from '../api/_mcpTools';
import {
  analyzeMusicTaste,
  buildTasteRecommendationQueries,
  rankTasteCandidates,
} from '../src/lib/musicTasteEngine';

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

describe('MCP Music Client helpers', () => {
  it('detects direct play and playback control commands without false positives on coding phrases', () => {
    expect(detectDirectMusicCommand('bật bài Lạc Trôi')).toEqual({ action: 'play', query: 'Lạc Trôi' });
    expect(detectDirectMusicCommand('mở nhạc chill lofi giúp mình')).toEqual({ action: 'play', query: 'chill lofi' });
    expect(detectDirectMusicCommand('play Nơi Này Có Anh')).toEqual({ action: 'play', query: 'Nơi Này Có Anh' });
    expect(detectDirectMusicCommand('tạm dừng nhạc')).toEqual({ action: 'pause' });
    expect(detectDirectMusicCommand('tiếp tục nhạc')).toEqual({ action: 'resume' });
    expect(detectDirectMusicCommand('qua bài')).toEqual({ action: 'next' });
    expect(detectDirectMusicCommand('bài trước')).toEqual({ action: 'prev' });
    expect(detectDirectMusicCommand('tắt nhạc')).toEqual({ action: 'stop' });

    // Zero-token loop triggers
    expect(detectDirectMusicCommand('bật loop')).toEqual({ action: 'loop', loopMode: 'toggle' });
    expect(detectDirectMusicCommand('lặp bài này')).toEqual({ action: 'loop', loopMode: 'one' });
    expect(detectDirectMusicCommand('bật loop danh sách')).toEqual({ action: 'loop', loopMode: 'all' });
    expect(detectDirectMusicCommand('tắt loop')).toEqual({ action: 'loop', loopMode: 'off' });

    // Generic no-name triggers -> algorithmic taste recommendation
    expect(detectDirectMusicCommand('mở bài')).toEqual({ action: 'play', autoRecommend: true });
    expect(detectDirectMusicCommand('bật nhạc lên đi')).toEqual({ action: 'play', autoRecommend: true });
    expect(detectDirectMusicCommand('nghe nhạc hợp gu')).toEqual({ action: 'play', autoRecommend: true });

    // Generic "mở playlist của tôi" should not route to removed YouTube OAuth playlist command
    expect(detectDirectMusicCommand('mở playlist của tôi')).toBeNull();

    // Lyrics lookup triggers
    expect(detectDirectMusicCommand('tìm lời bài Lạc Trôi')).toEqual({ action: 'lyrics', query: 'Lạc Trôi' });
    expect(detectDirectMusicCommand('dịch lời bài này')).toEqual({ action: 'lyrics', query: '' });

    expect(detectDirectMusicCommand('mở folder code')).toBeNull();
    expect(detectDirectMusicCommand('mở web app lên')).toBeNull();
    expect(detectDirectMusicCommand('bật terminal log')).toBeNull();
    expect(detectDirectMusicCommand('https://www.youtube.com/watch?v=Llw9Q6akRo4&list=RDCLAK5uy_n')).toEqual({
      action: 'play',
      url: 'https://www.youtube.com/watch?v=Llw9Q6akRo4&list=RDCLAK5uy_n',
      query: 'https://www.youtube.com/watch?v=Llw9Q6akRo4&list=RDCLAK5uy_n',
    });
  });

  it('parses and strips AI MCP_MUSIC directives cleanly including loop mode', () => {
    const raw = 'Đang phát Lạc Trôi cho bạn nhé.\n[[MCP_MUSIC:{"action":"play","query":"Lạc Trôi Sơn Tùng"}]]';
    const parsed = parseAiMusicDirective(raw);
    expect(parsed.directive).toEqual({ action: 'play', query: 'Lạc Trôi Sơn Tùng' });
    expect(parsed.cleanedText).toBe('Đang phát Lạc Trôi cho bạn nhé.');

    const loopParsed = parseAiMusicDirective('Đã bật lặp lại.\n[[MCP_MUSIC:{"action":"loop","mode":"one"}]]');
    expect(loopParsed.directive).toEqual({ action: 'loop', loopMode: 'one', mode: 'one' });
    expect(loopParsed.cleanedText).toBe('Đã bật lặp lại.');

    expect(stripMusicDirectives('Đang xử lý... [[MCP_MUSIC:{"action":"pa')).toBe('Đang xử lý...');
  });
});

describe('Lyrics parser & Taste recommendation algorithm', () => {
  it('parses original lyrics and translation sections accurately', () => {
    const sample = [
      'TITLE: Shape of You',
      'ARTIST: Ed Sheeran',
      'ORIGINAL_LANGUAGE: English',
      '===ORIGINAL_LYRICS===',
      'The club is not the best place to find a lover',
      '===TRANSLATED_LYRICS===',
      'Câu lạc bộ không phải nơi lý tưởng nhất để tìm người yêu',
    ].join('\n');

    const parsed = parseLyricsResponseBlocks(sample);
    expect(parsed.detectedTitle).toBe('Shape of You');
    expect(parsed.detectedArtist).toBe('Ed Sheeran');
    expect(parsed.originalLyrics).toContain('best place to find a lover');
    expect(parsed.translatedLyrics).toContain('Câu lạc bộ không phải nơi');
  });

  it('analyzes taste profile and recommends fresh favored-artist tracks over very recently played ones', () => {
    const now = Date.now();
    const history = [
      {
        id: 'played-1',
        title: 'Nơi Này Có Anh',
        channelTitle: 'Sơn Tùng M-TP Official',
        thumbnail: '',
        playCount: 6,
        lastPlayedAt: now - 1000,
        firstPlayedAt: now - 100000,
        tags: ['nơi', 'này', 'anh', 'sơn', 'tùng'],
      },
      {
        id: 'played-2',
        title: 'Thủy Triều',
        channelTitle: 'Quang Hùng MasterD',
        thumbnail: '',
        playCount: 3,
        lastPlayedAt: now - 60000,
        firstPlayedAt: now - 200000,
        tags: ['thủy', 'triều', 'chill'],
      },
    ];

    const profile = analyzeMusicTaste(history, now);
    expect(profile.topArtists[0]?.name).toBe('Sơn Tùng M-TP');

    const rec = buildTasteRecommendationQueries(history);
    expect(rec.queries.length).toBeGreaterThan(0);
    expect(rec.reason).toContain('Sơn Tùng M-TP');

    const ranked = rankTasteCandidates(
      [
        { id: 'played-1', title: 'Nơi Này Có Anh', channelTitle: 'Sơn Tùng M-TP Official', thumbnail: '' },
        { id: 'fresh-fav', title: 'Chạy Ngay Đi', channelTitle: 'Sơn Tùng M-TP Official', thumbnail: '' },
        { id: 'random-other', title: 'Random Track', channelTitle: 'Other', thumbnail: '' },
      ],
      history,
      profile
    );
    expect(ranked[0].id).toBe('fresh-fav');

    const billionPrioritized = rankTasteCandidates(
      [
        { id: 'low', title: 'Sơn Tùng Mix', channelTitle: 'Sơn Tùng M-TP Official', thumbnail: '', viewCount: 25_000_000 },
        { id: 'b2', title: 'See You Again', channelTitle: 'Wiz Khalifa', thumbnail: '', viewCount: 6_400_000_000 },
        { id: 'b1', title: 'Despacito', channelTitle: 'LuisFonsiVEVO', thumbnail: '', viewCount: 9_100_000_000 },
      ],
      history,
      profile
    );
    expect(billionPrioritized.map((t) => t.id)).toEqual(['b1', 'b2', 'low']);
  });

  it('parses YouTube view strings and prioritizes >= 1B view tracks descending', () => {
    expect(parseYouTubeViewCount('9,181,242,846 views')).toBe(9_181_242_846);
    expect(parseYouTubeViewCount('1.5B views')).toBe(1_500_000_000);
    expect(parseYouTubeViewCount('420M views')).toBe(420_000_000);
    expect(parseYouTubeViewCount('1,2 tỷ lượt xem')).toBe(1_200_000_000);

    const sorted = sortMusicTracksByPopularity([
      { id: 'a', viewCount: 80_000_000 },
      { id: 'b', viewCount: 1_200_000_000 },
      { id: 'c', viewCount: 5_400_000_000 },
      { id: 'd', viewCount: 500_000_000 },
      { id: 'e' },
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['c', 'b', 'd', 'a', 'e']);
  });
});

describe('MCP Music Server (/api/mcp/music & YouTube routes)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('supports initialize and tools/list via JSON-RPC 2.0', async () => {
    const initRes = await callServerlessHandler('/api/mcp/music', 'POST', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });
    expect(initRes.status).toBe(200);
    const initJson = JSON.parse(initRes.text);
    expect(initJson.result.serverInfo.name).toBe('ncmusicplayer-mcp');

    const listRes = await callServerlessHandler('/api/mcp/music', 'POST', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    expect(listRes.status).toBe(200);
    const toolNames = JSON.parse(listRes.text).result.tools.map((t: any) => t.name);
    expect(toolNames).toEqual([
      'music_search',
      'music_suggestions',
      'music_resolve_url',
      'music_player_control',
      'music_lyrics',
    ]);
  });

  it('does not expose removed /api/mcp/youtube/playlists route', async () => {
    const res = await callServerlessHandler('/api/mcp/youtube/playlists', 'GET');
    expect(res.status).toBe(404);
  });

  it('calls NCmusicplayer /api/search via MCP tools/call and filters channel entries without track id', async () => {
    const upstreamMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.startsWith('https://test1-gamma-navy-38.vercel.app/api/search')) {
        return new Response(
          JSON.stringify([
            { title: 'Sơn Tùng M-TP Official', channelTitle: 'Channel' },
            { id: 'Llw9Q6akRo4', title: 'LẠC TRÔI | OFFICIAL MUSIC VIDEO', thumbnail: 'https://i.ytimg.com/vi/Llw9Q6akRo4/hqdefault.jpg', channelTitle: 'Sơn Tùng M-TP Official' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.startsWith('https://www.youtube.com/results')) {
        return new Response('<html></html>', { status: 200 });
      }
      return originalFetch(input, init);
    });
    globalThis.fetch = upstreamMock as any;

    const callRes = await callServerlessHandler('/api/mcp/music', 'POST', {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'music_player_control',
        arguments: { action: 'play', query: 'Lạc Trôi' },
      },
    });

    expect(callRes.status).toBe(200);
    const json = JSON.parse(callRes.text);
    const tracks = json.result.structuredContent.tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      id: 'Llw9Q6akRo4',
      title: 'LẠC TRÔI | OFFICIAL MUSIC VIDEO',
      sourceUrl: 'https://test1-gamma-navy-38.vercel.app',
    });
  });

  it('validates schema before calling AI on /api/mcp/google-form/ai-fill', async () => {
    const res = await callServerlessHandler('/api/mcp/google-form/ai-fill', 'POST', {
      schema: { title: 'Empty Form', fields: [] },
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.text);
    expect(json.error).toContain('chưa có trường');
  });
});


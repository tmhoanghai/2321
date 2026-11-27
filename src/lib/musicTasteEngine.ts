import { MusicTrack } from './mcpMusicClient';

export interface MusicHistoryEntry {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  sourceUrl?: string;
  playlistId?: string;
  playCount: number;
  lastPlayedAt: number;
  firstPlayedAt: number;
  tags: string[];
}

export interface MusicTasteProfile {
  totalPlays: number;
  topArtists: Array<{ name: string; score: number }>;
  topKeywords: Array<{ word: string; score: number }>;
  recentTrackIds: string[];
}

const HISTORY_STORAGE_PREFIX = 'tm_music_history_v1_';
const MAX_HISTORY_ITEMS = 80;

const TITLE_STOPWORDS = new Set([
  'official', 'music', 'video', 'mv', 'lyric', 'lyrics', 'audio', 'visualizer',
  'hd', '4k', 'full', 'ver', 'version', 'live', 'cover', 'remix', 'feat', 'ft',
  'prod', 'by', 'the', 'and', 'with', 'for', 'you', 'nhac', 'nhạc', 'bai', 'bài',
  'hat', 'hát', 'của', 'cua', 'và', 'va', 'cho', 'moi', 'mới', 'hay', 'nhat', 'nhất',
  'youtube', 'ncmusicplayer', 'track', 'song', 'playlist', '1080p', 'topic',
]);

export function extractMusicTags(title: string, channelTitle: string): string[] {
  const combined = `${title || ''} ${channelTitle || ''}`
    .toLowerCase()
    .replace(/[\[\](){}|/\\•—–\-_,.:;!?~"']/g, ' ');
  const tokens = combined
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !TITLE_STOPWORDS.has(t) && !/^\d+$/.test(t));

  return Array.from(new Set(tokens)).slice(0, 14);
}

function getStorageKey(accountKey: string): string {
  const safeKey = (accountKey || 'guest').replace(/[^a-zA-Z0-9_@.-]/g, '_');
  return `${HISTORY_STORAGE_PREFIX}${safeKey}`;
}

export function loadMusicHistory(accountKey: string): MusicHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(accountKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string')
      .sort((a, b) => Number(b.lastPlayedAt || 0) - Number(a.lastPlayedAt || 0))
      .slice(0, MAX_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function saveMusicHistory(accountKey: string, entries: MusicHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      getStorageKey(accountKey),
      JSON.stringify(entries.slice(0, MAX_HISTORY_ITEMS))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function clearMusicHistory(accountKey: string): MusicHistoryEntry[] {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(getStorageKey(accountKey));
    } catch {
      // ignore
    }
  }
  return [];
}

export function recordTrackInHistory(
  accountKey: string,
  track: MusicTrack,
  now = Date.now()
): MusicHistoryEntry[] {
  if (!track || !track.id || track.id.startsWith('playlist:')) {
    return loadMusicHistory(accountKey);
  }

  const current = loadMusicHistory(accountKey);
  const existingIdx = current.findIndex((item) => item.id === track.id);
  const tags = extractMusicTags(track.title, track.channelTitle);

  let next: MusicHistoryEntry[];
  if (existingIdx >= 0) {
    const existing = current[existingIdx];
    const withinCooldown = now - existing.lastPlayedAt < 25_000;
    const updated: MusicHistoryEntry = {
      ...existing,
      title: track.title || existing.title,
      channelTitle: track.channelTitle || existing.channelTitle,
      thumbnail: track.thumbnail || existing.thumbnail,
      sourceUrl: track.sourceUrl || existing.sourceUrl,
      playlistId: track.playlistId || existing.playlistId,
      playCount: withinCooldown ? existing.playCount : existing.playCount + 1,
      lastPlayedAt: now,
      tags: tags.length > 0 ? tags : existing.tags,
    };
    next = [updated, ...current.filter((_, idx) => idx !== existingIdx)];
  } else {
    const created: MusicHistoryEntry = {
      id: track.id,
      title: track.title,
      channelTitle: track.channelTitle || 'YouTube',
      thumbnail: track.thumbnail || '',
      sourceUrl: track.sourceUrl,
      playlistId: track.playlistId,
      playCount: 1,
      lastPlayedAt: now,
      firstPlayedAt: now,
      tags,
    };
    next = [created, ...current].slice(0, MAX_HISTORY_ITEMS);
  }

  saveMusicHistory(accountKey, next);
  return next;
}

export function analyzeMusicTaste(
  history: MusicHistoryEntry[],
  now = Date.now()
): MusicTasteProfile {
  const artistScores = new Map<string, number>();
  const artistDisplayNames = new Map<string, string>();
  const keywordScores = new Map<string, number>();

  let totalPlays = 0;

  for (const entry of history) {
    totalPlays += entry.playCount || 1;
    const ageHours = Math.max(0, (now - (entry.lastPlayedAt || now)) / 3_600_000);
    const recencyDecay = Math.exp(-ageHours / (24 * 14)); // 14-day half-life feel
    const weight = (1 + Math.log1p(entry.playCount || 1)) * (0.4 + 0.6 * recencyDecay);

    const rawArtist = (entry.channelTitle || '').trim();
    const artistClean = rawArtist
      .replace(/\s*-\s*topic$/i, '')
      .replace(/\b(official|vevo|channel)\b/gi, '')
      .trim();
    const artistKey = artistClean.toLowerCase();

    if (
      artistKey &&
      artistKey.length >= 2 &&
      artistKey !== 'youtube' &&
      artistKey !== 'ncmusicplayer' &&
      artistKey !== 'youtube playlist'
    ) {
      artistScores.set(artistKey, (artistScores.get(artistKey) || 0) + weight * 1.6);
      if (!artistDisplayNames.has(artistKey)) {
        artistDisplayNames.set(artistKey, artistClean);
      }
    }

    const tags = entry.tags?.length ? entry.tags : extractMusicTags(entry.title, entry.channelTitle);
    for (const tag of tags) {
      keywordScores.set(tag, (keywordScores.get(tag) || 0) + weight * 0.8);
    }
  }

  const topArtists = Array.from(artistScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, score]) => ({
      name: artistDisplayNames.get(key) || key,
      score: Number(score.toFixed(2)),
    }));

  const topKeywords = Array.from(keywordScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, score]) => ({
      word,
      score: Number(score.toFixed(2)),
    }));

  return {
    totalPlays,
    topArtists,
    topKeywords,
    recentTrackIds: history.slice(0, 12).map((h) => h.id),
  };
}

export function buildTasteRecommendationQueries(
  history: MusicHistoryEntry[],
  seedHint?: string
): { queries: string[]; reason: string; profile: MusicTasteProfile } {
  const profile = analyzeMusicTaste(history);

  if (seedHint && seedHint.trim()) {
    return {
      queries: [seedHint.trim()],
      reason: `Theo yêu cầu "${seedHint.trim()}"`,
      profile,
    };
  }

  if (history.length === 0) {
    return {
      queries: ['top hits 1 billion views official', 'lofi chill relaxing beats'],
      reason: 'Gợi ý khởi đầu ưu tiên bài trên 1B lượt xem (chưa có lịch sử nghe)',
      profile,
    };
  }

  const queries: string[] = [];
  const topArtist = profile.topArtists[0]?.name;
  const secondArtist = profile.topArtists[1]?.name;
  const recentEntry = history[0];
  const distinctKeywords = profile.topKeywords
    .map((k) => k.word)
    .filter((w) => !topArtist?.toLowerCase().includes(w))
    .slice(0, 3);

  if (topArtist && secondArtist) {
    queries.push(`${topArtist} ${distinctKeywords[0] || 'nhạc hay'}`.trim());
    queries.push(`${secondArtist} mix`);
  } else if (topArtist) {
    queries.push(`${topArtist} bài hát hay`);
    if (distinctKeywords.length >= 2) {
      queries.push(`${distinctKeywords.slice(0, 2).join(' ')} music`);
    }
  } else if (distinctKeywords.length > 0) {
    queries.push(distinctKeywords.slice(0, 3).join(' '));
  }

  if (recentEntry) {
    const cleanRecentTitle = recentEntry.title
      .replace(/[\[(].*?[\])]/g, '')
      .split(/[-|]/)[0]
      .trim();
    if (cleanRecentTitle && queries.length < 3) {
      queries.push(`${cleanRecentTitle} tương tự`);
    }
  }

  const deduped = Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean))).slice(0, 3);
  if (deduped.length === 0) {
    deduped.push('nhạc chill hay nhất');
  }

  const reason = topArtist
    ? `Hợp gu từ nghệ sĩ bạn hay nghe (${topArtist}${secondArtist ? `, ${secondArtist}` : ''})`
    : `Phù hợp với gu ${distinctKeywords.slice(0, 2).join(' & ') || 'gần đây'} (${history.length} bài đã nghe)`;

  return {
    queries: deduped,
    reason,
    profile,
  };
}

export function rankTasteCandidates(
  candidates: MusicTrack[],
  history: MusicHistoryEntry[],
  profile: MusicTasteProfile
): MusicTrack[] {
  const seenIds = new Set<string>();
  const uniqueTracks = candidates.filter((t) => {
    if (!t || !t.id || seenIds.has(t.id)) return false;
    seenIds.add(t.id);
    return true;
  });

  const veryRecentIds = new Set(history.slice(0, 5).map((h) => h.id));
  const olderHistoryIds = new Set(history.slice(5, 25).map((h) => h.id));
  const artistMap = new Map(profile.topArtists.map((a) => [a.name.toLowerCase(), a.score]));
  const kwMap = new Map(profile.topKeywords.map((k) => [k.word, k.score]));

  const ONE_BILLION = 1_000_000_000;

  return uniqueTracks
    .map((track) => {
      let score = 1;
      const views = Number(track.viewCount || 0);
      if (views >= ONE_BILLION) {
        score += 10_000 + Math.log10(views) * 40;
      } else if (views > 0) {
        score += Math.log10(views + 1) * 15;
      }

      const artistLower = (track.channelTitle || '').toLowerCase();
      for (const [favArtist, weight] of artistMap.entries()) {
        if (artistLower.includes(favArtist) || track.title.toLowerCase().includes(favArtist)) {
          score += weight * 2.2;
        }
      }
      const tags = extractMusicTags(track.title, track.channelTitle);
      for (const tag of tags) {
        score += (kwMap.get(tag) || 0) * 0.9;
      }

      // Encourage discovering fresh tracks rather than repeating the exact last 5 played songs
      if (veryRecentIds.has(track.id)) {
        score -= 50;
      } else if (olderHistoryIds.has(track.id)) {
        score -= 4;
      }

      // Slight random tie-breaker so consecutive auto-plays stay varied within same tier
      score += Math.random() * 0.85;
      return { track, score, views };
    })
    .sort((a, b) => {
      const aB = a.views >= ONE_BILLION ? 1 : 0;
      const bB = b.views >= ONE_BILLION ? 1 : 0;
      if (aB !== bB) return bB - aB;
      if (aB === 1 && bB === 1 && a.views !== b.views) return b.views - a.views;
      return b.score - a.score;
    })
    .map((item) => item.track);
}

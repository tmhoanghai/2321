import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  ExternalLink,
  Music2,
  Loader2,
  Link2,
  ListMusic,
  ChevronDown,
  Repeat,
  Repeat1,
} from 'lucide-react';
import { Theme } from '../types';
import {
  MUSIC_WEB_BASE_URL,
  MusicDisambiguationInfo,
  MusicLoopMode,
  MusicTrack,
} from '../lib/mcpMusicClient';

export type MusicPopoverTab = 'queue';

interface BackgroundMusicPlayerProps {
  queue: MusicTrack[];
  currentIndex: number;
  isPlaying: boolean;
  isLoading?: boolean;
  error?: string | null;
  disambiguation?: MusicDisambiguationInfo | null;
  pendingQuery?: string;
  loopMode?: MusicLoopMode;
  theme: Theme;
  externalPopoverRequest?: { tab: MusicPopoverTab; nonce: number } | null;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onCycleLoopMode?: () => void;
  onTrackEnded?: () => void;
  onSelectIndex?: (index: number) => void;
  onPlayUrl?: (url: string) => void;
  onSearchQuery?: (query: string) => void;
  onSelectDisambiguatedTrack?: (track: MusicTrack) => void;
  onDismissDisambiguation?: () => void;
  onPlaybackStateChange?: (playing: boolean) => void;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<any> | null = null;

function ensureYouTubeIframeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prevReady?.();
      } catch {
        // Ignore previous callback error
      }
      resolve(window.YT);
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.head.appendChild(tag);
    }

    setTimeout(() => {
      if (window.YT?.Player) resolve(window.YT);
    }, 4000);
  });

  return ytApiPromise;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatCompactViews(views?: number): string {
  const v = Number(views || 0);
  if (!Number.isFinite(v) || v <= 0) return '';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${Math.round(v / 1_000_000)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

// Tiny silent PCM WAV (~0.1s mono 8kHz) used strictly to keep mobile OS media session active in background
const SILENT_KEEPALIVE_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQQAAAAAAA==';

export const BackgroundMusicPlayer: React.FC<BackgroundMusicPlayerProps> = ({
  queue,
  currentIndex,
  isPlaying,
  isLoading = false,
  error = null,
  disambiguation = null,
  pendingQuery = '',
  loopMode = 'off',
  theme,
  externalPopoverRequest = null,
  onTogglePlay,
  onNext,
  onPrev,
  onClose,
  onCycleLoopMode,
  onTrackEnded,
  onSelectIndex,
  onPlayUrl,
  onSearchQuery,
  onSelectDisambiguatedTrack,
  onDismissDisambiguation,
  onPlaybackStateChange,
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const keepAliveAudioRef = useRef<HTMLAudioElement | null>(null);
  const playerRef = useRef<any>(null);
  const loadedTrackKeyRef = useRef<string | null>(null);
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);
  const onTrackEndedRef = useRef(onTrackEnded);
  const onStateRef = useRef(onPlaybackStateChange);
  const isPlayingRef = useRef(isPlaying);
  const loopModeRef = useRef<MusicLoopMode>(loopMode);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MusicPopoverTab>('queue');
  const [urlInput, setUrlInput] = useState('');

  useEffect(() => {
    onNextRef.current = onNext;
    onPrevRef.current = onPrev;
    onTrackEndedRef.current = onTrackEnded;
    onStateRef.current = onPlaybackStateChange;
    isPlayingRef.current = isPlaying;
    loopModeRef.current = loopMode;
  }, [onNext, onPrev, onTrackEnded, onPlaybackStateChange, isPlaying, loopMode]);

  useEffect(() => {
    if (disambiguation?.ambiguous && disambiguation.candidates.length > 0) {
      setIsPopoverOpen(true);
      setActiveTab('queue');
    }
  }, [disambiguation]);

  useEffect(() => {
    if (externalPopoverRequest) {
      setActiveTab(externalPopoverRequest.tab);
      setIsPopoverOpen(true);
    }
  }, [externalPopoverRequest]);

  const currentTrack = queue[currentIndex] || null;
  const trackKey = currentTrack
    ? `${currentTrack.id || ''}:${currentTrack.playlistId || ''}`
    : null;

  useEffect(() => {
    if (!currentTrack || !trackKey) {
      if (playerRef.current) {
        try {
          playerRef.current.stopVideo?.();
        } catch {
          // ignore
        }
      }
      loadedTrackKeyRef.current = null;
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    let cancelled = false;

    const initOrLoad = async () => {
      const YT = await ensureYouTubeIframeApi();
      if (cancelled || !YT?.Player || !hostRef.current) return;

      const isPlaylistOnly = !currentTrack.id && Boolean(currentTrack.playlistId);

      if (!playerRef.current) {
        const mountEl = document.createElement('div');
        hostRef.current.innerHTML = '';
        hostRef.current.appendChild(mountEl);

        loadedTrackKeyRef.current = trackKey;
        const playerVars: Record<string, any> = {
          autoplay: isPlayingRef.current ? 1 : 0,
          controls: 0,
          playsinline: 1,
          rel: 0,
        };
        if (isPlaylistOnly && currentTrack.playlistId) {
          playerVars.listType = 'playlist';
          playerVars.list = currentTrack.playlistId;
        }

        playerRef.current = new YT.Player(mountEl, {
          height: '1',
          width: '1',
          videoId: currentTrack.id || undefined,
          playerVars,
          events: {
            onReady: (ev: any) => {
              if (cancelled) return;
              try {
                const iframe = ev.target?.getIframe?.();
                if (iframe) {
                  iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
                  iframe.setAttribute('playsinline', '1');
                }
              } catch {
                // ignore
              }
              if (isPlaylistOnly && currentTrack.playlistId && !currentTrack.id) {
                ev.target?.loadPlaylist?.({
                  list: currentTrack.playlistId,
                  listType: 'playlist',
                });
              }
              if (isPlayingRef.current) {
                ev.target?.playVideo?.();
              }
            },
            onStateChange: (ev: any) => {
              if (cancelled) return;
              const state = ev.data;
              if (state === YT.PlayerState.ENDED) {
                if (loopModeRef.current === 'one') {
                  try {
                    ev.target?.seekTo?.(0, true);
                    ev.target?.playVideo?.();
                    onStateRef.current?.(true);
                  } catch {
                    // fallback
                  }
                } else if (onTrackEndedRef.current) {
                  onTrackEndedRef.current();
                } else {
                  onNextRef.current?.();
                }
              } else if (state === YT.PlayerState.PLAYING) {
                onStateRef.current?.(true);
              } else if (state === YT.PlayerState.PAUSED) {
                onStateRef.current?.(false);
              }
            },
            onError: () => {
              if (!cancelled) onNextRef.current?.();
            },
          },
        });
      } else if (loadedTrackKeyRef.current !== trackKey) {
        loadedTrackKeyRef.current = trackKey;
        setCurrentTime(0);
        setDuration(0);
        if (isPlaylistOnly && currentTrack.playlistId) {
          playerRef.current.loadPlaylist?.({
            list: currentTrack.playlistId,
            listType: 'playlist',
          });
        } else if (currentTrack.id) {
          if (isPlayingRef.current) {
            playerRef.current.loadVideoById?.(currentTrack.id);
          } else {
            playerRef.current.cueVideoById?.(currentTrack.id);
          }
        }
      }
    };

    void initOrLoad();

    return () => {
      cancelled = true;
    };
  }, [currentTrack, trackKey]);

  useEffect(() => {
    const p = playerRef.current;
    if (!p || !trackKey) return;
    try {
      if (isPlaying) p.playVideo?.();
      else p.pauseVideo?.();
    } catch {
      // ignore player readiness race
    }
  }, [isPlaying, trackKey]);

  // Keep mobile OS audio session & Media Session lock-screen controls active in background
  useEffect(() => {
    const audio = keepAliveAudioRef.current;
    if (audio) {
      if (isPlaying && currentTrack) {
        audio.volume = 0.001;
        void audio.play().catch(() => {
          // Autoplay may wait for next user gesture on some mobile browsers
        });
      } else {
        audio.pause();
      }
    }

    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      if (currentTrack && typeof window.MediaMetadata !== 'undefined') {
        try {
          ms.metadata = new window.MediaMetadata({
            title: currentTrack.title || 'Đang phát nhạc',
            artist: currentTrack.channelTitle || 'TheMaster Music',
            album: 'TheMaster Audio',
            artwork: currentTrack.thumbnail
              ? [{ src: currentTrack.thumbnail, sizes: '480x360', type: 'image/jpeg' }]
              : [],
          });
        } catch {
          // ignore metadata error
        }
      }
      try {
        ms.playbackState = currentTrack ? (isPlaying ? 'playing' : 'paused') : 'none';
      } catch {
        // ignore
      }
    }
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safeSet = (action: MediaSessionAction, handler: ((details: any) => void) | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Unsupported action in current browser
      }
    };
    safeSet('play', () => {
      try {
        playerRef.current?.playVideo?.();
      } catch {
        // ignore
      }
      onStateRef.current?.(true);
    });
    safeSet('pause', () => {
      try {
        playerRef.current?.pauseVideo?.();
      } catch {
        // ignore
      }
      onStateRef.current?.(false);
    });
    safeSet('nexttrack', () => onNextRef.current?.());
    safeSet('previoustrack', () => onPrevRef.current?.());
    safeSet('seekto', (details: any) => {
      if (typeof details?.seekTime === 'number') {
        setCurrentTime(details.seekTime);
        try {
          playerRef.current?.seekTo?.(details.seekTime, true);
        } catch {
          // ignore
        }
      }
    });

    const handleVisibility = () => {
      if (!isPlayingRef.current || !playerRef.current) return;
      // Re-assert playback when page enters background or returns on mobile browsers
      window.setTimeout(() => {
        if (!isPlayingRef.current) return;
        try {
          const st = playerRef.current?.getPlayerState?.();
          if (st !== 1) {
            playerRef.current?.playVideo?.();
          }
          void keepAliveAudioRef.current?.play().catch(() => {});
        } catch {
          // ignore
        }
      }, 150);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!trackKey) return;
    const timer = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || isSeeking) return;
      try {
        const cur = Number(p.getCurrentTime?.() ?? 0);
        const dur = Number(p.getDuration?.() ?? 0);
        if (Number.isFinite(cur) && cur >= 0) setCurrentTime(cur);
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur);
          if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof navigator.mediaSession.setPositionState === 'function') {
            try {
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: 1,
                position: Math.min(cur, dur),
              });
            } catch {
              // ignore position bounds race
            }
          }
        }
      } catch {
        // ignore readiness race
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [trackKey, isSeeking]);

  const handleSeek = (nextSec: number) => {
    setCurrentTime(nextSec);
    try {
      playerRef.current?.seekTo?.(nextSec, true);
    } catch {
      // ignore
    }
  };

  const handleSubmitUrlOrSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const val = urlInput.trim();
    if (!val) return;
    if (/^https?:\/\//i.test(val) || /youtube\.com|youtu\.be/i.test(val)) {
      const normalized = /^https?:\/\//i.test(val) ? val : `https://${val}`;
      onPlayUrl?.(normalized);
    } else {
      onSearchQuery?.(val);
    }
    setUrlInput('');
  };

  const isLight = theme === Theme.LIGHT;
  const isPixel = theme === Theme.PIXEL;

  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const hasActiveContent = Boolean(currentTrack || isLoading || error);
  const labelText = isLoading
    ? 'Đang tải nhạc...'
    : error
    ? error
    : currentTrack
    ? `${currentTrack.title}  —  ${currentTrack.channelTitle}`
    : '';

  const loopTitle =
    loopMode === 'one'
      ? 'Đang lặp 1 bài (bấm để đổi)'
      : loopMode === 'all'
      ? 'Đang lặp danh sách (bấm để tắt)'
      : 'Bật chế độ lặp (Loop)';

  const shellClass = isPixel
    ? 'rounded-none border-2 border-emerald-400 bg-[#18181b] text-emerald-300'
    : isLight
    ? 'rounded-xl border border-zinc-200/90 bg-white/90 text-zinc-900'
    : 'rounded-xl border border-white/10 bg-zinc-950/75 text-zinc-100';

  return (
    <div className="relative flex items-center justify-center">
      {/* Keep YT player in tiny in-viewport host instead of -9999px so mobile browsers don't suspend background audio */}
      <div
        ref={hostRef}
        className="fixed bottom-1 right-1 w-[2px] h-[2px] opacity-[0.01] pointer-events-none overflow-hidden"
        aria-hidden="true"
      />
      <audio
        ref={keepAliveAudioRef}
        src={SILENT_KEEPALIVE_WAV}
        loop
        playsInline
        preload="auto"
        className="hidden"
      />

      {!hasActiveContent ? (
        <button
          type="button"
          onClick={() => setIsPopoverOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${shellClass} hover:opacity-90`}
          title="Nhạc nền • Dán link hoặc tìm tên bài hát"
        >
          <Music2 size={13} className={isLight ? 'text-zinc-700' : 'text-zinc-300'} />
          <span className="hidden sm:inline">Nhạc</span>
          {disambiguation?.ambiguous && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          )}
          <ChevronDown size={12} className="opacity-60" />
        </button>
      ) : (
        <div
          className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 w-[160px] sm:w-[320px] md:w-[410px] transition-all ${shellClass}`}
        >
          {currentTrack?.thumbnail ? (
            <img
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className={`hidden xs:block sm:block w-7 h-7 sm:w-8 sm:h-8 object-cover shrink-0 ${
                isPixel ? 'rounded-none border border-emerald-500/40' : 'rounded-lg'
              }`}
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-zinc-500/15 flex items-center justify-center shrink-0">
              {isLoading ? (
                <Loader2 size={14} className="animate-spin opacity-70" />
              ) : (
                <Music2 size={14} className="opacity-70" />
              )}
            </div>
          )}

          {/* Middle: Scrolling marquee title + Time bar underneath */}
          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
            <div className="tm-marquee-viewport text-[11px] font-medium leading-tight">
              {isLoading || error ? (
                <span className="block truncate">{labelText}</span>
              ) : (
                <div className="tm-marquee-track">
                  <span>{labelText}</span>
                  <span aria-hidden="true">{labelText}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono tabular-nums opacity-65 shrink-0">
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration > 0 ? Math.floor(duration) : 100}
                value={duration > 0 ? Math.min(Math.floor(currentTime), Math.floor(duration)) : 0}
                disabled={!currentTrack || duration <= 0}
                onMouseDown={() => setIsSeeking(true)}
                onTouchStart={() => setIsSeeking(true)}
                onChange={(e) => handleSeek(Number(e.target.value))}
                onMouseUp={() => setIsSeeking(false)}
                onTouchEnd={() => setIsSeeking(false)}
                aria-label="Thời gian phát nhạc"
                style={{
                  background: `linear-gradient(to right, currentColor ${progressPct}%, rgba(120,120,120,0.28) ${progressPct}%)`,
                }}
                className="tm-music-range flex-1 min-w-0 disabled:opacity-40"
              />
              <span className="text-[9px] font-mono tabular-nums opacity-65 shrink-0">
                {duration > 0 ? formatTime(duration) : '--:--'}
              </span>
            </div>
          </div>

          {/* Transport controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={onPrev}
              disabled={queue.length <= 1}
              className="p-1 rounded-md hover:bg-zinc-500/15 disabled:opacity-30 transition-colors"
              title="Bài trước"
            >
              <SkipBack size={12} />
            </button>
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!currentTrack || isLoading}
              className={`p-1.5 rounded-md transition-colors disabled:opacity-40 ${
                isLight
                  ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                  : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
              title={isPlaying ? 'Tạm dừng' : 'Phát nhạc'}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={queue.length <= 1}
              className="p-1 rounded-md hover:bg-zinc-500/15 disabled:opacity-30 transition-colors"
              title="Bài tiếp"
            >
              <SkipForward size={12} />
            </button>
            <button
              type="button"
              onClick={onCycleLoopMode}
              className={`p-1 rounded-md transition-colors ${
                loopMode !== 'off'
                  ? 'text-emerald-400 bg-emerald-500/15'
                  : 'opacity-70 hover:opacity-100 hover:bg-zinc-500/15'
              }`}
              title={loopTitle}
            >
              {loopMode === 'one' ? <Repeat1 size={12} /> : <Repeat size={12} />}
            </button>
            <button
              type="button"
              onClick={() => setIsPopoverOpen((v) => !v)}
              className={`p-1 rounded-md hover:bg-zinc-500/15 transition-colors ${
                isPopoverOpen ? 'bg-zinc-500/20' : ''
              }`}
              title="Hàng đợi nhạc"
            >
              <ListMusic size={12} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md hover:bg-red-500/15 hover:text-red-400 transition-colors"
              title="Tắt phát nhạc"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Minimalist Dropdown */}
      {isPopoverOpen && (
        <div
          className={`fixed sm:absolute top-16 sm:top-full left-1/2 -translate-x-1/2 sm:mt-2 w-[calc(100vw-1rem)] max-w-[390px] sm:w-[390px] p-3 border shadow-xl z-50 space-y-2.5 ${
            isPixel
              ? 'rounded-none border-2 border-emerald-400 bg-[#18181b] text-emerald-300'
              : isLight
              ? 'rounded-xl border-zinc-200 bg-white text-zinc-900'
              : 'rounded-xl border-white/10 bg-zinc-950 text-zinc-100'
          }`}
        >
          {/* Minimalist Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <Link2 size={12} className="opacity-70" />
              <span>Hàng đợi phát nhạc</span>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href={MUSIC_WEB_BASE_URL}
                target="_blank"
                rel="noreferrer"
                className="opacity-60 hover:opacity-100 transition-opacity"
                title="Mở NCmusicplayer"
              >
                <ExternalLink size={12} />
              </a>
              <button
                type="button"
                onClick={() => setIsPopoverOpen(false)}
                className="opacity-60 hover:opacity-100"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* TAB 1: QUEUE & LINK INPUT */}
          {activeTab === 'queue' && (
            <div className="space-y-2.5">
              <form onSubmit={handleSubmitUrlOrSearch} className="flex gap-1.5">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Dán link nhạc hoặc nhập tên bài hát..."
                  className={`flex-1 min-w-0 px-2.5 py-1.5 text-xs border outline-none ${
                    isPixel ? 'rounded-none' : 'rounded-lg'
                  } ${
                    isLight
                      ? 'bg-zinc-50 border-zinc-200 text-zinc-900'
                      : 'bg-white/5 border-white/10 text-zinc-100'
                  }`}
                />
                <button
                  type="submit"
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors shrink-0 ${
                    isPixel ? 'rounded-none' : 'rounded-lg'
                  } ${
                    isLight
                      ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                      : 'bg-white text-zinc-950 hover:bg-zinc-200'
                  }`}
                >
                  Phát
                </button>
              </form>

              <div className="flex items-center justify-end gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={onCycleLoopMode}
                  className={`flex items-center gap-1 px-2 py-1 border text-[11px] transition-colors ${
                    isPixel ? 'rounded-none' : 'rounded-lg'
                  } ${
                    loopMode !== 'off'
                      ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                      : isLight
                      ? 'border-zinc-200 text-zinc-600'
                      : 'border-white/10 text-zinc-400'
                  }`}
                >
                  {loopMode === 'one' ? <Repeat1 size={11} /> : <Repeat size={11} />}
                  <span>
                    {loopMode === 'one'
                      ? 'Lặp 1 bài'
                      : loopMode === 'all'
                      ? 'Lặp tất cả'
                      : 'Không lặp'}
                  </span>
                </button>
              </div>

              {disambiguation?.ambiguous && disambiguation.candidates.length > 0 && (
                <div
                  className={`p-2 rounded-lg border space-y-1.5 ${
                    isLight
                      ? 'bg-amber-50/70 border-amber-200 text-zinc-800'
                      : 'bg-amber-500/10 border-amber-500/20 text-zinc-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">
                      {pendingQuery
                        ? `Nhiều tác giả cho "${pendingQuery}" — chọn:`
                        : 'Chọn tác giả / ban nhạc:'}
                    </span>
                    {onDismissDisambiguation && (
                      <button
                        type="button"
                        onClick={onDismissDisambiguation}
                        className="text-[10px] opacity-60 hover:opacity-100"
                      >
                        Bỏ qua
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {disambiguation.candidates.map((cand, idx) => (
                      <button
                        key={`${cand.track.id}-${idx}`}
                        type="button"
                        onClick={() => {
                          onSelectDisambiguatedTrack?.(cand.track);
                          setIsPopoverOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 p-1.5 rounded-md text-left text-xs transition-colors ${
                          isLight ? 'hover:bg-white' : 'hover:bg-white/10'
                        }`}
                      >
                        {cand.track.thumbnail && (
                          <img
                            src={cand.track.thumbnail}
                            alt=""
                            className="w-7 h-7 rounded object-cover shrink-0"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{cand.channelTitle}</div>
                          <div className="text-[10px] opacity-70 truncate">{cand.track.title}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {queue.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] opacity-65 font-medium">
                    Đang phát ({currentIndex + 1}/{queue.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {queue.map((tItem, idx) => (
                      <button
                        key={`${tItem.id || tItem.playlistId}-${idx}`}
                        type="button"
                        onClick={() => onSelectIndex?.(idx)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                          idx === currentIndex
                            ? isLight
                              ? 'bg-zinc-100 font-semibold'
                              : 'bg-white/10 font-semibold'
                            : isLight
                            ? 'hover:bg-zinc-50'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        <span className="text-[10px] font-mono opacity-55 w-4 shrink-0">
                          {idx + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{tItem.title}</div>
                          <div className="text-[10px] opacity-60 truncate">
                            {tItem.channelTitle}
                            {tItem.viewCount ? ` • ${formatCompactViews(tItem.viewCount)}` : ''}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
};

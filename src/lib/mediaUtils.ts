export const MAX_MEDIA_FILE_BYTES = 45 * 1024 * 1024; // 45 MB per file
export const INLINE_MEDIA_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB decoded -> switch to Gemini Files API on server

const EXT_TO_MIME: Record<string, string> = {
  // Audio
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  opus: 'audio/opus',
  // Video
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  mpeg4: 'video/mp4',
  mpg: 'video/mpeg',
  // Documents & Images
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

const MIME_ALIASES: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'video/x-mp4': 'video/mp4',
  'application/mp4': 'video/mp4',
  'image/jpg': 'image/jpeg',
};

export function inferMediaMimeType(fileName?: string, rawMime?: string): string {
  const cleanedRaw = String(rawMime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (cleanedRaw && MIME_ALIASES[cleanedRaw]) {
    return MIME_ALIASES[cleanedRaw];
  }

  if (cleanedRaw && cleanedRaw !== 'application/octet-stream' && cleanedRaw !== 'binary/octet-stream') {
    return cleanedRaw;
  }

  const extMatch = String(fileName || '')
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  if (extMatch && EXT_TO_MIME[extMatch[1]]) {
    return EXT_TO_MIME[extMatch[1]];
  }

  return cleanedRaw || 'application/octet-stream';
}

export function isAudioMedia(mime?: string, fileName?: string): boolean {
  const normalized = inferMediaMimeType(fileName, mime);
  return normalized.startsWith('audio/');
}

export function isVideoMedia(mime?: string, fileName?: string): boolean {
  const normalized = inferMediaMimeType(fileName, mime);
  return normalized.startsWith('video/');
}

export function isNativeMultimodalMedia(mime?: string, fileName?: string): boolean {
  const normalized = inferMediaMimeType(fileName, mime);
  return (
    normalized.startsWith('image/') ||
    normalized === 'application/pdf' ||
    normalized.startsWith('audio/') ||
    normalized.startsWith('video/')
  );
}

export function formatMediaSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

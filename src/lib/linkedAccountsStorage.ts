import { FacebookPageSummary } from './mcpHubClient';

export const TM_LINKED_GOOGLE_STORAGE_KEY = 'tm_linked_google_v1';
export const TM_LINKED_FACEBOOK_STORAGE_KEY = 'tm_linked_facebook_v1';

export interface LocalGoogleLinkState {
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  linkedAt: string;
}

export interface LocalFacebookLinkState {
  accountUser: { id: string; name: string; picture?: string } | null;
  pages: FacebookPageSummary[];
  permissions: Array<{ permission: string; status: string }>;
  pageId: string;
  appId: string;
  apiVersion: string;
  scope: string;
  message?: string;
  link?: string;
  lastNote?: string;
  linkedAt?: string;
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function sanitizeFacebookPagesForLocal(pages: FacebookPageSummary[]): FacebookPageSummary[] {
  if (!Array.isArray(pages)) return [];
  return pages
    .filter((p) => p && typeof p.id === 'string' && p.id.trim())
    .slice(0, 60)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name || 'Facebook Page'),
      category: p.category ? String(p.category) : undefined,
      picture: p.picture ? String(p.picture) : undefined,
      tasks: Array.isArray(p.tasks) ? p.tasks.map(String) : undefined,
      link: p.link ? String(p.link) : undefined,
      followersCount: typeof p.followersCount === 'number' ? p.followersCount : undefined,
      // Explicitly omit accessToken so OAuth/Page tokens are never persisted in localStorage
    }));
}

export function loadLocalGoogleLink(): LocalGoogleLinkState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const parsed = safeParseJson<LocalGoogleLinkState>(
    window.localStorage.getItem(TM_LINKED_GOOGLE_STORAGE_KEY)
  );
  if (!parsed || typeof parsed !== 'object') return null;
  if (!parsed.email && !parsed.displayName && !parsed.photoURL) return null;
  return {
    email: parsed.email ? String(parsed.email) : null,
    displayName: parsed.displayName ? String(parsed.displayName) : null,
    photoURL: parsed.photoURL ? String(parsed.photoURL) : null,
    linkedAt: typeof parsed.linkedAt === 'string' ? parsed.linkedAt : new Date().toISOString(),
  };
}

export function saveLocalGoogleLink(input: Partial<LocalGoogleLinkState>): LocalGoogleLinkState {
  const existing = loadLocalGoogleLink();
  const next: LocalGoogleLinkState = {
    email: input.email !== undefined ? input.email : existing?.email ?? null,
    displayName: input.displayName !== undefined ? input.displayName : existing?.displayName ?? null,
    photoURL: input.photoURL !== undefined ? input.photoURL : existing?.photoURL ?? null,
    linkedAt: input.linkedAt || existing?.linkedAt || new Date().toISOString(),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(TM_LINKED_GOOGLE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}

export function clearLocalGoogleLink(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(TM_LINKED_GOOGLE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadLocalFacebookLink(): LocalFacebookLinkState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const parsed = safeParseJson<LocalFacebookLinkState>(
    window.localStorage.getItem(TM_LINKED_FACEBOOK_STORAGE_KEY)
  );
  if (!parsed || typeof parsed !== 'object') return null;

  return {
    accountUser:
      parsed.accountUser && typeof parsed.accountUser.id === 'string'
        ? {
            id: String(parsed.accountUser.id),
            name: String(parsed.accountUser.name || ''),
            picture: parsed.accountUser.picture ? String(parsed.accountUser.picture) : undefined,
          }
        : null,
    pages: sanitizeFacebookPagesForLocal(parsed.pages || []),
    permissions: Array.isArray(parsed.permissions)
      ? parsed.permissions
          .filter((p) => p && typeof p.permission === 'string')
          .map((p) => ({ permission: String(p.permission), status: String(p.status || 'granted') }))
      : [],
    pageId: typeof parsed.pageId === 'string' ? parsed.pageId : '',
    appId: typeof parsed.appId === 'string' ? parsed.appId : '',
    apiVersion: typeof parsed.apiVersion === 'string' && parsed.apiVersion ? parsed.apiVersion : 'v21.0',
    scope:
      typeof parsed.scope === 'string' && parsed.scope
        ? parsed.scope
        : 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts',
    message: typeof parsed.message === 'string' ? parsed.message : '',
    link: typeof parsed.link === 'string' ? parsed.link : '',
    lastNote: typeof parsed.lastNote === 'string' ? parsed.lastNote : undefined,
    linkedAt: typeof parsed.linkedAt === 'string' ? parsed.linkedAt : undefined,
  };
}

export function saveLocalFacebookLink(input: Partial<LocalFacebookLinkState>): LocalFacebookLinkState {
  const existing = loadLocalFacebookLink();
  const next: LocalFacebookLinkState = {
    accountUser: input.accountUser !== undefined ? input.accountUser : existing?.accountUser ?? null,
    pages:
      input.pages !== undefined
        ? sanitizeFacebookPagesForLocal(input.pages)
        : existing?.pages ?? [],
    permissions:
      input.permissions !== undefined ? input.permissions : existing?.permissions ?? [],
    pageId: input.pageId !== undefined ? input.pageId : existing?.pageId ?? '',
    appId: input.appId !== undefined ? input.appId : existing?.appId ?? '',
    apiVersion: input.apiVersion !== undefined ? input.apiVersion : existing?.apiVersion ?? 'v21.0',
    scope:
      input.scope !== undefined
        ? input.scope
        : existing?.scope ?? 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts',
    message: input.message !== undefined ? input.message : existing?.message ?? '',
    link: input.link !== undefined ? input.link : existing?.link ?? '',
    lastNote: input.lastNote !== undefined ? input.lastNote : existing?.lastNote,
    linkedAt: input.linkedAt ?? existing?.linkedAt ?? (input.accountUser || input.pageId ? new Date().toISOString() : undefined),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(TM_LINKED_FACEBOOK_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}

export function clearLocalFacebookLink(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(TM_LINKED_FACEBOOK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

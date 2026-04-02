// File: src/lib/api.ts
const API_BASE = '/api';
const ADMIN_TOKEN_KEY = 'wtw_admin_token';

// Store/retrieve admin token
export function setAdminToken(token: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function getAdminToken(): string | null {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}

export function clearAdminToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const { headers: optionHeaders, ...restOptions } = options;
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...restOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(optionHeaders instanceof Headers
          ? Object.fromEntries(optionHeaders.entries())
          : Array.isArray(optionHeaders)
            ? Object.fromEntries(optionHeaders)
            : optionHeaders),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

// Authenticated fetch for admin endpoints
async function fetchApiAdmin<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAdminToken();
  const { headers: optionHeaders, ...restOptions } = options;

  return fetchApi<T>(endpoint, {
    ...restOptions,
    headers: {
      ...(optionHeaders instanceof Headers
        ? Object.fromEntries(optionHeaders.entries())
        : Array.isArray(optionHeaders)
          ? Object.fromEntries(optionHeaders)
          : optionHeaders),
      ...(token ? { 'X-Admin-Token': token } : {}),
    },
  });
}

// Authenticated fetch for admin file uploads
async function fetchApiAdminFormData<T>(
  endpoint: string,
  formData: FormData
): Promise<ApiResponse<T>> {
  try {
    const token = getAdminToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-Admin-Token'] = token;
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

// Special fetch for file uploads (no JSON content-type, no auth)
async function fetchApiFormData<T>(
  endpoint: string,
  formData: FormData
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

// Special fetch for GET requests without Content-Type header
async function fetchApiGet<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

// Authenticated GET for admin endpoints
async function fetchApiAdminGet<T>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const token = getAdminToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['X-Admin-Token'] = token;
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Network error' };
  }
}

export const adminApi = {
  checkPasswordStatus: () =>
    fetchApi<{ isSet: boolean }>('/admin/check-password-status', { method: 'POST' }),

  setPassword: (password: string) =>
    fetchApi<{ success: boolean; token?: string }>('/admin/set-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  verifyPassword: (password: string) =>
    fetchApi<{ valid: boolean; token?: string; upgradeRequired?: boolean }>('/admin/verify-password', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // Protected endpoints use fetchApiAdmin
  getConfig: () =>
    fetchApiAdmin<{ config: any }>('/admin/get-config', { method: 'POST' }),

  saveConfig: (config: any) =>
    fetchApiAdmin<{ success: boolean }>('/admin/save-config', {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),

  // Public - needed by session participants
  getSessionSettings: () =>
    fetchApi<{ settings: any }>('/admin/get-session-settings', { method: 'POST' }),

  saveSessionSettings: (settings: any) =>
    fetchApiAdmin<{ success: boolean }>('/admin/save-session-settings', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    }),

  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return fetchApiAdminFormData<{ success: boolean; path: string }>('/admin/upload-logo', formData);
  },

  deleteLogo: () =>
    fetchApiAdmin<{ success: boolean }>('/admin/delete-logo', { method: 'POST' }),

  // Public - needed for home page
  getLogo: () =>
    fetchApiGet<{ logo: { path: string; filename: string } | null }>('/admin/get-logo'),

  // Public - needed for manifest
  getPwaSettings: () =>
    fetchApiGet<{ settings: { appName: string; appShortName: string; hasCustomIcon: boolean } | null }>('/admin/get-pwa-settings'),

  savePwaSettings: (appName: string, appShortName: string) =>
    fetchApiAdmin<{ success: boolean }>('/admin/save-pwa-settings', {
      method: 'POST',
      body: JSON.stringify({ appName, appShortName }),
    }),

  uploadPwaIcon: (file: File) => {
    const formData = new FormData();
    formData.append('icon', file);
    return fetchApiAdminFormData<{ success: boolean }>('/admin/upload-pwa-icon', formData);
  },

  deletePwaIcon: () =>
    fetchApiAdmin<{ success: boolean }>('/admin/delete-pwa-icon', { method: 'POST' }),

  getSessionHistory: (limit = 50, offset = 0) =>
    fetchApiAdminGet<{ history: any[]; total: number }>(`/admin/session-history?limit=${limit}&offset=${offset}`),

  clearSessionHistory: () =>
    fetchApiAdmin<{ success: boolean }>('/admin/clear-session-history', { method: 'POST' }),

  getCorsOrigins: () =>
    fetchApiAdminGet<{ origins: string[] }>('/admin/get-cors-origins'),

  saveCorsOrigins: (origins: string[]) =>
    fetchApiAdmin<{ success: boolean }>('/admin/save-cors-origins', {
      method: 'POST',
      body: JSON.stringify({ origins }),
    }),
};

export interface CacheRefreshProgress {
  isRunning: boolean;
  phase: string;
  moviesProcessed: number;
  moviesTotal: number;
  showsProcessed: number;
  showsTotal: number;
  languagesFound: number;
  collectionsProcessed: number;
  labelsFound?: number;
  error?: string;
}

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  githubRepo: string;
  error?: string;
}

export const plexApi = {
  testConnection: (plexUrl: string, plexToken: string) =>
    fetchApi<{ success: boolean; error?: string }>('/plex/test-connection', {
      method: 'POST',
      body: JSON.stringify({ plexUrl, plexToken }),
    }),

  getLibraries: (plexUrl?: string, plexToken?: string) =>
    fetchApi<{ libraries: any[] }>('/plex/get-libraries', {
      method: 'POST',
      body: JSON.stringify({ plexUrl, plexToken }),
    }),

  getCacheStats: () =>
    fetchApi<{ mediaCount: number; languagesCached: boolean; collectionsCached?: boolean; labelsCached?: boolean; labelsCount?: number }>('/plex/get-cache-stats', {
      method: 'POST',
    }),

  getCacheRefreshProgress: () =>
    fetchApiGet<CacheRefreshProgress>('/plex/cache-refresh-progress'),

  refreshCache: (libraryKeys: string[]) =>
    fetchApiAdmin<{ success: boolean; mediaCount: number; movieCount: number; showCount: number; languageCount: number; labelsCount?: number; collectionsCount?: number }>(
      '/plex/refresh-cache',
      {
        method: 'POST',
        body: JSON.stringify({ libraryKeys }),
      }
    ),

  getMedia: (mediaType: string, filters?: any, userPlexToken?: string) =>
    fetchApi<{ items: any[]; cached: boolean }>('/plex/get-media', {
      method: 'POST',
      body: JSON.stringify({ mediaType, filters, userPlexToken }),
    }),

  getLanguages: () =>
    fetchApi<{ languages: { language: string; count: number }[]; cached: boolean }>(
      '/plex/get-languages',
      { method: 'POST' }
    ),

  getLabels: () =>
    fetchApi<{ labels: { label: string; count: number }[]; cached: boolean }>(
      '/plex/get-labels',
      { method: 'POST' }
    ),

  getWatchedKeys: (userPlexToken: string) =>
    fetchApi<{ watchedKeys: string[] }>('/plex/get-watched-keys', {
      method: 'POST',
      body: JSON.stringify({ userPlexToken }),
    }),

  getWatchlist: (userPlexToken: string) =>
    fetchApi<{ watchlistKeys: string[]; watchlistCount: number; matchedCount: number }>('/plex/get-watchlist', {
      method: 'POST',
      body: JSON.stringify({ userPlexToken }),
    }),

  addToWatchlist: (userPlexToken: string, ratingKey: string) =>
    fetchApi<{ success: boolean }>('/plex/add-to-watchlist', {
      method: 'POST',
      body: JSON.stringify({ userPlexToken, ratingKey }),
    }),

  checkWatchlist: (userPlexToken: string, ratingKey: string) =>
    fetchApi<{ inWatchlist: boolean }>('/plex/check-watchlist', {
      method: 'POST',
      body: JSON.stringify({ userPlexToken, ratingKey }),
    }),

  getCollections: (libraryKeys: string[], mediaType?: string) =>
    fetchApi<{ collections: any[]; cached: boolean }>('/plex/get-collections', {
      method: 'POST',
      body: JSON.stringify({ libraryKeys, mediaType }),
    }),

  getCollectionItems: (collectionKeys: string[]) =>
    fetchApi<{ itemKeys: string[]; cached: boolean }>('/plex/get-collection-items', {
      method: 'POST',
      body: JSON.stringify({ collectionKeys }),
    }),

  getLastCacheRefresh: () =>
    fetchApi<{ 
      lastRefresh: { timestamp: string; type: string; mediaCount?: number; error?: string; success?: boolean } | null;
      lastManualRefresh: any;
      lastAutoRefresh: any;
    }>('/plex/last-cache-refresh'),

  createOAuthPin: (redirectUri?: string) =>
    fetchApi<{ pinId: number; code: string; authUrl: string }>('/plex/oauth/create-pin', {
      method: 'POST',
      body: JSON.stringify({ redirectUri }),
    }),

  getServerInfo: () =>
    fetchApiGet<{ 
      machineIdentifier: string; 
      friendlyName: string;
      host: string;
      port: string;
      protocol: string;
    }>('/plex/server-info'),

  checkOAuthPin: (pinId: number) =>
    fetchApi<{ authenticated: boolean; authToken?: string; user?: { username: string; email: string; thumb: string } }>(
      '/plex/oauth/check-pin',
      {
        method: 'POST',
        body: JSON.stringify({ pinId }),
      }
    ),
};

export const versionApi = {
  getVersionInfo: () =>
    fetchApiGet<VersionInfo>('/version'),

  getCurrentVersion: () =>
    fetchApiGet<{ version: string }>('/version/current'),
};

export const sessionsApi = {
  create: (data: { 
    mediaType: string; 
    displayName: string; 
    isGuest: boolean; 
    plexToken?: string; 
    timedDuration?: number;
    useWatchlist?: boolean;
  }) =>
    fetchApi<{ session: { id: string; code: string }; participant: { id: string } }>('/sessions/create', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getByCode: (code: string) =>
    fetchApi<{ session: any }>(`/sessions/code/${code}`),

  getById: (id: string) =>
    fetchApi<{ session: any }>(`/sessions/${id}`),

  update: (id: string, updates: any) =>
    fetchApi<{ session: any }>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  join: (sessionId: string, data: { displayName: string; isGuest: boolean; plexToken?: string }) =>
    fetchApi<{ participant: { id: string } }>(`/sessions/${sessionId}/join`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getParticipants: (sessionId: string) =>
    fetchApi<{ participants: any[] }>(`/sessions/${sessionId}/participants`),

  updateParticipant: (participantId: string, updates: any) =>
    fetchApi<{ participant: any }>(`/sessions/participants/${participantId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  addVote: (sessionId: string, participantId: string, itemKey: string, vote: boolean) =>
    fetchApi<{ success: boolean; voteId: string; match?: boolean; winnerItemKey?: string }>(`/sessions/${sessionId}/votes`, {
      method: 'POST',
      body: JSON.stringify({ participantId, itemKey, vote }),
    }),

  getVotes: (sessionId: string) =>
    fetchApi<{ votes: any[] }>(`/sessions/${sessionId}/votes`),

  deleteVote: (sessionId: string, participantId: string, itemKey: string) =>
    fetchApi<{ success: boolean }>(`/sessions/${sessionId}/votes/${participantId}/${itemKey}`, {
      method: 'DELETE',
    }),

  getMatches: (sessionId: string) =>
    fetchApi<{ matches: string[]; topLiked: { itemKey: string; likeCount: number }[] }>(`/sessions/${sessionId}/matches`),

  castFinalVote: (sessionId: string, participantId: string, itemKey: string) =>
    fetchApi<{ success: boolean; allVoted: boolean; winner?: string; wasTie?: boolean; tiedItems?: string[] }>(
      `/sessions/${sessionId}/final-vote`,
      {
        method: 'POST',
        body: JSON.stringify({ participantId, itemKey }),
      }
    ),

  getFinalVotes: (sessionId: string) =>
    fetchApi<{ finalVotes: any[]; votedCount: number; totalCount: number; allVoted: boolean }>(
      `/sessions/${sessionId}/final-votes`
    ),

  getConfig: (key: string) =>
    fetchApi<{ value: any }>(`/sessions/config/${key}`),

  getCachedMedia: (mediaType: string) =>
    fetchApi<{ items: any[] }>(`/sessions/cache/media?mediaType=${mediaType}`),

  getWatchedKeys: (sessionId: string, participantId: string) =>
    fetchApiGet<{ watchedKeys: string[] }>(`/plex/session/${sessionId}/watched-keys/${participantId}`),

  getWatchlistKeys: (sessionId: string) =>
    fetchApiGet<{ watchlistKeys: string[]; watchlistCount: number; matchedCount: number }>(`/plex/session/${sessionId}/watchlist-keys`),

  checkWatchlist: (sessionId: string, participantId: string, ratingKey: string) =>
    fetchApi<{ inWatchlist: boolean }>(`/plex/session/${sessionId}/check-watchlist/${participantId}`, {
      method: 'POST',
      body: JSON.stringify({ ratingKey }),
    }),

  addToWatchlist: (sessionId: string, participantId: string, ratingKey: string) =>
    fetchApi<{ success: boolean }>(`/plex/session/${sessionId}/add-to-watchlist/${participantId}`, {
      method: 'POST',
      body: JSON.stringify({ ratingKey }),
    }),
};
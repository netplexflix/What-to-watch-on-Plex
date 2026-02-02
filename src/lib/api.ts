// File: src/lib/api.ts
const API_BASE = '/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
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

// Special fetch for file uploads (no JSON content-type)
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

export const adminApi = {
  checkPasswordStatus: () =>
    fetchApi<{ isSet: boolean }>('/admin/check-password-status', { method: 'POST' }),

  setPassword: (passwordHash: string) =>
    fetchApi<{ success: boolean }>('/admin/set-password', {
      method: 'POST',
      body: JSON.stringify({ passwordHash }),
    }),

  verifyPassword: (passwordHash: string) =>
    fetchApi<{ valid: boolean }>('/admin/verify-password', {
      method: 'POST',
      body: JSON.stringify({ passwordHash }),
    }),

  getConfig: () =>
    fetchApi<{ config: any }>('/admin/get-config', { method: 'POST' }),

  saveConfig: (config: any) =>
    fetchApi<{ success: boolean }>('/admin/save-config', {
      method: 'POST',
      body: JSON.stringify({ config }),
    }),

  getSessionSettings: () =>
    fetchApi<{ settings: any }>('/admin/get-session-settings', { method: 'POST' }),

  saveSessionSettings: (settings: any) =>
    fetchApi<{ success: boolean }>('/admin/save-session-settings', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    }),

  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return fetchApiFormData<{ success: boolean; path: string }>('/admin/upload-logo', formData);
  },

  deleteLogo: () =>
    fetchApi<{ success: boolean }>('/admin/delete-logo', { method: 'POST' }),

  getLogo: () =>
    fetchApiGet<{ logo: { path: string; filename: string } | null }>('/admin/get-logo'),

  getSessionHistory: (limit = 50, offset = 0) =>
    fetchApiGet<{ history: any[]; total: number }>(`/admin/session-history?limit=${limit}&offset=${offset}`),

  clearSessionHistory: () =>
    fetchApi<{ success: boolean }>('/admin/clear-session-history', { method: 'POST' }),
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
    fetchApi<{ success: boolean; mediaCount: number; movieCount: number; showCount: number; languageCount: number; labelsCount?: number; collectionsCount?: number }>(
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
};
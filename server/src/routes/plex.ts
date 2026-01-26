// File: server/src/routes/plex.ts
import { Router } from 'express';
import { getDb, generateId } from '../db.js';

const router = Router();

const PLEX_APP_NAME = 'WhatToWatch';
const PLEX_CLIENT_ID = 'wtw-self-hosted';

// Store for cache refresh progress (in-memory, per-process)
const cacheRefreshProgress: {
  isRunning: boolean;
  phase: string;
  moviesProcessed: number;
  moviesTotal: number;
  showsProcessed: number;
  showsTotal: number;
  languagesFound: number;
  collectionsProcessed: number;
  error?: string;
} = {
  isRunning: false,
  phase: 'idle',
  moviesProcessed: 0,
  moviesTotal: 0,
  showsProcessed: 0,
  showsTotal: 0,
  languagesFound: 0,
  collectionsProcessed: 0,
};

interface PlexLibrary {
  key: string;
  title: string;
  type: string;
}

// Language code mapping - ISO 639-2/B and ISO 639-1 codes
const CODE_TO_LANGUAGE: Record<string, string> = {
  // ISO 639-2/B codes (3-letter)
  eng: 'English',
  fra: 'French',
  fre: 'French',
  deu: 'German',
  ger: 'German',
  spa: 'Spanish',
  ita: 'Italian',
  jpn: 'Japanese',
  kor: 'Korean',
  zho: 'Chinese',
  chi: 'Chinese',
  cmn: 'Chinese',
  yue: 'Chinese',
  rus: 'Russian',
  por: 'Portuguese',
  hin: 'Hindi',
  ara: 'Arabic',
  nld: 'Dutch',
  dut: 'Dutch',
  swe: 'Swedish',
  nor: 'Norwegian',
  nob: 'Norwegian',
  nno: 'Norwegian',
  dan: 'Danish',
  fin: 'Finnish',
  pol: 'Polish',
  tur: 'Turkish',
  tha: 'Thai',
  vie: 'Vietnamese',
  ind: 'Indonesian',
  ces: 'Czech',
  cze: 'Czech',
  hun: 'Hungarian',
  ron: 'Romanian',
  rum: 'Romanian',
  ukr: 'Ukrainian',
  heb: 'Hebrew',
  ell: 'Greek',
  gre: 'Greek',
  // ISO 639-1 codes (2-letter)
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ru: 'Russian',
  pt: 'Portuguese',
  hi: 'Hindi',
  ar: 'Arabic',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  pl: 'Polish',
  tr: 'Turkish',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  uk: 'Ukrainian',
  he: 'Hebrew',
  el: 'Greek',
};

function normalizeLanguageName(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'Unknown' || trimmed === 'und' || trimmed === 'Undetermined') return undefined;
  
  const key = trimmed.toLowerCase();
  
  // First check if it's a code we can map
  if (CODE_TO_LANGUAGE[key]) {
    return CODE_TO_LANGUAGE[key];
  }
  
  // Check if it's already a full language name (capitalize first letter)
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  
  // If it looks like a language name (not a code), return it
  if (trimmed.length > 3) {
    return capitalized;
  }
  
  return undefined;
}

function getPlexConfig() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
  if (!row) return null;
  return JSON.parse(row.value);
}

function getSessionSettings() {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('session_settings') as { value: string } | undefined;
  if (!row) return {};
  return JSON.parse(row.value);
}

// Test Plex connection
router.post('/test-connection', async (req, res) => {
  try {
    const { plexUrl, plexToken } = req.body;
    
    const response = await fetch(`${plexUrl}/identity?X-Plex-Token=${plexToken}`, {
      headers: { Accept: 'application/json' },
    });
    
    if (!response.ok) {
      return res.json({ success: false, error: `Connection failed: ${response.status}` });
    }
    
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.json({ success: false, error: `Connection error: ${message}` });
  }
});

// Get Plex libraries
router.post('/get-libraries', async (req, res) => {
  try {
    let { plexUrl, plexToken } = req.body;
    
    if (!plexUrl || !plexToken) {
      const config = getPlexConfig();
      if (!config?.plex_url || !config?.plex_token) {
        return res.status(400).json({ error: 'Plex not configured' });
      }
      plexUrl = config.plex_url;
      plexToken = config.plex_token;
    }
    
    const response = await fetch(`${plexUrl}/library/sections?X-Plex-Token=${plexToken}`, {
      headers: { Accept: 'application/json' },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch libraries: ${response.status}`);
    }
    
    const data = await response.json();
    const directories = data.MediaContainer?.Directory || [];
    
    const libraries: PlexLibrary[] = directories
      .filter((dir: any) => dir.type === 'movie' || dir.type === 'show')
      .map((dir: any) => ({
        key: dir.key,
        title: dir.title,
        type: dir.type,
      }));
    
    res.json({ libraries });
  } catch (error) {
    console.error('Error fetching libraries:', error);
    res.status(500).json({ error: 'Failed to fetch libraries' });
  }
});

// Get collections from libraries (with caching)
router.post('/get-collections', async (req, res) => {
  try {
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const { libraryKeys, mediaType } = req.body;
    const selectedLibraries = libraryKeys || config.libraries || [];
    const sortedLibraryKeys = [...selectedLibraries].sort().join(',');
    const cacheKey = `${sortedLibraryKeys}:${mediaType || 'all'}`;
    
    const db = getDb();
    
    // Check cache first
    const cached = db.prepare(
      'SELECT collections FROM collections_cache WHERE cache_key = ?'
    ).get(cacheKey) as { collections: string } | undefined;
    
    if (cached?.collections) {
      console.log('[Plex] Returning cached collections');
      return res.json({ collections: JSON.parse(cached.collections), cached: true });
    }
    
    // Get library types
    const libResponse = await fetch(`${config.plex_url}/library/sections?X-Plex-Token=${config.plex_token}`, {
      headers: { Accept: 'application/json' },
    });
    const libData = await libResponse.json();
    const directories = libData.MediaContainer?.Directory || [];
    
    const libraryTypeMap = new Map<string, string>();
    directories.forEach((dir: any) => libraryTypeMap.set(dir.key, dir.type));
    
    // Filter libraries by media type if specified
    let filteredLibraryKeys = selectedLibraries;
    if (mediaType === 'movies') {
      filteredLibraryKeys = selectedLibraries.filter((key: string) => libraryTypeMap.get(key) === 'movie');
    } else if (mediaType === 'shows') {
      filteredLibraryKeys = selectedLibraries.filter((key: string) => libraryTypeMap.get(key) === 'show');
    }
    
    const allCollections: any[] = [];
    
    for (const libraryKey of filteredLibraryKeys) {
      try {
        const response = await fetch(
          `${config.plex_url}/library/sections/${libraryKey}/collections?X-Plex-Token=${config.plex_token}`,
          { headers: { Accept: 'application/json' } }
        );
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const collections = data.MediaContainer?.Metadata || [];
        
        for (const collection of collections) {
          allCollections.push({
            ratingKey: collection.ratingKey,
            title: collection.title,
            thumb: collection.thumb ? `/api/plex/image?path=${encodeURIComponent(collection.thumb)}` : null,
            childCount: collection.childCount || 0,
            libraryKey,
            libraryType: libraryTypeMap.get(libraryKey),
          });
        }
      } catch (e) {
        console.error(`[Plex] Error fetching collections for library ${libraryKey}:`, e);
      }
    }
    
    // Sort by title
    allCollections.sort((a, b) => a.title.localeCompare(b.title));
    
    // Cache the collections
    db.prepare(`
      INSERT INTO collections_cache (id, cache_key, collections, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(cache_key) DO UPDATE SET 
        collections = excluded.collections, 
        updated_at = datetime('now')
    `).run(generateId(), cacheKey, JSON.stringify(allCollections));
    
    res.json({ collections: allCollections, cached: false });
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// Get items in a collection (with caching)
router.post('/get-collection-items', async (req, res) => {
  try {
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const { collectionKeys } = req.body;
    if (!collectionKeys || collectionKeys.length === 0) {
      return res.json({ itemKeys: [] });
    }
    
    const db = getDb();
    const sortedKeys = [...collectionKeys].sort().join(',');
    
    // Check cache first
    const cached = db.prepare(
      'SELECT item_keys FROM collection_items_cache WHERE collection_keys = ?'
    ).get(sortedKeys) as { item_keys: string } | undefined;
    
    if (cached?.item_keys) {
      console.log('[Plex] Returning cached collection items');
      return res.json({ itemKeys: JSON.parse(cached.item_keys), cached: true });
    }
    
    const itemKeys = new Set<string>();
    
    for (const collectionKey of collectionKeys) {
      try {
        const response = await fetch(
          `${config.plex_url}/library/collections/${collectionKey}/children?X-Plex-Token=${config.plex_token}`,
          { headers: { Accept: 'application/json' } }
        );
        
        if (!response.ok) {
          console.error(`[Plex] Failed to fetch collection ${collectionKey}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const items = data.MediaContainer?.Metadata || [];
        
        console.log(`[Plex] Collection ${collectionKey} has ${items.length} items`);
        
        for (const item of items) {
          itemKeys.add(item.ratingKey);
        }
      } catch (e) {
        console.error(`[Plex] Error fetching collection items for ${collectionKey}:`, e);
      }
    }
    
    const itemKeysArray = Array.from(itemKeys);
    console.log(`[Plex] Total unique items from collections: ${itemKeysArray.length}`);
    
    // Cache the result
    db.prepare(`
      INSERT INTO collection_items_cache (id, collection_keys, item_keys, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(collection_keys) DO UPDATE SET 
        item_keys = excluded.item_keys, 
        updated_at = datetime('now')
    `).run(generateId(), sortedKeys, JSON.stringify(itemKeysArray));
    
    res.json({ itemKeys: itemKeysArray, cached: false });
  } catch (error) {
    console.error('Error fetching collection items:', error);
    res.status(500).json({ error: 'Failed to fetch collection items' });
  }
});

// Get cache stats
router.post('/get-cache-stats', (req, res) => {
  try {
    const db = getDb();
    
    // Get plex config for library keys
    const configRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
    
    let totalMediaCount = 0;
    
    if (configRow) {
      const config = JSON.parse(configRow.value);
      const sortedLibraryKeys = [...(config.libraries || [])].sort().join(',');
      
      // Get the 'both' cache which contains all items (not summing individual caches)
      const bothCache = db.prepare(
        'SELECT item_count FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
      ).get(sortedLibraryKeys, 'both') as { item_count: number } | undefined;
      
      if (bothCache) {
        totalMediaCount = bothCache.item_count || 0;
      } else {
        // Fallback: if no 'both' cache, sum movies and shows
        const moviesCache = db.prepare(
          'SELECT item_count FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
        ).get(sortedLibraryKeys, 'movies') as { item_count: number } | undefined;
        
        const showsCache = db.prepare(
          'SELECT item_count FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
        ).get(sortedLibraryKeys, 'shows') as { item_count: number } | undefined;
        
        totalMediaCount = (moviesCache?.item_count || 0) + (showsCache?.item_count || 0);
      }
    }
    
    const langRow = db.prepare('SELECT languages FROM library_languages_cache LIMIT 1').get() as { languages: string } | undefined;
    let languagesCached = false;
    if (langRow?.languages) {
      try {
        const langs = JSON.parse(langRow.languages);
        languagesCached = Array.isArray(langs) && langs.length > 0;
      } catch {
        languagesCached = false;
      }
    }
    
    // Get collections cache count
    const collectionsCount = db.prepare('SELECT COUNT(*) as count FROM collections_cache').get() as { count: number };
    
    res.json({
      mediaCount: totalMediaCount,
      languagesCached,
      collectionsCached: collectionsCount.count > 0,
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Get cache refresh progress
router.get('/cache-refresh-progress', (req, res) => {
  res.json(cacheRefreshProgress);
});

// Helper function to extract languages from audio streams
function extractLanguagesFromStreams(media: any[]): string[] {
  const languages = new Set<string>();
  
  if (!media) return [];
  
  for (const m of media) {
    if (m.Part) {
      for (const part of m.Part) {
        if (part.Stream) {
          for (const stream of part.Stream) {
            // streamType 2 = audio
            if (stream.streamType === 2) {
              let normalizedLang: string | undefined;
              
              if (stream.languageCode) {
                normalizedLang = normalizeLanguageName(stream.languageCode);
              }
              if (!normalizedLang && stream.languageTag) {
                const tagPart = stream.languageTag.split('-')[0];
                normalizedLang = normalizeLanguageName(tagPart);
              }
              if (!normalizedLang && stream.language) {
                normalizedLang = normalizeLanguageName(stream.language);
              }
              
              if (normalizedLang) {
                languages.add(normalizedLang);
              }
            }
          }
        }
      }
    }
  }
  
  return Array.from(languages);
}

// Helper function to get languages for a TV show by checking a random episode
async function getShowLanguagesFromEpisode(
  plexUrl: string, 
  plexToken: string, 
  showRatingKey: string
): Promise<string[]> {
  try {
    // First, get the seasons of the show
    const seasonsResponse = await fetch(
      `${plexUrl}/library/metadata/${showRatingKey}/children?X-Plex-Token=${plexToken}`,
      { headers: { Accept: 'application/json' } }
    );
    
    if (!seasonsResponse.ok) {
      return [];
    }
    
    const seasonsData = await seasonsResponse.json();
    const seasons = seasonsData.MediaContainer?.Metadata || [];
    
    if (seasons.length === 0) {
      return [];
    }
    
    // Get the first season (or a random one)
    const firstSeason = seasons[0];
    
    // Get episodes from the first season
    const episodesResponse = await fetch(
      `${plexUrl}/library/metadata/${firstSeason.ratingKey}/children?X-Plex-Token=${plexToken}`,
      { headers: { Accept: 'application/json' } }
    );
    
    if (!episodesResponse.ok) {
      return [];
    }
    
    const episodesData = await episodesResponse.json();
    const episodes = episodesData.MediaContainer?.Metadata || [];
    
    if (episodes.length === 0) {
      return [];
    }
    
    // Get the first episode's detailed metadata
    const firstEpisode = episodes[0];
    const episodeDetailResponse = await fetch(
      `${plexUrl}/library/metadata/${firstEpisode.ratingKey}?X-Plex-Token=${plexToken}`,
      { headers: { Accept: 'application/json' } }
    );
    
    if (!episodeDetailResponse.ok) {
      return [];
    }
    
    const episodeDetailData = await episodeDetailResponse.json();
    const episodeDetail = episodeDetailData.MediaContainer?.Metadata?.[0];
    
    if (!episodeDetail) {
      return [];
    }
    
    // Extract languages from the episode's audio streams
    return extractLanguagesFromStreams(episodeDetail.Media);
  } catch (e) {
    console.error(`[Plex] Error fetching episode languages for show ${showRatingKey}:`, e);
    return [];
  }
}

// Refresh cache with progress tracking
router.post('/refresh-cache', async (req, res) => {
  // Check if already running
  if (cacheRefreshProgress.isRunning) {
    return res.status(409).json({ error: 'Cache refresh already in progress' });
  }

  try {
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const { libraryKeys } = req.body;
    const selectedLibraries = libraryKeys || config.libraries || [];
    const sortedLibraryKeys = [...selectedLibraries].sort().join(',');
    
    // Reset progress
    cacheRefreshProgress.isRunning = true;
    cacheRefreshProgress.phase = 'starting';
    cacheRefreshProgress.moviesProcessed = 0;
    cacheRefreshProgress.moviesTotal = 0;
    cacheRefreshProgress.showsProcessed = 0;
    cacheRefreshProgress.showsTotal = 0;
    cacheRefreshProgress.languagesFound = 0;
    cacheRefreshProgress.collectionsProcessed = 0;
    cacheRefreshProgress.error = undefined;
    
    const db = getDb();
    
    // Clear existing cache for these libraries
    db.prepare('DELETE FROM media_items_cache WHERE library_keys = ?').run(sortedLibraryKeys);
    db.prepare('DELETE FROM library_languages_cache WHERE library_keys = ?').run(sortedLibraryKeys);
    db.prepare('DELETE FROM collections_cache').run();
    db.prepare('DELETE FROM collection_items_cache').run();
    
    console.log('[Cache] Starting cache refresh for libraries:', selectedLibraries);
    
    // Fetch media items with detailed language info
    const { items: movieItems, languages: movieLanguages } = await fetchMediaItemsWithLanguagesAndProgress(
      config.plex_url, config.plex_token, selectedLibraries, 'movies'
    );
    const { items: showItems, languages: showLanguages } = await fetchMediaItemsWithLanguagesAndProgress(
      config.plex_url, config.plex_token, selectedLibraries, 'shows'
    );
    
    console.log(`[Cache] Fetched ${movieItems.length} movies and ${showItems.length} shows`);
    
    // Update phase to languages
    cacheRefreshProgress.phase = 'languages';
    
    const insertMedia = db.prepare(`
      INSERT INTO media_items_cache (id, library_keys, media_type, items, item_count, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(library_keys, media_type) DO UPDATE SET 
        items = excluded.items, 
        item_count = excluded.item_count, 
        updated_at = datetime('now')
    `);
    
    if (movieItems.length > 0) {
      insertMedia.run(generateId(), sortedLibraryKeys, 'movies', JSON.stringify(movieItems), movieItems.length);
    }
    if (showItems.length > 0) {
      insertMedia.run(generateId(), sortedLibraryKeys, 'shows', JSON.stringify(showItems), showItems.length);
    }
    
    const bothItems = [...movieItems, ...showItems];
    if (bothItems.length > 0) {
      insertMedia.run(generateId(), sortedLibraryKeys, 'both', JSON.stringify(bothItems), bothItems.length);
    }
    
    // Merge language counts
    const mergedLanguages = new Map<string, number>();
    for (const [lang, count] of movieLanguages) {
      mergedLanguages.set(lang, (mergedLanguages.get(lang) || 0) + count);
    }
    for (const [lang, count] of showLanguages) {
      mergedLanguages.set(lang, (mergedLanguages.get(lang) || 0) + count);
    }
    
    const languages = Array.from(mergedLanguages.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    cacheRefreshProgress.languagesFound = languages.length;
    console.log('[Cache] Languages found:', languages.length);
    
    if (languages.length > 0) {
      db.prepare(`
        INSERT INTO library_languages_cache (id, library_keys, languages, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(library_keys) DO UPDATE SET 
          languages = excluded.languages, 
          updated_at = datetime('now')
      `).run(generateId(), sortedLibraryKeys, JSON.stringify(languages));
    }
    
    // Pre-cache collections
    cacheRefreshProgress.phase = 'collections';
    console.log('[Cache] Pre-caching collections...');
    const collectionsCount = await preCacheCollections(config.plex_url, config.plex_token, selectedLibraries);
    cacheRefreshProgress.collectionsProcessed = collectionsCount;
    
    // Mark as complete
    cacheRefreshProgress.phase = 'complete';
    
    // Record refresh time
    db.prepare(`
      INSERT INTO app_config (key, value, updated_at)
      VALUES ('last_cache_refresh', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(JSON.stringify({ 
      timestamp: new Date().toISOString(),
      mediaCount: movieItems.length + showItems.length,
      movieCount: movieItems.length,
      showCount: showItems.length,
      languageCount: languages.length,
      type: 'manual',
      success: true
    }));
    
    res.json({
      success: true,
      mediaCount: movieItems.length + showItems.length,
      movieCount: movieItems.length,
      showCount: showItems.length,
      languageCount: languages.length,
      collectionsCount,
    });
  } catch (error) {
    console.error('Error refreshing cache:', error);
    cacheRefreshProgress.error = error instanceof Error ? error.message : 'Unknown error';
    cacheRefreshProgress.phase = 'error';
    res.status(500).json({ error: 'Failed to refresh cache' });
  } finally {
    // Reset running state after a delay to allow final poll
    setTimeout(() => {
      cacheRefreshProgress.isRunning = false;
    }, 2000);
  }
});

// Helper function to pre-cache collections
async function preCacheCollections(
  plexUrl: string,
  plexToken: string,
  libraryKeys: string[]
): Promise<number> {
  const db = getDb();
  
  try {
    // Get library types
    const libResponse = await fetch(`${plexUrl}/library/sections?X-Plex-Token=${plexToken}`, {
      headers: { Accept: 'application/json' },
    });
    const libData = await libResponse.json();
    const directories = libData.MediaContainer?.Directory || [];
    
    const libraryTypeMap = new Map<string, string>();
    directories.forEach((dir: any) => libraryTypeMap.set(dir.key, dir.type));
    
    // Cache collections for 'all' media type
    const sortedLibraryKeys = [...libraryKeys].sort().join(',');
    const cacheKey = `${sortedLibraryKeys}:all`;
    
    const allCollections: any[] = [];
    
    for (const libraryKey of libraryKeys) {
      try {
        const response = await fetch(
          `${plexUrl}/library/sections/${libraryKey}/collections?X-Plex-Token=${plexToken}`,
          { headers: { Accept: 'application/json' } }
        );
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const collections = data.MediaContainer?.Metadata || [];
        
        for (const collection of collections) {
          allCollections.push({
            ratingKey: collection.ratingKey,
            title: collection.title,
            thumb: collection.thumb ? `/api/plex/image?path=${encodeURIComponent(collection.thumb)}` : null,
            childCount: collection.childCount || 0,
            libraryKey,
            libraryType: libraryTypeMap.get(libraryKey),
          });
        }
      } catch (e) {
        console.error(`[Plex] Error fetching collections for library ${libraryKey}:`, e);
      }
    }
    
    // Sort by title
    allCollections.sort((a, b) => a.title.localeCompare(b.title));
    
    // Cache the collections
    db.prepare(`
      INSERT INTO collections_cache (id, cache_key, collections, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(cache_key) DO UPDATE SET 
        collections = excluded.collections, 
        updated_at = datetime('now')
    `).run(generateId(), cacheKey, JSON.stringify(allCollections));
    
    console.log(`[Cache] Pre-cached ${allCollections.length} collections`);
    return allCollections.length;
  } catch (e) {
    console.error('[Cache] Error pre-caching collections:', e);
    return 0;
  }
}

// Get media items
router.post('/get-media', async (req, res) => {
  try {
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const { mediaType, filters, userPlexToken } = req.body;
    const selectedLibraries = config.libraries || [];
    const sortedLibraryKeys = [...selectedLibraries].sort().join(',');
    
    const db = getDb();
    const settings = getSessionSettings();
    const filterWatched = settings.filter_watched !== false;
    
    const cacheType = mediaType === 'movies' ? 'movies' : mediaType === 'shows' ? 'shows' : 'both';
    const cached = db.prepare(
      'SELECT items, item_count FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
    ).get(sortedLibraryKeys, cacheType) as { items: string; item_count: number } | undefined;
    
    let items: any[] = [];
    let fromCache = false;
    
    if (cached?.items) {
      console.log(`[Media] Loading ${cached.item_count} items from cache`);
      items = JSON.parse(cached.items);
      fromCache = true;
    } else {
      console.log('[Media] Cache miss, fetching from Plex...');
      const result = await fetchMediaItemsWithLanguagesAndProgress(config.plex_url, config.plex_token, selectedLibraries, mediaType);
      items = result.items;
    }
    
    // Apply preference filters
    if (filters) {
      const beforeCount = items.length;
      items = applyFilters(items, filters);
      console.log(`[Media] Filtered from ${beforeCount} to ${items.length} items`);
    }
    
    // Filter watched items if user has Plex token
    if (userPlexToken && filterWatched) {
      const beforeCount = items.length;
      const watchedKeys = await getWatchedItems(config.plex_url, userPlexToken, selectedLibraries);
      items = items.filter(item => !watchedKeys.has(item.ratingKey));
      console.log(`[Media] Filtered ${beforeCount - items.length} watched items`);
    }
    
    res.json({ items, cached: fromCache });
  } catch (error) {
    console.error('Error getting media:', error);
    res.status(500).json({ error: 'Failed to get media' });
  }
});

// Get languages
router.post('/get-languages', async (req, res) => {
  try {
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const selectedLibraries = config.libraries || [];
    const sortedLibraryKeys = [...selectedLibraries].sort().join(',');
    
    const db = getDb();
    const cached = db.prepare(
      'SELECT languages FROM library_languages_cache WHERE library_keys = ?'
    ).get(sortedLibraryKeys) as { languages: string } | undefined;
    
    if (cached?.languages) {
      try {
        const languages = JSON.parse(cached.languages);
        if (Array.isArray(languages) && languages.length > 0) {
          console.log('[Languages] Returning cached languages:', languages.length);
          return res.json({ languages, cached: true });
        }
      } catch (e) {
        console.error('Error parsing cached languages:', e);
      }
    }
    
    // If no cache, try to extract from cached media items
    const mediaCache = db.prepare(
      'SELECT items FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
    ).get(sortedLibraryKeys, 'both') as { items: string } | undefined;
    
    if (mediaCache?.items) {
      const items = JSON.parse(mediaCache.items);
      const languageCounts = new Map<string, number>();
      
      for (const item of items) {
        if (item.languages && Array.isArray(item.languages)) {
          for (const lang of item.languages) {
            languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
          }
        }
      }
      
      const languages = Array.from(languageCounts.entries())
        .map(([language, count]) => ({ language, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
      
      if (languages.length > 0) {
        db.prepare(`
          INSERT INTO library_languages_cache (id, library_keys, languages, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(library_keys) DO UPDATE SET 
            languages = excluded.languages, 
            updated_at = datetime('now')
        `).run(generateId(), sortedLibraryKeys, JSON.stringify(languages));
        
        console.log('[Languages] Extracted from media cache:', languages.length);
        return res.json({ languages, cached: true });
      }
    }
    
    console.log('[Languages] No cache available, fetching fresh...');
    const { languages: langMap } = await fetchMediaItemsWithLanguagesAndProgress(
      config.plex_url, config.plex_token, selectedLibraries, 'both'
    );
    
    const languages = Array.from(langMap.entries())
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    if (languages.length > 0) {
      db.prepare(`
        INSERT INTO library_languages_cache (id, library_keys, languages, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(library_keys) DO UPDATE SET 
          languages = excluded.languages, 
          updated_at = datetime('now')
      `).run(generateId(), sortedLibraryKeys, JSON.stringify(languages));
    }
    
    res.json({ languages, cached: false });
  } catch (error) {
    console.error('Error getting languages:', error);
    res.status(500).json({ error: 'Failed to get languages' });
  }
});

// Get watched keys for a user
router.post('/get-watched-keys', async (req, res) => {
  try {
    const config = getPlexConfig();
    if (!config?.plex_url) {
      return res.json({ watchedKeys: [] });
    }
    
    const { userPlexToken } = req.body;
    if (!userPlexToken) {
      return res.json({ watchedKeys: [] });
    }
    
    const settings = getSessionSettings();
    if (settings.filter_watched === false) {
      return res.json({ watchedKeys: [] });
    }
    
    const selectedLibraries = config.libraries || [];
    const watchedKeys = await getWatchedItems(config.plex_url, userPlexToken, selectedLibraries);
    
    res.json({ watchedKeys: Array.from(watchedKeys) });
  } catch (error) {
    console.error('Error getting watched keys:', error);
    res.json({ watchedKeys: [] });
  }
});

// Plex OAuth - Create PIN
router.post('/oauth/create-pin', async (req, res) => {
  try {
    const { redirectUri } = req.body;
    
    const response = await fetch('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Plex-Product': PLEX_APP_NAME,
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      },
      body: JSON.stringify({ strong: true }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create Plex pin: ${response.status}`);
    }
    
    const data = await response.json();
    
    const authUrl = new URL('https://app.plex.tv/auth#');
    const params = new URLSearchParams({
      clientID: PLEX_CLIENT_ID,
      code: data.code,
      'context[device][product]': PLEX_APP_NAME,
    });
    
    if (redirectUri) {
      params.set('forwardUrl', redirectUri);
    }
    
    authUrl.hash = `?${params.toString()}`;
    
    res.json({
      pinId: data.id,
      code: data.code,
      authUrl: authUrl.toString(),
    });
  } catch (error) {
    console.error('Error creating Plex pin:', error);
    res.status(500).json({ error: 'Failed to create Plex pin' });
  }
});

// Plex OAuth - Check PIN
router.post('/oauth/check-pin', async (req, res) => {
  try {
    const { pinId } = req.body;
    if (!pinId) {
      return res.status(400).json({ error: 'Pin ID required' });
    }
    
    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Product': PLEX_APP_NAME,
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to check Plex pin: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.authToken) {
      const userResponse = await fetch('https://plex.tv/api/v2/user', {
        headers: {
          Accept: 'application/json',
          'X-Plex-Token': data.authToken,
          'X-Plex-Product': PLEX_APP_NAME,
          'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
        },
      });
      
      if (!userResponse.ok) {
        throw new Error(`Failed to get user info: ${userResponse.status}`);
      }
      
      const userData = await userResponse.json();
      
      return res.json({
        authenticated: true,
        authToken: data.authToken,
        user: {
          username: userData.username || userData.title,
          email: userData.email,
          thumb: userData.thumb,
        },
      });
    }
    
    res.json({ authenticated: false });
  } catch (error) {
    console.error('Error checking Plex pin:', error);
    res.status(500).json({ error: 'Failed to check Plex pin' });
  }
});

// Proxy Plex images
router.get('/image', async (req, res) => {
  try {
    const imagePath = req.query.path as string;
    if (!imagePath) {
      return res.status(400).json({ error: 'Missing path parameter' });
    }
    
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const fullUrl = `${config.plex_url}${imagePath}?X-Plex-Token=${config.plex_token}`;
    
    const response = await fetch(fullUrl, {
      headers: { Accept: 'image/*' },
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch image: ${response.status}` });
    }
    
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('Content-Type') || 'image/jpeg';
    
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

// ============ HELPER FUNCTIONS ============

// Fetch media items with proper language detection and progress tracking
async function fetchMediaItemsWithLanguagesAndProgress(
  plexUrl: string,
  plexToken: string,
  libraryKeys: string[],
  mediaType?: string
): Promise<{ items: any[]; languages: Map<string, number> }> {
  const allItems: any[] = [];
  const languageCounts = new Map<string, number>();
  
  const libResponse = await fetch(`${plexUrl}/library/sections?X-Plex-Token=${plexToken}`, {
    headers: { Accept: 'application/json' },
  });
  const libData = await libResponse.json();
  const directories = libData.MediaContainer?.Directory || [];
  
  const libraryTypeMap = new Map<string, string>();
  directories.forEach((dir: any) => libraryTypeMap.set(dir.key, dir.type));
  
  let filteredLibraryKeys = libraryKeys;
  if (mediaType === 'movie' || mediaType === 'movies') {
    filteredLibraryKeys = libraryKeys.filter(key => libraryTypeMap.get(key) === 'movie');
  } else if (mediaType === 'show' || mediaType === 'shows') {
    filteredLibraryKeys = libraryKeys.filter(key => libraryTypeMap.get(key) === 'show');
  }
  
  // First pass: count totals for progress
  let totalMovies = 0;
  let totalShows = 0;
  
  for (const libraryKey of filteredLibraryKeys) {
    const libraryType = libraryTypeMap.get(libraryKey) || 'movie';
    try {
      const countResponse = await fetch(
        `${plexUrl}/library/sections/${libraryKey}/all?X-Plex-Token=${plexToken}&X-Plex-Container-Start=0&X-Plex-Container-Size=0`,
        { headers: { Accept: 'application/json' } }
      );
      if (countResponse.ok) {
        const countData = await countResponse.json();
        const count = countData.MediaContainer?.totalSize || 0;
        if (libraryType === 'movie') {
          totalMovies += count;
        } else {
          totalShows += count;
        }
      }
    } catch (e) {
      // Ignore count errors
    }
  }
  
  cacheRefreshProgress.moviesTotal = totalMovies;
  cacheRefreshProgress.showsTotal = totalShows;
  
  for (const libraryKey of filteredLibraryKeys) {
    try {
      const libraryType = libraryTypeMap.get(libraryKey) || 'movie';
      
      // Update phase based on library type
      if (libraryType === 'movie') {
        cacheRefreshProgress.phase = 'movies';
      } else {
        cacheRefreshProgress.phase = 'shows';
      }
      
      // First get the list of all items (basic info)
      const response = await fetch(
        `${plexUrl}/library/sections/${libraryKey}/all?X-Plex-Token=${plexToken}&includeGuids=1`,
        { headers: { Accept: 'application/json' } }
      );
      
      if (!response.ok) {
        console.error(`[Plex] Failed to fetch library ${libraryKey}: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      const items = data.MediaContainer?.Metadata || [];
      
      console.log(`[Plex] Processing ${items.length} ${libraryType}s from library ${libraryKey}`);
      
      if (libraryType === 'movie') {
        // Process movies in batches to get detailed metadata with streams
        const BATCH_SIZE = 50;
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const batch = items.slice(i, i + BATCH_SIZE);
          const ratingKeys = batch.map((item: any) => item.ratingKey).join(',');
          
          // Fetch detailed metadata for batch
          const detailResponse = await fetch(
            `${plexUrl}/library/metadata/${ratingKeys}?X-Plex-Token=${plexToken}`,
            { headers: { Accept: 'application/json' } }
          );
          
          let detailedItems: any[] = [];
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            detailedItems = detailData.MediaContainer?.Metadata || [];
          }
          
          // Create a map for quick lookup
          const detailMap = new Map<string, any>();
          for (const detail of detailedItems) {
            detailMap.set(detail.ratingKey, detail);
          }
          
          for (const item of batch) {
            const detailedItem = detailMap.get(item.ratingKey) || item;
            const itemLanguages = extractLanguagesFromStreams(detailedItem.Media);
            
            for (const lang of itemLanguages) {
              languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
            }
            
            allItems.push(createMediaItem(item, detailedItem, libraryType, itemLanguages));
          }
          
          // Update progress
          cacheRefreshProgress.moviesProcessed += batch.length;
          
          // Small delay between batches to avoid overwhelming the Plex server
          if (i + BATCH_SIZE < items.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } else {
        // Process TV shows - need to check episodes for language info
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          
          // Get languages from a random episode
          const itemLanguages = await getShowLanguagesFromEpisode(plexUrl, plexToken, item.ratingKey);
          
          for (const lang of itemLanguages) {
            languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
          }
          
          allItems.push(createMediaItem(item, item, libraryType, itemLanguages));
          
          // Update progress
          cacheRefreshProgress.showsProcessed++;
          
          // Small delay to avoid overwhelming the Plex server
          if ((i + 1) % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }
    } catch (e) {
      console.error(`[Plex] Error fetching items for library ${libraryKey}:`, e);
    }
  }
  
  // Update language count in progress
  cacheRefreshProgress.languagesFound = languageCounts.size;
  
  console.log(`[Plex] Total items fetched: ${allItems.length}, Languages found: ${languageCounts.size}`);
  
  return { 
    items: allItems.sort((a, b) => a.ratingKey.localeCompare(b.ratingKey)), 
    languages: languageCounts 
  };
}

// Helper to create a standardized media item object
function createMediaItem(item: any, detailedItem: any, libraryType: string, languages: string[]): any {
  let thumbUrl: string | undefined;
  if (item.thumb) {
    const thumbPath = item.thumb.startsWith('/') ? item.thumb : `/${item.thumb}`;
    thumbUrl = `/api/plex/image?path=${encodeURIComponent(thumbPath)}`;
  }
  
  let artUrl: string | undefined;
  if (item.art) {
    const artPath = item.art.startsWith('/') ? item.art : `/${item.art}`;
    artUrl = `/api/plex/image?path=${encodeURIComponent(artPath)}`;
  }
  
  const genres = item.Genre?.map((g: any) => g.tag) || [];
  const directors = item.Director?.map((d: any) => d.tag) || [];
  const actors = item.Role?.map((r: any) => r.tag).slice(0, 10) || [];
  
  return {
    ratingKey: item.ratingKey,
    title: item.title,
    year: item.year,
    summary: item.summary,
    thumb: thumbUrl,
    art: artUrl,
    rating: item.rating,
    contentRating: item.contentRating,
    duration: item.duration,
    originallyAvailableAt: item.originallyAvailableAt,
    studio: item.studio,
    audienceRating: item.audienceRating,
    type: item.type || libraryType,
    genres,
    directors,
    actors,
    languages,
    Genre: item.Genre,
    Director: item.Director,
    Role: item.Role,
    Country: item.Country,
  };
}

function applyFilters(items: any[], filters: any): any[] {
  return items.filter(item => {
    const itemGenres = item.genres || item.Genre?.map((g: any) => g.tag) || [];
    const year = item.year;
    const itemLanguages = item.languages || [];
    
    // Only apply EXCLUSIONS as hard filters
    if (filters.excludedGenres?.length > 0) {
      if (filters.excludedGenres.some((g: string) => itemGenres.includes(g))) return false;
    }
    
    if (filters.excludedEras?.length > 0 && year) {
      if (filters.excludedEras.some((era: string) => matchesEra(year, era))) return false;
    }
    
    if (filters.excludedLanguages?.length > 0 && itemLanguages.length > 0) {
      if (filters.excludedLanguages.some((l: string) => itemLanguages.includes(l))) return false;
    }
    
    return true;
  });
}

function matchesEra(year: number, era: string): boolean {
  const currentYear = new Date().getFullYear();
  switch (era) {
    case 'recent': return year >= currentYear - 2;
    case '2020s': return year >= 2020;
    case '2010s': return year >= 2010 && year < 2020;
    case '2000s': return year >= 2000 && year < 2010;
    case '90s': return year >= 1990 && year < 2000;
    case 'classic': return year < 1990;
    default: return false;
  }
}

async function getWatchedItems(
  plexUrl: string,
  userPlexToken: string,
  libraryKeys: string[]
): Promise<Set<string>> {
  const watchedKeys = new Set<string>();
  
  for (const libraryKey of libraryKeys) {
    try {
      const response = await fetch(
        `${plexUrl}/library/sections/${libraryKey}/all?X-Plex-Token=${userPlexToken}&unwatched=0`,
        { headers: { Accept: 'application/json' } }
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const items = data.MediaContainer?.Metadata || [];
      
      for (const item of items) {
        if (item.viewCount && item.viewCount > 0) {
          watchedKeys.add(item.ratingKey);
        }
      }
    } catch (e) {
      console.error(`[Plex] Error fetching watched items for library ${libraryKey}:`, e);
    }
  }
  
  console.log(`[Plex] Found ${watchedKeys.size} watched items for user`);
  return watchedKeys;
}

// Get last cache refresh info
router.get('/last-cache-refresh', (req, res) => {
  try {
    const db = getDb();
    
    const manualRefreshRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('last_cache_refresh') as { value: string } | undefined;
    const autoRefreshRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('last_auto_cache_refresh') as { value: string } | undefined;
    
    let lastManualRefresh = null;
    let lastAutoRefresh = null;
    
    if (manualRefreshRow?.value) {
      try {
        lastManualRefresh = JSON.parse(manualRefreshRow.value);
      } catch (e) {}
    }
    
    if (autoRefreshRow?.value) {
      try {
        lastAutoRefresh = JSON.parse(autoRefreshRow.value);
      } catch (e) {}
    }
    
    let lastRefresh = null;
    
    if (lastManualRefresh && lastAutoRefresh) {
      const manualTime = new Date(lastManualRefresh.timestamp).getTime();
      const autoTime = new Date(lastAutoRefresh.timestamp).getTime();
      lastRefresh = manualTime > autoTime ? { ...lastManualRefresh, type: 'manual' } : lastAutoRefresh;
    } else if (lastManualRefresh) {
      lastRefresh = { ...lastManualRefresh, type: 'manual' };
    } else if (lastAutoRefresh) {
      lastRefresh = lastAutoRefresh;
    }
    
    res.json({ 
      lastRefresh,
      lastManualRefresh,
      lastAutoRefresh
    });
  } catch (error) {
    console.error('Error getting last cache refresh:', error);
    res.status(500).json({ error: 'Failed to get last cache refresh info' });
  }
});

export { router as plexRoutes };
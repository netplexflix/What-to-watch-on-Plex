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
  labelsFound: number;
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
  labelsFound: 0,
};

interface PlexLibrary {
  key: string;
  title: string;
  type: string;
}

// Language code mapping - ISO 639-2/B and ISO 639-1 codes
const CODE_TO_LANGUAGE: Record<string, string> = {
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
  
  if (CODE_TO_LANGUAGE[key]) {
    return CODE_TO_LANGUAGE[key];
  }
  
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  
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
    
    const cached = db.prepare(
      'SELECT collections FROM collections_cache WHERE cache_key = ?'
    ).get(cacheKey) as { collections: string } | undefined;
    
    if (cached?.collections) {
      console.log('[Plex] Returning cached collections');
      return res.json({ collections: JSON.parse(cached.collections), cached: true });
    }
    
    const libResponse = await fetch(`${config.plex_url}/library/sections?X-Plex-Token=${config.plex_token}`, {
      headers: { Accept: 'application/json' },
    });
    const libData = await libResponse.json();
    const directories = libData.MediaContainer?.Directory || [];
    
    const libraryTypeMap = new Map<string, string>();
    directories.forEach((dir: any) => libraryTypeMap.set(dir.key, dir.type));
    
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
    
    allCollections.sort((a, b) => a.title.localeCompare(b.title));
    
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
    
    const configRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
    
    let totalMediaCount = 0;
    
    if (configRow) {
      const config = JSON.parse(configRow.value);
      const sortedLibraryKeys = [...(config.libraries || [])].sort().join(',');
      
      const bothCache = db.prepare(
        'SELECT item_count FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
      ).get(sortedLibraryKeys, 'both') as { item_count: number } | undefined;
      
      if (bothCache) {
        totalMediaCount = bothCache.item_count || 0;
      } else {
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
    
    const collectionsCount = db.prepare('SELECT COUNT(*) as count FROM collections_cache').get() as { count: number };

    const labelsRow = db.prepare('SELECT labels FROM media_labels_cache LIMIT 1').get() as { labels: string } | undefined;
    let labelsCached = false;
    let labelsCount = 0;
    if (labelsRow?.labels) {
      try {
        const labels = JSON.parse(labelsRow.labels);
        labelsCached = Array.isArray(labels) && labels.length > 0;
        labelsCount = labels.length;
      } catch {
        labelsCached = false;
      }
    }
    
    res.json({
      mediaCount: totalMediaCount,
      languagesCached,
      collectionsCached: collectionsCount.count > 0,
      labelsCached,
      labelsCount,
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

// Helper function to extract labels from an item
function extractLabelsFromItem(item: any): string[] {
  const labels: string[] = [];
  
  if (item.Label && Array.isArray(item.Label)) {
    for (const label of item.Label) {
      if (label.tag) {
        labels.push(label.tag);
      }
    }
  }
  
  return labels;
}

// Helper function to get languages for a TV show by checking a random episode
async function getShowLanguagesFromEpisode(
  plexUrl: string, 
  plexToken: string, 
  showRatingKey: string
): Promise<string[]> {
  try {
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
    
    const firstSeason = seasons[0];
    
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
    
    return extractLanguagesFromStreams(episodeDetail.Media);
  } catch (e) {
    console.error(`[Plex] Error fetching episode languages for show ${showRatingKey}:`, e);
    return [];
  }
}

// Refresh cache with progress tracking
router.post('/refresh-cache', async (req, res) => {
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
    
    cacheRefreshProgress.isRunning = true;
    cacheRefreshProgress.phase = 'starting';
    cacheRefreshProgress.moviesProcessed = 0;
    cacheRefreshProgress.moviesTotal = 0;
    cacheRefreshProgress.showsProcessed = 0;
    cacheRefreshProgress.showsTotal = 0;
    cacheRefreshProgress.languagesFound = 0;
    cacheRefreshProgress.collectionsProcessed = 0;
    cacheRefreshProgress.labelsFound = 0;
    cacheRefreshProgress.error = undefined;
    
    const db = getDb();
    
    db.prepare('DELETE FROM media_items_cache WHERE library_keys = ?').run(sortedLibraryKeys);
    db.prepare('DELETE FROM library_languages_cache WHERE library_keys = ?').run(sortedLibraryKeys);
    db.prepare('DELETE FROM media_labels_cache WHERE library_keys = ?').run(sortedLibraryKeys);
    db.prepare('DELETE FROM collections_cache').run();
    db.prepare('DELETE FROM collection_items_cache').run();
    
    console.log('[Cache] Starting cache refresh for libraries:', selectedLibraries);
    
    const { items: movieItems, languages: movieLanguages, labels: movieLabels } = await fetchMediaItemsWithLanguagesAndProgress(
      config.plex_url, config.plex_token, selectedLibraries, 'movies'
    );
    const { items: showItems, languages: showLanguages, labels: showLabels } = await fetchMediaItemsWithLanguagesAndProgress(
      config.plex_url, config.plex_token, selectedLibraries, 'shows'
    );
    
    console.log(`[Cache] Fetched ${movieItems.length} movies and ${showItems.length} shows`);
    
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

    const mergedLabels = new Map<string, number>();
    for (const [label, count] of movieLabels) {
      mergedLabels.set(label, (mergedLabels.get(label) || 0) + count);
    }
    for (const [label, count] of showLabels) {
      mergedLabels.set(label, (mergedLabels.get(label) || 0) + count);
    }

    const labels = Array.from(mergedLabels.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    cacheRefreshProgress.labelsFound = labels.length;
    console.log('[Cache] Labels found:', labels.length);

    if (labels.length > 0) {
      db.prepare(`
        INSERT INTO media_labels_cache (id, library_keys, labels, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(library_keys) DO UPDATE SET 
          labels = excluded.labels, 
          updated_at = datetime('now')
      `).run(generateId(), sortedLibraryKeys, JSON.stringify(labels));
    }
    
    cacheRefreshProgress.phase = 'collections';
    console.log('[Cache] Pre-caching collections...');
    const collectionsCount = await preCacheCollections(config.plex_url, config.plex_token, selectedLibraries);
    cacheRefreshProgress.collectionsProcessed = collectionsCount;
    
    cacheRefreshProgress.phase = 'complete';
    
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
      labelsCount: labels.length,
      type: 'manual',
      success: true
    }));
    
    res.json({
      success: true,
      mediaCount: movieItems.length + showItems.length,
      movieCount: movieItems.length,
      showCount: showItems.length,
      languageCount: languages.length,
      labelsCount: labels.length,
      collectionsCount,
    });
  } catch (error) {
    console.error('Error refreshing cache:', error);
    cacheRefreshProgress.error = error instanceof Error ? error.message : 'Unknown error';
    cacheRefreshProgress.phase = 'error';
    res.status(500).json({ error: 'Failed to refresh cache' });
  } finally {
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
    const libResponse = await fetch(`${plexUrl}/library/sections?X-Plex-Token=${plexToken}`, {
      headers: { Accept: 'application/json' },
    });
    const libData = await libResponse.json();
    const directories = libData.MediaContainer?.Directory || [];
    
    const libraryTypeMap = new Map<string, string>();
    directories.forEach((dir: any) => libraryTypeMap.set(dir.key, dir.type));
    
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
    
    allCollections.sort((a, b) => a.title.localeCompare(b.title));
    
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
    
    if (filters) {
      const beforeCount = items.length;
      items = applyFilters(items, filters);
      console.log(`[Media] Filtered from ${beforeCount} to ${items.length} items`);
    }
    
    if (userPlexToken) {
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

// Get labels
router.post('/get-labels', async (req, res) => {
  try {
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const selectedLibraries = config.libraries || [];
    const sortedLibraryKeys = [...selectedLibraries].sort().join(',');
    
    const db = getDb();
    const cached = db.prepare(
      'SELECT labels FROM media_labels_cache WHERE library_keys = ?'
    ).get(sortedLibraryKeys) as { labels: string } | undefined;
    
    if (cached?.labels) {
      try {
        const labels = JSON.parse(cached.labels);
        if (Array.isArray(labels) && labels.length > 0) {
          console.log('[Labels] Returning cached labels:', labels.length);
          return res.json({ labels, cached: true });
        }
      } catch (e) {
        console.error('Error parsing cached labels:', e);
      }
    }
    
    const mediaCache = db.prepare(
      'SELECT items FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
    ).get(sortedLibraryKeys, 'both') as { items: string } | undefined;
    
    if (mediaCache?.items) {
      const items = JSON.parse(mediaCache.items);
      const labelCounts = new Map<string, number>();
      
      for (const item of items) {
        if (item.labels && Array.isArray(item.labels)) {
          for (const label of item.labels) {
            labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
          }
        }
      }
      
      const labels = Array.from(labelCounts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
      
      if (labels.length > 0) {
        db.prepare(`
          INSERT INTO media_labels_cache (id, library_keys, labels, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(library_keys) DO UPDATE SET 
            labels = excluded.labels, 
            updated_at = datetime('now')
        `).run(generateId(), sortedLibraryKeys, JSON.stringify(labels));
        
        console.log('[Labels] Extracted from media cache:', labels.length);
        return res.json({ labels, cached: true });
      }
    }
    
    res.json({ labels: [], cached: false });
  } catch (error) {
    console.error('Error getting labels:', error);
    res.status(500).json({ error: 'Failed to get labels' });
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
    
    const selectedLibraries = config.libraries || [];
    const watchedKeys = await getWatchedItems(config.plex_url, userPlexToken, selectedLibraries);
    
    res.json({ watchedKeys: Array.from(watchedKeys) });
  } catch (error) {
    console.error('Error getting watched keys:', error);
    res.json({ watchedKeys: [] });
  }
});

// Helper function to fetch all watchlist items with pagination
async function fetchAllWatchlistItems(userPlexToken: string): Promise<any[]> {
  const allItems: any[] = [];
  let offset = 0;
  const pageSize = 50; // Fetch 50 items at a time
  let hasMore = true;

  while (hasMore) {
    const url = `https://discover.provider.plex.tv/library/sections/watchlist/all?X-Plex-Token=${userPlexToken}&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${pageSize}`;
    
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Product': PLEX_APP_NAME,
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      },
    });

    if (!response.ok) {
      console.error(`[Plex] Watchlist fetch failed at offset ${offset}:`, response.status);
      break;
    }

    const data = await response.json();
    const items = data.MediaContainer?.Metadata || [];
    const totalSize = data.MediaContainer?.totalSize || 0;

    allItems.push(...items);
    offset += items.length;

    console.log(`[Plex] Fetched watchlist items ${offset}/${totalSize}`);

    // Check if we've fetched all items
    if (items.length < pageSize || offset >= totalSize) {
      hasMore = false;
    }

    // Small delay to avoid rate limiting
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return allItems;
}

// Get user's watchlist with pagination
router.post('/get-watchlist', async (req, res) => {
  try {
    const { userPlexToken } = req.body;
    if (!userPlexToken) {
      return res.status(400).json({ error: 'Plex token required' });
    }

    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }

    console.log('[Plex] Fetching watchlist for user (with pagination)...');

    // Fetch all watchlist items with pagination
    const watchlistItems = await fetchAllWatchlistItems(userPlexToken);

    console.log(`[Plex] Found ${watchlistItems.length} total items in user's watchlist`);

    // Get the GUIDs from watchlist items to match with local library
    const watchlistGuids = new Set<string>();
    const watchlistTitles = new Map<string, any>();

    for (const item of watchlistItems) {
      const key = `${item.title?.toLowerCase()}:${item.year || ''}`;
      watchlistTitles.set(key, item);

      if (item.Guid) {
        for (const guid of item.Guid) {
          watchlistGuids.add(guid.id);
        }
      }
      if (item.guid) {
        watchlistGuids.add(item.guid);
      }
      if (item.ratingKey) {
        watchlistGuids.add(`plex://movie/${item.ratingKey}`);
        watchlistGuids.add(`plex://show/${item.ratingKey}`);
      }
    }

    console.log(`[Plex] Watchlist has ${watchlistTitles.size} unique titles and ${watchlistGuids.size} GUIDs`);

    // Now match against local library cache
    const db = getDb();
    const selectedLibraries = config.libraries || [];
    const sortedLibraryKeys = [...selectedLibraries].sort().join(',');

    const cached = db.prepare(
      'SELECT items FROM media_items_cache WHERE library_keys = ? AND media_type = ?'
    ).get(sortedLibraryKeys, 'both') as { items: string } | undefined;

    const matchedKeys: string[] = [];

    if (cached?.items) {
      const localItems = JSON.parse(cached.items);
      console.log(`[Plex] Checking ${localItems.length} local items against watchlist`);

      for (const localItem of localItems) {
        const key = `${localItem.title?.toLowerCase()}:${localItem.year || ''}`;
        if (watchlistTitles.has(key)) {
          matchedKeys.push(localItem.ratingKey);
          continue;
        }

        if (localItem.guids && Array.isArray(localItem.guids)) {
          let matched = false;
          for (const guid of localItem.guids) {
            if (watchlistGuids.has(guid)) {
              matchedKeys.push(localItem.ratingKey);
              matched = true;
              break;
            }
          }
          if (matched) continue;
        }
      }
    } else {
      console.log('[Plex] No local cache available for watchlist matching');
    }

    console.log(`[Plex] Matched ${matchedKeys.length} watchlist items to local library`);

    res.json({ 
      watchlistKeys: matchedKeys,
      watchlistCount: watchlistItems.length,
      matchedCount: matchedKeys.length,
    });
  } catch (error) {
    console.error('Error getting watchlist:', error);
    res.status(500).json({ error: 'Failed to get watchlist' });
  }
});

// Helper function to get item metadata including GUIDs from local server
async function getItemMetadata(
  plexUrl: string,
  plexToken: string,
  ratingKey: string
): Promise<{
  title: string | null;
  year: number | null;
  type: string | null;
  guids: string[];
}> {
  try {
    const response = await fetch(
      `${plexUrl}/library/metadata/${ratingKey}?X-Plex-Token=${plexToken}`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      console.error(`[Plex] Failed to get metadata for ${ratingKey}: ${response.status}`);
      return { title: null, year: null, type: null, guids: [] };
    }

    const data = await response.json();
    const item = data.MediaContainer?.Metadata?.[0];

    if (!item) {
      return { title: null, year: null, type: null, guids: [] };
    }

    const guids: string[] = [];
    
    // Collect all GUIDs
    if (item.Guid && Array.isArray(item.Guid)) {
      for (const guidObj of item.Guid) {
        if (guidObj.id) {
          guids.push(guidObj.id);
        }
      }
    }
    if (item.guid) {
      guids.push(item.guid);
    }

    return {
      title: item.title,
      year: item.year,
      type: item.type,
      guids,
    };
  } catch (error) {
    console.error(`[Plex] Error getting metadata for ${ratingKey}:`, error);
    return { title: null, year: null, type: null, guids: [] };
  }
}

// Helper function to search for an item on Plex and get its watchlist ratingKey
async function findWatchlistRatingKey(
  userPlexToken: string,
  title: string,
  year: number | null,
  type: string | null,
  guids: string[]
): Promise<string | null> {
  try {
    // Method 1: Search using the Plex search API
    const searchQuery = encodeURIComponent(title);
    const searchUrl = `https://discover.provider.plex.tv/library/search?query=${searchQuery}&limit=30&searchTypes=${type === 'movie' ? '1' : type === 'show' ? '2' : '1,2'}`;
    
    console.log(`[Plex] Searching for watchlist item: "${title}" (${year || 'any year'})`);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': userPlexToken,
        'X-Plex-Product': PLEX_APP_NAME,
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      },
    });

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const searchResults = searchData.MediaContainer?.Metadata || [];

      console.log(`[Plex] Search returned ${searchResults.length} results`);

      // First, try to match by GUID
      for (const result of searchResults) {
        if (result.Guid && Array.isArray(result.Guid)) {
          for (const resultGuid of result.Guid) {
            if (guids.includes(resultGuid.id)) {
              console.log(`[Plex] Found match by GUID: ${result.title} (${result.year}) - ratingKey: ${result.ratingKey}`);
              return result.ratingKey;
            }
          }
        }
      }

      // Second, try exact title + year match
      for (const result of searchResults) {
        const titleMatch = result.title?.toLowerCase() === title.toLowerCase();
        const yearMatch = !year || !result.year || Math.abs(result.year - year) <= 1;

        if (titleMatch && yearMatch && result.ratingKey) {
          console.log(`[Plex] Found match by title/year: ${result.title} (${result.year}) - ratingKey: ${result.ratingKey}`);
          return result.ratingKey;
        }
      }

      // Third, try fuzzy title match
      for (const result of searchResults) {
        const titleLower = title.toLowerCase();
        const resultTitleLower = (result.title || '').toLowerCase();
        const titleMatch = resultTitleLower.includes(titleLower) || titleLower.includes(resultTitleLower);
        const yearMatch = !year || !result.year || Math.abs(result.year - year) <= 2;

        if (titleMatch && yearMatch && result.ratingKey) {
          console.log(`[Plex] Found fuzzy match: ${result.title} (${result.year}) - ratingKey: ${result.ratingKey}`);
          return result.ratingKey;
        }
      }
    } else {
      console.log(`[Plex] Search API returned ${searchResponse.status}, trying alternative method`);
    }

    // Method 2: Try the matches endpoint with IMDB/TMDB ID
    for (const guid of guids) {
      let matchUrl: string | null = null;
      
      if (guid.startsWith('imdb://')) {
        const imdbId = guid.replace('imdb://', '');
        matchUrl = `https://discover.provider.plex.tv/library/metadata/matches?type=${type === 'movie' ? '1' : '2'}&guid=com.plexapp.agents.imdb://${imdbId}&limit=1`;
      } else if (guid.startsWith('tmdb://')) {
        const tmdbId = guid.replace('tmdb://', '');
        const agentType = type === 'movie' ? 'movie' : 'tv';
        matchUrl = `https://discover.provider.plex.tv/library/metadata/matches?type=${type === 'movie' ? '1' : '2'}&guid=com.plexapp.agents.themoviedb://${tmdbId}?lang=en&limit=1`;
      } else if (guid.startsWith('tvdb://')) {
        const tvdbId = guid.replace('tvdb://', '');
        matchUrl = `https://discover.provider.plex.tv/library/metadata/matches?type=2&guid=com.plexapp.agents.thetvdb://${tvdbId}?lang=en&limit=1`;
      }

      if (matchUrl) {
        console.log(`[Plex] Trying matches endpoint with GUID: ${guid}`);
        
        try {
          const matchResponse = await fetch(matchUrl, {
            headers: {
              Accept: 'application/json',
              'X-Plex-Token': userPlexToken,
              'X-Plex-Product': PLEX_APP_NAME,
              'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
            },
          });

          if (matchResponse.ok) {
            const matchData = await matchResponse.json();
            const matches = matchData.MediaContainer?.Metadata || [];
            
            if (matches.length > 0 && matches[0].ratingKey) {
              console.log(`[Plex] Found via matches endpoint: ${matches[0].title} - ratingKey: ${matches[0].ratingKey}`);
              return matches[0].ratingKey;
            }
          }
        } catch (e) {
          console.log(`[Plex] Matches endpoint failed for ${guid}`);
        }
      }
    }

    // Method 3: Try direct GUID lookup
    for (const guid of guids) {
      if (guid.startsWith('plex://')) {
        // Extract ratingKey from plex:// GUID
        const match = guid.match(/plex:\/\/(?:movie|show)\/([a-f0-9]+)/i);
        if (match) {
          console.log(`[Plex] Extracted ratingKey from plex GUID: ${match[1]}`);
          return match[1];
        }
      }
    }

    console.log(`[Plex] Could not find watchlist ratingKey for "${title}"`);
    return null;
  } catch (error) {
    console.error('[Plex] Error finding watchlist ratingKey:', error);
    return null;
  }
}

// Add item to watchlist
router.post('/add-to-watchlist', async (req, res) => {
  try {
    const { userPlexToken, ratingKey } = req.body;
    if (!userPlexToken || !ratingKey) {
      return res.status(400).json({ error: 'Plex token and rating key required' });
    }

    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }

    // Get the item's metadata from the local server
    const itemInfo = await getItemMetadata(config.plex_url, config.plex_token, ratingKey);

    if (!itemInfo.title) {
      return res.status(404).json({ error: 'Item not found' });
    }

    console.log(`[Plex] Adding to watchlist: "${itemInfo.title}" (${itemInfo.year}), type: ${itemInfo.type}`);
    console.log(`[Plex] Available GUIDs: ${itemInfo.guids.join(', ')}`);

    // Find the Plex discover ratingKey for this item
    const watchlistRatingKey = await findWatchlistRatingKey(
      userPlexToken,
      itemInfo.title,
      itemInfo.year,
      itemInfo.type,
      itemInfo.guids
    );

    if (!watchlistRatingKey) {
      console.error('[Plex] Could not find item in Plex discover service');
      return res.status(404).json({ 
        error: 'Could not find item on Plex. It may not be in the Plex database.',
        details: `Searched for: "${itemInfo.title}" (${itemInfo.year})`
      });
    }

    console.log(`[Plex] Adding item to watchlist with ratingKey: ${watchlistRatingKey}`);

    // Try multiple methods to add to watchlist
    
    // Method 1: PUT to addToWatchlist action
    let success = false;
    
    try {
      const addResponse = await fetch(
        `https://discover.provider.plex.tv/actions/addToWatchlist?ratingKey=${watchlistRatingKey}`,
        {
          method: 'PUT',
          headers: {
            Accept: 'application/json',
            'X-Plex-Token': userPlexToken,
            'X-Plex-Product': PLEX_APP_NAME,
            'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
          },
        }
      );

      if (addResponse.ok || addResponse.status === 200 || addResponse.status === 201) {
        success = true;
        console.log(`[Plex] Successfully added via PUT method`);
      } else {
        console.log(`[Plex] PUT method returned ${addResponse.status}`);
      }
    } catch (e) {
      console.log(`[Plex] PUT method failed:`, e);
    }

    // Method 2: POST to watchlist endpoint
    if (!success) {
      try {
        const postResponse = await fetch(
          `https://discover.provider.plex.tv/library/sections/watchlist/all?ratingKey=${watchlistRatingKey}`,
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'X-Plex-Token': userPlexToken,
              'X-Plex-Product': PLEX_APP_NAME,
              'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
            },
          }
        );

        if (postResponse.ok || postResponse.status === 200 || postResponse.status === 201) {
          success = true;
          console.log(`[Plex] Successfully added via POST method`);
        } else {
          console.log(`[Plex] POST method returned ${postResponse.status}`);
        }
      } catch (e) {
        console.log(`[Plex] POST method failed:`, e);
      }
    }

    // Method 3: Use the metadata endpoint to add to watchlist
    if (!success) {
      try {
        const metadataResponse = await fetch(
          `https://discover.provider.plex.tv/library/metadata/${watchlistRatingKey}/watchlist`,
          {
            method: 'PUT',
            headers: {
              Accept: 'application/json',
              'X-Plex-Token': userPlexToken,
              'X-Plex-Product': PLEX_APP_NAME,
              'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
            },
          }
        );

        if (metadataResponse.ok || metadataResponse.status === 200 || metadataResponse.status === 201) {
          success = true;
          console.log(`[Plex] Successfully added via metadata endpoint`);
        } else {
          console.log(`[Plex] Metadata endpoint returned ${metadataResponse.status}`);
        }
      } catch (e) {
        console.log(`[Plex] Metadata endpoint failed:`, e);
      }
    }

    if (success) {
      console.log(`[Plex] Successfully added "${itemInfo.title}" to watchlist`);
      res.json({ success: true });
    } else {
      throw new Error('All watchlist add methods failed');
    }
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    const message = error instanceof Error ? error.message : 'Failed to add to watchlist';
    res.status(500).json({ error: message });
  }
});

// Check if item is in watchlist
router.post('/check-watchlist', async (req, res) => {
  try {
    const { userPlexToken, ratingKey } = req.body;
    if (!userPlexToken || !ratingKey) {
      return res.status(400).json({ error: 'Plex token and rating key required' });
    }

    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }

    // Get the item's metadata to get title/year and GUIDs
    const itemInfo = await getItemMetadata(config.plex_url, config.plex_token, ratingKey);

    if (!itemInfo.title) {
      return res.json({ inWatchlist: false });
    }

    // Fetch all watchlist items (with pagination)
    const watchlistItems = await fetchAllWatchlistItems(userPlexToken);

    // Check if item is in watchlist by title+year (case insensitive)
    let inWatchlist = watchlistItems.some((wItem: any) => 
      wItem.title?.toLowerCase() === itemInfo.title?.toLowerCase() && 
      (!wItem.year || !itemInfo.year || Math.abs(wItem.year - itemInfo.year) <= 1)
    );

    // Also check by GUID if available
    if (!inWatchlist && itemInfo.guids.length > 0) {
      for (const wItem of watchlistItems) {
        // Check Guid array
        if (wItem.Guid && Array.isArray(wItem.Guid)) {
          for (const guidObj of wItem.Guid) {
            if (itemInfo.guids.includes(guidObj.id)) {
              inWatchlist = true;
              break;
            }
          }
        }
        
        // Check main guid
        if (!inWatchlist && wItem.guid && itemInfo.guids.includes(wItem.guid)) {
          inWatchlist = true;
        }
        
        if (inWatchlist) break;
      }
    }

    res.json({ inWatchlist });
  } catch (error) {
    console.error('Error checking watchlist:', error);
    res.json({ inWatchlist: false });
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
): Promise<{ items: any[]; languages: Map<string, number>; labels: Map<string, number> }> {
  const allItems: any[] = [];
  const languageCounts = new Map<string, number>();
  const labelCounts = new Map<string, number>();
  
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
      
      if (libraryType === 'movie') {
        cacheRefreshProgress.phase = 'movies';
      } else {
        cacheRefreshProgress.phase = 'shows';
      }
      
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
        const BATCH_SIZE = 50;
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const batch = items.slice(i, i + BATCH_SIZE);
          const ratingKeys = batch.map((item: any) => item.ratingKey).join(',');
          
          const detailResponse = await fetch(
            `${plexUrl}/library/metadata/${ratingKeys}?X-Plex-Token=${plexToken}`,
            { headers: { Accept: 'application/json' } }
          );
          
          let detailedItems: any[] = [];
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            detailedItems = detailData.MediaContainer?.Metadata || [];
          }
          
          const detailMap = new Map<string, any>();
          for (const detail of detailedItems) {
            detailMap.set(detail.ratingKey, detail);
          }
          
          for (const item of batch) {
            const detailedItem = detailMap.get(item.ratingKey) || item;
            const itemLanguages = extractLanguagesFromStreams(detailedItem.Media);
            const itemLabels = extractLabelsFromItem(detailedItem);
            
            for (const lang of itemLanguages) {
              languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
            }

            for (const label of itemLabels) {
              labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
            }
            
            allItems.push(createMediaItem(item, detailedItem, libraryType, itemLanguages, itemLabels));
          }
          
          cacheRefreshProgress.moviesProcessed += batch.length;
          
          if (i + BATCH_SIZE < items.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } else {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          
          const itemLanguages = await getShowLanguagesFromEpisode(plexUrl, plexToken, item.ratingKey);
          
          const detailResponse = await fetch(
            `${plexUrl}/library/metadata/${item.ratingKey}?X-Plex-Token=${plexToken}`,
            { headers: { Accept: 'application/json' } }
          );
          
          let detailedItem = item;
          let itemLabels: string[] = [];
          if (detailResponse.ok) {
            const detailData = await detailResponse.json();
            detailedItem = detailData.MediaContainer?.Metadata?.[0] || item;
            itemLabels = extractLabelsFromItem(detailedItem);
          }
          
          for (const lang of itemLanguages) {
            languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
          }

          for (const label of itemLabels) {
            labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
          }
          
          allItems.push(createMediaItem(item, detailedItem, libraryType, itemLanguages, itemLabels));
          
          cacheRefreshProgress.showsProcessed++;
          
          if ((i + 1) % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }
    } catch (e) {
      console.error(`[Plex] Error fetching items for library ${libraryKey}:`, e);
    }
  }
  
  cacheRefreshProgress.languagesFound = languageCounts.size;
  cacheRefreshProgress.labelsFound = labelCounts.size;
  
  console.log(`[Plex] Total items fetched: ${allItems.length}, Languages found: ${languageCounts.size}, Labels found: ${labelCounts.size}`);
  
  return { 
    items: allItems.sort((a, b) => a.ratingKey.localeCompare(b.ratingKey)), 
    languages: languageCounts,
    labels: labelCounts,
  };
}

// Helper to create a standardized media item object
function createMediaItem(item: any, detailedItem: any, libraryType: string, languages: string[], labels: string[]): any {
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

  const guids: string[] = [];
  if (detailedItem.Guid) {
    for (const guid of detailedItem.Guid) {
      guids.push(guid.id);
    }
  }
  if (detailedItem.guid) {
    guids.push(detailedItem.guid);
  }
  
  return {
    ratingKey: item.ratingKey,
    title: item.title,
    year: item.year,
    summary: item.summary,
    thumb: thumbUrl,
    art: artUrl,
    rating: item.rating,
    audienceRating: item.audienceRating,
    contentRating: item.contentRating,
    duration: item.duration,
    originallyAvailableAt: item.originallyAvailableAt,
    studio: item.studio,
    type: item.type || libraryType,
    genres,
    directors,
    actors,
    languages,
    labels,
    guids,
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

// ============ PLAYBACK CONTROL ENDPOINTS ============

// Get available Plex players/clients for a user
router.get('/players', async (req, res) => {
  try {
    const userPlexToken = req.headers['x-plex-token'] as string;
    
    if (!userPlexToken) {
      return res.status(401).json({ error: 'Plex token required' });
    }
    
    const config = getPlexConfig();
    if (!config?.plex_url) {
      return res.status(400).json({ error: 'Plex server not configured' });
    }
    
    let serverMachineId = '';
    try {
      const identityResponse = await fetch(
        `${config.plex_url}/identity?X-Plex-Token=${config.plex_token}`,
        { headers: { Accept: 'application/json' } }
      );
      
      if (identityResponse.ok) {
        const identityData = await identityResponse.json();
        serverMachineId = identityData.MediaContainer?.machineIdentifier || '';
      }
    } catch (e) {
      console.error('[Plex] Error getting server identity:', e);
    }
    
    const clients: any[] = [];
    const seenClientIds = new Set<string>();
    
    try {
      const clientsResponse = await fetch(
        `${config.plex_url}/clients?X-Plex-Token=${config.plex_token}`,
        { 
          headers: { 
            Accept: 'application/json',
            'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
            'X-Plex-Product': PLEX_APP_NAME,
          } 
        }
      );
      
      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json();
        const serverClients = clientsData.MediaContainer?.Server || [];
        
        for (const client of serverClients) {
          if (client.machineIdentifier && !seenClientIds.has(client.machineIdentifier)) {
            seenClientIds.add(client.machineIdentifier);
            clients.push({
              clientId: client.machineIdentifier,
              name: client.name || 'Unknown Device',
              product: client.product || '',
              device: client.device || '',
              platform: client.platform || '',
              platformVersion: client.platformVersion || '',
              local: true,
              address: client.address,
              port: client.port,
              protocol: client.protocol || 'http',
              protocolCapabilities: client.protocolCapabilities || '',
            });
          }
        }
      }
    } catch (e) {
      console.error('[Plex] Error fetching /clients:', e);
    }
    
    try {
      const sessionsResponse = await fetch(
        `${config.plex_url}/status/sessions?X-Plex-Token=${config.plex_token}`,
        { 
          headers: { 
            Accept: 'application/json',
            'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
          } 
        }
      );
      
      if (sessionsResponse.ok) {
        const sessionsData = await sessionsResponse.json();
        const sessions = sessionsData.MediaContainer?.Metadata || [];
        
        for (const session of sessions) {
          if (session.Player?.machineIdentifier && !seenClientIds.has(session.Player.machineIdentifier)) {
            seenClientIds.add(session.Player.machineIdentifier);
            clients.push({
              clientId: session.Player.machineIdentifier,
              name: session.Player.title || session.Player.device || 'Active Player',
              product: session.Player.product || '',
              device: session.Player.device || '',
              platform: session.Player.platform || '',
              platformVersion: session.Player.platformVersion || '',
              local: session.Player.local !== false,
              address: session.Player.address,
              port: session.Player.port,
              protocol: 'http',
              protocolCapabilities: session.Player.protocolCapabilities || '',
              isPlaying: true,
            });
          }
        }
      }
    } catch (e) {
      console.error('[Plex] Error fetching sessions:', e);
    }
    
    try {
      const resourcesResponse = await fetch(
        'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1',
        {
          headers: {
            Accept: 'application/json',
            'X-Plex-Token': userPlexToken,
            'X-Plex-Product': PLEX_APP_NAME,
            'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
          },
        }
      );
      
      if (resourcesResponse.ok) {
        const resources = await resourcesResponse.json();
        
        for (const resource of resources) {
          const provides = resource.provides || '';
          if (provides.includes('player') && !seenClientIds.has(resource.clientIdentifier)) {
            seenClientIds.add(resource.clientIdentifier);
            
            let bestConnection = null;
            if (resource.connections && resource.connections.length > 0) {
              bestConnection = resource.connections.find((c: any) => c.local) || resource.connections[0];
            }
            
            clients.push({
              clientId: resource.clientIdentifier,
              name: resource.name || 'Unknown Device',
              product: resource.product || '',
              device: resource.device || '',
              platform: resource.platform || '',
              platformVersion: resource.platformVersion || '',
              local: bestConnection?.local || false,
              address: bestConnection?.address,
              port: bestConnection?.port,
              protocol: bestConnection?.protocol || 'http',
              protocolCapabilities: provides,
              lastSeenAt: resource.lastSeenAt,
              presence: resource.presence,
            });
          }
        }
      }
    } catch (e) {
      console.error('[Plex] Error fetching plex.tv resources:', e);
    }
    
    clients.sort((a, b) => {
      if (a.isPlaying && !b.isPlaying) return -1;
      if (!a.isPlaying && b.isPlaying) return 1;
      if (a.local && !b.local) return -1;
      if (!a.local && b.local) return 1;
      return a.name.localeCompare(b.name);
    });
    
    console.log(`[Plex] Found ${clients.length} total players`);
    
    res.json({ 
      players: clients,
      serverMachineId,
    });
  } catch (error) {
    console.error('Error fetching Plex players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Get server machine identifier and info for deep links
router.get('/server-info', async (req, res) => {
  try {
    const config = getPlexConfig();
    if (!config?.plex_url || !config?.plex_token) {
      return res.status(400).json({ error: 'Plex not configured' });
    }
    
    const response = await fetch(
      `${config.plex_url}/identity?X-Plex-Token=${config.plex_token}`,
      { headers: { Accept: 'application/json' } }
    );
    
    if (!response.ok) {
      throw new Error('Failed to get server identity');
    }
    
    const data = await response.json();
    const serverUrl = new URL(config.plex_url);
    
    res.json({
      machineIdentifier: data.MediaContainer?.machineIdentifier,
      friendlyName: data.MediaContainer?.friendlyName,
      host: serverUrl.hostname,
      port: serverUrl.port || '32400',
      protocol: serverUrl.protocol.replace(':', ''),
    });
  } catch (error) {
    console.error('Error getting server info:', error);
    res.status(500).json({ error: 'Failed to get server info' });
  }
});

export { router as plexRoutes };
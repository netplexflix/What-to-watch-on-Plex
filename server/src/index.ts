// File: server/src/index.ts
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase, getDb } from './db.js';
import { adminRoutes } from './routes/admin.js';
import { plexRoutes } from './routes/plex.js';
import { sessionRoutes } from './routes/sessions.js';
import { versionRoutes } from './routes/version.js';
import { setupWebSocket } from './websocket.js';
import { APP_VERSION } from './version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '../../data');
const UPLOADS_PATH = path.resolve(DATA_PATH, 'uploads');

// Initialize database
initDatabase(DATA_PATH);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============ DYNAMIC PWA ROUTES (before static files) ============

// Helper to get PWA settings from DB
function getPwaSettings(): { appName: string; appShortName: string; hasCustomIcon: boolean } {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('pwa_settings') as { value: string } | undefined;
    if (row) {
      const settings = JSON.parse(row.value);
      return {
        appName: settings.appName || '',
        appShortName: settings.appShortName || '',
        hasCustomIcon: !!settings.hasCustomIcon,
      };
    }
  } catch (e) {
    console.error('[PWA] Error reading PWA settings:', e);
  }
  return { appName: '', appShortName: '', hasCustomIcon: false };
}

// Helper to get the updated_at timestamp for pwa_settings (used as cache buster)
function getPwaSettingsTimestamp(): string {
  try {
    const db = getDb();
    const row = db.prepare('SELECT updated_at FROM app_config WHERE key = ?').get('pwa_settings') as { updated_at: string } | undefined;
    if (row?.updated_at) {
      return new Date(row.updated_at).getTime().toString();
    }
  } catch (e) {
    // ignore
  }
  return '0';
}

// Dynamic manifest.json
app.get('/manifest.json', (req, res) => {
  try {
    const pwaSettings = getPwaSettings();
    const cacheBuster = getPwaSettingsTimestamp();
    
    const appName = pwaSettings.appName || 'What to Watch?';
    const shortName = pwaSettings.appShortName || 'WTW';
    
    // Determine icon paths
    let icons;
    if (pwaSettings.hasCustomIcon) {
      const icon192Exists = fs.existsSync(path.join(UPLOADS_PATH, 'pwa-icon-192.png'));
      const icon512Exists = fs.existsSync(path.join(UPLOADS_PATH, 'pwa-icon-512.png'));
      
      if (icon192Exists && icon512Exists) {
        icons = [
          {
            src: `/pwa-icons/icon-192.png?v=${cacheBuster}`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: `/pwa-icons/icon-512.png?v=${cacheBuster}`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ];
      }
    }
    
    // Fallback to default icons
    if (!icons) {
      icons = [
        {
          src: `/icons/icon-192.png?v=${cacheBuster}`,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: `/icons/icon-512.png?v=${cacheBuster}`,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ];
    }
    
    const manifest = {
      name: appName,
      short_name: shortName,
      description: 'Swipe together. Watch together. A Tinder-like app to help groups decide what to watch.',
      start_url: '/',
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#2dd4bf',
      orientation: 'portrait',
      icons,
    };
    
    res.set('Content-Type', 'application/manifest+json');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(manifest);
  } catch (error) {
    console.error('[PWA] Error generating manifest:', error);
    // Fallback to a basic manifest
    res.set('Content-Type', 'application/manifest+json');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({
      name: 'What to Watch?',
      short_name: 'WTW',
      description: 'Swipe together. Watch together.',
      start_url: '/',
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#2dd4bf',
      orientation: 'portrait',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    });
  }
});

// Serve custom PWA icons (no caching to ensure updates are picked up)
app.get('/pwa-icons/icon-192.png', (req, res) => {
  const pwaSettings = getPwaSettings();
  
  if (pwaSettings.hasCustomIcon) {
    const iconPath = path.resolve(UPLOADS_PATH, 'pwa-icon-192.png');
    if (fs.existsSync(iconPath)) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache, must-revalidate');
      return res.sendFile(iconPath);
    }
  }
  
  // Fallback to default
  const defaultIcon = path.join(distPath, 'icons/icon-192.png');
  if (fs.existsSync(defaultIcon)) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(defaultIcon);
  } else {
    res.status(404).send('Icon not found');
  }
});

app.get('/pwa-icons/icon-512.png', (req, res) => {
  const pwaSettings = getPwaSettings();
  
  if (pwaSettings.hasCustomIcon) {
    const iconPath = path.resolve(UPLOADS_PATH, 'pwa-icon-512.png');
    if (fs.existsSync(iconPath)) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache, must-revalidate');
      return res.sendFile(iconPath);
    }
  }
  
  // Fallback to default
  const defaultIcon = path.join(distPath, 'icons/icon-512.png');
  if (fs.existsSync(defaultIcon)) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(defaultIcon);
  } else {
    res.status(404).send('Icon not found');
  }
});

// Dynamic apple-touch-icon
app.get('/apple-touch-icon.png', (req, res) => {
  const pwaSettings = getPwaSettings();
  
  if (pwaSettings.hasCustomIcon) {
    const iconPath = path.resolve(UPLOADS_PATH, 'pwa-icon-192.png');
    if (fs.existsSync(iconPath)) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-cache, must-revalidate');
      return res.sendFile(iconPath);
    }
  }
  
  // Fallback to default
  const defaultIcon = path.join(distPath, 'icons/icon-192.png');
  if (fs.existsSync(defaultIcon)) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.sendFile(defaultIcon);
  } else {
    res.status(404).send('Icon not found');
  }
});

// API routes
app.use('/api/admin', adminRoutes);
app.use('/api/plex', plexRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/version', versionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath, {
  // Don't serve the static manifest.json - we handle it dynamically above
  index: false,
}));

// SPA fallback - serve index.html with dynamic PWA meta tags
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const indexPath = path.join(distPath, 'index.html');
    
    try {
      let html = fs.readFileSync(indexPath, 'utf-8');
      
      const pwaSettings = getPwaSettings();
      const appName = pwaSettings.appName || 'What to Watch?';
      
      // Replace title
      html = html.replace(/<title>.*?<\/title>/, `<title>${appName}</title>`);
      
      // Replace apple-mobile-web-app-title
      html = html.replace(
        /(<meta\s+name="apple-mobile-web-app-title"\s+content=")([^"]*)("\s*\/>)/,
        `$1${appName}$3`
      );
      
      // Replace apple-touch-icon if custom icon exists
      if (pwaSettings.hasCustomIcon) {
        html = html.replace(
          /href="\/icons\/icon-192\.png"/,
          'href="/pwa-icons/icon-192.png"'
        );
      }
      
      res.set('Content-Type', 'text/html');
      res.set('Cache-Control', 'no-cache');
      res.send(html);
    } catch (e) {
      // Fallback if file read fails
      res.sendFile(indexPath);
    }
  }
});

// WebSocket setup
setupWebSocket(wss);

// ============ AUTO CACHE REFRESH SCHEDULER ============

async function performCacheRefresh(): Promise<{ success: boolean; mediaCount?: number; error?: string }> {
  try {
    const db = getDb();
    
    // Get plex config
    const plexConfigRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
    
    if (!plexConfigRow) {
      return { success: false, error: 'No Plex config found' };
    }
    
    const plexConfig = JSON.parse(plexConfigRow.value);
    
    if (!plexConfig.plex_url || !plexConfig.plex_token || !plexConfig.libraries?.length) {
      return { success: false, error: 'Plex not fully configured' };
    }
    
    // Make internal API call to refresh cache
    const response = await fetch(`http://localhost:${PORT}/api/plex/refresh-cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ libraryKeys: plexConfig.libraries }),
    });
    
    if (response.ok) {
      const result = await response.json();
      return { success: true, mediaCount: result.mediaCount };
    } else {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

function scheduleAutoCacheRefresh() {
  const checkAndRefresh = async () => {
    try {
      const db = getDb();
      
      // Check if auto refresh is enabled
      const settingsRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('session_settings') as { value: string } | undefined;
      
      if (!settingsRow) return;
      
      const settings = JSON.parse(settingsRow.value);
      
      if (!settings.auto_cache_refresh) return;
      
      const now = new Date();
      const targetHour = 3; // 3 AM
      
      // Check if it's around 3 AM (within the first 5 minutes of the hour)
      if (now.getHours() !== targetHour || now.getMinutes() >= 5) {
        return;
      }
      
      // Check if we already refreshed today
      const lastRefreshRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('last_auto_cache_refresh') as { value: string } | undefined;
      
      if (lastRefreshRow) {
        try {
          const lastRefresh = JSON.parse(lastRefreshRow.value);
          const lastRefreshDate = new Date(lastRefresh.timestamp);
          
          // If we already refreshed today, skip
          if (lastRefreshDate.toDateString() === now.toDateString()) {
            return;
          }
        } catch (e) {
          // Invalid JSON, proceed with refresh
        }
      }
      
      console.log('[AutoCache] Starting automatic cache refresh at 3 AM...');
      
      const result = await performCacheRefresh();
      
      if (result.success) {
        console.log(`[AutoCache] Cache refresh completed successfully: ${result.mediaCount} items`);
        
        // Record the successful refresh time
        db.prepare(`
          INSERT INTO app_config (key, value, updated_at)
          VALUES ('last_auto_cache_refresh', ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `).run(JSON.stringify({ 
          timestamp: now.toISOString(),
          mediaCount: result.mediaCount,
          type: 'auto'
        }));
      } else {
        console.error('[AutoCache] Cache refresh failed:', result.error);
        
        // Record the failed attempt
        db.prepare(`
          INSERT INTO app_config (key, value, updated_at)
          VALUES ('last_auto_cache_refresh', ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        `).run(JSON.stringify({ 
          timestamp: now.toISOString(),
          error: result.error,
          type: 'auto',
          success: false
        }));
      }
    } catch (error) {
      console.error('[AutoCache] Error in auto cache refresh scheduler:', error);
    }
  };
  
  // Check every minute
  setInterval(checkAndRefresh, 60 * 1000);
  
  // Also do an initial check 10 seconds after startup
  // (in case server was down during the scheduled time)
  setTimeout(checkAndRefresh, 10 * 1000);
  
  console.log('[AutoCache] Auto cache refresh scheduler started (runs daily at 3 AM if enabled)');
}

// ============ START SERVER ============

server.listen(PORT, () => {
  console.log(`What to Watch ${APP_VERSION} - Server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_PATH}`);
  
  // Start the auto cache refresh scheduler
  scheduleAutoCacheRefresh();
});
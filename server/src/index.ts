// file: server/src/index.ts
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, getDb } from './db.js';
import { adminRoutes } from './routes/admin.js';
import { plexRoutes } from './routes/plex.js';
import { sessionRoutes } from './routes/sessions.js';
import { setupWebSocket } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '../../data');

// Initialize database
initDatabase(DATA_PATH);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/admin', adminRoutes);
app.use('/api/plex', plexRoutes);
app.use('/api/sessions', sessionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
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
  console.log(`Server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_PATH}`);
  
  // Start the auto cache refresh scheduler
  scheduleAutoCacheRefresh();
});
//file: server/src/routes/admin.ts
import { Router, Request, Response, NextFunction } from 'express';
import { getDb, generateId } from '../db.js';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const router = Router();

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 20; // max attempts per window

function authRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_MAX) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    }
    entry.count++;
  } else {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  }

  next();
}

// Periodically clean up expired entries to avoid memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) rateLimitStore.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS);

// Configure multer for logo uploads
const DATA_PATH = process.env.DATA_PATH || './data';
const UPLOADS_PATH = path.resolve(DATA_PATH, 'uploads');

// Ensure uploads directory exists
try {
  if (!fs.existsSync(UPLOADS_PATH)) {
    fs.mkdirSync(UPLOADS_PATH, { recursive: true });
  }
} catch (err) {
  console.error('[Admin] Error creating uploads directory:', err);
}

// Helper function to delete files matching a prefix
function deleteFilesWithPrefix(prefix: string, excludeFiles: string[] = []) {
  try {
    const files = fs.readdirSync(UPLOADS_PATH);
    files.forEach(file => {
      if (file.startsWith(prefix) && !excludeFiles.includes(file)) {
        const filePath = path.join(UPLOADS_PATH, file);
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error('[Admin] Error deleting file:', file, err);
        }
      }
    });
  } catch (err) {
    console.error('[Admin] Error reading uploads directory:', err);
  }
}

// Helper function to delete all custom-logo files
function deleteAllCustomLogoFiles() {
  deleteFilesWithPrefix('custom-logo');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (req, file, cb) => {
    deleteAllCustomLogoFiles();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `custom-logo${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, GIF, WebP, and SVG are allowed.'));
    }
  },
});

const pwaIconStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `temp-pwa-upload-${Date.now()}${ext}`);
  },
});

const pwaIconUpload = multer({
  storage: pwaIconStorage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, and WebP are allowed for PWA icons.'));
    }
  },
});

// Hash password using SHA-256
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ============ AUTH MIDDLEWARE ============

// Verify admin auth via X-Admin-Token header
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-admin-token'] as string;
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('admin_password') as { value: string } | undefined;
    
    if (!row) {
      return res.status(401).json({ error: 'Admin password not set' });
    }
    
    const config = JSON.parse(row.value);
    if (config.hash !== token) {
      return res.status(403).json({ error: 'Invalid credentials' });
    }
    
    next();
  } catch (error) {
    console.error('[Admin] Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

// ============ PUBLIC ROUTES (no auth required) ============

// Check if admin password is set
router.post('/check-password-status', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('admin_password') as { value: string } | undefined;
    
    if (row) {
      const config = JSON.parse(row.value);
      res.json({ isSet: !!config.hash });
    } else {
      res.json({ isSet: false });
    }
  } catch (error) {
    console.error('[Admin] Error checking password status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set admin password
router.post('/set-password', authRateLimiter, (req, res) => {
  try {
    const { passwordHash } = req.body;
    if (!passwordHash) {
      return res.status(400).json({ error: 'Password hash required' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT value FROM app_config WHERE key = ?').get('admin_password') as { value: string } | undefined;
    
    if (existing) {
      const config = JSON.parse(existing.value);
      if (config.hash) {
        return res.status(400).json({ error: 'Password already set' });
      }
    }

    const stmt = db.prepare(`
      INSERT INTO app_config (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run('admin_password', JSON.stringify({ hash: passwordHash }));

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error setting password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify admin password
router.post('/verify-password', authRateLimiter, (req, res) => {
  try {
    const { passwordHash } = req.body;
    if (!passwordHash) {
      return res.json({ valid: false });
    }

    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('admin_password') as { value: string } | undefined;
    
    if (!row) {
      return res.json({ valid: false });
    }

    const config = JSON.parse(row.value);
    res.json({ valid: config.hash === passwordHash });
  } catch (error) {
    console.error('[Admin] Error verifying password:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve custom logo file
router.get('/logo/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename.startsWith('custom-logo')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const sanitizedFilename = path.basename(filename);
    const filePath = path.resolve(UPLOADS_PATH, sanitizedFilename);
    
    // Ensure resolved path is within UPLOADS_PATH
    if (!filePath.startsWith(path.resolve(UPLOADS_PATH))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Logo not found' });
    }
    
    const ext = path.extname(sanitizedFilename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    
    res.sendFile(filePath, (err) => {
      if (err) {
        console.error('[Admin] Error sending file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to serve logo' });
        }
      }
    });
  } catch (error) {
    console.error('[Admin] Exception serving logo:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to serve logo' });
    }
  }
});

// Get custom logo config
router.get('/get-logo', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('custom_logo') as { value: string } | undefined;
    
    if (row) {
      const logoConfig = JSON.parse(row.value);
      const filePath = path.join(UPLOADS_PATH, logoConfig.filename);
      if (fs.existsSync(filePath)) {
        res.json({ logo: logoConfig });
      } else {
        db.prepare('DELETE FROM app_config WHERE key = ?').run('custom_logo');
        res.json({ logo: null });
      }
    } else {
      res.json({ logo: null });
    }
  } catch (error) {
    console.error('[Admin] Error getting logo:', error);
    res.status(500).json({ error: 'Failed to get logo' });
  }
});

// Get PWA settings
router.get('/get-pwa-settings', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('pwa_settings') as { value: string } | undefined;
    
    if (row) {
      const settings = JSON.parse(row.value);
      if (settings.hasCustomIcon) {
        const icon192Path = path.join(UPLOADS_PATH, 'pwa-icon-192.png');
        const icon512Path = path.join(UPLOADS_PATH, 'pwa-icon-512.png');
        if (!fs.existsSync(icon192Path) || !fs.existsSync(icon512Path)) {
          settings.hasCustomIcon = false;
          db.prepare(`
            INSERT INTO app_config (key, value, updated_at) 
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
          `).run('pwa_settings', JSON.stringify(settings));
        }
      }
      res.json({ settings });
    } else {
      res.json({ settings: null });
    }
  } catch (error) {
    console.error('[Admin] Error getting PWA settings:', error);
    res.status(500).json({ error: 'Failed to get PWA settings' });
  }
});

// Get session settings
router.post('/get-session-settings', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('session_settings') as { value: string } | undefined;
    
    if (row) {
      const settings = JSON.parse(row.value);
      // Return only non-sensitive session settings
      res.json({ 
        settings: {
          suggestion_order: settings.suggestion_order,
          max_choices: settings.max_choices,
          max_exclusions: settings.max_exclusions,
          enable_collections: settings.enable_collections,
          enable_plex_button: settings.enable_plex_button,
          enable_label_restrictions: settings.enable_label_restrictions,
          label_restriction_mode: settings.label_restriction_mode,
          restricted_labels: settings.restricted_labels,
          rating_display: settings.rating_display,
          enable_lobby_qr: settings.enable_lobby_qr,
          enable_chat: settings.enable_chat,
          auto_cache_refresh: settings.auto_cache_refresh,
        }
      });
    } else {
      res.json({ settings: null });
    }
  } catch (error) {
    console.error('[Admin] Error getting session settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ PROTECTED ROUTES (require admin auth) ============

// Get Plex config
router.post('/get-config', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
    
    res.json({ config: row ? JSON.parse(row.value) : null });
  } catch (error) {
    console.error('[Admin] Error getting config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save Plex config
router.post('/save-config', requireAdmin, (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ error: 'Config required' });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO app_config (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run('plex', JSON.stringify(config));

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error saving config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save session settings
router.post('/save-session-settings', requireAdmin, (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings) {
      return res.status(400).json({ error: 'Settings required' });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO app_config (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run('session_settings', JSON.stringify(settings));

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error saving session settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload custom logo
router.post('/upload-logo', requireAdmin, upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const db = getDb();
    const logoPath = `/api/admin/logo/${req.file.filename}`;
    
    const stmt = db.prepare(`
      INSERT INTO app_config (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run('custom_logo', JSON.stringify({ path: logoPath, filename: req.file.filename }));

    res.json({ success: true, path: logoPath });
  } catch (error) {
    console.error('[Admin] Error uploading logo:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Delete custom logo
router.post('/delete-logo', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('custom_logo') as { value: string } | undefined;
    
    if (row) {
      const logoConfig = JSON.parse(row.value);
      
      const filePath = path.join(UPLOADS_PATH, logoConfig.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      db.prepare('DELETE FROM app_config WHERE key = ?').run('custom_logo');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error deleting logo:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

// Save PWA settings (name only)
router.post('/save-pwa-settings', requireAdmin, (req, res) => {
  try {
    const { appName, appShortName } = req.body;
    
    const db = getDb();
    
    const existing = db.prepare('SELECT value FROM app_config WHERE key = ?').get('pwa_settings') as { value: string } | undefined;
    const currentSettings = existing ? JSON.parse(existing.value) : {};
    
    const newSettings = {
      ...currentSettings,
      appName: appName || '',
      appShortName: appShortName || '',
    };
    
    const stmt = db.prepare(`
      INSERT INTO app_config (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run('pwa_settings', JSON.stringify(newSettings));

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error saving PWA settings:', error);
    res.status(500).json({ error: 'Failed to save PWA settings' });
  }
});

// Upload PWA icon
router.post('/upload-pwa-icon', requireAdmin, pwaIconUpload.single('icon'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tempPath = path.join(UPLOADS_PATH, req.file.filename);
    const icon192Path = path.join(UPLOADS_PATH, 'pwa-icon-192.png');
    const icon512Path = path.join(UPLOADS_PATH, 'pwa-icon-512.png');

    const inputBuffer = fs.readFileSync(tempPath);

    try { if (fs.existsSync(icon192Path)) fs.unlinkSync(icon192Path); } catch (e) { /* ignore */ }
    try { if (fs.existsSync(icon512Path)) fs.unlinkSync(icon512Path); } catch (e) { /* ignore */ }

    await sharp(inputBuffer)
      .resize(192, 192, { fit: 'cover', position: 'center' })
      .png()
      .toFile(icon192Path);

    await sharp(inputBuffer)
      .resize(512, 512, { fit: 'cover', position: 'center' })
      .png()
      .toFile(icon512Path);

    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (e) {
      console.error('[Admin] Error cleaning up temp file:', e);
    }

    try {
      const files = fs.readdirSync(UPLOADS_PATH);
      files.forEach(file => {
        if (file.startsWith('temp-pwa-upload-')) {
          try { fs.unlinkSync(path.join(UPLOADS_PATH, file)); } catch (e) { /* ignore */ }
        }
      });
    } catch (e) { /* ignore */ }

    const db = getDb();
    const existing = db.prepare('SELECT value FROM app_config WHERE key = ?').get('pwa_settings') as { value: string } | undefined;
    const currentSettings = existing ? JSON.parse(existing.value) : {};
    
    const newSettings = {
      ...currentSettings,
      hasCustomIcon: true,
    };
    
    const stmt = db.prepare(`
      INSERT INTO app_config (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run('pwa_settings', JSON.stringify(newSettings));

    res.json({ success: true });
  } catch (error) {
    if (req.file) {
      const tempPath = path.join(UPLOADS_PATH, req.file.filename);
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
    }
    
    console.error('[Admin] Error uploading PWA icon:', error);
    res.status(500).json({ error: 'Failed to process icon' });
  }
});

// Delete PWA icon
router.post('/delete-pwa-icon', requireAdmin, (req, res) => {
  try {
    const icon192Path = path.join(UPLOADS_PATH, 'pwa-icon-192.png');
    const icon512Path = path.join(UPLOADS_PATH, 'pwa-icon-512.png');
    
    if (fs.existsSync(icon192Path)) fs.unlinkSync(icon192Path);
    if (fs.existsSync(icon512Path)) fs.unlinkSync(icon512Path);
    
    try {
      const files = fs.readdirSync(UPLOADS_PATH);
      files.forEach(file => {
        if (file.startsWith('temp-pwa-upload-')) {
          try { fs.unlinkSync(path.join(UPLOADS_PATH, file)); } catch (e) { /* ignore */ }
        }
      });
    } catch (e) { /* ignore */ }

    const db = getDb();
    const existing = db.prepare('SELECT value FROM app_config WHERE key = ?').get('pwa_settings') as { value: string } | undefined;
    const currentSettings = existing ? JSON.parse(existing.value) : {};
    
    const newSettings = {
      ...currentSettings,
      hasCustomIcon: false,
    };
    
    const stmt = db.prepare(`
      INSERT INTO app_config (key, value, updated_at) 
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run('pwa_settings', JSON.stringify(newSettings));

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error deleting PWA icon:', error);
    res.status(500).json({ error: 'Failed to delete icon' });
  }
});

// Get session history
router.get('/session-history', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    // Sanitize limit and offset to prevent abuse
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safeOffset = Math.max(0, offset);
    
    const history = db.prepare(`
      SELECT * FROM session_history 
      ORDER BY completed_at DESC 
      LIMIT ? OFFSET ?
    `).all(safeLimit, safeOffset) as any[];
    
    const total = db.prepare('SELECT COUNT(*) as count FROM session_history').get() as { count: number };
    
    const parsed = history.map(h => ({
      ...h,
      participants: JSON.parse(h.participants),
      was_timed: !!h.was_timed,
    }));
    
    res.json({ history: parsed, total: total.count });
  } catch (error) {
    console.error('[Admin] Error getting session history:', error);
    res.status(500).json({ error: 'Failed to get session history' });
  }
});

// Clear session history
router.post('/clear-session-history', requireAdmin, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM session_history').run();
    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error clearing session history:', error);
    res.status(500).json({ error: 'Failed to clear session history' });
  }
});

export { router as adminRoutes };
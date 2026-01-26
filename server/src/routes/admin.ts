//file: server/src/routes/admin.ts
import { Router } from 'express';
import { getDb, generateId } from '../db.js';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

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

// Helper function to delete all custom-logo files
function deleteAllCustomLogoFiles() {
  try {
    const files = fs.readdirSync(UPLOADS_PATH);
    files.forEach(file => {
      if (file.startsWith('custom-logo')) {
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (req, file, cb) => {
    // Delete any existing custom-logo files before saving new one
    deleteAllCustomLogoFiles();
    
    // Use 'custom-logo' as filename with original extension
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `custom-logo${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
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

// Hash password using SHA-256
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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
router.post('/set-password', (req, res) => {
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
router.post('/verify-password', (req, res) => {
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

// Get Plex config
router.post('/get-config', (req, res) => {
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
router.post('/save-config', (req, res) => {
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

// Get session settings
router.post('/get-session-settings', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('session_settings') as { value: string } | undefined;
    
    res.json({ settings: row ? JSON.parse(row.value) : null });
  } catch (error) {
    console.error('[Admin] Error getting session settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save session settings
router.post('/save-session-settings', (req, res) => {
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
router.post('/upload-logo', upload.single('logo'), (req, res) => {
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
router.post('/delete-logo', (req, res) => {
  try {
    const db = getDb();
    
    // Get current logo info
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('custom_logo') as { value: string } | undefined;
    
    if (row) {
      const logoConfig = JSON.parse(row.value);
      
      // Delete the file
      const filePath = path.join(UPLOADS_PATH, logoConfig.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Remove from database
      db.prepare('DELETE FROM app_config WHERE key = ?').run('custom_logo');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Admin] Error deleting logo:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
  }
});

// Get custom logo config
router.get('/get-logo', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('custom_logo') as { value: string } | undefined;
    
    if (row) {
      const logoConfig = JSON.parse(row.value);
      // Verify file still exists
      const filePath = path.join(UPLOADS_PATH, logoConfig.filename);
      if (fs.existsSync(filePath)) {
        res.json({ logo: logoConfig });
      } else {
        // File doesn't exist, clean up database
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

// Serve custom logo file
router.get('/logo/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security check: only allow files that start with 'custom-logo'
    if (!filename.startsWith('custom-logo')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Use absolute path
    const filePath = path.resolve(UPLOADS_PATH, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Logo not found' });
    }
    
    // Determine content type
    const ext = path.extname(filename).toLowerCase();
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
    
    // Use absolute path for sendFile
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

export { router as adminRoutes };
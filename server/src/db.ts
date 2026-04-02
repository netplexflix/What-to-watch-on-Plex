// file: server/src/db.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { encrypt, decrypt, encryptToken, decryptToken } from './services/encryption.js';

let db: DatabaseType;

export function initDatabase(dataPath: string): DatabaseType {
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  const dbPath = path.join(dataPath, 'wtw.db');
  db = new Database(dbPath);
  
  db.pragma('journal_mode = WAL');
  
  // Create base tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'waiting',
      media_type TEXT,
      host_user_id TEXT,
      winner_item_key TEXT,
      preferences TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_guest INTEGER DEFAULT 1,
      plex_token TEXT,
      preferences TEXT,
      questions_completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      vote INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES session_participants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_items_cache (
      id TEXT PRIMARY KEY,
      library_keys TEXT NOT NULL,
      media_type TEXT NOT NULL,
      items TEXT NOT NULL,
      item_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(library_keys, media_type)
    );

    CREATE TABLE IF NOT EXISTS library_languages_cache (
      id TEXT PRIMARY KEY,
      library_keys TEXT NOT NULL UNIQUE,
      languages TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collections_cache (
      id TEXT PRIMARY KEY,
      cache_key TEXT NOT NULL UNIQUE,
      collections TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collection_items_cache (
      id TEXT PRIMARY KEY,
      collection_keys TEXT NOT NULL UNIQUE,
      item_keys TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_labels_cache (
      id TEXT PRIMARY KEY,
      library_keys TEXT NOT NULL UNIQUE,
      labels TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code);
    CREATE INDEX IF NOT EXISTS idx_participants_session ON session_participants(session_id);
    CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
    CREATE INDEX IF NOT EXISTS idx_votes_participant ON votes(participant_id);
  `);

  // Run migrations for new columns/tables
  runMigrations(db);

  console.log('Database initialized at:', dbPath);
  return db;
}

function runMigrations(db: DatabaseType) {
  // Check and add new columns to sessions
  const sessionsColumns = db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
  const sessionColumnNames = sessionsColumns.map(c => c.name);
  
  if (!sessionColumnNames.includes('timed_duration')) {
    console.log('[DB Migration] Adding timed_duration column to sessions');
    db.exec('ALTER TABLE sessions ADD COLUMN timed_duration INTEGER DEFAULT NULL');
  }
  
  if (!sessionColumnNames.includes('timer_end_at')) {
    console.log('[DB Migration] Adding timer_end_at column to sessions');
    db.exec('ALTER TABLE sessions ADD COLUMN timer_end_at TEXT DEFAULT NULL');
  }

  if (!sessionColumnNames.includes('use_watchlist')) {
    console.log('[DB Migration] Adding use_watchlist column to sessions');
    db.exec('ALTER TABLE sessions ADD COLUMN use_watchlist INTEGER DEFAULT 0');
  }

  if (!sessionColumnNames.includes('host_plex_token')) {
    console.log('[DB Migration] Adding host_plex_token column to sessions');
    db.exec('ALTER TABLE sessions ADD COLUMN host_plex_token TEXT DEFAULT NULL');
  }

  if (!sessionColumnNames.includes('match_target')) {
    console.log('[DB Migration] Adding match_target column to sessions');
    db.exec('ALTER TABLE sessions ADD COLUMN match_target INTEGER DEFAULT NULL');
  }

  // Create final_votes table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS final_votes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES session_participants(id) ON DELETE CASCADE,
      UNIQUE(session_id, participant_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_final_votes_session ON final_votes(session_id);
  `);

  // Create session_history table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_history (
      id TEXT PRIMARY KEY,
      session_code TEXT NOT NULL,
      participants TEXT NOT NULL,
      winner_item_key TEXT,
      winner_title TEXT,
      winner_thumb TEXT,
      media_type TEXT,
      was_timed INTEGER DEFAULT 0,
      completed_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE INDEX IF NOT EXISTS idx_session_history_completed ON session_history(completed_at);
  `);

  // Create media_labels_cache table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_labels_cache (
      id TEXT PRIMARY KEY,
      library_keys TEXT NOT NULL UNIQUE,
      labels TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Encrypt existing plaintext Plex tokens
  migrateTokenEncryption(db);

  console.log('[DB] Migrations complete');
}

function migrateTokenEncryption(db: DatabaseType) {
  const migrated = db.prepare('SELECT value FROM app_config WHERE key = ?').get('encryption_migrated') as { value: string } | undefined;
  if (migrated) return;

  console.log('[DB Migration] Encrypting existing Plex tokens...');
  let count = 0;

  // Encrypt Plex config token in app_config
  try {
    const plexRow = db.prepare('SELECT value FROM app_config WHERE key = ?').get('plex') as { value: string } | undefined;
    if (plexRow) {
      const config = JSON.parse(plexRow.value);
      if (config.plex_token && !isLikelyEncrypted(config.plex_token)) {
        config.plex_token = encrypt(config.plex_token);
        db.prepare('UPDATE app_config SET value = ?, updated_at = datetime(\'now\') WHERE key = ?').run(JSON.stringify(config), 'plex');
        count++;
      }
    }
  } catch (e) {
    console.error('[DB Migration] Error encrypting plex config token:', e);
  }

  // Encrypt session participant tokens
  try {
    const participants = db.prepare('SELECT id, plex_token FROM session_participants WHERE plex_token IS NOT NULL').all() as { id: string; plex_token: string }[];
    for (const p of participants) {
      if (p.plex_token && !isLikelyEncrypted(p.plex_token)) {
        const encrypted = encrypt(p.plex_token);
        db.prepare('UPDATE session_participants SET plex_token = ? WHERE id = ?').run(encrypted, p.id);
        count++;
      }
    }
  } catch (e) {
    console.error('[DB Migration] Error encrypting participant tokens:', e);
  }

  // Encrypt host_plex_token on sessions
  try {
    const sessions = db.prepare('SELECT id, host_plex_token FROM sessions WHERE host_plex_token IS NOT NULL').all() as { id: string; host_plex_token: string }[];
    for (const s of sessions) {
      if (s.host_plex_token && !isLikelyEncrypted(s.host_plex_token)) {
        const encrypted = encrypt(s.host_plex_token);
        db.prepare('UPDATE sessions SET host_plex_token = ? WHERE id = ?').run(encrypted, s.id);
        count++;
      }
    }
  } catch (e) {
    console.error('[DB Migration] Error encrypting session host tokens:', e);
  }

  // Mark migration as complete
  db.prepare(`
    INSERT INTO app_config (key, value, updated_at)
    VALUES ('encryption_migrated', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify({ migratedAt: new Date().toISOString(), count }));

  console.log(`[DB Migration] Encrypted ${count} tokens`);
}

// Heuristic: Plex tokens are typically ~20 char alphanumeric strings
// Encrypted values are base64 and longer (40+ chars)
function isLikelyEncrypted(value: string): boolean {
  if (!value || value.length < 30) return false;
  try {
    const buf = Buffer.from(value, 'base64');
    // If it round-trips as base64 and is long enough, likely encrypted
    return buf.length >= 28 && Buffer.from(buf).toString('base64') === value;
  } catch {
    return false;
  }
}

export function getDb(): DatabaseType {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function generateId(): string {
  return crypto.randomUUID();
}
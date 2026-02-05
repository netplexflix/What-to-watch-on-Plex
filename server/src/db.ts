// file: server/src/db.ts
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
  // Check and add timed_duration column to sessions
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

  console.log('[DB] Migrations complete');
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
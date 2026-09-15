const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'music.db'));

db.pragma('journal_mode = WAL'); 
db.pragma('foreign_keys = ON'); 

db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    artist        TEXT NOT NULL DEFAULT 'Unknown Artist',
    album         TEXT NOT NULL DEFAULT 'Unknown Album',
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    format        TEXT,
    duration      REAL NOT NULL DEFAULT 0,
    filesize      INTEGER NOT NULL DEFAULT 0,
    uploaded_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    song_id     TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, song_id)
  );

  CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist ON playlist_songs(playlist_id);
`);

// Additive migration preserves existing libraries.
const columns = db.prepare('PRAGMA table_info(songs)').all().map(c => c.name);
if (!columns.includes('favorite')) db.exec('ALTER TABLE songs ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0');
if (!columns.includes('play_count')) db.exec('ALTER TABLE songs ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0');
if (!columns.includes('last_played_at')) db.exec('ALTER TABLE songs ADD COLUMN last_played_at TEXT');
module.exports = db;

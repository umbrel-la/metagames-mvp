PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  cover_url TEXT,
  developer TEXT,
  description TEXT,
  video_url TEXT,
  metacritic_url TEXT NOT NULL,
  genres TEXT NOT NULL DEFAULT '[]',
  critic_summary_positive TEXT,
  critic_summary_negative TEXT,
  user_summary_positive TEXT,
  user_summary_negative TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_platforms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_slug TEXT,
  metascore INTEGER,
  userscore REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, platform)
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('NEW_RELEASES', 'BROWSE_NEW')),
  page INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('RUNNING', 'COMPLETED', 'FAILED')),
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_processed_games (
  date TEXT NOT NULL,
  slug TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(date, slug)
);

CREATE INDEX IF NOT EXISTS idx_games_title ON games(title);
CREATE INDEX IF NOT EXISTS idx_platforms_platform ON game_platforms(platform);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_date ON scrape_runs(date, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_running_scrape_per_date
  ON scrape_runs(date) WHERE status = 'RUNNING';

DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS players;

CREATE TABLE IF NOT EXISTS leagues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS league_line_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_doubles INTEGER NOT NULL DEFAULT 1,
  max_combined_rating REAL
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  ntrp_rating REAL NOT NULL DEFAULT 3.5,
  team_id INTEGER REFERENCES teams(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  team_id INTEGER REFERENCES teams(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  match_date TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS match_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_doubles INTEGER NOT NULL DEFAULT 1,
  max_combined_rating REAL
);

CREATE TABLE IF NOT EXISTS lineups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_line_id INTEGER NOT NULL UNIQUE REFERENCES match_lines(id) ON DELETE CASCADE,
  home_player1_id INTEGER REFERENCES players(id),
  home_player2_id INTEGER REFERENCES players(id),
  away_player1_id INTEGER REFERENCES players(id),
  away_player2_id INTEGER REFERENCES players(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS line_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_line_id INTEGER NOT NULL UNIQUE REFERENCES match_lines(id) ON DELETE CASCADE,
  home_set1 INTEGER NOT NULL DEFAULT 0,
  away_set1 INTEGER NOT NULL DEFAULT 0,
  home_tb1 INTEGER,
  away_tb1 INTEGER,
  home_set2 INTEGER NOT NULL DEFAULT 0,
  away_set2 INTEGER NOT NULL DEFAULT 0,
  home_tb2 INTEGER,
  away_tb2 INTEGER,
  home_set3 INTEGER,
  away_set3 INTEGER,
  home_tb3 INTEGER,
  away_tb3 INTEGER,
  winner TEXT NOT NULL,
  submitted_by_id INTEGER REFERENCES users(id),
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date DESC);
CREATE INDEX IF NOT EXISTS idx_teams_league ON teams(league_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
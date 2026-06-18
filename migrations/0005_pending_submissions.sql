CREATE TABLE IF NOT EXISTS pending_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  match_date TEXT NOT NULL,
  location TEXT,
  scores_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by_id INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  match_id INTEGER REFERENCES matches(id)
);

CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_submissions(status, submitted_at DESC);
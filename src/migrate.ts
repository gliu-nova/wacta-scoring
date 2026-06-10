let done = false;

export async function ensureTables(db: D1Database): Promise<void> {
  if (done) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      ntrp REAL NOT NULL DEFAULT 3.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      winner_id INTEGER NOT NULL REFERENCES players(id),
      loser_id INTEGER NOT NULL REFERENCES players(id),
      score TEXT NOT NULL,
      match_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date DESC)`),
  ]);
  done = true;
}
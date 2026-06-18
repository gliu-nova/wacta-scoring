import { hashPassword } from "./auth";

let done = false;

const TABLES = [
  `CREATE TABLE IF NOT EXISTS leagues (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS league_line_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, league_id INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_doubles INTEGER NOT NULL DEFAULT 1,
    max_combined_rating REAL)`,
  `CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, league_id INTEGER NOT NULL REFERENCES leagues(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL, email TEXT,
    ntrp_rating REAL NOT NULL DEFAULT 3.5, team_id INTEGER REFERENCES teams(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player', team_id INTEGER REFERENCES teams(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, league_id INTEGER NOT NULL REFERENCES leagues(id),
    home_team_id INTEGER NOT NULL REFERENCES teams(id), away_team_id INTEGER NOT NULL REFERENCES teams(id),
    match_date TEXT NOT NULL, location TEXT, status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS match_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, is_doubles INTEGER NOT NULL DEFAULT 1,
    max_combined_rating REAL)`,
  `CREATE TABLE IF NOT EXISTS lineups (
    id INTEGER PRIMARY KEY AUTOINCREMENT, match_line_id INTEGER NOT NULL UNIQUE REFERENCES match_lines(id) ON DELETE CASCADE,
    home_player1_id INTEGER, home_player2_id INTEGER, away_player1_id INTEGER, away_player2_id INTEGER,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS line_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT, match_line_id INTEGER NOT NULL UNIQUE REFERENCES match_lines(id) ON DELETE CASCADE,
    home_set1 INTEGER NOT NULL DEFAULT 0, away_set1 INTEGER NOT NULL DEFAULT 0, home_tb1 INTEGER, away_tb1 INTEGER,
    home_set2 INTEGER NOT NULL DEFAULT 0, away_set2 INTEGER NOT NULL DEFAULT 0, home_tb2 INTEGER, away_tb2 INTEGER,
    home_set3 INTEGER, away_set3 INTEGER, home_tb3 INTEGER, away_tb3 INTEGER,
    winner TEXT NOT NULL, submitted_by_id INTEGER, submitted_at TEXT NOT NULL DEFAULT (datetime('now')))`,
];

const ALTERS = [
  "ALTER TABLE lineups ADD COLUMN home_players_text TEXT",
  "ALTER TABLE lineups ADD COLUMN away_players_text TEXT",
];

export async function ensureTables(db: D1Database): Promise<void> {
  if (done) return;
  await db.batch(TABLES.map((sql) => db.prepare(sql)));
  for (const sql of ALTERS) {
    try { await db.prepare(sql).run(); } catch { /* column exists */ }
  }
  await seedDefaults(db);
  done = true;
}

async function seedDefaults(db: D1Database): Promise<void> {
  const admin = await db.prepare("SELECT id FROM users WHERE username = ?").bind("admin").first();
  if (!admin) {
    const hash = await hashPassword("admin");
    await db.prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)")
      .bind("admin", hash, "admin").run();
  }
  const league = await db.prepare("SELECT id FROM leagues LIMIT 1").first();
  if (!league) {
    await db.prepare("INSERT INTO leagues (name, description) VALUES (?, ?)")
      .bind("A League", "Stronger players").run();
    const a = await db.prepare("SELECT id FROM leagues WHERE name = ?").bind("A League").first<{ id: number }>();
    await db.prepare("INSERT INTO leagues (name, description) VALUES (?, ?)")
      .bind("B League", "Developing players").run();
    const b = await db.prepare("SELECT id FROM leagues WHERE name = ?").bind("B League").first<{ id: number }>();
    if (a) {
      for (const [i, name] of ["Open Mens", "Open Mixed", "8.0 Mens"].entries()) {
        await db.prepare("INSERT INTO league_line_templates (league_id, name, sort_order, is_doubles) VALUES (?, ?, ?, ?)")
          .bind(a.id, name, i, 1).run();
      }
    }
    if (b) {
      for (const [i, name] of ["Mens 3.5", "Womens 3.5", "Mixed 7.0"].entries()) {
        await db.prepare("INSERT INTO league_line_templates (league_id, name, sort_order, is_doubles) VALUES (?, ?, ?, ?)")
          .bind(b.id, name, i, 1).run();
      }
    }
  }
}
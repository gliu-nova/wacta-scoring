import type { Match, Player, PlayerStats } from "./types";

export async function getLeaderboard(db: D1Database): Promise<PlayerStats[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.ntrp, p.created_at,
        SUM(CASE WHEN m.winner_id = p.id THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN m.loser_id = p.id THEN 1 ELSE 0 END) AS losses
      FROM players p
      LEFT JOIN matches m ON m.winner_id = p.id OR m.loser_id = p.id
      GROUP BY p.id
      ORDER BY wins DESC, losses ASC, p.name ASC`
    )
    .all<PlayerStats & { wins: number; losses: number }>();

  return (results ?? []).map((r) => {
    const wins = Number(r.wins) || 0;
    const losses = Number(r.losses) || 0;
    return {
      ...r,
      wins,
      losses,
      win_pct: wins + losses > 0 ? Math.round((100 * wins) / (wins + losses)) : 0,
    };
  });
}

export async function getRecentMatches(
  db: D1Database,
  limit = 20
): Promise<Match[]> {
  const { results } = await db
    .prepare(
      `SELECT m.*, w.name AS winner_name, l.name AS loser_name
      FROM matches m
      JOIN players w ON w.id = m.winner_id
      JOIN players l ON l.id = m.loser_id
      ORDER BY m.match_date DESC, m.id DESC
      LIMIT ?`
    )
    .bind(limit)
    .all<Match>();
  return results ?? [];
}

export async function getPlayers(db: D1Database): Promise<Player[]> {
  const { results } = await db
    .prepare("SELECT * FROM players ORDER BY name ASC")
    .all<Player>();
  return results ?? [];
}

export async function getPlayerById(
  db: D1Database,
  id: number
): Promise<Player | null> {
  return db
    .prepare("SELECT * FROM players WHERE id = ?")
    .bind(id)
    .first<Player>();
}

export async function createPlayer(
  db: D1Database,
  name: string,
  ntrp: number
): Promise<Player> {
  await db
    .prepare("INSERT INTO players (name, ntrp) VALUES (?, ?)")
    .bind(name.trim(), ntrp)
    .run();
  const result = await db
    .prepare("SELECT * FROM players WHERE name = ?")
    .bind(name.trim())
    .first<Player>();
  if (!result) throw new Error("Failed to create player");
  return result;
}

export async function createMatch(
  db: D1Database,
  data: {
    winner_id: number;
    loser_id: number;
    score: string;
    match_date: string;
    notes?: string;
  }
): Promise<Match> {
  const insert = await db
    .prepare(
      `INSERT INTO matches (winner_id, loser_id, score, match_date, notes)
      VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      data.winner_id,
      data.loser_id,
      data.score.trim(),
      data.match_date,
      data.notes?.trim() || null
    )
    .run();
  const id = insert.meta.last_row_id;
  const full = await db
    .prepare(
      `SELECT m.*, w.name AS winner_name, l.name AS loser_name
      FROM matches m
      JOIN players w ON w.id = m.winner_id
      JOIN players l ON l.id = m.loser_id
      WHERE m.id = ?`
    )
    .bind(id)
    .first<Match>();
  if (!full) throw new Error("Failed to load match");
  return full;
}
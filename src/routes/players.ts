import { Hono } from "hono";
import type { Env, Player } from "../types";

const players = new Hono<{ Bindings: Env }>();

players.get("/search", async (c) => {
  const q = c.req.query("q") || "";
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM players WHERE first_name LIKE ? OR last_name LIKE ? ORDER BY last_name, first_name"
  ).bind(`%${q}%`, `%${q}%`).all<Player>();
  return c.json(rows.results ?? []);
});

players.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const player = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first<Player>();
  if (!player) return c.json({ error: "Not found" }, 404);
  const team = player.team_id
    ? await c.env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(player.team_id).first()
    : null;
  const lineups = await c.env.DB.prepare(
    `SELECT lu.*, ml.name line_name, ml.match_id, m.match_date, m.home_team_id, m.away_team_id
     FROM lineups lu JOIN match_lines ml ON ml.id=lu.match_line_id JOIN matches m ON m.id=ml.match_id
     WHERE lu.home_player1_id=? OR lu.home_player2_id=? OR lu.away_player1_id=? OR lu.away_player2_id=?`
  ).bind(id, id, id, id).all();
  const history = [];
  for (const lu of lineups.results ?? []) {
    const row = lu as { match_line_id: number; line_name: string; match_id: number; match_date: string; home_team_id: number; away_team_id: number; home_player1_id: number; home_player2_id: number; away_player1_id: number; away_player2_id: number };
    const result = await c.env.DB.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(row.match_line_id).first();
    const home = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(row.home_team_id).first<{ name: string }>();
    const away = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(row.away_team_id).first<{ name: string }>();
    const side = [row.home_player1_id, row.home_player2_id].includes(id) ? "home" : "away";
    const won = result && (result as { winner: string }).winner === side;
    history.push({ match_id: row.match_id, match_date: row.match_date, line_name: row.line_name, home: home?.name, away: away?.name, won, result });
  }
  history.sort((a, b) => b.match_date.localeCompare(a.match_date));
  const line_wins = history.filter((h) => h.won).length;
  const line_losses = history.filter((h) => h.result && !h.won).length;
  return c.json({
    player, team, history,
    line_wins, line_losses,
    win_pct: line_wins + line_losses ? Math.round(100 * line_wins / (line_wins + line_losses)) : 0,
  });
});

export default players;
import { Hono } from "hono";
import { getUser } from "../auth";
import { createMatchLines, updateMatchStatus } from "../services/matches";
import { computeStandings } from "../services/standings";
import { ratingWarnings, validateLineScoreEntry } from "../services/validation";
import type { Env, Lineup, LineResult, Match, MatchLine, Player, Side, User } from "../types";

const matches = new Hono<{ Bindings: Env }>();

matches.get("/calendar", async (c) => {
  const year = Number(c.req.query("year")) || new Date().getFullYear();
  const month = Number(c.req.query("month")) || new Date().getMonth() + 1;
  const leagueId = c.req.query("league_id");
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${endDay}`;
  let sql = "SELECT m.*, ht.name as home_name, at.name as away_name FROM matches m JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id WHERE m.match_date BETWEEN ? AND ?";
  const binds: (string | number)[] = [start, end];
  if (leagueId) { sql += " AND m.league_id = ?"; binds.push(Number(leagueId)); }
  sql += " ORDER BY m.match_date";
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(rows.results ?? []);
});

matches.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const match = await c.env.DB.prepare(
    `SELECT m.*, ht.name home_name, at.name away_name, l.name league_name
     FROM matches m JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id
     JOIN leagues l ON l.id=m.league_id WHERE m.id = ?`
  ).bind(id).first();
  if (!match) return c.json({ error: "Not found" }, 404);
  const lines = await c.env.DB.prepare("SELECT * FROM match_lines WHERE match_id = ? ORDER BY sort_order").bind(id).all<MatchLine>();
  const lineData = [];
  for (const line of lines.results ?? []) {
    const lineup = await c.env.DB.prepare("SELECT * FROM lineups WHERE match_line_id = ?").bind(line.id).first<Lineup>();
    const result = await c.env.DB.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(line.id).first<LineResult>();
    lineData.push({ line, lineup, result });
  }
  const user = await getUser(c);
  const loggedIn = !!user;
  return c.json({ match, lineData, can_edit: loggedIn, can_score: loggedIn });
});

matches.post("/", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const b = await c.req.json<{ league_id?: number; home_team_id?: number; away_team_id?: number; match_date?: string; location?: string }>();
  if (b.home_team_id === b.away_team_id) return c.json({ error: "Teams must differ" }, 400);
  const r = await c.env.DB.prepare(
    "INSERT INTO matches (league_id, home_team_id, away_team_id, match_date, location) VALUES (?, ?, ?, ?, ?)"
  ).bind(b.league_id, b.home_team_id, b.away_team_id, b.match_date, b.location?.trim() || null).run();
  const match = await c.env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(r.meta.last_row_id).first<Match>();
  if (match) await createMatchLines(c.env.DB, match);
  return c.json(match, 201);
});

matches.put("/:id/lineup", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const matchId = Number(c.req.param("id"));
  const match = await c.env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<Match>();
  if (!match) return c.json({ error: "Not found" }, 404);
  const { lineups } = await c.req.json<{ lineups: Array<{ match_line_id: number; home_player1_id?: number; home_player2_id?: number; away_player1_id?: number; away_player2_id?: number }> }>();
  const warnings: string[] = [];
  const players = await c.env.DB.prepare("SELECT * FROM players").all<Player>();
  const pmap = new Map((players.results ?? []).map((p) => [p.id, p]));
  for (const lu of lineups) {
    const line = await c.env.DB.prepare("SELECT * FROM match_lines WHERE id = ?").bind(lu.match_line_id).first<MatchLine>();
    const hp = [pmap.get(lu.home_player1_id!), line?.is_doubles ? pmap.get(lu.home_player2_id!) : undefined].filter(Boolean) as Player[];
    const ap = [pmap.get(lu.away_player1_id!), line?.is_doubles ? pmap.get(lu.away_player2_id!) : undefined].filter(Boolean) as Player[];
    warnings.push(...ratingWarnings(hp, ap));
    const existing = await c.env.DB.prepare("SELECT id FROM lineups WHERE match_line_id = ?").bind(lu.match_line_id).first();
    if (existing) {
      await c.env.DB.prepare("UPDATE lineups SET home_player1_id=?, home_player2_id=?, away_player1_id=?, away_player2_id=?, updated_at=datetime('now') WHERE match_line_id=?")
        .bind(lu.home_player1_id ?? null, lu.home_player2_id ?? null, lu.away_player1_id ?? null, lu.away_player2_id ?? null, lu.match_line_id).run();
    } else {
      await c.env.DB.prepare("INSERT INTO lineups (match_line_id, home_player1_id, home_player2_id, away_player1_id, away_player2_id) VALUES (?, ?, ?, ?, ?)")
        .bind(lu.match_line_id, lu.home_player1_id ?? null, lu.home_player2_id ?? null, lu.away_player1_id ?? null, lu.away_player2_id ?? null).run();
    }
  }
  await updateMatchStatus(c.env.DB, matchId);
  return c.json({ ok: true, warnings });
});

matches.put("/:id/scores", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const matchId = Number(c.req.param("id"));
  const match = await c.env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<Match>();
  if (!match) return c.json({ error: "Not found" }, 404);
  const { scores } = await c.req.json<{ scores: Array<{
    match_line_id: number;
    winner: Side;
    home_set1?: number; away_set1?: number; home_tb1?: number; away_tb1?: number;
    home_set2?: number; away_set2?: number; home_tb2?: number; away_tb2?: number;
    home_set3?: number; away_set3?: number; home_tb3?: number; away_tb3?: number;
    home_players_text?: string; away_players_text?: string;
  }> }>();
  const errors: string[] = [];
  for (const s of scores) {
    const line = await c.env.DB.prepare("SELECT name FROM match_lines WHERE id = ?").bind(s.match_line_id).first<{ name: string }>();
    const parsed = {
      home_set1: s.home_set1 ?? 0, away_set1: s.away_set1 ?? 0, home_tb1: s.home_tb1 ?? null, away_tb1: s.away_tb1 ?? null,
      home_set2: s.home_set2 ?? 0, away_set2: s.away_set2 ?? 0, home_tb2: s.home_tb2 ?? null, away_tb2: s.away_tb2 ?? null,
      home_set3: s.home_set3 ?? null, away_set3: s.away_set3 ?? null, home_tb3: s.home_tb3 ?? null, away_tb3: s.away_tb3 ?? null,
    };
    const vr = validateLineScoreEntry(parsed, s.winner);
    if (!vr.ok) { errors.push(...vr.errors.map((e) => `${line?.name}: ${e}`)); continue; }
    const winner = s.winner;
    const homeText = s.home_players_text?.trim() || null;
    const awayText = s.away_players_text?.trim() || null;
    if (homeText || awayText) {
      const existingLu = await c.env.DB.prepare("SELECT id FROM lineups WHERE match_line_id = ?").bind(s.match_line_id).first();
      if (existingLu) {
        await c.env.DB.prepare("UPDATE lineups SET home_players_text=?, away_players_text=?, updated_at=datetime('now') WHERE match_line_id=?")
          .bind(homeText, awayText, s.match_line_id).run();
      } else {
        await c.env.DB.prepare("INSERT INTO lineups (match_line_id, home_players_text, away_players_text) VALUES (?, ?, ?)")
          .bind(s.match_line_id, homeText, awayText).run();
      }
    }
    const existing = await c.env.DB.prepare("SELECT id FROM line_results WHERE match_line_id = ?").bind(s.match_line_id).first();
    if (existing) {
      await c.env.DB.prepare(`UPDATE line_results SET home_set1=?,away_set1=?,home_tb1=?,away_tb1=?,home_set2=?,away_set2=?,home_tb2=?,away_tb2=?,
        home_set3=?,away_set3=?,home_tb3=?,away_tb3=?,winner=?,submitted_by_id=?,submitted_at=datetime('now') WHERE match_line_id=?`)
        .bind(parsed.home_set1,parsed.away_set1,parsed.home_tb1,parsed.away_tb1,parsed.home_set2,parsed.away_set2,parsed.home_tb2,parsed.away_tb2,
          parsed.home_set3,parsed.away_set3,parsed.home_tb3,parsed.away_tb3,winner,user.id,s.match_line_id).run();
    } else {
      await c.env.DB.prepare(`INSERT INTO line_results (match_line_id,home_set1,away_set1,home_tb1,away_tb1,home_set2,away_set2,home_tb2,away_tb2,home_set3,away_set3,home_tb3,away_tb3,winner,submitted_by_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(s.match_line_id,parsed.home_set1,parsed.away_set1,parsed.home_tb1,parsed.away_tb1,parsed.home_set2,parsed.away_set2,parsed.home_tb2,parsed.away_tb2,
          parsed.home_set3,parsed.away_set3,parsed.home_tb3,parsed.away_tb3,winner,user.id).run();
    }
  }
  if (errors.length) return c.json({ error: errors.join("; ") }, 400);
  await updateMatchStatus(c.env.DB, matchId);
  return c.json({ ok: true });
});

export default matches;
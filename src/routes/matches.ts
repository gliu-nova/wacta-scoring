import { Hono } from "hono";
import { getUser } from "../auth";
import { logActivity, logActivityLinked } from "../services/activity";
import { buildLineupChangeDetails, buildMatchChangeDetails, buildScoreChangeDetails } from "../services/changes";
import { createMatchLines, updateMatchStatus } from "../services/matches";
import {
  approvePendingSubmission,
  createPendingSubmission,
  getPendingCount,
  listPendingSubmissions,
  rejectPendingSubmission,
  type GuestScoreEntry,
} from "../services/pending";
import { applyScores } from "../services/scores";
import { ratingWarnings } from "../services/validation";
import type { Env, Lineup, LineResult, LineWinner, Match, MatchLine, Player } from "../types";

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

matches.get("/recent", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 10, 25);
  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.match_date, m.status, l.name as league_name,
      ht.name as home_name, at.name as away_name,
      MAX(lr.submitted_at) as updated_at, COUNT(lr.id) as lines_scored
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    JOIN leagues l ON l.id = m.league_id
    JOIN match_lines ml ON ml.match_id = m.id
    JOIN line_results lr ON lr.match_line_id = ml.id
    GROUP BY m.id
    ORDER BY updated_at DESC
    LIMIT ?`
  ).bind(limit).all();
  return c.json(rows.results ?? []);
});

matches.get("/pending", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json(await listPendingSubmissions(c.env.DB));
});

matches.get("/pending/count", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ count: await getPendingCount(c.env.DB) });
});

matches.post("/submit", async (c) => {
  const b = await c.req.json<{
    league_id?: number;
    home_team_id?: number;
    away_team_id?: number;
    match_date?: string;
    location?: string;
    scores?: GuestScoreEntry[];
  }>();
  if (!b.league_id || !b.home_team_id || !b.away_team_id || !b.match_date || !b.scores?.length) {
    return c.json({ error: "Missing required fields" }, 400);
  }
  const result = await createPendingSubmission(c.env.DB, {
    league_id: b.league_id,
    home_team_id: b.home_team_id,
    away_team_id: b.away_team_id,
    match_date: b.match_date,
    location: b.location,
    scores: b.scores,
  });
  if ("errors" in result) return c.json({ error: result.errors.join("; ") }, 400);
  const info = await c.env.DB.prepare(
    "SELECT ht.name as home_name, at.name as away_name FROM teams ht, teams at WHERE ht.id = ? AND at.id = ?"
  ).bind(b.home_team_id, b.away_team_id).first<{ home_name: string; away_name: string }>();
  if (info) {
    await logActivity(c.env.DB, null, `Guest submitted match results: ${info.home_name} vs ${info.away_name} (pending approval)`, "/approvals.html");
  }
  return c.json({ ok: true, pending: true, id: result.id }, 201);
});

matches.post("/pending/:id/approve", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const result = await approvePendingSubmission(c.env.DB, Number(c.req.param("id")), user);
  if ("error" in result) return c.json({ error: result.error }, result.error === "Not found" ? 404 : 400);
  return c.json(result);
});

matches.post("/pending/:id/reject", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const result = await rejectPendingSubmission(c.env.DB, Number(c.req.param("id")), user);
  if ("error" in result) return c.json({ error: result.error }, 404);
  return c.json(result);
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

matches.put("/:id", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const matchId = Number(c.req.param("id"));
  const match = await c.env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<Match>();
  if (!match) return c.json({ error: "Not found" }, 404);
  const b = await c.req.json<{ match_date?: string; location?: string; home_team_id?: number; away_team_id?: number }>();
  const homeId = b.home_team_id ?? match.home_team_id;
  const awayId = b.away_team_id ?? match.away_team_id;
  if (homeId === awayId) return c.json({ error: "Teams must differ" }, 400);
  if (b.home_team_id || b.away_team_id) {
    for (const tid of [homeId, awayId]) {
      const team = await c.env.DB.prepare("SELECT id FROM teams WHERE id = ? AND league_id = ?").bind(tid, match.league_id).first();
      if (!team) return c.json({ error: "Teams must belong to this match's league" }, 400);
    }
  }
  const details = await buildMatchChangeDetails(c.env.DB, match, b);
  await c.env.DB.prepare(
    "UPDATE matches SET match_date = ?, location = ?, home_team_id = ?, away_team_id = ? WHERE id = ?"
  ).bind(
    b.match_date ?? match.match_date,
    b.location !== undefined ? (b.location?.trim() || null) : match.location,
    homeId, awayId, matchId,
  ).run();
  const info = await c.env.DB.prepare(
    `SELECT ht.name as home_name, at.name as away_name FROM matches m
     JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id WHERE m.id = ?`
  ).bind(matchId).first<{ home_name: string; away_name: string }>();
  if (info && details) {
    await logActivityLinked(c.env.DB, user, `Updated match ${info.home_name} vs ${info.away_name}`, `/match.html?id=${matchId}`, details);
  }
  return c.json({ ok: true });
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
  const info = await c.env.DB.prepare(
    `SELECT ht.name as home_name, at.name as away_name, l.name as league_name
     FROM matches m JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id
     JOIN leagues l ON l.id=m.league_id WHERE m.id = ?`
  ).bind(match?.id).first<{ home_name: string; away_name: string; league_name: string }>();
  if (info) {
    await logActivityLinked(c.env.DB, user, `Created match ${info.home_name} vs ${info.away_name} (${info.league_name})`,
      `/match.html?id=${match?.id}`, { subtitle: `${b.match_date}${b.location ? ` · ${b.location.trim()}` : ""}` });
  }
  return c.json(match, 201);
});

matches.put("/:id/lineup", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const matchId = Number(c.req.param("id"));
  const match = await c.env.DB.prepare("SELECT * FROM matches WHERE id = ?").bind(matchId).first<Match>();
  if (!match) return c.json({ error: "Not found" }, 404);
  const { lineups } = await c.req.json<{ lineups: Array<{
    match_line_id: number;
    home_player1_id?: number; home_player2_id?: number;
    away_player1_id?: number; away_player2_id?: number;
    home_players_text?: string; away_players_text?: string;
  }> }>();
  const warnings: string[] = [];
  const players = await c.env.DB.prepare("SELECT * FROM players").all<Player>();
  const pmap = new Map((players.results ?? []).map((p) => [p.id, p]));
  const lineupDetails = await buildLineupChangeDetails(c.env.DB, lineups, pmap);
  for (const lu of lineups) {
    const line = await c.env.DB.prepare("SELECT * FROM match_lines WHERE id = ?").bind(lu.match_line_id).first<MatchLine>();
    const hp = [pmap.get(lu.home_player1_id!), line?.is_doubles ? pmap.get(lu.home_player2_id!) : undefined].filter(Boolean) as Player[];
    const ap = [pmap.get(lu.away_player1_id!), line?.is_doubles ? pmap.get(lu.away_player2_id!) : undefined].filter(Boolean) as Player[];
    warnings.push(...ratingWarnings(hp, ap));
    const existing = await c.env.DB.prepare("SELECT id FROM lineups WHERE match_line_id = ?").bind(lu.match_line_id).first();
    const homeText = lu.home_players_text?.trim() || null;
    const awayText = lu.away_players_text?.trim() || null;
    if (existing) {
      await c.env.DB.prepare(`UPDATE lineups SET home_player1_id=?, home_player2_id=?, away_player1_id=?, away_player2_id=?,
        home_players_text=?, away_players_text=?, updated_at=datetime('now') WHERE match_line_id=?`)
        .bind(lu.home_player1_id ?? null, lu.home_player2_id ?? null, lu.away_player1_id ?? null, lu.away_player2_id ?? null,
          homeText, awayText, lu.match_line_id).run();
    } else {
      await c.env.DB.prepare(`INSERT INTO lineups (match_line_id, home_player1_id, home_player2_id, away_player1_id, away_player2_id, home_players_text, away_players_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(lu.match_line_id, lu.home_player1_id ?? null, lu.home_player2_id ?? null, lu.away_player1_id ?? null, lu.away_player2_id ?? null,
          homeText, awayText).run();
    }
  }
  await updateMatchStatus(c.env.DB, matchId);
  const info = await c.env.DB.prepare(
    `SELECT ht.name as home_name, at.name as away_name FROM matches m
     JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id WHERE m.id = ?`
  ).bind(matchId).first<{ home_name: string; away_name: string }>();
  if (info && lineupDetails) {
    await logActivityLinked(c.env.DB, user, `Updated lineup for ${info.home_name} vs ${info.away_name}`, `/match.html?id=${matchId}`, lineupDetails);
  }
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
    winner: LineWinner;
    home_set1?: number; away_set1?: number; home_tb1?: number; away_tb1?: number;
    home_set2?: number; away_set2?: number; home_tb2?: number; away_tb2?: number;
    home_set3?: number; away_set3?: number; home_tb3?: number; away_tb3?: number;
    home_players_text?: string; away_players_text?: string;
  }> }>();
  const info = await c.env.DB.prepare(
    `SELECT ht.name as home_name, at.name as away_name FROM matches m
     JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id WHERE m.id = ?`
  ).bind(matchId).first<{ home_name: string; away_name: string }>();
  const scoreDetails = info ? await buildScoreChangeDetails(c.env.DB, scores, info.home_name, info.away_name) : null;
  const errors = await applyScores(c.env.DB, matchId, scores, user.id);
  if (errors.length) return c.json({ error: errors.join("; ") }, 400);
  if (info && scoreDetails) {
    const title = scoreDetails.subtitle?.includes("→") ? `Updated scores for ${info.home_name} vs ${info.away_name}` : `Submitted scores for ${info.home_name} vs ${info.away_name}`;
    await logActivityLinked(c.env.DB, user, title, `/match.html?id=${matchId}`, scoreDetails);
  }
  return c.json({ ok: true });
});

export default matches;
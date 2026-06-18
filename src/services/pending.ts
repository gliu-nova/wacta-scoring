import { logActivity } from "./activity";
import { createMatchLines } from "./matches";
import { applyScores, type ScoreEntry } from "./scores";
import { validateLineScoreEntry } from "./validation";
import type { LeagueLineTemplate, Match, User } from "../types";

export type GuestScoreEntry = Omit<ScoreEntry, "match_line_id"> & { line_template_id: number };

type PendingRow = {
  id: number;
  league_id: number;
  home_team_id: number;
  away_team_id: number;
  match_date: string;
  location: string | null;
  scores_json: string;
  status: string;
  submitted_at: string;
  reviewed_by_id: number | null;
  reviewed_at: string | null;
  match_id: number | null;
};

export type PendingSubmission = {
  id: number;
  league_id: number;
  league_name: string;
  home_team_id: number;
  away_team_id: number;
  home_name: string;
  away_name: string;
  match_date: string;
  location: string | null;
  submitted_at: string;
  scores: Array<GuestScoreEntry & { line_name: string }>;
};

function parseGuestScore(s: GuestScoreEntry) {
  return {
    home_set1: s.home_set1 ?? 0,
    away_set1: s.away_set1 ?? 0,
    home_tb1: s.home_tb1 != null && s.home_tb1 !== "" ? Number(s.home_tb1) : null,
    away_tb1: s.away_tb1 != null && s.away_tb1 !== "" ? Number(s.away_tb1) : null,
    home_set2: s.home_set2 ?? 0,
    away_set2: s.away_set2 ?? 0,
    home_tb2: s.home_tb2 != null && s.home_tb2 !== "" ? Number(s.home_tb2) : null,
    away_tb2: s.away_tb2 != null && s.away_tb2 !== "" ? Number(s.away_tb2) : null,
    home_set3: s.home_set3 ?? null,
    away_set3: s.away_set3 ?? null,
    home_tb3: s.home_tb3 != null && s.home_tb3 !== "" ? Number(s.home_tb3) : null,
    away_tb3: s.away_tb3 != null && s.away_tb3 !== "" ? Number(s.away_tb3) : null,
  };
}

export async function validateGuestSubmission(
  db: D1Database,
  leagueId: number,
  homeTeamId: number,
  awayTeamId: number,
  scores: GuestScoreEntry[],
): Promise<string[]> {
  const errors: string[] = [];
  if (homeTeamId === awayTeamId) errors.push("Teams must differ");
  const home = await db.prepare("SELECT id FROM teams WHERE id = ? AND league_id = ?").bind(homeTeamId, leagueId).first();
  const away = await db.prepare("SELECT id FROM teams WHERE id = ? AND league_id = ?").bind(awayTeamId, leagueId).first();
  if (!home || !away) errors.push("Invalid teams for this league");
  const templates = await db.prepare(
    "SELECT * FROM league_line_templates WHERE league_id = ? ORDER BY sort_order"
  ).bind(leagueId).all<LeagueLineTemplate>();
  const tmap = new Map((templates.results ?? []).map((t) => [t.id, t]));
  if (!tmap.size) errors.push("League has no line templates");
  for (const s of scores) {
    const t = tmap.get(s.line_template_id);
    if (!t) {
      errors.push(`Unknown line ${s.line_template_id}`);
      continue;
    }
    const vr = validateLineScoreEntry(parseGuestScore(s), s.winner);
    if (!vr.ok) errors.push(...vr.errors.map((e) => `${t.name}: ${e}`));
  }
  return errors;
}

async function enrichPending(db: D1Database, row: PendingRow): Promise<PendingSubmission> {
  const info = await db.prepare(
    `SELECT l.name as league_name, ht.name as home_name, at.name as away_name
     FROM leagues l
     JOIN teams ht ON ht.id = ?
     JOIN teams at ON at.id = ?
     WHERE l.id = ?`
  ).bind(row.home_team_id, row.away_team_id, row.league_id).first<{ league_name: string; home_name: string; away_name: string }>();
  const scores = JSON.parse(row.scores_json) as GuestScoreEntry[];
  const templates = await db.prepare(
    "SELECT id, name FROM league_line_templates WHERE league_id = ?"
  ).bind(row.league_id).all<{ id: number; name: string }>();
  const tmap = new Map((templates.results ?? []).map((t) => [t.id, t.name]));
  return {
    id: row.id,
    league_id: row.league_id,
    league_name: info?.league_name ?? "",
    home_team_id: row.home_team_id,
    away_team_id: row.away_team_id,
    home_name: info?.home_name ?? "",
    away_name: info?.away_name ?? "",
    match_date: row.match_date,
    location: row.location,
    submitted_at: row.submitted_at,
    scores: scores.map((s) => ({ ...s, line_name: tmap.get(s.line_template_id) ?? "Line" })),
  };
}

export async function createPendingSubmission(
  db: D1Database,
  body: {
    league_id: number;
    home_team_id: number;
    away_team_id: number;
    match_date: string;
    location?: string;
    scores: GuestScoreEntry[];
  },
): Promise<{ id: number } | { errors: string[] }> {
  const errors = await validateGuestSubmission(db, body.league_id, body.home_team_id, body.away_team_id, body.scores);
  if (errors.length) return { errors };
  const r = await db.prepare(
    "INSERT INTO pending_submissions (league_id, home_team_id, away_team_id, match_date, location, scores_json) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(body.league_id, body.home_team_id, body.away_team_id, body.match_date, body.location?.trim() || null, JSON.stringify(body.scores)).run();
  return { id: Number(r.meta.last_row_id) };
}

export async function listPendingSubmissions(db: D1Database): Promise<PendingSubmission[]> {
  const rows = await db.prepare(
    "SELECT * FROM pending_submissions WHERE status = 'pending' ORDER BY submitted_at DESC"
  ).all<PendingRow>();
  return Promise.all((rows.results ?? []).map((r) => enrichPending(db, r)));
}

export async function getPendingCount(db: D1Database): Promise<number> {
  return (await db.prepare("SELECT COUNT(*) as n FROM pending_submissions WHERE status = 'pending'").first<{ n: number }>())?.n ?? 0;
}

async function matchLabel(db: D1Database, homeId: number, awayId: number) {
  const info = await db.prepare(
    "SELECT ht.name as home_name, at.name as away_name FROM teams ht, teams at WHERE ht.id = ? AND at.id = ?"
  ).bind(homeId, awayId).first<{ home_name: string; away_name: string }>();
  return info ? `${info.home_name} vs ${info.away_name}` : "match";
}

export async function approvePendingSubmission(db: D1Database, id: number, user: User): Promise<{ match_id: number } | { error: string }> {
  const row = await db.prepare("SELECT * FROM pending_submissions WHERE id = ? AND status = 'pending'").bind(id).first<PendingRow>();
  if (!row) return { error: "Not found" };
  const scores = JSON.parse(row.scores_json) as GuestScoreEntry[];
  const r = await db.prepare(
    "INSERT INTO matches (league_id, home_team_id, away_team_id, match_date, location) VALUES (?, ?, ?, ?, ?)"
  ).bind(row.league_id, row.home_team_id, row.away_team_id, row.match_date, row.location).run();
  const match = await db.prepare("SELECT * FROM matches WHERE id = ?").bind(r.meta.last_row_id).first<Match>();
  if (!match) return { error: "Failed to create match" };
  await createMatchLines(db, match);
  const templates = await db.prepare(
    "SELECT id FROM league_line_templates WHERE league_id = ? ORDER BY sort_order"
  ).bind(row.league_id).all<{ id: number }>();
  const matchLines = await db.prepare(
    "SELECT id FROM match_lines WHERE match_id = ? ORDER BY sort_order"
  ).bind(match.id).all<{ id: number }>();
  const templateToLine = new Map<number, number>();
  (templates.results ?? []).forEach((t, i) => {
    const line = matchLines.results?.[i];
    if (line) templateToLine.set(t.id, line.id);
  });
  const scoreEntries: ScoreEntry[] = scores.map((s) => ({
    ...s,
    match_line_id: templateToLine.get(s.line_template_id)!,
  })).filter((s) => s.match_line_id);
  const errors = await applyScores(db, match.id, scoreEntries, user.id);
  if (errors.length) {
    await db.prepare("DELETE FROM matches WHERE id = ?").bind(match.id).run();
    return { error: errors.join("; ") };
  }
  await db.prepare(
    "UPDATE pending_submissions SET status = 'approved', reviewed_by_id = ?, reviewed_at = datetime('now'), match_id = ? WHERE id = ?"
  ).bind(user.id, match.id, id).run();
  const label = await matchLabel(db, row.home_team_id, row.away_team_id);
  await logActivity(db, user, `Approved match results: ${label}`, `/match.html?id=${match.id}`);
  return { match_id: match.id };
}

export async function rejectPendingSubmission(db: D1Database, id: number, user: User): Promise<{ ok: true } | { error: string }> {
  const row = await db.prepare("SELECT * FROM pending_submissions WHERE id = ? AND status = 'pending'").bind(id).first<PendingRow>();
  if (!row) return { error: "Not found" };
  await db.prepare(
    "UPDATE pending_submissions SET status = 'rejected', reviewed_by_id = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).bind(user.id, id).run();
  const label = await matchLabel(db, row.home_team_id, row.away_team_id);
  await logActivity(db, user, `Rejected match results: ${label}`);
  return { ok: true };
}
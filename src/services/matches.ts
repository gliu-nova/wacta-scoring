import type { LeagueLineTemplate, Match, MatchStatus } from "../types";

export async function createMatchLines(db: D1Database, match: Match): Promise<void> {
  const templates = await db.prepare(
    "SELECT * FROM league_line_templates WHERE league_id = ? ORDER BY sort_order"
  ).bind(match.league_id).all<LeagueLineTemplate>();
  for (const t of templates.results ?? []) {
    await db.prepare(
      "INSERT INTO match_lines (match_id, name, sort_order, is_doubles, max_combined_rating) VALUES (?, ?, ?, ?, ?)"
    ).bind(match.id, t.name, t.sort_order, t.is_doubles, t.max_combined_rating).run();
  }
}

export async function updateMatchStatus(db: D1Database, matchId: number): Promise<void> {
  const lines = await db.prepare("SELECT id FROM match_lines WHERE match_id = ?").bind(matchId).all<{ id: number }>();
  let hasLineup = false, scored = 0;
  for (const l of lines.results ?? []) {
    const lu = await db.prepare("SELECT id FROM lineups WHERE match_line_id = ?").bind(l.id).first();
    if (lu) hasLineup = true;
    const r = await db.prepare("SELECT id FROM line_results WHERE match_line_id = ?").bind(l.id).first();
    if (r) scored++;
  }
  const total = lines.results?.length ?? 0;
  let status: MatchStatus = "scheduled";
  if (scored === total && total > 0) status = "completed";
  else if (scored > 0) status = "in_progress";
  else if (hasLineup) status = "lineup_set";
  await db.prepare("UPDATE matches SET status = ? WHERE id = ?").bind(status, matchId).run();
}
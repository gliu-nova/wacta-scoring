import type { LineResult, Side, TeamStanding } from "../types";
import { setWinner } from "./validation";

function countGames(r: LineResult, side: Side): [number, number] {
  const sets: [number, number, number | null, number | null][] = [
    [r.home_set1, r.away_set1, r.home_tb1, r.away_tb1],
    [r.home_set2, r.away_set2, r.home_tb2, r.away_tb2],
  ];
  if (r.home_set3 != null && r.away_set3 != null) sets.push([r.home_set3, r.away_set3, r.home_tb3, r.away_tb3]);
  let won = 0, lost = 0;
  for (const [h, a, htb, atb] of sets) {
    const sw = setWinner(h, a, htb, atb);
    const [hg, ag] = h === 6 && a === 6 ? (sw === "home" ? [7, 6] : [6, 7]) : [h, a];
    if (side === "home") { won += hg; lost += ag; } else { won += ag; lost += hg; }
  }
  return [won, lost];
}

const emptyStanding = (id: number, name: string): TeamStanding => ({
  team_id: id, team_name: name,
  matches_played: 0, match_wins: 0, match_losses: 0, match_ties: 0,
  line_wins: 0, line_losses: 0, line_ties: 0,
  games_won: 0, games_lost: 0, match_win_pct: 0, game_win_pct: 0,
});

export async function computeStandings(db: D1Database, leagueId: number): Promise<TeamStanding[]> {
  const teams = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(leagueId).all<{ id: number; name: string }>();
  const map = new Map<number, TeamStanding>();
  for (const t of teams.results ?? []) map.set(t.id, emptyStanding(t.id, t.name));

  const matches = await db.prepare("SELECT * FROM matches WHERE league_id = ? AND status = 'completed'").bind(leagueId).all();
  for (const m of matches.results ?? []) {
    const match = m as { id: number; home_team_id: number; away_team_id: number };
    const lines = await db.prepare("SELECT id FROM match_lines WHERE match_id = ?").bind(match.id).all<{ id: number }>();
    let homeLines = 0, awayLines = 0, lineResults = 0;
    for (const line of lines.results ?? []) {
      const r = await db.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(line.id).first<LineResult>();
      if (!r) continue;
      lineResults++;
      const [hw, hl] = countGames(r, "home");
      const [aw, al] = countGames(r, "away");
      map.get(match.home_team_id)!.games_won += hw; map.get(match.home_team_id)!.games_lost += hl;
      map.get(match.away_team_id)!.games_won += aw; map.get(match.away_team_id)!.games_lost += al;
      if (r.winner === "home") {
        homeLines++;
        map.get(match.home_team_id)!.line_wins++; map.get(match.away_team_id)!.line_losses++;
      } else if (r.winner === "away") {
        awayLines++;
        map.get(match.away_team_id)!.line_wins++; map.get(match.home_team_id)!.line_losses++;
      } else {
        map.get(match.home_team_id)!.line_ties++; map.get(match.away_team_id)!.line_ties++;
      }
    }
    if (lineResults === 0) continue;
    map.get(match.home_team_id)!.matches_played++;
    map.get(match.away_team_id)!.matches_played++;
    if (homeLines > awayLines) {
      map.get(match.home_team_id)!.match_wins++; map.get(match.away_team_id)!.match_losses++;
    } else if (awayLines > homeLines) {
      map.get(match.away_team_id)!.match_wins++; map.get(match.home_team_id)!.match_losses++;
    } else {
      map.get(match.home_team_id)!.match_ties++; map.get(match.away_team_id)!.match_ties++;
    }
  }

  const standings = [...map.values()].map((s) => ({
    ...s,
    match_win_pct: s.matches_played ? Math.round(100 * s.match_wins / s.matches_played * 10) / 10 : 0,
    game_win_pct: s.games_won + s.games_lost ? Math.round(100 * s.games_won / (s.games_won + s.games_lost) * 10) / 10 : 0,
  }));
  return standings.sort((a, b) =>
    b.match_wins - a.match_wins || b.match_ties - a.match_ties
    || b.game_win_pct - a.game_win_pct || a.team_name.localeCompare(b.team_name));
}
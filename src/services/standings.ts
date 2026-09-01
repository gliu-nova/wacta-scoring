import type { LineResult, LineWinner, Side, TeamStanding } from "../types";
import { setWinner } from "./validation";

/** Games won/lost for a side. Set scores are order-independent: the line winner
 *  gets the higher game count in each set, the loser the lower (e.g. winner +
 *  6-3 6-2 → 12 games to 5). Ties keep the entered home/away split. */
export function countGames(r: LineResult, side: Side): [number, number] {
  let won = 0, lost = 0;
  for (const [h, a, htb, atb] of lineSets(r)) {
    const sw = setWinner(h, a, htb, atb);
    const [hg, ag] = h === 6 && a === 6
      ? (sw === "home" ? [7, 6] : sw === "away" ? [6, 7] : [6, 6])
      : [h, a];
    if (r.winner === "tie") {
      if (side === "home") { won += hg; lost += ag; } else { won += ag; lost += hg; }
    } else {
      const high = Math.max(hg, ag);
      const low = Math.min(hg, ag);
      if (side === r.winner) { won += high; lost += low; } else { won += low; lost += high; }
    }
  }
  return [won, lost];
}

function lineSets(r: LineResult): [number, number, number | null, number | null][] {
  const sets: [number, number, number | null, number | null][] = [
    [r.home_set1, r.away_set1, r.home_tb1, r.away_tb1],
    [r.home_set2, r.away_set2, r.home_tb2, r.away_tb2],
  ];
  if (r.home_set3 != null && r.away_set3 != null) sets.push([r.home_set3, r.away_set3, r.home_tb3, r.away_tb3]);
  return sets;
}

/** Sets won by home and away on a line. A line win is 2-0, or 2-1 when a third
 *  set was played (independent of box order). Tied lines use entered set winners. */
export function countSets(r: LineResult): [number, number] {
  if (r.winner === "tie") {
    let home = 0, away = 0;
    for (const [h, a, htb, atb] of lineSets(r)) {
      const w = setWinner(h, a, htb, atb);
      if (w === "home") home++;
      else if (w === "away") away++;
    }
    return [home, away];
  }
  const third = r.home_set3 != null && r.away_set3 != null;
  const winnerSets = 2;
  const loserSets = third ? 1 : 0;
  return r.winner === "home" ? [winnerSets, loserSets] : [loserSets, winnerSets];
}

/** Match winner from line wins, then sets, then games. Equal on all three is a tie. */
export function matchWinner(lines: LineResult[]): LineWinner {
  let homeLines = 0, awayLines = 0;
  let homeSets = 0, awaySets = 0;
  let homeGames = 0, awayGames = 0;
  for (const r of lines) {
    if (r.winner === "home") homeLines++;
    else if (r.winner === "away") awayLines++;
    const [hs, as] = countSets(r);
    homeSets += hs;
    awaySets += as;
    homeGames += countGames(r, "home")[0];
    awayGames += countGames(r, "away")[0];
  }
  if (homeLines !== awayLines) return homeLines > awayLines ? "home" : "away";
  if (homeSets !== awaySets) return homeSets > awaySets ? "home" : "away";
  if (homeGames !== awayGames) return homeGames > awayGames ? "home" : "away";
  return "tie";
}

const emptyStanding = (id: number, name: string): TeamStanding => ({
  team_id: id, team_name: name,
  matches_played: 0, match_wins: 0, match_losses: 0, match_ties: 0,
  line_wins: 0, line_losses: 0, line_ties: 0,
  games_won: 0, games_lost: 0, match_win_pct: 0, game_win_pct: 0,
});

export type StandingMatchInput = {
  home_team_id: number;
  away_team_id: number;
  lines: LineResult[];
};

/** Pure standings from in-memory match/line results (for tests and DB-backed compute). */
export function computeStandingsFromMatches(
  teams: { id: number; name: string }[],
  matches: StandingMatchInput[],
): TeamStanding[] {
  const map = new Map<number, TeamStanding>();
  for (const t of teams) map.set(t.id, emptyStanding(t.id, t.name));

  for (const match of matches) {
    let lineResults = 0;
    for (const r of match.lines) {
      lineResults++;
      const [hw, hl] = countGames(r, "home");
      const [aw, al] = countGames(r, "away");
      map.get(match.home_team_id)!.games_won += hw; map.get(match.home_team_id)!.games_lost += hl;
      map.get(match.away_team_id)!.games_won += aw; map.get(match.away_team_id)!.games_lost += al;
      if (r.winner === "home") {
        map.get(match.home_team_id)!.line_wins++; map.get(match.away_team_id)!.line_losses++;
      } else if (r.winner === "away") {
        map.get(match.away_team_id)!.line_wins++; map.get(match.home_team_id)!.line_losses++;
      } else {
        map.get(match.home_team_id)!.line_ties++; map.get(match.away_team_id)!.line_ties++;
      }
    }
    if (lineResults === 0) continue;
    map.get(match.home_team_id)!.matches_played++;
    map.get(match.away_team_id)!.matches_played++;
    const winner = matchWinner(match.lines);
    if (winner === "home") {
      map.get(match.home_team_id)!.match_wins++; map.get(match.away_team_id)!.match_losses++;
    } else if (winner === "away") {
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

export async function computeStandings(db: D1Database, leagueId: number): Promise<TeamStanding[]> {
  const teams = await db.prepare("SELECT id, name FROM teams WHERE league_id = ?").bind(leagueId).all<{ id: number; name: string }>();
  const matches = await db.prepare("SELECT * FROM matches WHERE league_id = ? AND status = 'completed'").bind(leagueId).all();
  const inputs: StandingMatchInput[] = [];
  for (const m of matches.results ?? []) {
    const match = m as { id: number; home_team_id: number; away_team_id: number };
    const lines = await db.prepare("SELECT id FROM match_lines WHERE match_id = ?").bind(match.id).all<{ id: number }>();
    const results: LineResult[] = [];
    for (const line of lines.results ?? []) {
      const r = await db.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(line.id).first<LineResult>();
      if (r) results.push(r);
    }
    inputs.push({ home_team_id: match.home_team_id, away_team_id: match.away_team_id, lines: results });
  }
  return computeStandingsFromMatches(teams.results ?? [], inputs);
}

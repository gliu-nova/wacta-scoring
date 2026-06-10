import { computeStandings } from "./standings";
import type { League, Player } from "../types";

function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function formatScore(r: {
  home_set1: number; away_set1: number; home_tb1: number | null; away_tb1: number | null;
  home_set2: number; away_set2: number; home_tb2: number | null; away_tb2: number | null;
  home_set3: number | null; away_set3: number | null; home_tb3: number | null; away_tb3: number | null;
}): string {
  const set = (h: number, a: number, htb: number | null, atb: number | null) => {
    if (h === 6 && a === 6 && htb != null && atb != null) return `${htb}-${atb}`;
    return `${h}-${a}`;
  };
  const parts = [
    set(r.home_set1, r.away_set1, r.home_tb1, r.away_tb1),
    set(r.home_set2, r.away_set2, r.home_tb2, r.away_tb2),
  ];
  if (r.home_set3 != null && r.away_set3 != null) parts.push(set(r.home_set3, r.away_set3, r.home_tb3, r.away_tb3));
  return parts.join(" ");
}

function playerName(p: Player | undefined): string {
  if (!p) return "";
  return `${p.first_name} ${p.last_name}`.trim();
}

function lineupNames(ids: (number | null)[], pmap: Map<number, Player>): string {
  return ids.map((id) => (id ? playerName(pmap.get(id)) : "")).filter(Boolean).join(" / ");
}

export async function standingsCsv(db: D1Database, leagueId: number): Promise<string> {
  const league = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>();
  const standings = await computeStandings(db, leagueId);
  const rows = [
    csvRow(["League", league?.name ?? String(leagueId)]),
    "",
    csvRow(["Rank", "Team", "Matches", "W", "L", "Match Win %", "Line W", "Line L", "Game Win %"]),
    ...standings.map((s, i) => csvRow([
      i + 1, s.team_name, s.matches_played, s.match_wins, s.match_losses,
      s.match_win_pct, s.line_wins, s.line_losses, s.game_win_pct,
    ])),
  ];
  return rows.join("\n");
}

export async function playersCsv(db: D1Database, leagueId?: number): Promise<string> {
  let sql = `SELECT p.*, t.name as team_name, l.name as league_name
    FROM players p LEFT JOIN teams t ON t.id = p.team_id LEFT JOIN leagues l ON l.id = t.league_id`;
  const binds: number[] = [];
  if (leagueId) { sql += " WHERE t.league_id = ?"; binds.push(leagueId); }
  sql += " ORDER BY l.name, t.name, p.last_name, p.first_name";
  const rows = await db.prepare(sql).bind(...binds).all<Player & { team_name: string | null; league_name: string | null }>();
  return [
    csvRow(["League", "Team", "First Name", "Last Name", "NTRP", "Email"]),
    ...(rows.results ?? []).map((p) => csvRow([
      p.league_name, p.team_name, p.first_name, p.last_name, p.ntrp_rating, p.email,
    ])),
  ].join("\n");
}

export async function matchesCsv(db: D1Database, leagueId?: number): Promise<string> {
  let sql = `SELECT m.*, l.name league_name, ht.name home_name, at.name away_name
    FROM matches m JOIN leagues l ON l.id = m.league_id
    JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id`;
  const binds: number[] = [];
  if (leagueId) { sql += " WHERE m.league_id = ?"; binds.push(leagueId); }
  sql += " ORDER BY m.match_date, m.id";
  const matches = await db.prepare(sql).bind(...binds).all();
  const players = await db.prepare("SELECT * FROM players").all<Player>();
  const pmap = new Map((players.results ?? []).map((p) => [p.id, p]));
  const rows = [csvRow([
    "League", "Date", "Home Team", "Away Team", "Status", "Location",
    "Line", "Home Players", "Away Players", "Score", "Winner",
  ])];
  for (const m of matches.results ?? []) {
    const match = m as {
      id: number; league_name: string; match_date: string; home_name: string; away_name: string;
      status: string; location: string | null;
    };
    const lines = await db.prepare("SELECT * FROM match_lines WHERE match_id = ? ORDER BY sort_order").bind(match.id).all();
    for (const line of lines.results ?? []) {
      const l = line as { id: number; name: string };
      const lineup = await db.prepare("SELECT * FROM lineups WHERE match_line_id = ?").bind(l.id).first<{
        home_player1_id: number | null; home_player2_id: number | null;
        away_player1_id: number | null; away_player2_id: number | null;
      }>();
      const result = await db.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(l.id).first();
      rows.push(csvRow([
        match.league_name, match.match_date, match.home_name, match.away_name, match.status, match.location,
        l.name,
        lineup ? lineupNames([lineup.home_player1_id, lineup.home_player2_id], pmap) : "",
        lineup ? lineupNames([lineup.away_player1_id, lineup.away_player2_id], pmap) : "",
        result ? formatScore(result as never) : "",
        result ? (result as { winner: string }).winner : "",
      ]));
    }
  }
  return rows.join("\n");
}

export async function bundleCsv(db: D1Database): Promise<string> {
  const leagues = await db.prepare("SELECT * FROM leagues ORDER BY name").all<League>();
  const sections: string[] = [`WACTA Export — ${new Date().toISOString().slice(0, 10)}`, ""];
  for (const league of leagues.results ?? []) {
    sections.push(`=== STANDINGS: ${league.name} ===`, await standingsCsv(db, league.id), "");
    sections.push(`=== MATCHES: ${league.name} ===`, await matchesCsv(db, league.id), "");
  }
  sections.push("=== ALL PLAYERS ===", await playersCsv(db));
  return sections.join("\n");
}
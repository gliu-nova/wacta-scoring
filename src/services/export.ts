import { computeStandings, countGames } from "./standings";
import type { League, LineResult, Player } from "../types";

function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

function formatMatchDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return date;
  return `${m[2]}/${m[3]}`;
}

function lineWinnerLabel(winner: string, homeName: string, awayName: string): string {
  if (winner === "home") return homeName;
  if (winner === "away") return awayName;
  if (winner === "tie") return "Tie";
  return "";
}

function lineGameScore(r: LineResult): string {
  const [homeGames, awayGames] = countGames(r, "home");
  return `${homeGames}-${awayGames}`;
}

function formatOverall(
  homeW: number, homeL: number, homeT: number,
  awayW: number, awayL: number, awayT: number,
  homeName: string, awayName: string,
): string {
  if (homeW > awayW) return `${homeName} wins ${homeW}-${homeL}-${homeT}`;
  if (awayW > homeW) return `${awayName} wins ${awayW}-${awayL}-${awayT}`;
  return `Tie ${homeW}-${homeL}-${homeT}`;
}

function formatGamesWon(homeName: string, homeGames: number, awayName: string, awayGames: number): string {
  return `${awayName}${awayGames} - ${homeName}${homeGames}`;
}

type LineColumn = { sort_order: number; name: string };

async function getLineColumns(db: D1Database, leagueId?: number): Promise<LineColumn[]> {
  if (leagueId) {
    const rows = await db.prepare(
      "SELECT sort_order, name FROM league_line_templates WHERE league_id = ? ORDER BY sort_order",
    ).bind(leagueId).all<LineColumn>();
    return rows.results ?? [];
  }
  const row = await db.prepare(`
    SELECT MAX(line_cnt) as n FROM (
      SELECT COUNT(*) as line_cnt FROM match_lines ml
      JOIN line_results lr ON lr.match_line_id = ml.id
      GROUP BY ml.match_id
    )
  `).first<{ n: number | null }>();
  const n = row?.n ?? 0;
  return Array.from({ length: n }, (_, i) => ({ sort_order: i, name: "" }));
}

function buildMatchHeader(lineCols: LineColumn[], includeLeague: boolean): string[] {
  const header = ["Date", "Home Team", "Guest Team"];
  if (includeLeague) header.unshift("League");
  for (let i = 0; i < lineCols.length; i++) {
    const label = lineCols[i].name ? `D${i + 1} (${lineCols[i].name})` : `D${i + 1}`;
    header.push(`${label} Winner`, `${label} Score`);
  }
  header.push("Overall", "Games won");
  return header;
}

export async function standingsCsv(db: D1Database, leagueId: number): Promise<string> {
  const league = await db.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>();
  const standings = await computeStandings(db, leagueId);
  const rows = [
    csvRow(["League", league?.name ?? String(leagueId)]),
    "",
    csvRow(["Ranking", "Team", "Matches", "W", "L", "T", "% Matches Won", "Line W", "Line L", "Line T", "% Games Won"]),
    ...standings.map((s, i) => csvRow([
      i + 1, s.team_name, s.matches_played, s.match_wins, s.match_losses, s.match_ties,
      s.match_win_pct, s.line_wins, s.line_losses, s.line_ties, s.game_win_pct,
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
    JOIN teams ht ON ht.id = m.home_team_id JOIN teams at ON at.id = m.away_team_id
    WHERE EXISTS (
      SELECT 1 FROM match_lines ml
      JOIN line_results lr ON lr.match_line_id = ml.id
      WHERE ml.match_id = m.id
    )`;
  const binds: number[] = [];
  if (leagueId) { sql += " AND m.league_id = ?"; binds.push(leagueId); }
  sql += " ORDER BY m.match_date DESC, m.id DESC";

  const [matches, lineCols] = await Promise.all([
    db.prepare(sql).bind(...binds).all(),
    getLineColumns(db, leagueId),
  ]);
  const includeLeague = !leagueId;
  const rows = [csvRow(buildMatchHeader(lineCols, includeLeague))];

  for (const m of matches.results ?? []) {
    const match = m as {
      id: number; league_name: string; match_date: string; home_name: string; away_name: string;
    };
    const lines = await db.prepare("SELECT * FROM match_lines WHERE match_id = ? ORDER BY sort_order").bind(match.id).all();
    const resultsByOrder = new Map<number, LineResult>();
    let homeW = 0, homeL = 0, homeT = 0, awayW = 0, awayL = 0, awayT = 0;
    let homeGames = 0, awayGames = 0;

    for (const line of lines.results ?? []) {
      const l = line as { id: number; sort_order: number };
      const result = await db.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(l.id).first<LineResult>();
      if (!result) continue;
      resultsByOrder.set(l.sort_order, result);
      const [hg, ag] = countGames(result, "home");
      homeGames += hg;
      awayGames += ag;
      if (result.winner === "home") { homeW++; awayL++; }
      else if (result.winner === "away") { awayW++; homeL++; }
      else { homeT++; awayT++; }
    }

    const row: (string | number | null | undefined)[] = [];
    if (includeLeague) row.push(match.league_name);
    row.push(formatMatchDate(match.match_date), match.home_name, match.away_name);
    for (const col of lineCols) {
      const result = resultsByOrder.get(col.sort_order);
      if (result) {
        row.push(lineWinnerLabel(result.winner, match.home_name, match.away_name));
        row.push(lineGameScore(result));
      } else {
        row.push("", "");
      }
    }
    row.push(
      formatOverall(homeW, homeL, homeT, awayW, awayL, awayT, match.home_name, match.away_name),
      formatGamesWon(match.home_name, homeGames, match.away_name, awayGames),
    );
    rows.push(csvRow(row));
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
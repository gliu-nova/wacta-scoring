import { computeStandings, countGames, matchWinner } from "./standings";
import type { League, LineResult, Lineup, Player } from "../types";

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

function formatLineScore(r: LineResult): string {
  const set = (h: number, a: number, htb: number | null, atb: number | null) => {
    if (h === 6 && a === 6 && htb != null && atb != null) return `${htb}-${atb}`;
    return `${h}-${a}`;
  };
  const parts = [
    set(r.home_set1, r.away_set1, r.home_tb1, r.away_tb1),
    set(r.home_set2, r.away_set2, r.home_tb2, r.away_tb2),
  ];
  if (r.home_set3 != null && r.away_set3 != null) {
    parts.push(set(r.home_set3, r.away_set3, r.home_tb3, r.away_tb3));
  }
  return parts.join(" ");
}

function playerName(pmap: Map<number, Player>, id: number | null | undefined): string {
  if (!id) return "";
  const p = pmap.get(id);
  return p ? `${p.first_name} ${p.last_name}` : "";
}

/** Home/away player names for a line; empty strings when none were submitted. */
function lineupSideNames(
  lu: Lineup | null | undefined,
  side: "home" | "away",
  pmap: Map<number, Player>,
): string {
  if (!lu) return "";
  const text = side === "home" ? lu.home_players_text : lu.away_players_text;
  if (text?.trim()) return text.trim();
  const ids = side === "home"
    ? [lu.home_player1_id, lu.home_player2_id]
    : [lu.away_player1_id, lu.away_player2_id];
  return ids.map((id) => playerName(pmap, id)).filter(Boolean).join(", ");
}

function formatOverall(
  homeW: number, homeL: number, homeT: number,
  awayW: number, awayL: number, awayT: number,
  homeName: string, awayName: string,
  outcome: "home" | "away" | "tie",
): string {
  const score = `${homeW}-${homeL}-${homeT}`;
  if (outcome === "home") return `${homeName} wins ${score}`;
  if (outcome === "away") return `${awayName} wins ${awayW}-${awayL}-${awayT}`;
  return `Tie ${score}`;
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
    header.push(`${label} Winner`, `${label} Score`, `${label} Home Players`, `${label} Away Players`);
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

  const [matches, lineCols, allPlayers] = await Promise.all([
    db.prepare(sql).bind(...binds).all(),
    getLineColumns(db, leagueId),
    db.prepare("SELECT * FROM players").all<Player>(),
  ]);
  const pmap = new Map((allPlayers.results ?? []).map((p) => [p.id, p]));
  const includeLeague = !leagueId;
  const rows = [csvRow(buildMatchHeader(lineCols, includeLeague))];

  for (const m of matches.results ?? []) {
    const match = m as {
      id: number; league_name: string; match_date: string; home_name: string; away_name: string;
    };
    const lines = await db.prepare("SELECT * FROM match_lines WHERE match_id = ? ORDER BY sort_order").bind(match.id).all();
    const resultsByOrder = new Map<number, LineResult>();
    const lineupsByOrder = new Map<number, Lineup | null>();
    const scoredLines: LineResult[] = [];
    let homeW = 0, homeL = 0, homeT = 0, awayW = 0, awayL = 0, awayT = 0;
    let homeGames = 0, awayGames = 0;

    for (const line of lines.results ?? []) {
      const l = line as { id: number; sort_order: number };
      const result = await db.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(l.id).first<LineResult>();
      if (!result) continue;
      resultsByOrder.set(l.sort_order, result);
      scoredLines.push(result);
      const lineup = await db.prepare("SELECT * FROM lineups WHERE match_line_id = ?").bind(l.id).first<Lineup>();
      lineupsByOrder.set(l.sort_order, lineup);
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
        const lu = lineupsByOrder.get(col.sort_order);
        row.push(lineWinnerLabel(result.winner, match.home_name, match.away_name));
        row.push(formatLineScore(result));
        row.push(lineupSideNames(lu, "home", pmap));
        row.push(lineupSideNames(lu, "away", pmap));
      } else {
        row.push("", "", "", "");
      }
    }
    row.push(
      formatOverall(homeW, homeL, homeT, awayW, awayL, awayT, match.home_name, match.away_name, matchWinner(scoredLines)),
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
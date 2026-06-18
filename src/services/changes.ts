import type { Lineup, LineResult, Match, Player } from "../types";
import type { ScoreEntry } from "./scores";

export type ActivityHighlight = { row: string; cells?: string[]; fields?: string[] };

export type ActivityDetails = {
  subtitle?: string;
  highlights?: ActivityHighlight[];
};

export function formatSetScore(h: number | null | undefined, a: number | null | undefined): string | null {
  if (h == null && a == null) return null;
  if (!h && !a) return null;
  return `${h ?? 0}-${a ?? 0}`;
}

export function winnerLabel(w: string | null | undefined, homeName: string, awayName: string): string {
  if (w === "home") return `${homeName} wins`;
  if (w === "away") return `${awayName} wins`;
  if (w === "tie") return "Tie";
  return "—";
}

function scoreSets(r: { home_set1: number; away_set1: number; home_set2: number; away_set2: number; home_set3: number | null; away_set3: number | null }) {
  return [
    formatSetScore(r.home_set1, r.away_set1),
    formatSetScore(r.home_set2, r.away_set2),
    r.home_set3 != null || r.away_set3 != null ? formatSetScore(r.home_set3, r.away_set3) : null,
  ];
}

function playerName(pmap: Map<number, Player>, id: number | null | undefined): string {
  if (!id) return "";
  const p = pmap.get(id);
  return p ? `${p.first_name} ${p.last_name}` : "";
}

function lineupDisplay(lu: Lineup | null, pmap: Map<number, Player>): string {
  if (!lu) return "";
  const text = [lu.home_players_text, lu.away_players_text].filter(Boolean).join(" / ");
  if (text) return text;
  const names = [lu.home_player1_id, lu.home_player2_id, lu.away_player1_id, lu.away_player2_id]
    .map((id) => playerName(pmap, id)).filter(Boolean);
  return names.join(", ");
}

export async function buildScoreChangeDetails(
  db: D1Database,
  scores: ScoreEntry[],
  homeName: string,
  awayName: string,
): Promise<ActivityDetails | null> {
  const parts: string[] = [];
  const highlights: ActivityHighlight[] = [];

  for (const s of scores) {
    const line = await db.prepare("SELECT id, name FROM match_lines WHERE id = ?").bind(s.match_line_id)
      .first<{ id: number; name: string }>();
    if (!line) continue;

    const before = await db.prepare("SELECT * FROM line_results WHERE match_line_id = ?").bind(s.match_line_id).first<LineResult>();
    const afterParsed = {
      home_set1: s.home_set1 ?? 0, away_set1: s.away_set1 ?? 0,
      home_set2: s.home_set2 ?? 0, away_set2: s.away_set2 ?? 0,
      home_set3: s.home_set3 ?? null, away_set3: s.away_set3 ?? null,
    };
    const beforeSets = before ? scoreSets(before) : [null, null, null];
    const afterSets = scoreSets(afterParsed);

    const lineParts: string[] = [];
    const cells: string[] = [];
    const fields: string[] = [];

    for (let i = 0; i < 3; i++) {
      const b = beforeSets[i];
      const a = afterSets[i];
      if (b === a) continue;
      if (before && b != null) lineParts.push(`Set ${i + 1}: ${b} → ${a ?? "—"}`);
      else if (a) lineParts.push(`Set ${i + 1}: ${a}`);
      cells.push("score");
      fields.push(`set${i + 1}`);
    }

    if (!before || before.winner !== s.winner) {
      if (before) {
        lineParts.push(`Result: ${winnerLabel(before.winner, homeName, awayName)} → ${winnerLabel(s.winner, homeName, awayName)}`);
      } else {
        lineParts.push(`Result: ${winnerLabel(s.winner, homeName, awayName)}`);
      }
      cells.push("result");
      fields.push("winner");
    }

    if (lineParts.length) {
      parts.push(`${line.name}: ${lineParts.join("; ")}`);
      highlights.push({ row: String(line.id), cells: [...new Set(cells)], fields: [...new Set(fields)] });
    }
  }

  if (!parts.length) return null;
  return { subtitle: parts.join(" · "), highlights };
}

type LineupInput = {
  match_line_id: number;
  home_player1_id?: number;
  home_player2_id?: number;
  away_player1_id?: number;
  away_player2_id?: number;
  home_players_text?: string;
  away_players_text?: string;
};

export async function buildLineupChangeDetails(
  db: D1Database,
  lineups: LineupInput[],
  pmap: Map<number, Player>,
): Promise<ActivityDetails | null> {
  const parts: string[] = [];
  const highlights: ActivityHighlight[] = [];

  for (const lu of lineups) {
    const line = await db.prepare("SELECT id, name FROM match_lines WHERE id = ?").bind(lu.match_line_id)
      .first<{ id: number; name: string }>();
    if (!line) continue;

    const before = await db.prepare("SELECT * FROM lineups WHERE match_line_id = ?").bind(lu.match_line_id).first<Lineup>();
    const beforeHome = before?.home_players_text?.trim() || [before?.home_player1_id, before?.home_player2_id].map((id) => playerName(pmap, id)).filter(Boolean).join(", ") || "—";
    const beforeAway = before?.away_players_text?.trim() || [before?.away_player1_id, before?.away_player2_id].map((id) => playerName(pmap, id)).filter(Boolean).join(", ") || "—";
    const afterHome = lu.home_players_text?.trim() || [lu.home_player1_id, lu.home_player2_id].map((id) => playerName(pmap, id)).filter(Boolean).join(", ") || "—";
    const afterAway = lu.away_players_text?.trim() || [lu.away_player1_id, lu.away_player2_id].map((id) => playerName(pmap, id)).filter(Boolean).join(", ") || "—";

    const lineParts: string[] = [];
    const cells: string[] = [];
    if (beforeHome !== afterHome) {
      lineParts.push(`Home: ${beforeHome} → ${afterHome}`);
      cells.push("home_players");
    }
    if (beforeAway !== afterAway) {
      lineParts.push(`Away: ${beforeAway} → ${afterAway}`);
      cells.push("away_players");
    }
    if (lineParts.length) {
      parts.push(`${line.name}: ${lineParts.join("; ")}`);
      highlights.push({ row: String(line.id), cells });
    }
  }

  if (!parts.length) return null;
  return { subtitle: parts.join(" · "), highlights };
}

export async function buildMatchChangeDetails(
  db: D1Database,
  match: Match,
  updates: { match_date?: string; location?: string; home_team_id?: number; away_team_id?: number },
): Promise<ActivityDetails | null> {
  const parts: string[] = [];
  const highlights: ActivityHighlight[] = [{ row: "meta", cells: [] }];

  if (updates.match_date && updates.match_date !== match.match_date) {
    parts.push(`Date: ${match.match_date} → ${updates.match_date}`);
    highlights[0].cells!.push("match_date");
  }
  if (updates.location !== undefined) {
    const newLoc = updates.location?.trim() || null;
    if (newLoc !== match.location) {
      parts.push(`Location: ${match.location || "—"} → ${newLoc || "—"}`);
      highlights[0].cells!.push("location");
    }
  }
  const homeId = updates.home_team_id ?? match.home_team_id;
  const awayId = updates.away_team_id ?? match.away_team_id;
  if (homeId !== match.home_team_id) {
    const [oldT, newT] = await Promise.all([
      db.prepare("SELECT name FROM teams WHERE id = ?").bind(match.home_team_id).first<{ name: string }>(),
      db.prepare("SELECT name FROM teams WHERE id = ?").bind(homeId).first<{ name: string }>(),
    ]);
    parts.push(`Home team: ${oldT?.name ?? "?"} → ${newT?.name ?? "?"}`);
    highlights[0].cells!.push("home_team");
  }
  if (awayId !== match.away_team_id) {
    const [oldT, newT] = await Promise.all([
      db.prepare("SELECT name FROM teams WHERE id = ?").bind(match.away_team_id).first<{ name: string }>(),
      db.prepare("SELECT name FROM teams WHERE id = ?").bind(awayId).first<{ name: string }>(),
    ]);
    parts.push(`Away team: ${oldT?.name ?? "?"} → ${newT?.name ?? "?"}`);
    highlights[0].cells!.push("away_team");
  }

  if (!parts.length) return null;
  return { subtitle: parts.join(" · "), highlights };
}

export function buildFieldChangeDetails(
  label: string,
  rowId: string,
  changes: Array<{ field: string; before: string; after: string; cell?: string }>,
): ActivityDetails | null {
  if (!changes.length) return null;
  return {
    subtitle: changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join(" · "),
    highlights: [{ row: rowId, cells: changes.map((c) => c.cell ?? "name") }],
  };
}
import { updateMatchStatus } from "./matches";
import { validateLineScoreEntry } from "./validation";
import type { LineWinner } from "../types";

export type ScoreEntry = {
  match_line_id: number;
  winner: LineWinner;
  home_set1?: number;
  away_set1?: number;
  home_tb1?: number | string;
  away_tb1?: number | string;
  home_set2?: number;
  away_set2?: number;
  home_tb2?: number | string;
  away_tb2?: number | string;
  home_set3?: number;
  away_set3?: number;
  home_tb3?: number | string;
  away_tb3?: number | string;
  home_players_text?: string;
  away_players_text?: string;
};

function parseScore(s: ScoreEntry) {
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

export async function applyScores(
  db: D1Database,
  matchId: number,
  scores: ScoreEntry[],
  userId: number | null,
): Promise<string[]> {
  const errors: string[] = [];
  for (const s of scores) {
    const line = await db.prepare("SELECT name FROM match_lines WHERE id = ?").bind(s.match_line_id).first<{ name: string }>();
    if (!line) {
      errors.push(`Unknown line ${s.match_line_id}`);
      continue;
    }
    const parsed = parseScore(s);
    const vr = validateLineScoreEntry(parsed, s.winner);
    if (!vr.ok) {
      errors.push(...vr.errors.map((e) => `${line.name}: ${e}`));
      continue;
    }
    const homeText = s.home_players_text?.trim() || null;
    const awayText = s.away_players_text?.trim() || null;
    if (homeText || awayText) {
      const existingLu = await db.prepare("SELECT id FROM lineups WHERE match_line_id = ?").bind(s.match_line_id).first();
      if (existingLu) {
        await db.prepare("UPDATE lineups SET home_players_text=?, away_players_text=?, updated_at=datetime('now') WHERE match_line_id=?")
          .bind(homeText, awayText, s.match_line_id).run();
      } else {
        await db.prepare("INSERT INTO lineups (match_line_id, home_players_text, away_players_text) VALUES (?, ?, ?)")
          .bind(s.match_line_id, homeText, awayText).run();
      }
    }
    const existing = await db.prepare("SELECT id FROM line_results WHERE match_line_id = ?").bind(s.match_line_id).first();
    if (existing) {
      await db.prepare(`UPDATE line_results SET home_set1=?,away_set1=?,home_tb1=?,away_tb1=?,home_set2=?,away_set2=?,home_tb2=?,away_tb2=?,
        home_set3=?,away_set3=?,home_tb3=?,away_tb3=?,winner=?,submitted_by_id=?,submitted_at=datetime('now') WHERE match_line_id=?`)
        .bind(parsed.home_set1, parsed.away_set1, parsed.home_tb1, parsed.away_tb1, parsed.home_set2, parsed.away_set2, parsed.home_tb2, parsed.away_tb2,
          parsed.home_set3, parsed.away_set3, parsed.home_tb3, parsed.away_tb3, s.winner, userId, s.match_line_id).run();
    } else {
      await db.prepare(`INSERT INTO line_results (match_line_id,home_set1,away_set1,home_tb1,away_tb1,home_set2,away_set2,home_tb2,away_tb2,home_set3,away_set3,home_tb3,away_tb3,winner,submitted_by_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(s.match_line_id, parsed.home_set1, parsed.away_set1, parsed.home_tb1, parsed.away_tb1, parsed.home_set2, parsed.away_set2, parsed.home_tb2, parsed.away_tb2,
          parsed.home_set3, parsed.away_set3, parsed.home_tb3, parsed.away_tb3, s.winner, userId).run();
    }
  }
  if (!errors.length) await updateMatchStatus(db, matchId);
  return errors;
}
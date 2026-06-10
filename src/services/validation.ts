import type { Player, Side } from "../types";

export function setWinner(h: number, a: number, htb: number | null, atb: number | null): Side | null {
  if (h === 6 && a === 6) {
    if (htb == null || atb == null) return null;
    if (htb > atb && htb >= 7 && htb - atb >= 2) return "home";
    if (atb > htb && atb >= 7 && atb - htb >= 2) return "away";
    return null;
  }
  if (h >= 6 && h - a >= 2) return "home";
  if (a >= 6 && a - h >= 2) return "away";
  if (h === 7 && a === 6) return "home";
  if (a === 7 && h === 6) return "away";
  return null;
}

export function validateSet(h: number, a: number, htb: number | null, atb: number | null): string[] {
  const errors: string[] = [];
  if (h < 0 || a < 0 || h > 7 || a > 7) errors.push("Games must be 0-7.");
  if (h === a && h !== 6) errors.push("Sets cannot be tied except 6-6.");
  if (h === 6 && a === 6 && setWinner(h, a, htb, atb) === null) errors.push("Invalid tiebreak for 6-6.");
  else if (setWinner(h, a, htb, atb) === null) errors.push(`Invalid set score ${h}-${a}.`);
  return errors;
}

export function validateLineScore(s: {
  home_set1: number; away_set1: number; home_tb1: number | null; away_tb1: number | null;
  home_set2: number; away_set2: number; home_tb2: number | null; away_tb2: number | null;
  home_set3: number | null; away_set3: number | null; home_tb3: number | null; away_tb3: number | null;
}): { ok: boolean; errors: string[] } {
  const errors = [
    ...validateSet(s.home_set1, s.away_set1, s.home_tb1, s.away_tb1),
    ...validateSet(s.home_set2, s.away_set2, s.home_tb2, s.away_tb2),
  ];
  const homeWins = (setWinner(s.home_set1, s.away_set1, s.home_tb1, s.away_tb1) === "home" ? 1 : 0)
    + (setWinner(s.home_set2, s.away_set2, s.home_tb2, s.away_tb2) === "home" ? 1 : 0);
  const awayWins = (setWinner(s.home_set1, s.away_set1, s.home_tb1, s.away_tb1) === "away" ? 1 : 0)
    + (setWinner(s.home_set2, s.away_set2, s.home_tb2, s.away_tb2) === "away" ? 1 : 0);
  if (homeWins === 1 && awayWins === 1) {
    if (s.home_set3 == null || s.away_set3 == null) errors.push("Third set required when tied 1-1.");
    else errors.push(...validateSet(s.home_set3, s.away_set3, s.home_tb3, s.away_tb3));
  }
  return { ok: errors.length === 0, errors };
}

export function determineWinner(s: Parameters<typeof validateLineScore>[0]): Side {
  const sets: [number, number, number | null, number | null][] = [
    [s.home_set1, s.away_set1, s.home_tb1, s.away_tb1],
    [s.home_set2, s.away_set2, s.home_tb2, s.away_tb2],
  ];
  if (s.home_set3 != null && s.away_set3 != null) sets.push([s.home_set3, s.away_set3, s.home_tb3, s.away_tb3]);
  let home = 0;
  for (const [h, a, htb, atb] of sets) if (setWinner(h, a, htb, atb) === "home") home++;
  return home > sets.length - home ? "home" : "away";
}

export function canSubmitScores(matchDate: string): boolean {
  return new Date().toISOString().slice(0, 10) >= matchDate;
}

export function ratingWarnings(home: Player[], away: Player[], threshold = 1.0): string[] {
  const h = home.filter(Boolean), a = away.filter(Boolean);
  if (!h.length || !a.length) return [];
  const hAvg = h.reduce((s, p) => s + p.ntrp_rating, 0) / h.length;
  const aAvg = a.reduce((s, p) => s + p.ntrp_rating, 0) / a.length;
  const diff = Math.abs(hAvg - aAvg);
  return diff > threshold ? [`Rating mismatch: home avg ${hAvg.toFixed(1)} vs away ${aAvg.toFixed(1)}`] : [];
}
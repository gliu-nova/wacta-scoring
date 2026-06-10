export type Env = {
  DB: D1Database;
  SUBMIT_PASSWORD?: string;
};

export type Player = {
  id: number;
  name: string;
  ntrp: number;
  created_at: string;
};

export type PlayerStats = Player & {
  wins: number;
  losses: number;
  win_pct: number;
};

export type Match = {
  id: number;
  winner_id: number;
  loser_id: number;
  score: string;
  match_date: string;
  notes: string | null;
  created_at: string;
  winner_name: string;
  loser_name: string;
};
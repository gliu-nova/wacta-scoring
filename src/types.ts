export type Env = {
  DB: D1Database;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  SECRET_KEY?: string;
  SUBMIT_PASSWORD?: string;
  EXPORT_TOKEN?: string;
};

export type UserRole = "admin" | "captain" | "player";
export type MatchStatus = "scheduled" | "lineup_set" | "in_progress" | "completed";
export type Side = "home" | "away";
export type LineWinner = Side | "tie";

export type User = {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  team_id: number | null;
  created_at: string;
};

export type League = { id: number; name: string; description: string | null; created_at: string };
export type LeagueLineTemplate = {
  id: number; league_id: number; name: string; sort_order: number;
  is_doubles: number; max_combined_rating: number | null;
};
export type Team = { id: number; name: string; league_id: number; created_at: string };
export type Player = {
  id: number; first_name: string; last_name: string; email: string | null;
  ntrp_rating: number; team_id: number | null; created_at: string;
};
export type Match = {
  id: number; league_id: number; home_team_id: number; away_team_id: number;
  match_date: string; location: string | null; status: MatchStatus; created_at: string;
};
export type MatchLine = {
  id: number; match_id: number; name: string; sort_order: number;
  is_doubles: number; max_combined_rating: number | null;
};
export type Lineup = {
  id: number; match_line_id: number;
  home_player1_id: number | null; home_player2_id: number | null;
  away_player1_id: number | null; away_player2_id: number | null;
  home_players_text: string | null; away_players_text: string | null;
  updated_at: string;
};
export type LineResult = {
  id: number; match_line_id: number;
  home_set1: number; away_set1: number; home_tb1: number | null; away_tb1: number | null;
  home_set2: number; away_set2: number; home_tb2: number | null; away_tb2: number | null;
  home_set3: number | null; away_set3: number | null; home_tb3: number | null; away_tb3: number | null;
  winner: LineWinner; submitted_by_id: number | null; submitted_at: string;
};

export type TeamStanding = {
  team_id: number; team_name: string;
  matches_played: number; match_wins: number; match_losses: number; match_ties: number;
  line_wins: number; line_losses: number; line_ties: number;
  games_won: number; games_lost: number;
  match_win_pct: number; game_win_pct: number;
};
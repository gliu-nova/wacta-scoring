import { describe, expect, it } from "vitest";
import { countGames, computeStandingsFromMatches } from "./standings";
import type { LineResult } from "../types";

function line(partial: Partial<LineResult> & Pick<LineResult, "winner">): LineResult {
  return {
    id: 1,
    match_line_id: 1,
    home_set1: 0, away_set1: 0, home_tb1: null, away_tb1: null,
    home_set2: 0, away_set2: 0, home_tb2: null, away_tb2: null,
    home_set3: null, away_set3: null, home_tb3: null, away_tb3: null,
    submitted_by_id: null,
    submitted_at: "",
    ...partial,
  };
}

describe("countGames", () => {
  it("credits higher games in each set to the line winner, regardless of box order", () => {
    const normal = line({
      winner: "away",
      home_set1: 6, away_set1: 1,
      home_set2: 6, away_set2: 2,
    });
    expect(countGames(normal, "away")).toEqual([12, 3]);
    expect(countGames(normal, "home")).toEqual([3, 12]);

    const flipped = line({
      winner: "away",
      home_set1: 1, away_set1: 6,
      home_set2: 2, away_set2: 6,
    });
    expect(countGames(flipped, "away")).toEqual([12, 3]);
    expect(countGames(flipped, "home")).toEqual([3, 12]);
  });

  it("gives winner 12 and loser 5 for a 6-3 6-2 result", () => {
    const r = line({
      winner: "home",
      home_set1: 6, away_set1: 3,
      home_set2: 6, away_set2: 2,
    });
    expect(countGames(r, "home")).toEqual([12, 5]);
    expect(countGames(r, "away")).toEqual([5, 12]);
  });

  it("keeps home/away split on ties", () => {
    const r = line({
      winner: "tie",
      home_set1: 5, away_set1: 5,
    });
    expect(countGames(r, "home")).toEqual([5, 5]);
    expect(countGames(r, "away")).toEqual([5, 5]);
  });

  it("counts 6-6 tiebreak as 7-6 then assigns high to line winner", () => {
    const r = line({
      winner: "away",
      home_set1: 6, away_set1: 6, home_tb1: 7, away_tb1: 5,
      home_set2: 0, away_set2: 0,
    });
    // TB says home won the set (7-6), but line winner is away → away gets 7
    expect(countGames(r, "away")).toEqual([7, 6]);
    expect(countGames(r, "home")).toEqual([6, 7]);
  });

  it("includes a third set when present", () => {
    const r = line({
      winner: "home",
      home_set1: 6, away_set1: 4,
      home_set2: 3, away_set2: 6,
      home_set3: 6, away_set3: 2,
    });
    expect(countGames(r, "home")).toEqual([18, 9]);
    expect(countGames(r, "away")).toEqual([9, 18]);
  });
});

describe("computeStandingsFromMatches", () => {
  const teams = [
    { id: 1, name: "Home Team" },
    { id: 2, name: "Away Team" },
    { id: 3, name: "Idle Team" },
  ];

  it("awards match win from line wins and aggregates games with winner logic", () => {
    // Away wins 4 lines convincingly; scores entered home-heavy (old bug pattern)
    const lines = [
      line({ winner: "away", home_set1: 6, away_set1: 1, home_set2: 6, away_set2: 2 }),
      line({ winner: "away", home_set1: 6, away_set1: 3, home_set2: 6, away_set2: 0 }),
      line({ winner: "away", home_set1: 6, away_set1: 0, home_set2: 6, away_set2: 3 }),
      line({ winner: "home", home_set1: 6, away_set1: 4, home_set2: 6, away_set2: 4 }),
      line({ winner: "away", home_set1: 6, away_set1: 2, home_set2: 6, away_set2: 1 }),
    ];
    const standings = computeStandingsFromMatches(teams, [
      { home_team_id: 1, away_team_id: 2, lines },
    ]);

    const home = standings.find((s) => s.team_id === 1)!;
    const away = standings.find((s) => s.team_id === 2)!;
    const idle = standings.find((s) => s.team_id === 3)!;

    expect(away.match_wins).toBe(1);
    expect(away.match_losses).toBe(0);
    expect(away.line_wins).toBe(4);
    expect(away.line_losses).toBe(1);
    expect(home.match_wins).toBe(0);
    expect(home.line_wins).toBe(1);
    expect(home.line_losses).toBe(4);

    // 4 away line wins at 12-3 each, plus one home line win at 12-8 → away 56-24
    expect(away.games_won).toBe(56);
    expect(away.games_lost).toBe(24);
    expect(away.game_win_pct).toBe(70);
    expect(home.games_won).toBe(24);
    expect(home.games_lost).toBe(56);
    expect(home.game_win_pct).toBe(30);

    expect(idle.matches_played).toBe(0);
    expect(standings[0].team_id).toBe(2); // away ranked first
  });

  it("records a match tie when line wins are equal", () => {
    const lines = [
      line({ winner: "home", home_set1: 6, away_set1: 3 }),
      line({ winner: "away", home_set1: 2, away_set1: 6 }),
    ];
    const [home, away] = computeStandingsFromMatches(
      teams.slice(0, 2),
      [{ home_team_id: 1, away_team_id: 2, lines }],
    ).sort((a, b) => a.team_id - b.team_id);

    expect(home.match_ties).toBe(1);
    expect(away.match_ties).toBe(1);
    expect(home.match_wins).toBe(0);
    expect(away.match_wins).toBe(0);
    expect(home.match_win_pct).toBe(0);
  });

  it("skips matches with no line results", () => {
    const standings = computeStandingsFromMatches(teams.slice(0, 2), [
      { home_team_id: 1, away_team_id: 2, lines: [] },
    ]);
    expect(standings.every((s) => s.matches_played === 0)).toBe(true);
  });

  it("ranks by match wins, then ties, then game win %", () => {
    const a = { id: 10, name: "Alpha" };
    const b = { id: 11, name: "Bravo" };
    const c = { id: 12, name: "Charlie" };
    // Alpha 1-0, Bravo 1-0 with worse games, Charlie 0-2
    const standings = computeStandingsFromMatches([a, b, c], [
      {
        home_team_id: 10, away_team_id: 12,
        lines: [line({ winner: "home", home_set1: 6, away_set1: 0, home_set2: 6, away_set2: 0 })],
      },
      {
        home_team_id: 11, away_team_id: 12,
        lines: [line({ winner: "home", home_set1: 6, away_set1: 4, home_set2: 6, away_set2: 4 })],
      },
    ]);
    expect(standings.map((s) => s.team_name)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(standings[0].game_win_pct).toBeGreaterThan(standings[1].game_win_pct);
  });

  it("keeps league game totals zero-sum (every game won equals a game lost)", () => {
    const standings = computeStandingsFromMatches(teams.slice(0, 2), [
      {
        home_team_id: 1, away_team_id: 2,
        lines: [
          line({ winner: "home", home_set1: 6, away_set1: 4, home_set2: 3, away_set2: 6, home_set3: 6, away_set3: 1 }),
          line({ winner: "tie", home_set1: 4, away_set1: 4 }),
          line({ winner: "away", home_set1: 1, away_set1: 6 }),
        ],
      },
    ]);
    const totalWon = standings.reduce((n, s) => n + s.games_won, 0);
    const totalLost = standings.reduce((n, s) => n + s.games_lost, 0);
    expect(totalWon).toBe(totalLost);
  });
});

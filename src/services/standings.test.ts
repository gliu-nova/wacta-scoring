import { describe, expect, it } from "vitest";
import { countGames, countSets, matchWinner, computeStandingsFromMatches } from "./standings";
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

function twoSet(winner: "home" | "away", winGames = 6, loseGames = 4): LineResult {
  return winner === "home"
    ? line({ winner, home_set1: winGames, away_set1: loseGames, home_set2: winGames, away_set2: loseGames })
    : line({ winner, home_set1: loseGames, away_set1: winGames, home_set2: loseGames, away_set2: winGames });
}

function threeSet(winner: "home" | "away"): LineResult {
  return winner === "home"
    ? line({ winner, home_set1: 6, away_set1: 4, home_set2: 3, away_set2: 6, home_set3: 6, away_set3: 2 })
    : line({ winner, home_set1: 4, away_set1: 6, home_set2: 6, away_set2: 3, home_set3: 2, away_set3: 6 });
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

describe("countSets", () => {
  it("counts a two-set line win as 2-0 even if boxes are flipped", () => {
    const normal = line({
      winner: "away",
      home_set1: 1, away_set1: 6,
      home_set2: 2, away_set2: 6,
    });
    expect(countSets(normal)).toEqual([0, 2]);

    const flipped = line({
      winner: "away",
      home_set1: 6, away_set1: 1,
      home_set2: 6, away_set2: 2,
    });
    expect(countSets(flipped)).toEqual([0, 2]);
  });

  it("counts a three-set line as 2-1 for the line winner", () => {
    const r = line({
      winner: "home",
      home_set1: 6, away_set1: 4,
      home_set2: 3, away_set2: 6,
      home_set3: 6, away_set3: 2,
    });
    expect(countSets(r)).toEqual([2, 1]);
  });

  it("counts set winners from entered scores on a tied line", () => {
    const r = line({
      winner: "tie",
      home_set1: 6, away_set1: 4,
      home_set2: 3, away_set2: 6,
    });
    expect(countSets(r)).toEqual([1, 1]);
  });
});

describe("matchWinner", () => {
  it("uses line wins when they are not tied", () => {
    expect(matchWinner([twoSet("home"), twoSet("home"), twoSet("away")])).toBe("home");
  });

  it("breaks a 2-2 line tie by sets", () => {
    const lines = [twoSet("home"), twoSet("home"), threeSet("away"), threeSet("away")];
    expect(matchWinner(lines)).toBe("home"); // 6 sets to 4
  });

  it("breaks a 2-2 set tie by games", () => {
    const lines = [twoSet("home", 6, 1), twoSet("home", 6, 1), twoSet("away", 6, 4), twoSet("away", 6, 4)];
    expect(matchWinner(lines)).toBe("home");
  });

  it("is a match tie when lines, sets, and games are all even", () => {
    const lines = [twoSet("home"), twoSet("home"), twoSet("away"), twoSet("away")];
    expect(matchWinner(lines)).toBe("tie");
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

  it("awards a match win on a 2-2 when one team won more sets", () => {
    const lines = [twoSet("home"), twoSet("home"), threeSet("away"), threeSet("away")];
    const [home, away] = computeStandingsFromMatches(
      teams.slice(0, 2),
      [{ home_team_id: 1, away_team_id: 2, lines }],
    ).sort((a, b) => a.team_id - b.team_id);

    expect(home.line_wins).toBe(2);
    expect(away.line_wins).toBe(2);
    expect(home.match_wins).toBe(1);
    expect(away.match_losses).toBe(1);
    expect(home.match_ties).toBe(0);
    expect(away.match_ties).toBe(0);
  });

  it("awards a match win on a 2-2 when sets are even but one team won more games", () => {
    const lines = [twoSet("home", 6, 1), twoSet("home", 6, 1), twoSet("away", 6, 4), twoSet("away", 6, 4)];
    const [home, away] = computeStandingsFromMatches(
      teams.slice(0, 2),
      [{ home_team_id: 1, away_team_id: 2, lines }],
    ).sort((a, b) => a.team_id - b.team_id);

    expect(home.line_wins).toBe(2);
    expect(away.line_wins).toBe(2);
    expect(home.match_wins).toBe(1);
    expect(away.match_losses).toBe(1);
    expect(home.match_ties).toBe(0);
  });

  it("records a match tie when 2-2 lines, sets, and games are all even", () => {
    const lines = [twoSet("home"), twoSet("home"), twoSet("away"), twoSet("away")];
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

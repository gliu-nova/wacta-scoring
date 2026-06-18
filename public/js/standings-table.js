import { esc } from "/js/ui.js";

function wlt(w, l, t) {
  return `<span class="text-green-700">${w}</span>-<span class="text-red-600">${l}</span>-<span class="text-slate-500">${t}</span>`;
}

export function renderStandingsTable(standings) {
  return `<table class="w-full text-sm"><thead class="bg-slate-100"><tr>
    <th class="p-3 text-left">Ranking</th><th class="p-3 text-left">Team</th>
    <th class="p-3">Record (W-L-T)</th>
    <th class="p-3">% of Matches Won</th>
    <th class="p-3">Lines (W-L-T)</th>
    <th class="p-3">% of Games Won</th></tr></thead><tbody>${
    standings.map((t, i) => `<tr class="border-t">
      <td class="p-3 text-slate-400">${i + 1}</td>
      <td class="p-3 font-medium">${esc(t.team_name)}</td>
      <td class="p-3 text-center">${wlt(t.match_wins, t.match_losses, t.match_ties)}</td>
      <td class="p-3 text-center">${t.match_win_pct}%</td>
      <td class="p-3 text-center">${wlt(t.line_wins, t.line_losses, t.line_ties)}</td>
      <td class="p-3 text-center font-medium">${t.game_win_pct}%</td></tr>`).join("")
    || `<tr><td colspan="6" class="p-8 text-center text-slate-400">No completed matches yet</td></tr>`
  }</tbody></table>`;
}

export function renderLeagueStandings(leagueName, standings) {
  return `<div class="bg-white rounded-xl border overflow-x-auto">
    <h2 class="text-lg font-semibold p-4 border-b bg-slate-50">${esc(leagueName)}</h2>
    ${renderStandingsTable(standings)}
  </div>`;
}
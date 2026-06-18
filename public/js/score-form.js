import { esc } from "/js/ui.js";

function setInputs(line, r, n) {
  const h = r?.["home_set" + n];
  const a = r?.["away_set" + n];
  return `<div class="grid grid-cols-3 gap-2 text-sm items-center"><span>Set ${n}</span>
    <input name="h${n}_${line.id}" type="number" min="0" value="${h ?? ""}" placeholder="—" class="border rounded px-2 py-1">
    <input name="a${n}_${line.id}" type="number" min="0" value="${a ?? ""}" placeholder="—" class="border rounded px-2 py-1"></div>`;
}

export function renderLineCards(lineData, homeName, awayName) {
  return lineData.map(({ line, result: r, lineup: lu }) => {
    const win = r?.winner ?? "";
    return `<div class="bg-white p-4 rounded-xl border">
      <h3 class="font-semibold mb-3">${esc(line.name)}</h3>
      <div class="mb-4">
        <label class="text-sm font-medium text-slate-700">Result <span class="text-red-600">*</span></label>
        <div class="flex flex-wrap gap-4 mt-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="winner_${line.id}" value="home" ${win === "home" ? "checked" : ""} required>
            <span>${esc(homeName)} wins</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="winner_${line.id}" value="away" ${win === "away" ? "checked" : ""} required>
            <span>${esc(awayName)} wins</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="winner_${line.id}" value="tie" ${win === "tie" ? "checked" : ""} required>
            <span>Tie</span>
          </label>
        </div>
      </div>
      <p class="text-xs text-slate-400 mb-2">Set scores optional — e.g. 4-6, 6-2, 1-0</p>
      ${setInputs(line, r, 1)}${setInputs(line, r, 2)}
      <div class="grid grid-cols-3 gap-2 text-sm items-center mt-2"><span>Set 3</span>
        <input name="h3_${line.id}" type="number" min="0" value="${r?.home_set3 ?? ""}" placeholder="—" class="border rounded px-2 py-1">
        <input name="a3_${line.id}" type="number" min="0" value="${r?.away_set3 ?? ""}" placeholder="—" class="border rounded px-2 py-1"></div>
      <div class="mt-4 pt-3 border-t">
        <p class="text-xs text-slate-400 mb-2">Who played (optional)</p>
        <div class="grid sm:grid-cols-2 gap-3">
          <input name="home_players_${line.id}" placeholder="${esc(homeName)} players" value="${esc(lu?.home_players_text ?? "")}" class="border rounded-lg px-3 py-2 text-sm">
          <input name="away_players_${line.id}" placeholder="${esc(awayName)} players" value="${esc(lu?.away_players_text ?? "")}" class="border rounded-lg px-3 py-2 text-sm">
        </div>
      </div>
    </div>`;
  }).join("");
}

function num(fd, key) {
  const v = fd.get(key);
  return v === "" || v == null ? undefined : +v;
}

export function templatesToLineData(templates) {
  return templates.map((t) => ({ line: { id: t.id, name: t.name }, result: null, lineup: null }));
}

export function parseScoresForm(fd, lineData) {
  return lineData.map(({ line }) => ({
    match_line_id: line.id,
    winner: fd.get("winner_" + line.id),
    home_set1: num(fd, "h1_" + line.id),
    away_set1: num(fd, "a1_" + line.id),
    home_set2: num(fd, "h2_" + line.id),
    away_set2: num(fd, "a2_" + line.id),
    home_set3: num(fd, "h3_" + line.id),
    away_set3: num(fd, "a3_" + line.id),
    home_players_text: fd.get("home_players_" + line.id) || undefined,
    away_players_text: fd.get("away_players_" + line.id) || undefined,
  }));
}

export function parseGuestScoresForm(fd, lineData) {
  return parseScoresForm(fd, lineData).map(({ match_line_id, ...rest }) => ({
    line_template_id: match_line_id,
    ...rest,
  }));
}
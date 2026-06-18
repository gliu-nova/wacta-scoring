import { esc } from "/js/ui.js";

function setInputs(line, r, n) {
  const h = r?.["home_set" + n];
  const a = r?.["away_set" + n];
  return `<div class="grid grid-cols-4 gap-2 text-sm items-center"><span>Set ${n}</span>
    <input name="h${n}_${line.id}" type="number" min="0" value="${h ?? ""}" placeholder="—" class="border rounded px-2 py-1">
    <input name="a${n}_${line.id}" type="number" min="0" value="${a ?? ""}" placeholder="—" class="border rounded px-2 py-1">
    <div class="flex gap-1"><input name="htb${n}_${line.id}" placeholder="TB" value="${r?.["home_tb" + n] ?? ""}" class="border rounded px-1 py-1 w-12 text-xs">
    <input name="atb${n}_${line.id}" placeholder="TB" value="${r?.["away_tb" + n] ?? ""}" class="border rounded px-1 py-1 w-12 text-xs"></div></div>`;
}

export function renderLineCards(lineData, homeName, awayName) {
  return lineData.map(({ line, result: r, lineup: lu }) => {
    const win = r?.winner ?? "";
    return `<div class="bg-white p-4 rounded-xl border">
      <h3 class="font-semibold mb-3">${esc(line.name)}</h3>
      <div class="mb-4">
        <label class="text-sm font-medium text-slate-700">Winner <span class="text-red-600">*</span></label>
        <div class="flex flex-wrap gap-4 mt-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="winner_${line.id}" value="home" ${win === "home" ? "checked" : ""} required>
            <span>${esc(homeName)}</span>
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="winner_${line.id}" value="away" ${win === "away" ? "checked" : ""} required>
            <span>${esc(awayName)}</span>
          </label>
        </div>
      </div>
      <p class="text-xs text-slate-400 mb-2">Set scores optional — enter what you played (1 set, 2 sets, 10-pt tiebreak, etc.)</p>
      ${setInputs(line, r, 1)}${setInputs(line, r, 2)}
      <div class="grid grid-cols-4 gap-2 text-sm items-center mt-2"><span>Set 3 / STB</span>
        <input name="h3_${line.id}" type="number" min="0" value="${r?.home_set3 ?? ""}" placeholder="—" class="border rounded px-2 py-1">
        <input name="a3_${line.id}" type="number" min="0" value="${r?.away_set3 ?? ""}" placeholder="—" class="border rounded px-2 py-1">
        <div class="flex gap-1"><input name="htb3_${line.id}" placeholder="TB" value="${r?.home_tb3 ?? ""}" class="border rounded px-1 py-1 w-12 text-xs">
        <input name="atb3_${line.id}" placeholder="TB" value="${r?.away_tb3 ?? ""}" class="border rounded px-1 py-1 w-12 text-xs"></div></div>
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

export function parseScoresForm(fd, lineData) {
  return lineData.map(({ line }) => ({
    match_line_id: line.id,
    winner: fd.get("winner_" + line.id),
    home_set1: num(fd, "h1_" + line.id),
    away_set1: num(fd, "a1_" + line.id),
    home_tb1: fd.get("htb1_" + line.id) || undefined,
    away_tb1: fd.get("atb1_" + line.id) || undefined,
    home_set2: num(fd, "h2_" + line.id),
    away_set2: num(fd, "a2_" + line.id),
    home_tb2: fd.get("htb2_" + line.id) || undefined,
    away_tb2: fd.get("atb2_" + line.id) || undefined,
    home_set3: num(fd, "h3_" + line.id),
    away_set3: num(fd, "a3_" + line.id),
    home_tb3: fd.get("htb3_" + line.id) || undefined,
    away_tb3: fd.get("atb3_" + line.id) || undefined,
    home_players_text: fd.get("home_players_" + line.id) || undefined,
    away_players_text: fd.get("away_players_" + line.id) || undefined,
  }));
}
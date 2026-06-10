const API = "/api";

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return document.querySelectorAll(sel); }

function showAlert(el, msg, type = "error") {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.hidden = false;
}

function hideAlert(el) { if (el) el.hidden = true; }

function formatDate(d) {
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function getStoredPassword() {
  return sessionStorage.getItem("submit_password") || "";
}

function setStoredPassword(pw) {
  if (pw) sessionStorage.setItem("submit_password", pw);
}

async function loadLeaderboard(container) {
  container.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const data = await api("/leaderboard");
    if (!data.length) {
      container.innerHTML = '<div class="empty">No players yet. Add players to get started.</div>';
      return;
    }
    container.innerHTML = `<table>
      <thead><tr><th>#</th><th>Player</th><th>W-L</th><th>Win%</th></tr></thead>
      <tbody>${data.map((p, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td><strong>${esc(p.name)}</strong><br><span style="color:var(--muted);font-size:0.8rem">${p.ntrp.toFixed(1)} NTRP</span></td>
          <td><span class="win">${p.wins}</span>-<span class="loss">${p.losses}</span></td>
          <td><strong>${p.win_pct}%</strong></td>
        </tr>`).join("")}</tbody>
    </table>`;
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
  }
}

async function loadMatches(container, limit = 15) {
  container.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const data = await api(`/matches?limit=${limit}`);
    if (!data.length) {
      container.innerHTML = '<div class="empty">No matches recorded yet.</div>';
      return;
    }
    container.innerHTML = data.map((m) => `
      <div class="match-row">
        <div>
          <div class="match-players">${esc(m.winner_name)} <span style="color:var(--muted);font-weight:400">def.</span> ${esc(m.loser_name)}</div>
          <div class="match-meta">${formatDate(m.match_date)}${m.notes ? " · " + esc(m.notes) : ""}</div>
        </div>
        <div class="match-score">${esc(m.score)}</div>
      </div>`).join("");
  } catch (e) {
    container.innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`;
  }
}

async function loadPlayers(selectEl) {
  const players = await api("/players");
  selectEl.innerHTML = '<option value="">Select player…</option>' +
    players.map((p) => `<option value="${p.id}">${esc(p.name)} (${p.ntrp.toFixed(1)})</option>`).join("");
  return players;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export { api, $, showAlert, hideAlert, loadLeaderboard, loadMatches, loadPlayers, getStoredPassword, setStoredPassword, esc };
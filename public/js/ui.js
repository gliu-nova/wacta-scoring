const API = "/api";

export async function api(path, opts = {}) {
  const res = await fetch(API + path, { credentials: "include", ...opts, headers: { "Content-Type": "application/json", ...opts.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function getUser() {
  const { user } = await api("/auth/me");
  return user;
}

export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

export function nav(user, active = "", pendingCount = 0) {
  const links = [
    ["Home", "/"], ["Enter Match Results", "/enter.html"], ["Standings", "/standings.html"],
    ["Past Match Results", "/past-results.html"],
  ];
  if (user) links.push(["Approvals", "/approvals.html", pendingCount]);
  if (user?.role === "admin") links.push(["Admin", "/admin.html"]);
  return `<header class="bg-emerald-700 text-white shadow-lg sticky top-0 z-50">
    <div class="max-w-5xl mx-auto px-4 py-3">
      <div class="flex flex-wrap justify-between items-center gap-2">
        <a href="/" class="font-bold text-lg">🎾 WACTA Scoring</a>
        <div class="flex flex-wrap gap-3 text-sm items-center">
          ${links.map(([l, h, badge]) => `<a href="${h}" class="hover:text-emerald-200 ${active === l ? "underline" : ""}">${l}${badge ? ` (${badge})` : ""}</a>`).join("")}
          ${user ? `<span class="text-emerald-200">${esc(user.username)}</span><button id="logout-btn" class="hover:text-emerald-200">Logout</button>` : `<a href="/login.html" class="bg-emerald-600 px-3 py-1 rounded">Login</a>`}
        </div>
      </div>
    </div>
  </header>`;
}

export function page(title, body, active = "") {
  document.title = title + " — WACTA";
  document.body.innerHTML = `<div id="nav"></div><main class="max-w-5xl mx-auto px-4 py-6" id="main">${body}</main>`;
  getUser().then(async (user) => {
    let pendingCount = 0;
    if (user) {
      try {
        const { count } = await api("/matches/pending/count");
        pendingCount = count;
      } catch { /* ignore */ }
    }
    document.getElementById("nav").innerHTML = nav(user, active, pendingCount);
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
      await api("/auth/logout", { method: "POST" });
      location.href = "/";
    });
  });
}

export function alert(el, msg, type = "error") {
  el.className = `mb-4 p-3 rounded-lg text-sm ${type === "error" ? "bg-red-100 text-red-800 border border-red-200" : "bg-emerald-100 text-emerald-900 border border-emerald-200"}`;
  el.textContent = msg;
  el.hidden = false;
}

export function downloadCsv(path) {
  const a = document.createElement("a");
  a.href = API + path;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
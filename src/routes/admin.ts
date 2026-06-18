import { Hono } from "hono";
import { getUser, hashPassword } from "../auth";
import { logActivity, logActivityLinked } from "../services/activity";
import { buildFieldChangeDetails } from "../services/changes";
import { getPendingCount } from "../services/pending";
import type { Env, League, LeagueLineTemplate, Player, Team, User } from "../types";

const admin = new Hono<{ Bindings: Env }>();

async function requireAdmin(c: { env: Env; req: Request }) {
  const user = await getUser(c as never);
  if (!user || user.role !== "admin") return null;
  return user;
}

admin.get("/stats", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const count = async (sql: string) => (await c.env.DB.prepare(sql).first<{ n: number }>())?.n ?? 0;
  return c.json({
    leagues: await count("SELECT COUNT(*) as n FROM leagues"),
    teams: await count("SELECT COUNT(*) as n FROM teams"),
    players: await count("SELECT COUNT(*) as n FROM players"),
    matches: await count("SELECT COUNT(*) as n FROM matches"),
    pending: await getPendingCount(c.env.DB),
  });
});

// Leagues
admin.get("/leagues", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM leagues ORDER BY name").all<League>();
  return c.json(rows.results ?? []);
});
admin.post("/leagues", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const { name, description } = await c.req.json<{ name?: string; description?: string }>();
  await c.env.DB.prepare("INSERT INTO leagues (name, description) VALUES (?, ?)").bind(name?.trim(), description?.trim() || null).run();
  const league = await c.env.DB.prepare("SELECT * FROM leagues WHERE name = ?").bind(name?.trim()).first<League>();
  const user = await getUser(c as never);
  if (league) await logActivity(c.env.DB, user, `Added league ${league.name}`);
  return c.json(league, 201);
});
admin.put("/leagues/:id", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const { name, description } = await c.req.json<{ name?: string; description?: string }>();
  await c.env.DB.prepare("UPDATE leagues SET name = ?, description = ? WHERE id = ?").bind(name?.trim(), description?.trim() || null, id).run();
  const user = await getUser(c as never);
  await logActivity(c.env.DB, user, `Updated league ${name?.trim()}`);
  return c.json(await c.env.DB.prepare("SELECT * FROM leagues WHERE id = ?").bind(id).first());
});
admin.delete("/leagues/:id", async (c) => {
  const user = await requireAdmin(c);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const league = await c.env.DB.prepare("SELECT name FROM leagues WHERE id = ?").bind(id).first<{ name: string }>();
  await c.env.DB.prepare("DELETE FROM leagues WHERE id = ?").bind(id).run();
  if (league) await logActivity(c.env.DB, user, `Removed league ${league.name}`);
  return c.json({ ok: true });
});
admin.get("/leagues/:id/lines", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM league_line_templates WHERE league_id = ? ORDER BY sort_order")
    .bind(Number(c.req.param("id"))).all<LeagueLineTemplate>();
  return c.json(rows.results ?? []);
});
admin.post("/leagues/:id/lines", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const leagueId = Number(c.req.param("id"));
  const { name, is_doubles } = await c.req.json<{ name?: string; is_doubles?: boolean }>();
  const count = await c.env.DB.prepare("SELECT COUNT(*) as n FROM league_line_templates WHERE league_id = ?").bind(leagueId).first<{ n: number }>();
  await c.env.DB.prepare("INSERT INTO league_line_templates (league_id, name, sort_order, is_doubles) VALUES (?, ?, ?, ?)")
    .bind(leagueId, name?.trim(), count?.n ?? 0, is_doubles ? 1 : 0).run();
  const user = await getUser(c as never);
  await logActivity(c.env.DB, user, `Added line template "${name?.trim()}"`);
  return c.json({ ok: true }, 201);
});
admin.put("/leagues/:leagueId/lines/:lineId", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const leagueId = Number(c.req.param("leagueId"));
  const lineId = Number(c.req.param("lineId"));
  const { name, is_doubles } = await c.req.json<{ name?: string; is_doubles?: boolean }>();
  const before = await c.env.DB.prepare(
    "SELECT * FROM league_line_templates WHERE id = ? AND league_id = ?"
  ).bind(lineId, leagueId).first<LeagueLineTemplate>();
  if (!before) return c.json({ error: "Not found" }, 404);
  const newName = name?.trim() ?? before.name;
  const newDoubles = is_doubles !== undefined ? (is_doubles ? 1 : 0) : before.is_doubles;
  await c.env.DB.prepare("UPDATE league_line_templates SET name = ?, is_doubles = ? WHERE id = ?")
    .bind(newName, newDoubles, lineId).run();
  await c.env.DB.prepare(
    `UPDATE match_lines SET name = ?, is_doubles = ?
     WHERE sort_order = ? AND match_id IN (SELECT id FROM matches WHERE league_id = ?)`
  ).bind(newName, newDoubles, before.sort_order, leagueId).run();
  const user = await getUser(c as never);
  const league = await c.env.DB.prepare("SELECT name FROM leagues WHERE id = ?").bind(leagueId).first<{ name: string }>();
  const changes: Array<{ field: string; before: string; after: string; cell?: string }> = [];
  if (before.name !== newName) changes.push({ field: "Name", before: before.name, after: newName, cell: "name" });
  if (before.is_doubles !== newDoubles) {
    changes.push({ field: "Format", before: before.is_doubles ? "Doubles" : "Singles", after: newDoubles ? "Doubles" : "Singles", cell: "format" });
  }
  const details = buildFieldChangeDetails("line", String(lineId), changes);
  if (details) {
    details.subtitle = (details.subtitle ? `${league?.name ?? "League"}: ` : "") + details.subtitle + " (updated on all past matches too)";
    await logActivityLinked(c.env.DB, user, `Updated line "${newName}"`, `/league-lines.html?id=${leagueId}`, details);
  }
  return c.json({ ok: true });
});
admin.delete("/leagues/:leagueId/lines/:lineId", async (c) => {
  const user = await requireAdmin(c);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const line = await c.env.DB.prepare("SELECT name FROM league_line_templates WHERE id = ?").bind(Number(c.req.param("lineId"))).first<{ name: string }>();
  await c.env.DB.prepare("DELETE FROM league_line_templates WHERE id = ?").bind(Number(c.req.param("lineId"))).run();
  if (line) await logActivity(c.env.DB, user, `Removed line template "${line.name}"`);
  return c.json({ ok: true });
});

// Teams
admin.get("/teams", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM teams ORDER BY name").all<Team>();
  return c.json(rows.results ?? []);
});
admin.post("/teams", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const { name, league_id } = await c.req.json<{ name?: string; league_id?: number }>();
  await c.env.DB.prepare("INSERT INTO teams (name, league_id) VALUES (?, ?)").bind(name?.trim(), league_id).run();
  const user = await getUser(c as never);
  await logActivity(c.env.DB, user, `Added team ${name?.trim()}`);
  return c.json({ ok: true }, 201);
});
admin.put("/teams/:id", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const { name, league_id } = await c.req.json<{ name?: string; league_id?: number }>();
  const before = await c.env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(id).first<Team>();
  const user = await getUser(c as never);
  const changes: Array<{ field: string; before: string; after: string; cell?: string }> = [];
  if (before && name?.trim() !== before.name) {
    changes.push({ field: "Name", before: before.name, after: name?.trim() ?? "", cell: "name" });
  }
  if (before && league_id !== before.league_id) {
    const leagues = await c.env.DB.prepare("SELECT id, name FROM leagues").all<{ id: number; name: string }>();
    const lmap = new Map((leagues.results ?? []).map((l) => [l.id, l.name]));
    changes.push({ field: "League", before: lmap.get(before.league_id) ?? "?", after: lmap.get(league_id!) ?? "?", cell: "league" });
  }
  await c.env.DB.prepare("UPDATE teams SET name = ?, league_id = ? WHERE id = ?").bind(name?.trim(), league_id, id).run();
  const details = buildFieldChangeDetails("team", String(id), changes);
  if (details) await logActivityLinked(c.env.DB, user, `Updated team ${name?.trim()}`, "/teams.html", details);
  return c.json({ ok: true });
});
admin.delete("/teams/:id", async (c) => {
  const user = await requireAdmin(c);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const team = await c.env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(id).first<{ name: string }>();
  await c.env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(id).run();
  if (team) await logActivity(c.env.DB, user, `Removed team ${team.name}`);
  return c.json({ ok: true });
});

// Players
admin.get("/players", async (c) => {
  const q = c.req.query("q") || "";
  let stmt = "SELECT * FROM players";
  const binds: string[] = [];
  if (q) { stmt += " WHERE first_name LIKE ? OR last_name LIKE ?"; binds.push(`%${q}%`, `%${q}%`); }
  stmt += " ORDER BY last_name, first_name";
  const rows = await c.env.DB.prepare(stmt).bind(...binds).all<Player>();
  return c.json(rows.results ?? []);
});
admin.post("/players", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const b = await c.req.json<{ first_name?: string; last_name?: string; ntrp_rating?: number; team_id?: number | null; email?: string }>();
  await c.env.DB.prepare("INSERT INTO players (first_name, last_name, ntrp_rating, team_id, email) VALUES (?, ?, ?, ?, ?)")
    .bind(b.first_name?.trim(), b.last_name?.trim(), b.ntrp_rating ?? 3.5, b.team_id ?? null, b.email?.trim() || null).run();
  const user = await getUser(c as never);
  await logActivity(c.env.DB, user, `Added player ${b.first_name?.trim()} ${b.last_name?.trim()}`);
  return c.json({ ok: true }, 201);
});
admin.put("/players/:id", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ first_name?: string; last_name?: string; ntrp_rating?: number; team_id?: number | null; email?: string }>();
  const before = await c.env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(id).first<Player>();
  const user = await getUser(c as never);
  const teams = await c.env.DB.prepare("SELECT id, name FROM teams").all<{ id: number; name: string }>();
  const tmap = new Map((teams.results ?? []).map((t) => [t.id, t.name]));
  const teamLabel = (tid: number | null) => (tid ? tmap.get(tid) ?? "?" : "—");
  const changes: Array<{ field: string; before: string; after: string; cell?: string }> = [];
  if (before) {
    const full = (p: Player) => `${p.first_name} ${p.last_name}`;
    const afterFull = `${b.first_name?.trim()} ${b.last_name?.trim()}`;
    if (full(before) !== afterFull) {
      changes.push({ field: "Name", before: full(before), after: afterFull, cell: "name" });
    }
    if (before.ntrp_rating !== (b.ntrp_rating ?? 3.5)) {
      changes.push({ field: "NTRP", before: before.ntrp_rating.toFixed(1), after: (b.ntrp_rating ?? 3.5).toFixed(1), cell: "ntrp" });
    }
    if (before.team_id !== (b.team_id ?? null)) {
      changes.push({ field: "Team", before: teamLabel(before.team_id), after: teamLabel(b.team_id ?? null), cell: "team" });
    }
  }
  await c.env.DB.prepare("UPDATE players SET first_name=?, last_name=?, ntrp_rating=?, team_id=?, email=? WHERE id=?")
    .bind(b.first_name?.trim(), b.last_name?.trim(), b.ntrp_rating ?? 3.5, b.team_id ?? null, b.email?.trim() || null, id).run();
  const details = buildFieldChangeDetails("player", String(id), changes);
  if (details) await logActivityLinked(c.env.DB, user, `Updated player ${b.first_name?.trim()} ${b.last_name?.trim()}`, "/players-admin.html", details);
  return c.json({ ok: true });
});
admin.delete("/players/:id", async (c) => {
  const user = await requireAdmin(c);
  if (!user) return c.json({ error: "Forbidden" }, 403);
  const id = Number(c.req.param("id"));
  const player = await c.env.DB.prepare("SELECT first_name, last_name FROM players WHERE id = ?").bind(id).first<{ first_name: string; last_name: string }>();
  await c.env.DB.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
  if (player) await logActivity(c.env.DB, user, `Removed player ${player.first_name} ${player.last_name}`);
  return c.json({ ok: true });
});

// Users
admin.get("/users", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const rows = await c.env.DB.prepare("SELECT id, username, role, team_id, created_at FROM users ORDER BY username").all();
  return c.json(rows.results ?? []);
});
admin.post("/users", async (c) => {
  if (!(await requireAdmin(c))) return c.json({ error: "Forbidden" }, 403);
  const { username, password, role, team_id } = await c.req.json<{ username?: string; password?: string; role?: string; team_id?: number | null }>();
  const hash = await hashPassword(password || "");
  await c.env.DB.prepare("INSERT INTO users (username, password_hash, role, team_id) VALUES (?, ?, ?, ?)")
    .bind(username?.trim(), hash, role || "captain", team_id ?? null).run();
  const user = await getUser(c as never);
  await logActivity(c.env.DB, user, `Added user ${username?.trim()} (${role || "captain"})`);
  return c.json({ ok: true }, 201);
});

export default admin;
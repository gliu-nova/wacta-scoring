import { Hono } from "hono";
import { getUser, hashPassword } from "../auth";
import { logActivity } from "../services/activity";
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
  const { name, league_id } = await c.req.json<{ name?: string; league_id?: number }>();
  await c.env.DB.prepare("UPDATE teams SET name = ?, league_id = ? WHERE id = ?")
    .bind(name?.trim(), league_id, Number(c.req.param("id"))).run();
  const user = await getUser(c as never);
  await logActivity(c.env.DB, user, `Updated team ${name?.trim()}`);
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
  const b = await c.req.json<{ first_name?: string; last_name?: string; ntrp_rating?: number; team_id?: number | null; email?: string }>();
  await c.env.DB.prepare("UPDATE players SET first_name=?, last_name=?, ntrp_rating=?, team_id=?, email=? WHERE id=?")
    .bind(b.first_name?.trim(), b.last_name?.trim(), b.ntrp_rating ?? 3.5, b.team_id ?? null, b.email?.trim() || null, Number(c.req.param("id"))).run();
  const user = await getUser(c as never);
  await logActivity(c.env.DB, user, `Updated player ${b.first_name?.trim()} ${b.last_name?.trim()}`);
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
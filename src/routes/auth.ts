import { Hono } from "hono";
import { clearAuthCookie, createToken, getUser, hashPassword, setAuthCookie, verifyPassword } from "../auth";
import type { Env, User } from "../types";

const auth = new Hono<{ Bindings: Env }>();

auth.post("/login", async (c) => {
  const { username, password } = await c.req.json<{ username?: string; password?: string }>();
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<User>();
  if (!user || !(await verifyPassword(password || "", user.password_hash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }
  const token = await createToken(user, c.env);
  setAuthCookie(c, token);
  return c.json({ id: user.id, username: user.username, role: user.role, team_id: user.team_id });
});

auth.post("/logout", (c) => { clearAuthCookie(c); return c.json({ ok: true }); });

auth.get("/me", async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ user: null });
  return c.json({ user: { id: user.id, username: user.username, role: user.role, team_id: user.team_id } });
});

export default auth;
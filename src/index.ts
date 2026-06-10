import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createMatch,
  createPlayer,
  getLeaderboard,
  getPlayers,
  getRecentMatches,
} from "./db";
import { ensureTables } from "./migrate";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", cors());
app.use("*", async (c, next) => {
  await ensureTables(c.env.DB);
  await next();
});

function checkSubmitAuth(c: { env: Env; req: Request }, password?: string) {
  const secret = c.env.SUBMIT_PASSWORD;
  if (!secret) return true;
  const provided =
    password || c.req.header("X-Submit-Password") || "";
  return provided === secret;
}

app.get("/health", (c) => c.json({ ok: true }));

app.get("/leaderboard", async (c) => {
  const data = await getLeaderboard(c.env.DB);
  return c.json(data);
});

app.get("/matches", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") || 20), 50);
  const data = await getRecentMatches(c.env.DB, limit);
  return c.json(data);
});

app.get("/players", async (c) => {
  const data = await getPlayers(c.env.DB);
  return c.json(data);
});

app.post("/players", async (c) => {
  const body = await c.req.json<{ name?: string; ntrp?: number; password?: string }>();
  if (!checkSubmitAuth(c, body.password)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const name = body.name?.trim();
  if (!name || name.length < 2) {
    return c.json({ error: "Name is required" }, 400);
  }
  const ntrp = Number(body.ntrp) || 3.5;
  try {
    const player = await createPlayer(c.env.DB, name, ntrp);
    return c.json(player, 201);
  } catch {
    return c.json({ error: "Player already exists or invalid data" }, 409);
  }
});

app.post("/matches", async (c) => {
  const body = await c.req.json<{
    winner_id?: number;
    loser_id?: number;
    score?: string;
    match_date?: string;
    notes?: string;
    password?: string;
  }>();
  if (!checkSubmitAuth(c, body.password)) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const winner_id = Number(body.winner_id);
  const loser_id = Number(body.loser_id);
  const score = body.score?.trim();
  const match_date = body.match_date?.trim();
  if (!winner_id || !loser_id || winner_id === loser_id) {
    return c.json({ error: "Pick different winner and loser" }, 400);
  }
  if (!score) return c.json({ error: "Score is required" }, 400);
  if (!match_date) return c.json({ error: "Date is required" }, 400);
  try {
    const match = await createMatch(c.env.DB, {
      winner_id,
      loser_id,
      score,
      match_date,
      notes: body.notes,
    });
    return c.json(match, 201);
  } catch {
    return c.json({ error: "Failed to save match" }, 400);
  }
});

export default app;
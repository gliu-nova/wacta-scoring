import { Hono } from "hono";
import { cors } from "hono/cors";
import { ensureTables } from "./migrate";
import admin from "./routes/admin";
import auth from "./routes/auth";
import matches from "./routes/matches";
import players from "./routes/players";
import standings from "./routes/standings";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", cors({ origin: "*", credentials: true }));
app.use("*", async (c, next) => { await ensureTables(c.env.DB); await next(); });

app.get("/health", (c) => c.json({ ok: true }));

app.route("/auth", auth);
app.route("/admin", admin);
app.route("/matches", matches);
app.route("/standings", standings);
app.route("/players", players);

export default app;
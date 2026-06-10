import { Hono } from "hono";
import type { Context } from "hono";
import { getUser } from "../auth";
import { bundleCsv, matchesCsv, playersCsv, standingsCsv } from "../services/export";
import type { Env } from "../types";

const exportRoutes = new Hono<{ Bindings: Env }>();

async function isAdmin(c: Context<{ Bindings: Env }>): Promise<boolean> {
  const user = await getUser(c);
  return user?.role === "admin";
}

function hasExportToken(c: Context<{ Bindings: Env }>): boolean {
  const token = c.req.query("token");
  return !!(c.env.EXPORT_TOKEN && token && token === c.env.EXPORT_TOKEN);
}

async function canExportAll(c: Context<{ Bindings: Env }>): Promise<boolean> {
  return (await isAdmin(c)) || hasExportToken(c);
}

function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

exportRoutes.get("/standings.csv", async (c) => {
  const leagueId = Number(c.req.query("league_id"));
  if (!leagueId) return c.json({ error: "league_id required" }, 400);
  const csv = await standingsCsv(c.env.DB, leagueId);
  return csvResponse(csv, `standings-league-${leagueId}.csv`);
});

exportRoutes.get("/matches.csv", async (c) => {
  const leagueId = c.req.query("league_id") ? Number(c.req.query("league_id")) : undefined;
  const csv = await matchesCsv(c.env.DB, leagueId);
  return csvResponse(csv, leagueId ? `matches-league-${leagueId}.csv` : "matches-all.csv");
});

exportRoutes.get("/players.csv", async (c) => {
  if (!(await canExportAll(c))) return c.json({ error: "Forbidden" }, 403);
  const leagueId = c.req.query("league_id") ? Number(c.req.query("league_id")) : undefined;
  const csv = await playersCsv(c.env.DB, leagueId);
  return csvResponse(csv, leagueId ? `players-league-${leagueId}.csv` : "players-all.csv");
});

exportRoutes.get("/all.csv", async (c) => {
  if (!(await canExportAll(c))) return c.json({ error: "Forbidden" }, 403);
  const csv = await bundleCsv(c.env.DB);
  return csvResponse(csv, `wacta-export-${new Date().toISOString().slice(0, 10)}.csv`);
});

export default exportRoutes;
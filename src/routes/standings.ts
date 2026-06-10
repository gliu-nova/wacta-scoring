import { Hono } from "hono";
import { computeStandings } from "../services/standings";
import type { Env } from "../types";

const standings = new Hono<{ Bindings: Env }>();

standings.get("/:leagueId", async (c) => {
  const data = await computeStandings(c.env.DB, Number(c.req.param("leagueId")));
  return c.json(data);
});

export default standings;
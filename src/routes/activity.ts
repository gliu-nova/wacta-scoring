import { Hono } from "hono";
import { getRecentActivity } from "../services/activity";
import type { Env } from "../types";

const activity = new Hono<{ Bindings: Env }>();

activity.get("/recent", async (c) => {
  const limit = Number(c.req.query("limit")) || 20;
  return c.json(await getRecentActivity(c.env.DB, limit));
});

export default activity;
import { Hono } from "hono";
import { getActivityById, getRecentActivity } from "../services/activity";
import type { Env } from "../types";

const activity = new Hono<{ Bindings: Env }>();

activity.get("/recent", async (c) => {
  const limit = Number(c.req.query("limit")) || 20;
  return c.json(await getRecentActivity(c.env.DB, limit));
});

activity.get("/:id", async (c) => {
  const entry = await getActivityById(c.env.DB, Number(c.req.param("id")));
  if (!entry) return c.json({ error: "Not found" }, 404);
  return c.json(entry);
});

export default activity;
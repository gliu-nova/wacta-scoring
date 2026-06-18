import type { ActivityDetails } from "./changes";
import type { User } from "../types";

export type ActivityEntry = {
  id: number;
  username: string | null;
  description: string;
  link: string | null;
  details: ActivityDetails | null;
  created_at: string;
};

function parseDetails(raw: string | null): ActivityDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActivityDetails;
  } catch {
    return null;
  }
}

function mapRow(row: {
  id: number;
  username: string | null;
  description: string;
  link: string | null;
  details: string | null;
  created_at: string;
}): ActivityEntry {
  return { ...row, details: parseDetails(row.details) };
}

export async function logActivity(
  db: D1Database,
  user: User | null,
  description: string,
  link?: string,
  details?: ActivityDetails | null,
): Promise<number> {
  const r = await db.prepare(
    "INSERT INTO activity_log (user_id, username, description, link, details) VALUES (?, ?, ?, ?, ?)"
  ).bind(
    user?.id ?? null,
    user?.username ?? null,
    description,
    link ?? null,
    details ? JSON.stringify(details) : null,
  ).run();
  return Number(r.meta.last_row_id);
}

/** Log activity and set link to include ?activity=id for highlight navigation. */
export async function logActivityLinked(
  db: D1Database,
  user: User | null,
  description: string,
  baseLink: string,
  details?: ActivityDetails | null,
): Promise<number> {
  const id = await logActivity(db, user, description, null, details);
  const sep = baseLink.includes("?") ? "&" : "?";
  await db.prepare("UPDATE activity_log SET link = ? WHERE id = ?").bind(`${baseLink}${sep}activity=${id}`, id).run();
  return id;
}

export async function getActivityById(db: D1Database, id: number): Promise<ActivityEntry | null> {
  const row = await db.prepare(
    "SELECT id, username, description, link, details, created_at FROM activity_log WHERE id = ?"
  ).bind(id).first<{
    id: number;
    username: string | null;
    description: string;
    link: string | null;
    details: string | null;
    created_at: string;
  }>();
  return row ? mapRow(row) : null;
}

export async function getRecentActivity(db: D1Database, limit = 20): Promise<ActivityEntry[]> {
  const rows = await db.prepare(
    "SELECT id, username, description, link, details, created_at FROM activity_log ORDER BY created_at DESC LIMIT ?"
  ).bind(Math.min(limit, 50)).all<{
    id: number;
    username: string | null;
    description: string;
    link: string | null;
    details: string | null;
    created_at: string;
  }>();
  return (rows.results ?? []).map(mapRow);
}
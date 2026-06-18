import type { User } from "../types";

export async function logActivity(
  db: D1Database,
  user: User | null,
  description: string,
  link?: string,
): Promise<void> {
  await db.prepare("INSERT INTO activity_log (user_id, username, description, link) VALUES (?, ?, ?, ?)")
    .bind(user?.id ?? null, user?.username ?? null, description, link ?? null).run();
}

export async function getRecentActivity(db: D1Database, limit = 20) {
  const rows = await db.prepare(
    "SELECT id, username, description, link, created_at FROM activity_log ORDER BY created_at DESC LIMIT ?"
  ).bind(Math.min(limit, 50)).all<{ id: number; username: string | null; description: string; link: string | null; created_at: string }>();
  return rows.results ?? [];
}
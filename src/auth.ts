import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env, User, UserRole } from "./types";

export const COOKIE = "wacta_session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function secret(env: Env): Uint8Array {
  const key = env.SECRET_KEY || "dev-secret-change-in-production";
  return new TextEncoder().encode(key);
}

export async function createToken(user: User, env: Env): Promise<string> {
  return new SignJWT({ sub: String(user.id), role: user.role, team_id: user.team_id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("72h")
    .sign(secret(env));
}

export async function decodeToken(token: string, env: Env) {
  try {
    const { payload } = await jwtVerify(token, secret(env));
    return payload as { sub: string; role: UserRole; team_id: number | null };
  } catch {
    return null;
  }
}

export async function getUser(c: Context<{ Bindings: Env }>): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const payload = await decodeToken(token, c.env);
  if (!payload) return null;
  return c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.sub).first<User>();
}

export function setAuthCookie(c: Context<{ Bindings: Env }>, token: string) {
  setCookie(c, COOKIE, token, { httpOnly: true, path: "/", maxAge: 72 * 3600, sameSite: "Lax" });
}

export function clearAuthCookie(c: Context<{ Bindings: Env }>) {
  deleteCookie(c, COOKIE, { path: "/" });
}

export function canEditMatch(user: User, homeTeamId: number, awayTeamId: number): boolean {
  if (user.role === "admin") return true;
  if (user.role === "captain" && user.team_id && [homeTeamId, awayTeamId].includes(user.team_id)) return true;
  return false;
}
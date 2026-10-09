import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

const COOKIE = "gl_session";

/** Anonymous demo session id stored in an httpOnly cookie (no personal data). */
export async function getSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return existing;
  const id = randomUUID();
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  return id;
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

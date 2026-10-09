import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

let devSecret: string | null = null;
function secret(): string {
  const s = process.env.LIVE_SECRET?.trim() || process.env.LEDGER_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (s) return s;
  // No secret configured: a per-process random one. Tokens then only live as long as this server process.
  devSecret ??= randomBytes(32).toString("hex");
  return devSecret;
}

export type TokenClaims = { s: string; r: "host" } | { s: string; r: "p"; p: string };

const mac = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

/** Opaque, signed capability. Bound to one session, so a token never works against another session. */
export function signLive(claims: TokenClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyLive(token: string | null | undefined, sessionId: string): TokenClaims | null {
  if (!token || token.length > 600) return null;
  const [body, given] = token.split(".");
  if (!body || !given) return null;
  const expected = Buffer.from(mac(body));
  const got = Buffer.from(given);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenClaims;
    return c.s === sessionId ? c : null;
  } catch {
    return null;
  }
}

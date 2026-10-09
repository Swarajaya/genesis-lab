import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  return process.env.LEDGER_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "genesis-lab-local-dev-secret";
}

const b64 = (b: Buffer) => b.toString("base64url");

/** HMAC-signed opaque token. Prevents the client from editing balances, rules or nonces. */
export function signToken(payload: unknown): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const mac = b64(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${mac}`;
}

export function verifyToken<T>(token: string): T | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

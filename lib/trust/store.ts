import "server-only";
import { getAdmin } from "@/lib/supabase/admin";
import type { RegistryStatus } from "@/lib/engines/trust/model";

/**
 * Replay-protection nonces and the credential revocation registry.
 * Always backed by process memory; additionally mirrored to Supabase (trust_nonces, trust_registry) when configured,
 * so that replay detection and revocation survive across serverless instances. See supabase/trust_engine.sql.
 */
interface Mem {
  nonces: Map<string, number>;
  registry: Map<string, { status: RegistryStatus; owner: string; at: number }>;
}
const g = globalThis as unknown as { __trustMem?: Mem };
const mem: Mem = (g.__trustMem ??= { nonces: new Map(), registry: new Map() });
const NONCE_KEEP_MS = 15 * 60_000;

/** Returns true if this is the FIRST time the nonce is seen (i.e. not a replay). */
export async function consumeNonce(nonce: string): Promise<{ first: boolean; durable: boolean }> {
  const now = Date.now();
  if (mem.nonces.size > 5000) for (const [k, t] of mem.nonces) if (now - t > NONCE_KEEP_MS) mem.nonces.delete(k);
  if (mem.nonces.has(nonce)) return { first: false, durable: false };
  mem.nonces.set(nonce, now);
  const db = getAdmin();
  if (!db) return { first: true, durable: false };
  try {
    const { error } = await db.from("trust_nonces").insert({ nonce });
    if (error?.code === "23505") return { first: false, durable: true };
    return { first: true, durable: !error };
  } catch {
    return { first: true, durable: false };
  }
}

export async function registryRegister(handle: string, owner: string): Promise<void> {
  mem.registry.set(handle, { status: "active", owner, at: Date.now() });
  const db = getAdmin();
  if (!db) return;
  try {
    await db.from("trust_registry").upsert({ handle, status: "active", owner_session: owner, updated_at: new Date().toISOString() });
  } catch {
    /* memory copy remains authoritative for this instance */
  }
}

export async function registryGet(handle: string): Promise<RegistryStatus | undefined> {
  const m = mem.registry.get(handle);
  const db = getAdmin();
  if (db) {
    try {
      const { data } = await db.from("trust_registry").select("status").eq("handle", handle).maybeSingle();
      if (data?.status === "active" || data?.status === "suspended" || data?.status === "revoked") return data.status;
    } catch {
      /* fall through to memory */
    }
  }
  return m?.status;
}

export async function registrySet(handle: string, status: RegistryStatus, owner: string): Promise<"ok" | "unknown" | "forbidden"> {
  const m = mem.registry.get(handle);
  let known = m;
  const db = getAdmin();
  if (!known && db) {
    try {
      const { data } = await db.from("trust_registry").select("owner_session,status").eq("handle", handle).maybeSingle();
      if (data) known = { status: data.status as RegistryStatus, owner: data.owner_session as string, at: Date.now() };
    } catch {
      /* ignore */
    }
  }
  if (!known) return "unknown";
  if (known.owner !== owner) return "forbidden";
  mem.registry.set(handle, { status, owner, at: Date.now() });
  if (db) {
    try {
      await db.from("trust_registry").update({ status, updated_at: new Date().toISOString() }).eq("handle", handle);
    } catch {
      /* ignore */
    }
  }
  return "ok";
}

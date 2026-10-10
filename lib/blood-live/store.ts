import { EventEmitter } from "node:events";
import type { Allocation, LiveEvent, Participant, World } from "@/lib/engines/blood/liveTypes";

export interface SessionRow {
  id: string;
  status: "active" | "ended";
  world: World;
  version: number;
  createdAt: string;
  expiresAt: string;
  endedAt: string | null;
}

export interface Loaded {
  session: SessionRow;
  participants: Participant[];
  allocations: Allocation[];
}

export interface Commit {
  expectedVersion: number;
  world: World;
  status: "active" | "ended";
  endedAt: string | null;
  participants: Participant[];
  allocations: Allocation[];
  events: LiveEvent[];
}

/** Storage contract. `commit` is an atomic compare-and-swap on the session version. */
export interface LiveStore {
  readonly kind: "supabase" | "memory";
  create(row: SessionRow): Promise<void>;
  load(id: string): Promise<Loaded | null>;
  commit(id: string, c: Commit): Promise<boolean>;
  events(id: string, limit: number): Promise<LiveEvent[]>;
}

// ------------------------------------------------------------------ in-memory (tests, and local dev without Supabase)

export class MemoryStore implements LiveStore {
  readonly kind = "memory" as const;
  private sessions = new Map<string, SessionRow>();
  private participants = new Map<string, Map<string, Participant>>();
  private allocations = new Map<string, Map<string, Allocation>>();
  private evs = new Map<string, LiveEvent[]>();

  async create(row: SessionRow) {
    this.sessions.set(row.id, structuredClone(row));
    this.participants.set(row.id, new Map());
    this.allocations.set(row.id, new Map());
    this.evs.set(row.id, []);
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  async load(id: string): Promise<Loaded | null> {
    const s = this.sessions.get(id);
    if (!s) return null;
    return {
      session: structuredClone(s),
      participants: structuredClone([...(this.participants.get(id)?.values() ?? [])]),
      allocations: structuredClone([...(this.allocations.get(id)?.values() ?? [])]),
    };
  }

  async commit(id: string, c: Commit): Promise<boolean> {
    const s = this.sessions.get(id);
    if (!s || s.version !== c.expectedVersion) return false;
    // Enforce the same uniqueness the database does: one live (offered/confirmed) row per patient+donor.
    const allocs = this.allocations.get(id)!;
    const merged = new Map(allocs);
    c.allocations.forEach((a) => merged.set(a.id, a));
    const seen = new Set<string>();
    for (const a of merged.values()) {
      if (a.state !== "offered" && a.state !== "confirmed") continue;
      const k = `${a.patientId}|${a.donorCode}`;
      if (seen.has(k)) return false;
      seen.add(k);
    }
    s.world = structuredClone(c.world);
    s.status = c.status;
    s.endedAt = c.endedAt;
    s.version += 1;
    c.participants.forEach((p) => this.participants.get(id)!.set(p.id, structuredClone(p)));
    c.allocations.forEach((a) => allocs.set(a.id, structuredClone(a)));
    this.evs.get(id)!.push(...structuredClone(c.events));
    return true;
  }

  async events(id: string, limit: number) {
    return structuredClone((this.evs.get(id) ?? []).slice(-limit));
  }
}

// ------------------------------------------------------------------ Supabase (service role, server only)

const iso = (v: unknown) => (typeof v === "string" ? v : new Date(String(v)).toISOString());

export class SupabaseStore implements LiveStore {
  readonly kind = "supabase" as const;
  constructor(private readonly db: import("@supabase/supabase-js").SupabaseClient) {}

  async create(row: SessionRow) {
    const { error } = await this.db.from("blood_live_sessions").insert({ id: row.id, status: row.status, world: row.world, version: row.version, expires_at: row.expiresAt, created_at: row.createdAt });
    if (error) throw new Error("session_create_failed");
  }

  async load(id: string): Promise<Loaded | null> {
    const [s, p, a] = await Promise.all([
      this.db.from("blood_live_sessions").select("*").eq("id", id).maybeSingle(),
      this.db.from("blood_live_participants").select("*").eq("session_id", id).order("joined_at"),
      this.db.from("blood_live_allocations").select("*").eq("session_id", id).order("created_at"),
    ]);
    if (s.error || !s.data) return null;
    if (p.error || a.error) throw new Error("session_load_failed");
    const r = s.data;
    return {
      session: { id: r.id, status: r.status, world: r.world, version: r.version, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at), endedAt: r.ended_at ? iso(r.ended_at) : null },
      participants: (p.data ?? []).map((x) => ({ id: x.id, role: x.role, code: x.code, abo: x.abo, rh: x.rh, units: x.units, zone: x.zone, online: x.online, connected: x.connected, hospitalRequests: x.hospital_requests, joinedAt: iso(x.joined_at) })),
      allocations: (a.data ?? []).map((x) => ({ id: x.id, patientId: x.patient_id, donorCode: x.donor_code, participantId: x.participant_id, units: x.units, state: x.state, createdAt: iso(x.created_at), updatedAt: iso(x.updated_at) })),
    };
  }

  async commit(id: string, c: Commit): Promise<boolean> {
    const { data, error } = await this.db.rpc("blood_live_commit", {
      p_session: id,
      p_expected: c.expectedVersion,
      p_world: c.world,
      p_status: c.status,
      p_ended: c.endedAt,
      p_participants: c.participants.map((p) => ({ id: p.id, role: p.role, code: p.code, abo: p.abo, rh: p.rh, units: p.units, zone: p.zone, online: p.online, connected: p.connected, hospital_requests: p.hospitalRequests, joined_at: p.joinedAt })),
      p_allocations: c.allocations.map((a) => ({ id: a.id, patient_id: a.patientId, donor_code: a.donorCode, participant_id: a.participantId, units: a.units, state: a.state, created_at: a.createdAt, updated_at: a.updatedAt })),
      p_events: c.events.map((e) => ({ seq: e.seq, type: e.type, actor: e.actor, message: e.message, data: e.data, created_at: e.at })),
    });
    if (error) {
      // 23505 = unique violation: a concurrent request already took this allocation. Treat as a lost race.
      if (error.code === "23505") return false;
      throw new Error("session_commit_failed");
    }
    return data === true;
  }

  async events(id: string, limit: number): Promise<LiveEvent[]> {
    const { data, error } = await this.db.from("blood_live_events").select("*").eq("session_id", id).order("seq", { ascending: false }).limit(limit);
    if (error) return [];
    return (data ?? []).reverse().map((x) => ({ seq: x.seq, type: x.type, at: iso(x.created_at), actor: x.actor, message: x.message, data: x.data ?? {} }));
  }
}

// ------------------------------------------------------------------ singleton + local fan-out bus

type G = typeof globalThis & { __liveMem?: MemoryStore; __liveBus?: EventEmitter };
const g = globalThis as G;

export const liveBus: EventEmitter = (g.__liveBus ??= new EventEmitter().setMaxListeners(200));

/**
 * Supabase is used only when the Live Mode tables and the commit function actually exist (probed once, safely:
 * the probe targets a random session id and writes nothing). Otherwise Live Mode runs from server memory with the
 * local stream, so a fresh project works immediately and the QR flow never fails with a 500.
 */
const PROBE_RETRY_MS = 15_000;
type Probe = { ready: boolean; at: number; why?: string };
const gp = globalThis as G & { __liveProbe?: Probe };

async function liveTablesReady(db: import("@supabase/supabase-js").SupabaseClient): Promise<boolean> {
  const cached = gp.__liveProbe;
  if (cached && (cached.ready || Date.now() - cached.at < PROBE_RETRY_MS)) return cached.ready;
  let ready = false;
  let why = "";
  try {
    // Never let an unreachable or paused Supabase hang a request: give the probe a hard 5 s budget.
    const probe = async () => {
      const t = await db.from("blood_live_sessions").select("id").limit(1);
      const f = await db.rpc("blood_live_commit", { p_session: "00000000-0000-4000-8000-000000000000", p_expected: -1, p_world: {}, p_status: "active", p_ended: null, p_participants: [], p_allocations: [], p_events: [] });
      return { ok: !t.error && !f.error, why: t.error?.message || f.error?.message || "" };
    };
    const r = await Promise.race([probe(), new Promise<{ ok: boolean; why: string }>((res) => setTimeout(() => res({ ok: false, why: "Supabase did not answer within 5 s (project paused or URL wrong?)" }), 5000))]);
    ready = r.ok;
    why = r.why;
    if (!ready) console.warn("[blood-live] Supabase live tables not usable:", why, "Run supabase/blood_live.sql in the Supabase SQL editor.");
  } catch (e) {
    ready = false;
    why = e instanceof Error ? e.message : "probe failed";
  }
  gp.__liveProbe = { ready, at: Date.now(), why };
  return ready;
}

/** Memory store only (used when a Supabase write fails and the session must live in server memory instead). */
export function memoryStore(): MemoryStore {
  return (g.__liveMem ??= new MemoryStore());
}

/** `sessionId` pins a session to the store that actually holds it, so a probe flip can never strand a session. */
export async function getStore(sessionId?: string): Promise<LiveStore> {
  if (sessionId && g.__liveMem?.has(sessionId)) return g.__liveMem;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getAdmin } = await import("@/lib/supabase/admin");
    const db = getAdmin();
    if (db && (await liveTablesReady(db))) return new SupabaseStore(db);
  }
  // Serverless hosts (Vercel) run every request on a different instance, so an in-memory session would vanish
  // between the QR scan and the next request. Fail loudly with the fix instead of "working" on the desktop only.
  if (process.env.VERCEL) {
    const { ApiError } = await import("@/lib/security/api");
    throw new ApiError(503, "live_storage_missing", "Live Mode needs the Supabase tables on this host. Run the Blood LIVE MODE block of supabase/schema.sql in the Supabase SQL editor, and set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return (g.__liveMem ??= new MemoryStore());
}

/** Booleans and short reasons only (no secrets). Used by GET /api/blood/live so a deployment can be checked from a browser. */
export async function diagnose() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    LIVE_SECRET: Boolean(process.env.LIVE_SECRET),
  };
  let tables: "ready" | "not_ready" | "not_configured" = "not_configured";
  let reason = "";
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { getAdmin } = await import("@/lib/supabase/admin");
    const db = getAdmin();
    if (db) {
      delete gp.__liveProbe; // always a fresh answer
      tables = (await liveTablesReady(db)) ? "ready" : "not_ready";
      reason = (gp as { __liveProbe?: Probe }).__liveProbe?.why ?? "";
    }
  }
  const vercel = Boolean(process.env.VERCEL);
  const store = tables === "ready" ? "supabase" : vercel ? "unavailable" : "memory";
  return { vercel, store, tables, reason: reason.slice(0, 200), env, realtime: env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "supabase broadcast + polling" : "polling" };
}

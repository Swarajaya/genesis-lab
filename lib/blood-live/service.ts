import { randomInt, randomUUID } from "node:crypto";
import { applyAction, buildSnapshot, newState, SESSION_TTL_MS, LiveError, type Actor, type Ctx, type LiveAction, type LiveEvent, type LiveState, type Snapshot } from "@/lib/engines/blood/live";
import { signLive, verifyLive } from "./auth";
import { getStore, liveBus, memoryStore, type LiveStore, type Loaded } from "./store";

export interface SessionInfo {
  id: string;
  code: string;
  status: "active" | "ended" | "expired";
  expiresAt: string;
  transport: "supabase" | "local";
}

export interface FullSnapshot extends Snapshot {
  session: SessionInfo;
  feed: LiveEvent[];
}

export type HostAction = LiveAction | { type: "end" };

const defaultCtx = (): Ctx => ({ now: () => new Date(), uid: () => randomUUID(), digits: () => String(randomInt(1000, 10000)) });
export const sessionCode = (id: string) => id.slice(0, 4).toUpperCase();

function info(l: Loaded, store: LiveStore, now: Date): SessionInfo {
  const expired = l.session.status === "active" && now.getTime() >= new Date(l.session.expiresAt).getTime();
  return { id: l.session.id, code: sessionCode(l.session.id), status: expired ? "expired" : l.session.status, expiresAt: l.session.expiresAt, transport: store.kind === "supabase" ? "supabase" : "local" };
}

const stateOf = (l: Loaded): LiveState => ({ world: l.session.world, participants: l.participants, allocations: l.allocations });

const changed = <T extends { id: string }>(before: T[], after: T[]): T[] => {
  const prev = new Map(before.map((x) => [x.id, JSON.stringify(x)]));
  return after.filter((x) => prev.get(x.id) !== JSON.stringify(x));
};

/** Tell every subscribed device that state changed. Clients refetch the authoritative snapshot. */
async function publish(sessionId: string, seq: number, kind: LiveStore["kind"]) {
  liveBus.emit(sessionId, seq);
  try {
    if (kind !== "supabase") return;
    const { getAdmin } = await import("@/lib/supabase/admin");
    const db = getAdmin();
    if (!db) return;
    const ch = db.channel(`blood-live:${sessionId}`);
    await ch.httpSend("tick", { seq });
    void db.removeChannel(ch);
  } catch {
    /* Realtime delivery is best effort; clients also refetch on reconnect. */
  }
}

export async function createSession(ctx: Ctx = defaultCtx(), store?: LiveStore): Promise<{ sessionId: string; hostToken: string; code: string; expiresAt: string }> {
  let st = store ?? (await getStore());
  const now = ctx.now();
  const id = ctx.uid();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const open = async (target: LiveStore) => {
    const world = newState().world;
    await target.create({ id, status: "active", world, version: 0, createdAt: now.toISOString(), expiresAt, endedAt: null });
    world.seq = 1;
    const ev: LiveEvent = { seq: 1, type: "SESSION_STARTED", at: now.toISOString(), actor: "host", message: `LIVE BLOOD NETWORK ${sessionCode(id)} started`, data: {} };
    if (!(await target.commit(id, { expectedVersion: 0, world, status: "active", endedAt: null, participants: [], allocations: [], events: [ev] }))) throw new Error("session_first_commit_failed");
    // Read it back through the same path every later request will use. If that fails, this store is not usable.
    if (!(await target.load(id))) throw new Error("session_readback_failed");
  };
  try {
    await open(st);
  } catch (e) {
    // A configured-but-broken Supabase must not break the demo on a developer machine. On Vercel there is no safe fallback.
    if (store || st.kind !== "supabase" || process.env.VERCEL) throw e;
    console.error("[blood-live] Supabase session storage failed, using server memory instead:", e instanceof Error ? e.message : e);
    st = memoryStore();
    await open(st);
  }
  return { sessionId: id, hostToken: signLive({ s: id, r: "host" }), code: sessionCode(id), expiresAt };
}

function actorFor(token: string | null | undefined, sessionId: string, action: HostAction): Actor {
  if (action.type === "join") return { kind: "anonymous" };
  const claims = verifyLive(token, sessionId);
  if (!claims) throw new LiveError("unauthorized", "This device is not authorised for the session.", 401);
  return claims.r === "host" ? { kind: "host" } : { kind: "participant", id: claims.p };
}

export interface PerformResult {
  snapshot: FullSnapshot;
  participantToken?: string;
  participantId?: string;
}

export async function perform(sessionId: string, token: string | null | undefined, action: HostAction, ctx: Ctx = defaultCtx(), store?: LiveStore): Promise<PerformResult> {
  const st = store ?? (await getStore(sessionId));
  const actor = actorFor(token, sessionId, action);
  for (let attempt = 0; attempt < 5; attempt++) {
    const loaded = await st.load(sessionId);
    if (!loaded) throw new LiveError("not_found", "Session not found.", 404);
    const si = info(loaded, st, ctx.now());
    if (si.status !== "active") throw new LiveError(si.status === "ended" ? "session_ended" : "session_expired", si.status === "ended" ? "This session has ended." : "This session has expired.", 410);

    let next: LiveState;
    let events: LiveEvent[];
    let status: "active" | "ended" = "active";
    let endedAt: string | null = null;
    if (action.type === "end") {
      if (actor.kind !== "host") throw new LiveError("forbidden", "Only the host can end the session.", 403);
      next = stateOf(loaded);
      next.world = { ...next.world, seq: next.world.seq + 1 };
      events = [{ seq: next.world.seq, type: "SESSION_ENDED", at: ctx.now().toISOString(), actor: "host", message: "SESSION ENDED", data: {} }];
      status = "ended";
      endedAt = ctx.now().toISOString();
    } else {
      ({ state: next, events } = applyAction(stateOf(loaded), action, actor, ctx));
    }
    const ok = await st.commit(sessionId, {
      expectedVersion: loaded.session.version,
      world: next.world,
      status,
      endedAt,
      participants: changed(loaded.participants, next.participants),
      allocations: changed(loaded.allocations, next.allocations),
      events,
    });
    if (!ok) continue; // lost a race with another request: reload and re-apply on fresh state
    void publish(sessionId, next.world.seq, st.kind);
    const joined = action.type === "join" ? next.participants.find((p) => !loaded.participants.some((q) => q.id === p.id)) : undefined;
    const viewer = actor.kind === "participant" ? actor.id : joined?.id ?? null;
    const snap = await snapshot(sessionId, viewer, ctx, st);
    return { snapshot: snap, participantId: joined?.id, participantToken: joined ? signLive({ s: sessionId, r: "p", p: joined.id }) : undefined };
  }
  throw new LiveError("busy", "The session is busy. Please try again.", 409);
}

export async function snapshot(sessionId: string, viewerParticipantId: string | null, ctx: Ctx = defaultCtx(), store?: LiveStore): Promise<FullSnapshot> {
  const st = store ?? (await getStore(sessionId));
  const loaded = await st.load(sessionId);
  if (!loaded) throw new LiveError("not_found", "Session not found.", 404);
  const snap = buildSnapshot(stateOf(loaded), viewerParticipantId);
  return { ...snap, session: info(loaded, st, ctx.now()), feed: await st.events(sessionId, 60) };
}

/** Resolve the viewing participant from a token without exposing anything about other devices. */
export function viewerOf(token: string | null | undefined, sessionId: string): string | null {
  const c = verifyLive(token, sessionId);
  return c && c.r === "p" ? c.p : null;
}

export { liveBus };

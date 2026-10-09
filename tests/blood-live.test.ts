import { describe, expect, it } from "vitest";
import { AIProviderRouter } from "@/lib/ai/router";
import { ProviderError } from "@/lib/ai/errors";
import type { AIProvider, ProviderName } from "@/lib/ai/types";
import { signLive, verifyLive } from "@/lib/blood-live/auth";
import { createCoalescer } from "@/lib/blood-live/coalesce";
import { explainFacts } from "@/lib/blood-live/explain";
import { createSession, liveBus, perform, snapshot, viewerOf } from "@/lib/blood-live/service";
import { MemoryStore } from "@/lib/blood-live/store";
import { actionRequest } from "@/lib/blood-live/schemas";
import { applyAction, buildSnapshot, evaluateFor, newState, plan, SESSION_TTL_MS, type Actor, type Ctx, type LiveAction, type LiveState } from "@/lib/engines/blood/live";
import { LiveError } from "@/lib/engines/blood/liveTypes";
import { DEMO_DONORS, evaluateDonor, rankDonors } from "@/lib/engines/blood/engine";

// ---------------------------------------------------------------- helpers
const mk = (start = "2026-01-01T00:00:00.000Z") => {
  let n = 0;
  let t = new Date(start).getTime();
  const ctx: Ctx = {
    now: () => new Date(t),
    uid: () => {
      n += 1;
      const h = n.toString(16).padStart(12, "0");
      return `00000000-0000-4000-8000-${h}`;
    },
    digits: () => String(4800 + n++),
  };
  return { ctx, advance: (ms: number) => (t += ms) };
};
const HOST: Actor = { kind: "host" };
const ANON: Actor = { kind: "anonymous" };
const step = (s: LiveState, a: LiveAction, actor: Actor, ctx: Ctx) => applyAction(s, a, actor, ctx);
const err = (fn: () => unknown): LiveError => {
  try {
    fn();
  } catch (e) {
    if (e instanceof LiveError) return e;
    throw e;
  }
  throw new Error("expected LiveError");
};
const donorJoin = { type: "join", role: "donor", abo: "A", rh: "+", units: 2, zone: "A" } as const;

function emergency() {
  const { ctx } = mk();
  let s = step(newState(), { type: "start_emergency" }, HOST, ctx).state;
  return { s, ctx, set: (n: LiveState) => (s = n) };
}

function withJudge(abo: "O" | "A" | "B" | "AB" = "A", rh: "+" | "-" = "+", units = 2) {
  const { ctx } = mk();
  let s = step(newState(), { type: "start_emergency" }, HOST, ctx).state;
  const r = step(s, { type: "join", role: "donor", abo, rh, units, zone: "A" }, ANON, ctx);
  s = r.state;
  const me = s.participants[0];
  return { s, ctx, me, actor: { kind: "participant", id: me.id } as Actor };
}

// ---------------------------------------------------------------- scenario + engine reuse
describe("emergency scenario", () => {
  it("starts with 12 patients, 31 units required, 27 available and a 4-unit critical shortage", () => {
    const { s } = emergency();
    const snap = buildSnapshot(s, null);
    expect(snap.metrics).toMatchObject({ patients: 12, unitsRequired: 31, unitsAvailable: 27, shortage: 4, criticalShortage: 4, allocated: 27, pending: 0 });
    const p7 = snap.patients.find((p) => p.id === "P-07")!;
    expect(p7).toMatchObject({ status: "CRITICAL", covered: 0, shortage: 4 });
  });

  it("is deterministic: the same actions always give the same plan", () => {
    const a = emergency();
    const b = emergency();
    expect(JSON.stringify(plan(a.s))).toBe(JSON.stringify(plan(b.s)));
  });

  it("decides compatibility only through the existing engine (RBC matches evaluateDonor exactly)", () => {
    const { s } = emergency();
    const p = s.world.patients[0];
    const d = s.world.bank[2];
    const direct = evaluateDonor({ abo: p.abo, rh: p.rh, antibodies: p.antibodies, unitsNeeded: p.unitsNeeded, urgency: p.urgency, chronicTransfusion: p.chronicTransfusion }, { ...d, available: true }, p.constraints);
    expect(evaluateFor(p, d).verdict).toBe(direct.verdict);
    expect(evaluateFor(p, d).score).toBe(direct.score);
  });

  it("existing blood engine behaviour is unchanged", () => {
    const ranked = rankDonors({ abo: "A", rh: "+", antibodies: [], unitsNeeded: 1, urgency: "urgent", chronicTransfusion: false }, DEMO_DONORS);
    expect(ranked[0].verdict).toBe("MATCH");
  });

  it("applies plasma rules (reverse ABO, Rh ignored)", () => {
    const { s } = emergency();
    const plasma = { ...s.world.patients[0], component: "PLASMA" as const, abo: "A" as const, rh: "-" as const };
    const donor = (abo: "O" | "A" | "B" | "AB", rh: "+" | "-") => ({ ...s.world.bank[0], abo, rh });
    expect(evaluateFor(plasma, donor("AB", "+")).verdict).not.toBe("INCOMPATIBLE"); // AB plasma is universal
    expect(evaluateFor(plasma, donor("O", "+")).verdict).toBe("INCOMPATIBLE"); // O plasma carries anti-A
  });
});

// ---------------------------------------------------------------- participants
describe("participants", () => {
  it("a donor joins, becomes ONLINE and a LIVE-XXXX code is issued", () => {
    const { s, me } = withJudge();
    expect(me.code).toMatch(/^LIVE-\d{4}$/);
    expect(me).toMatchObject({ role: "donor", online: true, connected: true, abo: "A", rh: "+", units: 2, zone: "A" });
    const snap = buildSnapshot(s, me.id);
    expect(snap.metrics.liveDonors).toBe(1);
    expect(snap.donors.find((d) => d.code === me.code)).toMatchObject({ status: "ONLINE", source: "live" });
  });

  it("rejects an incomplete donor registration", () => {
    const { ctx } = mk();
    expect(err(() => step(newState(), { type: "join", role: "donor" }, ANON, ctx)).code).toBe("invalid_donor");
  });

  it("validates registration input at the API boundary", () => {
    expect(actionRequest.safeParse({ action: { type: "join", role: "donor", abo: "A", rh: "+", units: 9, zone: "A" } }).success).toBe(false);
    expect(actionRequest.safeParse({ action: { type: "join", role: "donor", abo: "X", rh: "+", units: 2, zone: "A" } }).success).toBe(false);
    expect(actionRequest.safeParse({ action: donorJoin }).success).toBe(true);
  });

  it("only the host can run host actions; participants cannot", () => {
    const { s, ctx, actor } = withJudge();
    expect(err(() => step(s, { type: "start_emergency" }, actor, ctx)).code).toBe("forbidden");
    expect(err(() => step(s, { type: "stress_step", step: 0 }, actor, ctx)).code).toBe("forbidden");
    expect(err(() => step(s, { type: "escalate" }, ANON, ctx)).code).toBe("forbidden");
  });

  it("an unknown participant id is rejected", () => {
    const { s, ctx } = withJudge();
    expect(err(() => step(s, { type: "set_online", online: false }, { kind: "participant", id: "nope" }, ctx)).code).toBe("forbidden");
  });

  it("device leave and rejoin raise DEVICE_DISCONNECTED / DEVICE_CONNECTED once", () => {
    const { s, ctx, actor } = withJudge();
    const a = step(s, { type: "leave" }, actor, ctx);
    expect(a.events.map((e) => e.type)).toEqual(["DEVICE_DISCONNECTED"]);
    expect(buildSnapshot(a.state, null).metrics.devices).toBe(0);
    expect(step(a.state, { type: "leave" }, actor, ctx).events).toHaveLength(0);
    const b = step(a.state, { type: "rejoin" }, actor, ctx);
    expect(b.events.map((e) => e.type)).toEqual(["DEVICE_CONNECTED"]);
  });

  it("hospital devices can request patients, capped at 3, and donors cannot", () => {
    const { s: s0, ctx } = emergency() as unknown as { s: LiveState; ctx: Ctx };
    let s = step(s0, { type: "join", role: "hospital" }, ANON, ctx).state;
    const h: Actor = { kind: "participant", id: s.participants[0].id };
    for (let i = 0; i < 3; i++) s = step(s, { type: "hospital_submit", abo: "O", rh: "-", units: 1, urgency: "urgent" }, h, ctx).state;
    expect(s.world.patients).toHaveLength(15);
    expect(err(() => step(s, { type: "hospital_submit", abo: "O", rh: "-", units: 1, urgency: "urgent" }, h, ctx)).code).toBe("limit");
    s = step(s, donorJoin, ANON, ctx).state;
    const donor: Actor = { kind: "participant", id: s.participants[1].id };
    expect(err(() => step(s, { type: "hospital_submit", abo: "O", rh: "-", units: 1, urgency: "urgent" }, donor, ctx)).code).toBe("forbidden");
  });
});

// ---------------------------------------------------------------- matching, accept, decline
describe("live matching", () => {
  it("offers the judge's donor a critical patient (P-07) that no bank donor can serve", () => {
    for (const [abo, rh] of [["A", "+"], ["O", "-"], ["AB", "-"], ["B", "+"]] as const) {
      const { s, me } = withJudge(abo, rh);
      const offer = s.allocations.find((a) => a.state === "offered");
      expect(offer, `${abo}${rh}`).toMatchObject({ patientId: "P-07", donorCode: me.code, participantId: me.id, units: 2 });
    }
  });

  it("emits a MATCH_FOUND event addressed to that participant", () => {
    const { ctx } = mk();
    const s = step(newState(), { type: "start_emergency" }, HOST, ctx).state;
    const r = step(s, donorJoin, ANON, ctx);
    const e = r.events.find((x) => x.type === "MATCH_FOUND")!;
    expect(e.data).toMatchObject({ patientId: "P-07", units: 2 });
    expect(e.data.participantId).toBe(r.state.participants[0].id);
  });

  it("ACCEPT confirms the allocation and updates metrics (pending -> allocated)", () => {
    const { s, ctx, actor, me } = withJudge();
    const before = buildSnapshot(s, me.id).metrics;
    expect(before).toMatchObject({ pending: 2, allocated: 27 });
    const offer = s.allocations[0];
    const r = step(s, { type: "respond", allocationId: offer.id, accept: true }, actor, ctx);
    const after = buildSnapshot(r.state, me.id);
    expect(r.state.allocations[0].state).toBe("confirmed");
    expect(after.metrics).toMatchObject({ allocated: 29, pending: 0, shortage: 2 });
    expect(r.events.some((e) => e.type === "MATCH_ACCEPTED" && e.data.patientId === "P-07")).toBe(true);
    expect(after.me?.confirmed).toHaveLength(1);
  });

  it("blocks double acceptance and acceptance of someone else's offer", () => {
    const { s, ctx, actor } = withJudge();
    const id = s.allocations[0].id;
    const once = step(s, { type: "respond", allocationId: id, accept: true }, actor, ctx).state;
    expect(err(() => step(once, { type: "respond", allocationId: id, accept: true }, actor, ctx)).code).toBe("already_answered");
    expect(err(() => step(once, { type: "respond", allocationId: id, accept: false }, actor, ctx)).code).toBe("already_answered");
    const other = step(s, { type: "join", role: "donor", abo: "O", rh: "-", units: 1, zone: "B" }, ANON, ctx).state;
    const intruder: Actor = { kind: "participant", id: other.participants[1].id };
    expect(err(() => step(other, { type: "respond", allocationId: id, accept: true }, intruder, ctx)).code).toBe("not_found");
  });

  it("DECLINE records the refusal and offers the next valid candidate instead", () => {
    const { s, ctx, actor, me } = withJudge();
    let st = step(s, { type: "join", role: "donor", abo: "O", rh: "-", units: 3, zone: "B" }, ANON, ctx).state;
    const second = st.participants[1];
    // the first donor already holds the P-07 offer for 2 units; the second is offered the remaining 2
    expect(st.allocations.filter((a) => a.state === "offered").map((a) => a.donorCode).sort()).toEqual([me.code, second.code].sort());
    const offer = st.allocations.find((a) => a.donorCode === me.code)!;
    const r = step(st, { type: "respond", allocationId: offer.id, accept: false }, actor, ctx);
    st = r.state;
    expect(st.allocations.find((a) => a.id === offer.id)!.state).toBe("declined");
    expect(r.events.some((e) => e.type === "MATCH_DECLINED")).toBe(true);
    // the declined donor is not re-offered the same patient
    expect(st.allocations.some((a) => a.donorCode === me.code && a.state === "offered" && a.patientId === "P-07")).toBe(false);
    // and the other donor now covers all 4 units of P-07
    const second2 = st.allocations.find((a) => a.donorCode === second.code && a.state === "offered")!;
    expect(second2.units).toBe(3);
  });

  it("units are never over-committed across offers", () => {
    const { s, ctx } = withJudge("A", "+", 3);
    const st = step(s, { type: "join", role: "donor", abo: "B", rh: "+", units: 3, zone: "C" }, ANON, ctx).state;
    const total = st.allocations.filter((a) => a.state === "offered").reduce((n, a) => n + a.units, 0);
    expect(total).toBeLessThanOrEqual(4); // P-07 needs 4
  });

  it("a donor who cancels gets their offer withdrawn, and returning re-offers it", () => {
    const { s, ctx, actor, me } = withJudge();
    const off = step(s, { type: "set_online", online: false }, actor, ctx);
    expect(off.state.allocations[0].state).toBe("cancelled");
    expect(off.events.map((e) => e.type)).toEqual(expect.arrayContaining(["DONOR_OFFLINE", "MATCH_CANCELLED"]));
    const snap = buildSnapshot(off.state, me.id);
    expect(snap.donors.find((d) => d.code === me.code)!.status).toBe("OFFLINE");
    expect(snap.metrics).toMatchObject({ liveDonors: 0, pending: 0, unitsAvailable: 27 });
    const back = step(off.state, { type: "set_online", online: true }, actor, ctx);
    expect(back.state.allocations.filter((a) => a.state === "offered")).toHaveLength(1);
  });

  it("cancelling AFTER confirming cancels the confirmed allocation and recalculates", () => {
    const { s, ctx, actor, me } = withJudge();
    const st = step(s, { type: "respond", allocationId: s.allocations[0].id, accept: true }, actor, ctx).state;
    const r = step(st, { type: "set_online", online: false }, actor, ctx);
    expect(r.state.allocations[0].state).toBe("cancelled");
    expect(buildSnapshot(r.state, me.id).metrics).toMatchObject({ allocated: 27, shortage: 4 });
  });

  it("cannot respond after the donor went offline", () => {
    const { s, ctx, actor } = withJudge();
    const off = step(s, { type: "set_online", online: false }, actor, ctx).state;
    expect(err(() => step(off, { type: "respond", allocationId: s.allocations[0].id, accept: true }, actor, ctx)).code).toBe("already_answered");
  });
});

// ---------------------------------------------------------------- console events + inventory
describe("event console and inventory", () => {
  it("DONOR CANCELS takes a bank donor offline and shrinks available units", () => {
    const { s, ctx } = emergency();
    const r = step(s, { type: "donor_cancels", target: "D-103" }, HOST, ctx);
    const m = buildSnapshot(r.state, null).metrics;
    expect(r.state.world.bank.find((d) => d.code === "D-103")!.status).toBe("offline");
    expect(m.unitsAvailable).toBe(24);
    expect(m.shortage).toBeGreaterThan(4);
    expect(r.events[0].type).toBe("DONOR_OFFLINE");
  });

  it("BLOOD UNIT EXPIRES removes the units; default target is the soonest-expiring unit", () => {
    const { s, ctx } = emergency();
    const r = step(s, { type: "unit_expires" }, HOST, ctx);
    expect(r.state.world.bank.find((d) => d.status === "expired")!.code).toBe("D-112"); // 40 h, soonest
    expect(buildSnapshot(r.state, null).metrics.unitsAvailable).toBe(26);
  });

  it("DONOR RETURNS restores units; NEW DONOR ARRIVES adds supply", () => {
    const { s, ctx } = emergency();
    const off = step(s, { type: "donor_cancels", target: "D-103" }, HOST, ctx).state;
    const back = step(off, { type: "donor_returns" }, HOST, ctx).state;
    expect(buildSnapshot(back, null).metrics.unitsAvailable).toBe(27);
    const more = step(back, { type: "new_donor" }, HOST, ctx).state;
    expect(buildSnapshot(more, null).metrics.unitsAvailable).toBe(30);
  });

  it("HOSPITAL REQUEST and EMERGENCY WORSENS change demand", () => {
    const { s, ctx } = emergency();
    const h = step(s, { type: "hospital_request" }, HOST, ctx).state;
    expect(h.world.patients).toHaveLength(13);
    const w = step(h, { type: "emergency_worsens", target: "P-12" }, HOST, ctx).state;
    expect(w.world.patients.find((p) => p.id === "P-12")!.urgency).toBe("urgent");
  });

  it("console actions need an emergency and reject invalid targets", () => {
    const { ctx } = mk();
    expect(err(() => step(newState(), { type: "donor_cancels" }, HOST, ctx)).code).toBe("no_emergency");
    const { s } = emergency();
    expect(err(() => step(s, { type: "donor_cancels", target: "ZZZ-999" }, HOST, ctx)).code).toBe("invalid_target");
  });

  it("event sequence numbers are strictly increasing and gap-free", () => {
    const { ctx } = mk();
    let s = newState();
    const seqs: number[] = [];
    for (const a of [{ type: "start_emergency" }, { type: "new_donor" }, { type: "unit_expires" }] as LiveAction[]) {
      const r = step(s, a, HOST, ctx);
      s = r.state;
      seqs.push(...r.events.map((e) => e.seq));
    }
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
  });
});

// ---------------------------------------------------------------- escalation
describe("patient escalation", () => {
  it("raises urgency, reorders priority and announces PRIORITY UPDATED", () => {
    const { s, ctx } = emergency();
    expect(plan(s).order.indexOf("P-12")).toBe(11);
    const r = step(s, { type: "escalate", target: "P-12" }, HOST, ctx);
    expect(r.state.world.patients.find((p) => p.id === "P-12")!.urgency).toBe("critical");
    expect(r.events.some((e) => e.type === "PRIORITY_UPDATED" && e.data.patientId === "P-12")).toBe(true);
    expect(plan(r.state).order.indexOf("P-12")).toBeLessThan(plan(s).order.indexOf("P-12"));
  });

  it("rebalances live offers after an escalation changes who is short", () => {
    const { s, ctx, me } = withJudge("O", "-", 2);
    // knock out supply for P-12 (B+) so it is short, then escalate it above P-07's turn
    let st = step(s, { type: "donor_cancels", target: "D-111" }, HOST, ctx).state;
    st = step(st, { type: "donor_cancels", target: "D-112" }, HOST, ctx).state;
    const before = st.allocations.find((a) => a.state === "offered")!;
    expect(before.patientId).toBe("P-07"); // critical beats routine
    const r = step(st, { type: "escalate", target: "P-08" }, HOST, ctx);
    const offers = r.state.allocations.filter((a) => a.state === "offered" && a.donorCode === me.code);
    expect(offers).toHaveLength(1);
    expect(["P-07", "P-08"]).toContain(offers[0].patientId);
  });

  it("nothing to escalate is a clean error", () => {
    const { s, ctx } = emergency();
    let st = s;
    for (const p of st.world.patients) p.urgency = "critical";
    expect(err(() => step(st, { type: "escalate" }, HOST, ctx)).code).toBe("invalid_target");
    st = s;
  });
});

// ---------------------------------------------------------------- stress test
describe("stress test", () => {
  const run = () => {
    const { ctx } = mk();
    let s = newState();
    const events: string[] = [];
    for (let i = 0; i <= 7; i++) {
      const r = step(s, { type: "stress_step", step: i }, HOST, ctx);
      s = r.state;
      events.push(...r.events.map((e) => e.message));
    }
    return { s, events };
  };

  it("runs the deterministic 7-step sequence and resolves with consistent numbers", () => {
    const { s, events } = run();
    expect(s.world.phase).toBe("resolved");
    const res = s.world.resolution!;
    const m = buildSnapshot(s, null).metrics;
    expect(res).toMatchObject({ patientsServed: m.served, patientsTotal: m.patients, unitsAllocated: m.allocated, criticalShortage: m.criticalShortage, pending: m.pending });
    expect(res.patientsTotal).toBe(13); // 12 + hospital request
    expect(events.some((e) => e.includes("SYSTEM UNDER STRESS"))).toBe(true);
    expect(events.some((e) => e.startsWith("EMERGENCY RESOLUTION"))).toBe(true);
    expect(s.world.bank.filter((d) => d.status === "offline").map((d) => d.code).sort()).toEqual(["D-103", "D-108"]);
    expect(s.world.bank.find((d) => d.code === "D-111")!.status).toBe("expired");
    expect(s.world.patients.find((p) => p.id === "P-10")!.urgency).toBe("critical");
    expect(s.world.bank.some((d) => d.code.startsWith("NEW-"))).toBe(true);
  });

  it("is fully deterministic (no randomness)", () => {
    expect(run().events).toEqual(run().events);
  });

  it("enforces step order", () => {
    const { ctx } = mk();
    const s = step(newState(), { type: "stress_step", step: 0 }, HOST, ctx).state;
    expect(err(() => step(s, { type: "stress_step", step: 3 }, HOST, ctx)).code).toBe("bad_step");
    const s1 = step(s, { type: "stress_step", step: 1 }, HOST, ctx).state;
    expect(err(() => step(s1, { type: "stress_step", step: 1 }, HOST, ctx)).code).toBe("bad_step");
  });

  it("a joined live donor keeps participating through the stress run", () => {
    const { ctx } = mk();
    let s = step(newState(), { type: "stress_step", step: 0 }, HOST, ctx).state;
    s = step(s, donorJoin, ANON, ctx).state;
    for (let i = 1; i <= 7; i++) s = step(s, { type: "stress_step", step: i }, HOST, ctx).state;
    expect(s.participants[0].online).toBe(true);
    expect(buildSnapshot(s, null).metrics.liveDonors).toBe(1);
  });
});

// ---------------------------------------------------------------- service: sessions, auth, isolation, realtime
describe("sessions (service layer, in-memory store)", () => {
  it("creates a session with a host token, a short code and a 4h expiry", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const s = await createSession(ctx, store);
    expect(s.code).toBe(s.sessionId.slice(0, 4).toUpperCase());
    expect(new Date(s.expiresAt).getTime() - new Date("2026-01-01T00:00:00.000Z").getTime()).toBe(SESSION_TTL_MS);
    expect(verifyLive(s.hostToken, s.sessionId)).toEqual({ s: s.sessionId, r: "host" });
    const snap = await snapshot(s.sessionId, null, ctx, store);
    expect(snap.session.status).toBe("active");
    expect(snap.feed[0].type).toBe("SESSION_STARTED");
  });

  it("join issues a participant token; the full flow works end to end", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const s = await createSession(ctx, store);
    await perform(s.sessionId, s.hostToken, { type: "start_emergency" }, ctx, store);
    const j = await perform(s.sessionId, undefined, donorJoin, ctx, store);
    expect(j.participantToken).toBeTruthy();
    expect(viewerOf(j.participantToken, s.sessionId)).toBe(j.participantId);
    expect(j.snapshot.me?.offers).toHaveLength(1);
    const offer = j.snapshot.me!.offers[0];
    const acc = await perform(s.sessionId, j.participantToken, { type: "respond", allocationId: offer.id, accept: true }, ctx, store);
    expect(acc.snapshot.me?.confirmed).toHaveLength(1);
    const host = await snapshot(s.sessionId, null, ctx, store);
    expect(host.feed.some((e) => e.type === "MATCH_ACCEPTED")).toBe(true);
    expect(host.metrics.allocated).toBe(29);
  });

  it("rejects missing, forged and other-session tokens", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const a = await createSession(ctx, store);
    const b = await createSession(ctx, store);
    await expect(perform(a.sessionId, undefined, { type: "start_emergency" }, ctx, store)).rejects.toMatchObject({ code: "unauthorized", status: 401 });
    await expect(perform(a.sessionId, "garbage.token", { type: "start_emergency" }, ctx, store)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(perform(a.sessionId, a.hostToken.slice(0, -2) + "xx", { type: "start_emergency" }, ctx, store)).rejects.toMatchObject({ code: "unauthorized" });
    // session A's host token must not control session B
    await expect(perform(b.sessionId, a.hostToken, { type: "start_emergency" }, ctx, store)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("sessions are isolated: activity in one never appears in another", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const a = await createSession(ctx, store);
    const b = await createSession(ctx, store);
    await perform(a.sessionId, a.hostToken, { type: "start_emergency" }, ctx, store);
    await perform(a.sessionId, undefined, donorJoin, ctx, store);
    const sb = await snapshot(b.sessionId, null, ctx, store);
    expect(sb.participants).toHaveLength(0);
    expect(sb.patients).toHaveLength(0);
    expect(sb.feed.map((e) => e.type)).toEqual(["SESSION_STARTED"]);
    // a participant token from A does not give a `me` view in B
    const ja = await perform(a.sessionId, undefined, donorJoin, ctx, store);
    expect(viewerOf(ja.participantToken, b.sessionId)).toBeNull();
    await expect(perform(b.sessionId, ja.participantToken, { type: "set_online", online: false }, ctx, store)).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("an ended session can no longer be modified, by host or participants", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const s = await createSession(ctx, store);
    const j = await perform(s.sessionId, undefined, donorJoin, ctx, store);
    await expect(perform(s.sessionId, j.participantToken, { type: "end" }, ctx, store)).rejects.toMatchObject({ code: "forbidden" });
    await perform(s.sessionId, s.hostToken, { type: "end" }, ctx, store);
    const snap = await snapshot(s.sessionId, null, ctx, store);
    expect(snap.session.status).toBe("ended");
    await expect(perform(s.sessionId, s.hostToken, { type: "start_emergency" }, ctx, store)).rejects.toMatchObject({ code: "session_ended", status: 410 });
    await expect(perform(s.sessionId, j.participantToken, { type: "set_online", online: false }, ctx, store)).rejects.toMatchObject({ code: "session_ended" });
    await expect(perform(s.sessionId, undefined, donorJoin, ctx, store)).rejects.toMatchObject({ code: "session_ended" });
  });

  it("sessions expire after the TTL", async () => {
    const t = mk();
    const store = new MemoryStore();
    const s = await createSession(t.ctx, store);
    t.advance(SESSION_TTL_MS - 1000);
    await perform(s.sessionId, s.hostToken, { type: "start_emergency" }, t.ctx, store);
    t.advance(2000);
    await expect(perform(s.sessionId, s.hostToken, { type: "new_donor" }, t.ctx, store)).rejects.toMatchObject({ code: "session_expired", status: 410 });
    expect((await snapshot(s.sessionId, null, t.ctx, store)).session.status).toBe("expired");
  });

  it("unknown sessions return not_found", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    await expect(snapshot("00000000-0000-4000-8000-00000000dead", null, ctx, store)).rejects.toMatchObject({ code: "not_found", status: 404 });
  });

  it("publishes a realtime tick after every committed change (and not for rejected actions)", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const s = await createSession(ctx, store);
    const ticks: number[] = [];
    liveBus.on(s.sessionId, (n: number) => ticks.push(n));
    await perform(s.sessionId, s.hostToken, { type: "start_emergency" }, ctx, store);
    await perform(s.sessionId, undefined, donorJoin, ctx, store);
    await expect(perform(s.sessionId, "bad", { type: "new_donor" }, ctx, store)).rejects.toBeTruthy();
    liveBus.removeAllListeners(s.sessionId);
    expect(ticks).toHaveLength(2);
    expect(ticks[1]).toBeGreaterThan(ticks[0]);
  });

  it("concurrent accepts of the same offer: exactly one wins", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const s = await createSession(ctx, store);
    await perform(s.sessionId, s.hostToken, { type: "start_emergency" }, ctx, store);
    const j = await perform(s.sessionId, undefined, donorJoin, ctx, store);
    const id = j.snapshot.me!.offers[0].id;
    const results = await Promise.allSettled([1, 2, 3].map(() => perform(s.sessionId, j.participantToken, { type: "respond", allocationId: id, accept: true }, ctx, store)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loaded = await store.load(s.sessionId);
    expect(loaded!.allocations.filter((a) => a.state === "confirmed")).toHaveLength(1);
  });
});

describe("allocation integrity (store constraint)", () => {
  it("the store refuses two live allocations for the same patient+donor", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const s = await createSession(ctx, store);
    await perform(s.sessionId, s.hostToken, { type: "start_emergency" }, ctx, store);
    await perform(s.sessionId, undefined, donorJoin, ctx, store);
    const l = (await store.load(s.sessionId))!;
    const a = l.allocations[0];
    const dup = { ...a, id: "00000000-0000-4000-8000-0000000000ff" };
    const ok = await store.commit(s.sessionId, { expectedVersion: l.session.version, world: l.session.world, status: "active", endedAt: null, participants: [], allocations: [dup], events: [] });
    expect(ok).toBe(false);
  });

  it("the store refuses stale writes (compare-and-swap)", async () => {
    const { ctx } = mk();
    const store = new MemoryStore();
    const s = await createSession(ctx, store);
    const l = (await store.load(s.sessionId))!;
    const c = { world: l.session.world, status: "active" as const, endedAt: null, participants: [], allocations: [], events: [] };
    expect(await store.commit(s.sessionId, { ...c, expectedVersion: l.session.version })).toBe(true);
    expect(await store.commit(s.sessionId, { ...c, expectedVersion: l.session.version })).toBe(false);
  });
});

// ---------------------------------------------------------------- auth tokens
describe("tokens", () => {
  it("are bound to a session and tamper-evident", () => {
    const t = signLive({ s: "S1", r: "p", p: "P1" });
    expect(verifyLive(t, "S1")).toEqual({ s: "S1", r: "p", p: "P1" });
    expect(verifyLive(t, "S2")).toBeNull();
    const [body, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ s: "S1", r: "host" })).toString("base64url");
    expect(verifyLive(`${forged}.${mac}`, "S1")).toBeNull();
    expect(verifyLive(`${body}.`, "S1")).toBeNull();
    expect(verifyLive(null, "S1")).toBeNull();
    expect(verifyLive("x".repeat(700), "S1")).toBeNull();
  });
});

// ---------------------------------------------------------------- realtime client logic
describe("createCoalescer", () => {
  it("merges a burst of ticks into at most two runs and never overlaps", async () => {
    let runs = 0;
    let active = 0;
    let maxActive = 0;
    const c = createCoalescer(async () => {
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    for (let i = 0; i < 50; i++) c.trigger();
    await c.idle();
    await new Promise((r) => setTimeout(r, 40));
    expect(runs).toBe(2);
    expect(maxActive).toBe(1);
  });

  it("keeps working after a failing run", async () => {
    let n = 0;
    const c = createCoalescer(async () => {
      n++;
      if (n === 1) throw new Error("boom");
    });
    c.trigger();
    await c.idle();
    c.trigger();
    await c.idle();
    expect(n).toBe(2);
  });
});

// ---------------------------------------------------------------- AI is an explanation layer only
describe("AI explanation layer", () => {
  it("engine facts are produced with no AI at all, and do not alter state", () => {
    const { s } = withJudge();
    const before = JSON.stringify(s);
    const snap = buildSnapshot(s, null);
    const sel = explainFacts(snap, "donor_selected", "P-07", s.participants[0].code);
    expect(sel.question).toContain("selected");
    expect(sel.facts.join(" ")).toMatch(/Recipient antibodies/);
    const rej = explainFacts(snap, "donor_rejected", "P-07", "D-101");
    expect(rej.facts.join(" ")).toMatch(/Not assigned|INCOMPATIBLE/);
    expect(rej.facts.join(" ")).toMatch(/anti-Fya|antigen vs/);
    expect(explainFacts(snap, "priority", "P-07").facts[0]).toMatch(/CRITICAL/);
    expect(explainFacts(snap, "what_changed").facts[0]).toMatch(/Metrics/);
    expect(JSON.stringify(s)).toBe(before);
  });

  const fake = (name: ProviderName, per: Array<ProviderError | string>): AIProvider => ({
    name, keyCount: per.length, supportsImages: false,
    async call(i) {
      const r = per[i];
      if (typeof r === "string") return { text: r, model: name };
      throw r;
    },
  });
  const opts = { sleep: async () => {}, transientRetryDelayMs: 0 };

  it("explanations survive Gemini limits: next Gemini key, then Grok; all dead gives a clean error", async () => {
    const payload = JSON.stringify({ summary: "x".repeat(30), points: ["a"] });
    const g = fake("gemini", [new ProviderError("rate_limit", 429), new ProviderError("quota", 429)]);
    const x = fake("grok", [payload]);
    const out = await new AIProviderRouter({ providers: [g, x], primary: "gemini", ...opts }).generate({ system: "s", prompt: "p", json: true });
    expect(out.provider).toBe("grok");
    expect(JSON.parse(out.text).points).toEqual(["a"]);
    const dead = new AIProviderRouter({ providers: [fake("gemini", [new ProviderError("rate_limit", 429)]), fake("grok", [new ProviderError("auth", 401)])], primary: "gemini", ...opts });
    await expect(dead.generate({ system: "s", prompt: "p" })).rejects.toMatchObject({ name: "AIUnavailableError" });
  });
});

// ---------------------------------------------------------------- phone address
import { chooseBase } from "@/lib/blood-live/baseUrl";
describe("QR phone address", () => {
  it("prefers an override, then a real app URL, then a non-localhost origin, then the LAN address", () => {
    expect(chooseBase({ override: "http://1.2.3.4:3000", env: "https://app.example.com" })).toBe("http://1.2.3.4:3000");
    expect(chooseBase({ env: "https://app.example.com", origin: "http://localhost:3000", lan: ["192.168.1.9"] })).toBe("https://app.example.com");
    expect(chooseBase({ env: "http://localhost:3000", origin: "http://192.168.1.50:3000", lan: ["192.168.1.9"] })).toBe("http://192.168.1.50:3000");
    expect(chooseBase({ env: "http://localhost:3000", origin: "http://localhost:3000", lan: ["192.168.1.9", "10.0.0.2"], port: "3000", protocol: "http:" })).toBe("http://192.168.1.9:3000");
  });
  it("falls back to localhost when no LAN address is known (never empty, never a secret)", () => {
    expect(chooseBase({ env: "http://localhost:3000", origin: "http://localhost:3000" })).toBe("http://localhost:3000");
  });
});

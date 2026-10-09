/**
 * Blood LIVE MODE: pure, deterministic multi-patient allocation and session reducer.
 * Compatibility is decided ONLY by the existing engine (evaluateDonor / rankDonors). AI never touches it.
 * Educational simulation. Not for clinical use.
 */
import { evaluateDonor, rankDonors, type Donor, type MatchResult, type Recipient } from "./engine";
import { emergencyWorld, HOSPITAL_CYCLE, STRESS, WALKIN_CYCLE } from "./liveScenario";
import {
  LIVE_DONOR_EXPIRY_H, LiveError, MAX_HOSPITAL_REQUESTS, MAX_PARTICIPANTS, URGENCY_RANK, ZONE_KM,
  type Actor, type Allocation, type Ctx, type LiveAction, type LiveDonor, type LiveEvent, type LivePatient, type LiveState, type Participant, type Resolution, type World, type EventType,
} from "./liveTypes";
import { emptyWorld } from "./liveScenario";

export * from "./liveTypes";

export const newState = (): LiveState => ({ world: emptyWorld(), participants: [], allocations: [] });

// ------------------------------------------------------------------ compatibility (delegates to the existing engine)

function recipientOf(p: LivePatient, units: number): Recipient {
  return { abo: p.abo, rh: p.rh, antibodies: p.antibodies, unitsNeeded: units, urgency: p.urgency, chronicTransfusion: p.chronicTransfusion };
}

const asDonor = (d: LiveDonor, units = d.units): Donor => ({
  code: d.code, abo: d.abo, rh: d.rh, kell: d.kell, rhc: d.rhc, rhe: d.rhe, duffy: d.duffy, units, distanceKm: d.distanceKm, available: d.status === "online" && units > 0, hoursToExpiry: d.hoursToExpiry,
});

/**
 * Evaluate one donor for one patient. RBC uses the engine directly. PLASMA reverses the ABO direction
 * (a donor's plasma must be compatible with the patient) and ignores Rh, by evaluating a mirrored pair.
 */
export function evaluateFor(p: LivePatient, d: LiveDonor, units = p.unitsNeeded, donorUnits = d.units): MatchResult {
  const donor = asDonor(d, donorUnits);
  if (p.component === "RBC") return evaluateDonor(recipientOf(p, units), donor, p.constraints);
  const mirrorRecipient: Recipient = { abo: donor.abo, rh: "+", antibodies: [], unitsNeeded: units, urgency: p.urgency, chronicTransfusion: false };
  const mirrorDonor: Donor = { ...donor, abo: p.abo, rh: "+", kell: "K-", rhc: "c+", rhe: "E-", duffy: "Fy(a-)" };
  const res = evaluateDonor(mirrorRecipient, mirrorDonor, { ...p.constraints, allowRhMismatch: true });
  const factors = res.factors
    .filter((f) => f.id !== "rh" && f.id !== "antibody" && f.id !== "antigen")
    .map((f) => (f.id === "abo" ? { ...f, label: "ABO plasma compatibility", detail: f.status === "pass" ? `Donor ${donor.abo} plasma is compatible with a ${p.abo} patient.` : `Donor ${donor.abo} plasma carries antibodies against a ${p.abo} patient.` } : f));
  return { ...res, donor, factors: [...factors] };
}

function rankFor(p: LivePatient, pool: Array<{ d: LiveDonor; units: number }>, units: number): Array<MatchResult & { live: LiveDonor }> {
  const byCode = new Map(pool.map((x) => [x.d.code, x]));
  if (p.component === "RBC") {
    return rankDonors(recipientOf(p, units), pool.map((x) => asDonor(x.d, x.units)), p.constraints).map((r) => ({ ...r, live: byCode.get(r.donor.code)!.d }));
  }
  const order = { MATCH: 0, PARTIAL: 1, INCOMPATIBLE: 2 } as const;
  return pool
    .map((x) => ({ ...evaluateFor(p, x.d, units, x.units), live: x.d }))
    .sort((a, b) => order[a.verdict] - order[b.verdict] || b.score - a.score || a.etaMinutes - b.etaMinutes || a.donor.code.localeCompare(b.donor.code));
}

// ------------------------------------------------------------------ donors

export function liveDonors(participants: Participant[]): LiveDonor[] {
  return participants
    .filter((p) => p.role === "donor" && p.abo && p.rh)
    .map((p) => ({
      code: p.code, abo: p.abo!, rh: p.rh!, kell: "K-", rhc: "c+", rhe: "E-", duffy: "Fy(a-)", units: p.units, distanceKm: p.zone ? ZONE_KM[p.zone] : 6, hoursToExpiry: LIVE_DONOR_EXPIRY_H,
      status: p.online ? "online" : "offline", source: "live", participantId: p.id, zone: p.zone,
    }));
}

export const allDonors = (s: LiveState): LiveDonor[] => [...s.world.bank, ...liveDonors(s.participants)];

// ------------------------------------------------------------------ planner

export type AssignmentKind = "auto" | "offer" | "confirmed";
export interface Assignment {
  patientId: string;
  donorCode: string;
  units: number;
  kind: AssignmentKind;
  verdict: MatchResult["verdict"];
  score: number;
  etaMinutes: number;
  allocationId?: string;
}

export interface PatientPlan {
  covered: number;
  pending: number;
  shortage: number;
}

export interface Plan {
  assignments: Assignment[];
  perPatient: Record<string, PatientPlan>;
  order: string[];
}

export const sortPatients = (patients: LivePatient[]): LivePatient[] =>
  [...patients].filter((p) => !p.resolved).sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.no - b.no);

/**
 * Priority order: critical, urgent, routine, then patient number. Confirmed live allocations are locked first.
 * Each patient takes the best-ranked simulated bank donors; live phones are offered only the remaining unmet need
 * (a live donor is never committed without the person's consent).
 */
export function plan(s: LiveState): Plan {
  let state = s;
  let last: { plan: Plan; dropped: string[] } = planInner(state);
  // A pending offer that is no longer needed is dropped, which can free its donor for another patient: replan.
  for (let i = 0; i < 3 && last.dropped.length; i++) {
    const dropped = new Set(last.dropped);
    state = { ...state, allocations: state.allocations.map((a) => (dropped.has(a.id) ? { ...a, state: "cancelled" as const } : a)) };
    last = planInner(state);
  }
  return last.plan;
}

function planInner(s: LiveState): { plan: Plan; dropped: string[] } {
  const donors = allDonors(s);
  const dropped: string[] = [];
  const liveOffers = s.allocations.filter((a) => a.state === "offered");
  const stickyDonors = new Set(liveOffers.map((a) => a.donorCode));
  const remaining = new Map<string, number>();
  donors.forEach((d) => remaining.set(d.code, d.status === "online" ? d.units : 0));
  const assignments: Assignment[] = [];
  const per: Record<string, PatientPlan> = {};
  const active = sortPatients(s.world.patients);
  active.forEach((p) => (per[p.id] = { covered: 0, pending: 0, shortage: p.unitsNeeded }));

  for (const a of s.allocations.filter((x) => x.state === "confirmed")) {
    const d = donors.find((x) => x.code === a.donorCode);
    const p = active.find((x) => x.id === a.patientId);
    if (!d || !p || d.status !== "online") continue;
    const take = Math.min(a.units, remaining.get(d.code) ?? 0);
    if (take <= 0) continue;
    remaining.set(d.code, (remaining.get(d.code) ?? 0) - take);
    per[p.id].covered += take;
    const ev = evaluateFor(p, d, Math.max(1, p.unitsNeeded), take);
    assignments.push({ patientId: p.id, donorCode: d.code, units: take, kind: "confirmed", verdict: ev.verdict, score: ev.score, etaMinutes: ev.etaMinutes, allocationId: a.id });
  }

  const declined = new Set(s.allocations.filter((a) => a.state === "declined").map((a) => `${a.patientId}|${a.donorCode}`));
  const offeredDonors = new Set<string>();

  for (const p of active) {
    let need = p.unitsNeeded - per[p.id].covered;
    if (need <= 0) {
      per[p.id].shortage = 0;
      continue;
    }
    const take = (list: LiveDonor[], kind: AssignmentKind) => {
      const pool = list.filter((d) => (remaining.get(d.code) ?? 0) > 0 && d.status === "online").map((d) => ({ d, units: remaining.get(d.code)! }));
      for (const r of rankFor(p, pool, need)) {
        if (need <= 0 || r.verdict === "INCOMPATIBLE") break;
        const have = remaining.get(r.live.code) ?? 0;
        const n = Math.min(need, have);
        if (n <= 0) continue;
        remaining.set(r.live.code, have - n);
        need -= n;
        if (kind === "auto") per[p.id].covered += n;
        else per[p.id].pending += n;
        assignments.push({ patientId: p.id, donorCode: r.live.code, units: n, kind, verdict: r.verdict, score: r.score, etaMinutes: r.etaMinutes });
      }
    };
    take(donors.filter((d) => d.source === "bank"), "auto");
    // Pending offers are sticky: a new donor joining must not yank an offer away from a phone that is still deciding.
    for (const a of liveOffers.filter((x) => x.patientId === p.id)) {
      const dn = donors.find((x) => x.code === a.donorCode);
      const n = dn && dn.status === "online" ? Math.min(need, remaining.get(dn.code) ?? 0) : 0;
      if (!dn || n <= 0) {
        dropped.push(a.id);
        continue;
      }
      const ev = evaluateFor(p, dn, need, n);
      if (ev.verdict === "INCOMPATIBLE") {
        dropped.push(a.id);
        continue;
      }
      remaining.set(dn.code, (remaining.get(dn.code) ?? 0) - n);
      need -= n;
      per[p.id].pending += n;
      offeredDonors.add(dn.code);
      assignments.push({ patientId: p.id, donorCode: dn.code, units: n, kind: "offer", verdict: ev.verdict, score: ev.score, etaMinutes: ev.etaMinutes, allocationId: a.id });
    }
    if (need > 0) {
      const liveCandidates = donors.filter((d) => d.source === "live" && !offeredDonors.has(d.code) && !stickyDonors.has(d.code) && !declined.has(`${p.id}|${d.code}`));
      const before = assignments.length;
      take(liveCandidates, "offer");
      assignments.slice(before).forEach((a) => offeredDonors.add(a.donorCode));
    }
    per[p.id].shortage = Math.max(0, p.unitsNeeded - per[p.id].covered - per[p.id].pending);
  }
  return { plan: { assignments, perPatient: per, order: active.map((p) => p.id) }, dropped };
}

// ------------------------------------------------------------------ metrics

export interface Metrics {
  patients: number;
  unitsRequired: number;
  unitsAvailable: number;
  shortage: number;
  criticalShortage: number;
  liveDonors: number;
  matches: number;
  allocated: number;
  pending: number;
  served: number;
  devices: number;
}

export function metrics(s: LiveState, pl: Plan = plan(s)): Metrics {
  const active = s.world.patients.filter((p) => !p.resolved);
  const donors = allDonors(s);
  let allocated = 0, pending = 0, shortage = 0, criticalShortage = 0, served = 0;
  for (const p of active) {
    const pp = pl.perPatient[p.id];
    if (!pp) continue;
    allocated += pp.covered;
    pending += pp.pending;
    shortage += pp.shortage;
    if (p.urgency === "critical") criticalShortage += pp.shortage;
    if (pp.covered >= p.unitsNeeded) served++;
  }
  return {
    patients: active.length,
    unitsRequired: active.reduce((n, p) => n + p.unitsNeeded, 0),
    unitsAvailable: donors.filter((d) => d.status === "online").reduce((n, d) => n + d.units, 0),
    shortage,
    criticalShortage,
    liveDonors: s.participants.filter((p) => p.role === "donor" && p.online).length,
    matches: pl.assignments.length,
    allocated,
    pending,
    served,
    devices: s.participants.filter((p) => p.connected).length,
  };
}

// ------------------------------------------------------------------ reducer

interface Draft {
  state: LiveState;
  events: LiveEvent[];
  ctx: Ctx;
  actor: string;
}

function emit(d: Draft, type: EventType, message: string, data: LiveEvent["data"] = {}, actor = d.actor) {
  d.state.world.seq += 1;
  d.events.push({ seq: d.state.world.seq, type, at: d.ctx.now().toISOString(), actor, message, data });
}

const nowIso = (d: Draft) => d.ctx.now().toISOString();

function reconcile(d: Draft) {
  const s = d.state;
  const donors = allDonors(s);
  for (const a of s.allocations) {
    if (a.state !== "offered" && a.state !== "confirmed") continue;
    const dn = donors.find((x) => x.code === a.donorCode);
    const p = s.world.patients.find((x) => x.id === a.patientId);
    if (!dn || dn.status !== "online" || !p || p.resolved) {
      a.state = "cancelled";
      a.updatedAt = nowIso(d);
      emit(d, "MATCH_CANCELLED", `${a.donorCode} → ${a.patientId} allocation cancelled`, { donorCode: a.donorCode, patientId: a.patientId, participantId: a.participantId, allocationId: a.id, units: a.units }, "system");
    }
  }
  const pl = plan(s);
  const planned = pl.assignments.filter((x) => x.kind === "offer");
  for (const a of s.allocations.filter((x) => x.state === "offered")) {
    const keep = planned.some((x) => x.allocationId === a.id && x.units === a.units);
    if (!keep) {
      a.state = "cancelled";
      a.updatedAt = nowIso(d);
      emit(d, "MATCH_CANCELLED", `Offer ${a.donorCode} → ${a.patientId} withdrawn after recalculation`, { donorCode: a.donorCode, patientId: a.patientId, participantId: a.participantId, allocationId: a.id, units: a.units }, "system");
    }
  }
  for (const o of planned) {
    if (o.allocationId && s.allocations.some((a) => a.id === o.allocationId && a.state === "offered")) continue;
    const dn = donors.find((x) => x.code === o.donorCode)!;
    const alloc: Allocation = { id: d.ctx.uid(), patientId: o.patientId, donorCode: o.donorCode, participantId: dn.participantId!, units: o.units, state: "offered", createdAt: nowIso(d), updatedAt: nowIso(d) };
    s.allocations.push(alloc);
    const p = s.world.patients.find((x) => x.id === o.patientId)!;
    emit(d, "MATCH_FOUND", `LIVE MATCH FOUND: ${o.donorCode} (${dn.abo}${dn.rh}, ${o.units}u) → ${p.id} ${p.urgency.toUpperCase()}`, { donorCode: o.donorCode, patientId: o.patientId, participantId: dn.participantId!, allocationId: alloc.id, units: o.units }, "system");
  }
}

function requireHost(actor: Actor) {
  if (actor.kind !== "host") throw new LiveError("forbidden", "Only the session host can do that.", 403);
}

function requireMe(s: LiveState, actor: Actor): Participant {
  if (actor.kind !== "participant") throw new LiveError("forbidden", "Join the session first.", 403);
  const me = s.participants.find((p) => p.id === actor.id);
  if (!me) throw new LiveError("forbidden", "Unknown participant for this session.", 403);
  return me;
}

function requireEmergency(s: LiveState) {
  if (s.world.phase === "idle") throw new LiveError("no_emergency", "Start the emergency first.", 409);
}

const nextCode = (d: Draft): string => {
  for (let i = 0; i < 50; i++) {
    const code = `LIVE-${d.ctx.digits()}`;
    if (!d.state.participants.some((p) => p.code === code)) return code;
  }
  return `LIVE-${d.ctx.uid().slice(0, 4).toUpperCase()}`;
};

function pickBank(s: LiveState, target: string | undefined, pred: (x: LiveDonor) => boolean, order: (a: LiveDonor, b: LiveDonor) => number): LiveDonor | null {
  if (target) {
    const t = s.world.bank.find((x) => x.code === target);
    return t && pred(t) ? t : null;
  }
  return [...s.world.bank].filter(pred).sort(order)[0] ?? null;
}

function addPatient(d: Draft, spec: Pick<LivePatient, "abo" | "rh" | "unitsNeeded" | "urgency">, source: LivePatient["source"]): LivePatient {
  const w = d.state.world;
  const p: LivePatient = {
    id: `P-${String(w.nextPatientNo).padStart(2, "0")}`, no: w.nextPatientNo, component: "RBC", antibodies: [], chronicTransfusion: false,
    constraints: { maxDistanceKm: 30, minHoursToExpiry: 24, allowRhMismatch: false }, resolved: false, source, ...spec,
  };
  w.nextPatientNo += 1;
  w.patients.push(p);
  return p;
}

function addWalkIn(d: Draft): LiveDonor {
  const w = d.state.world;
  const spec = WALKIN_CYCLE[(w.nextWalkIn - 901) % WALKIN_CYCLE.length];
  const dn: LiveDonor = { code: `NEW-${w.nextWalkIn}`, abo: spec.abo, rh: spec.rh, kell: "K-", rhc: "c+", rhe: "E-", duffy: "Fy(a-)", units: spec.units, distanceKm: 3, hoursToExpiry: 200, status: "online", source: "bank", participantId: null, zone: "A" };
  w.nextWalkIn += 1;
  w.bank.push(dn);
  return dn;
}

function resolution(s: LiveState): Resolution {
  const m = metrics(s);
  return { patientsServed: m.served, patientsTotal: m.patients, unitsAllocated: m.allocated, criticalShortage: m.criticalShortage, shortage: m.shortage, pending: m.pending };
}

function escalateTo(d: Draft, p: LivePatient) {
  p.urgency = "critical";
  emit(d, "PRIORITY_UPDATED", `PRIORITY UPDATED: ${p.id} → CRITICAL`, { patientId: p.id });
}

function startEmergency(d: Draft) {
  const s = d.state;
  s.world = emergencyWorld(s.world.seq);
  for (const a of s.allocations) if (a.state === "offered" || a.state === "confirmed") { a.state = "cancelled"; a.updatedAt = nowIso(d); }
  const m = metrics(s);
  emit(d, "EMERGENCY_STARTED", `NEW EMERGENCY: ${m.patients} patients, ${m.unitsRequired} units required, ${m.unitsAvailable} available`);
}

/**
 * Applies one action to a deep copy of the state. Throws LiveError for invalid or unauthorised actions.
 * Returns the new state and the events it produced (with sequence numbers).
 */
export function applyAction(prev: LiveState, action: LiveAction, actor: Actor, ctx: Ctx): { state: LiveState; events: LiveEvent[] } {
  const state = structuredClone(prev);
  const d: Draft = { state, events: [], ctx, actor: actor.kind === "host" ? "host" : actor.kind === "participant" ? actor.id : "anonymous" };
  const s = state;

  switch (action.type) {
    case "join": {
      if (actor.kind !== "anonymous") throw new LiveError("forbidden", "Already joined.", 403);
      if (s.participants.length >= MAX_PARTICIPANTS) throw new LiveError("session_full", "This session is full.", 409);
      const p: Participant = { id: ctx.uid(), role: action.role, code: nextCode(d), abo: null, rh: null, units: 0, zone: null, online: false, connected: true, hospitalRequests: 0, joinedAt: nowIso(d) };
      if (action.role === "donor") {
        if (!action.abo || !action.rh || !action.zone || !action.units) throw new LiveError("invalid_donor", "Choose blood group, Rh, units and zone.");
        Object.assign(p, { abo: action.abo, rh: action.rh, units: action.units, zone: action.zone, online: true });
      }
      s.participants.push(p);
      d.actor = p.id;
      emit(d, "DEVICE_CONNECTED", `DEVICE CONNECTED ${p.code}`, { participantId: p.id });
      if (p.role === "donor") emit(d, "DONOR_JOINED", `NEW LIVE DONOR ${p.code} ${p.abo}${p.rh} ${p.units} UNIT${p.units > 1 ? "S" : ""} ONLINE`, { participantId: p.id, donorCode: p.code, units: p.units });
      reconcile(d);
      break;
    }
    case "rejoin": {
      const me = requireMe(s, actor);
      if (!me.connected) {
        me.connected = true;
        emit(d, "DEVICE_CONNECTED", `DEVICE CONNECTED ${me.code}`, { participantId: me.id });
      }
      break;
    }
    case "leave": {
      const me = requireMe(s, actor);
      if (me.connected) {
        me.connected = false;
        emit(d, "DEVICE_DISCONNECTED", `DEVICE DISCONNECTED ${me.code}`, { participantId: me.id });
      }
      break;
    }
    case "set_online": {
      const me = requireMe(s, actor);
      if (me.role !== "donor") throw new LiveError("forbidden", "Only donors can change availability.", 403);
      if (me.online === action.online) break;
      me.online = action.online;
      emit(d, action.online ? "DONOR_ONLINE" : "DONOR_OFFLINE", action.online ? `DONOR RETURNS ${me.code}` : `DONOR CANCELLED ${me.code} is now OFFLINE`, { participantId: me.id, donorCode: me.code, units: me.units });
      reconcile(d);
      break;
    }
    case "respond": {
      const me = requireMe(s, actor);
      const a = s.allocations.find((x) => x.id === action.allocationId);
      if (!a || a.participantId !== me.id) throw new LiveError("not_found", "That match does not belong to you.", 404);
      if (a.state !== "offered") throw new LiveError("already_answered", `This match was already ${a.state}.`, 409);
      const p = s.world.patients.find((x) => x.id === a.patientId);
      if (!p || p.resolved || !me.online) throw new LiveError("not_available", "This match is no longer available.", 409);
      const dup = s.allocations.some((x) => x.state === "confirmed" && x.patientId === a.patientId && x.donorCode === a.donorCode);
      if (dup) throw new LiveError("duplicate_allocation", "Already allocated.", 409);
      const confirmedUnits = s.allocations.filter((x) => x.state === "confirmed" && x.donorCode === a.donorCode).reduce((n, x) => n + x.units, 0);
      if (action.accept && confirmedUnits + a.units > me.units) throw new LiveError("insufficient_units", "Not enough units left.", 409);
      a.state = action.accept ? "confirmed" : "declined";
      a.updatedAt = nowIso(d);
      if (action.accept) emit(d, "MATCH_ACCEPTED", `LIVE DONOR ACCEPTED ${me.code} ↓ ${a.units} UNIT${a.units > 1 ? "S" : ""} ↓ ${p.id}`, { participantId: me.id, donorCode: me.code, patientId: p.id, units: a.units, allocationId: a.id });
      else emit(d, "MATCH_DECLINED", `LIVE DONOR DECLINED ${me.code} → ${p.id}`, { participantId: me.id, donorCode: me.code, patientId: p.id, units: a.units, allocationId: a.id });
      reconcile(d);
      break;
    }
    case "hospital_submit": {
      const me = requireMe(s, actor);
      if (me.role !== "hospital") throw new LiveError("forbidden", "Only hospital devices can send requests.", 403);
      requireEmergency(s);
      if (me.hospitalRequests >= MAX_HOSPITAL_REQUESTS) throw new LiveError("limit", "Request limit reached for this device.", 429);
      me.hospitalRequests += 1;
      const p = addPatient(d, { abo: action.abo, rh: action.rh, unitsNeeded: action.units, urgency: action.urgency }, "hospital");
      emit(d, "HOSPITAL_REQUEST", `HOSPITAL REQUEST ${p.id} ${p.abo}${p.rh} ${p.unitsNeeded}u ${p.urgency.toUpperCase()}`, { patientId: p.id, participantId: me.id, units: p.unitsNeeded });
      reconcile(d);
      break;
    }
    case "start_emergency": {
      requireHost(actor);
      startEmergency(d);
      reconcile(d);
      break;
    }
    case "donor_cancels": {
      requireHost(actor);
      requireEmergency(s);
      const live = action.target ? liveDonors(s.participants).find((x) => x.code === action.target) : undefined;
      if (live) {
        const part = s.participants.find((x) => x.id === live.participantId)!;
        if (!part.online) throw new LiveError("invalid_target", "That donor is already offline.", 409);
        part.online = false;
        emit(d, "DONOR_OFFLINE", `DONOR CANCELS ${part.code} → OFFLINE`, { participantId: part.id, donorCode: part.code, units: part.units });
      } else {
        const alloc = (x: LiveDonor) => plan(s).assignments.filter((a) => a.donorCode === x.code).reduce((n, a) => n + a.units, 0);
        const t = pickBank(s, action.target, (x) => x.status === "online", (a, b) => alloc(b) - alloc(a) || a.code.localeCompare(b.code));
        if (!t) throw new LiveError("invalid_target", "No donor to cancel.", 409);
        t.status = "offline";
        emit(d, "DONOR_OFFLINE", `DONOR CANCELS ${t.code} → OFFLINE (${t.units} units removed)`, { donorCode: t.code, units: t.units });
      }
      reconcile(d);
      break;
    }
    case "unit_expires": {
      requireHost(actor);
      requireEmergency(s);
      const t = pickBank(s, action.target, (x) => x.status === "online", (a, b) => a.hoursToExpiry - b.hoursToExpiry || a.code.localeCompare(b.code));
      if (!t) throw new LiveError("invalid_target", "No unit to expire.", 409);
      t.status = "expired";
      t.hoursToExpiry = 0;
      emit(d, "UNIT_EXPIRED", `BLOOD UNIT EXPIRED ${t.code} (${t.units} units)`, { donorCode: t.code, units: t.units });
      reconcile(d);
      break;
    }
    case "new_donor": {
      requireHost(actor);
      requireEmergency(s);
      const dn = addWalkIn(d);
      emit(d, "NEW_DONOR", `NEW DONOR ARRIVES ${dn.code} ${dn.abo}${dn.rh} ${dn.units}u`, { donorCode: dn.code, units: dn.units });
      reconcile(d);
      break;
    }
    case "emergency_worsens": {
      requireHost(actor);
      requireEmergency(s);
      const list = sortPatients(s.world.patients);
      const p = action.target ? list.find((x) => x.id === action.target) : [...list].reverse()[0];
      if (!p) throw new LiveError("invalid_target", "No patient to worsen.", 409);
      if (p.urgency === "routine") p.urgency = "urgent";
      else if (p.urgency === "urgent") p.urgency = "critical";
      else p.unitsNeeded += 1;
      emit(d, "EMERGENCY_WORSENED", `EMERGENCY WORSENS ${p.id} → ${p.urgency.toUpperCase()}, ${p.unitsNeeded} units`, { patientId: p.id, units: p.unitsNeeded });
      reconcile(d);
      break;
    }
    case "hospital_request": {
      requireHost(actor);
      requireEmergency(s);
      const spec = HOSPITAL_CYCLE[s.world.nextHospital % HOSPITAL_CYCLE.length];
      s.world.nextHospital += 1;
      const p = addPatient(d, spec, "console");
      emit(d, "HOSPITAL_REQUEST", `HOSPITAL REQUEST ${p.id} ${p.abo}${p.rh} ${p.unitsNeeded}u ${p.urgency.toUpperCase()}`, { patientId: p.id, units: p.unitsNeeded });
      reconcile(d);
      break;
    }
    case "donor_returns": {
      requireHost(actor);
      requireEmergency(s);
      const live = liveDonors(s.participants).find((x) => x.status === "offline" && (!action.target || x.code === action.target));
      const t = action.target ? s.world.bank.find((x) => x.code === action.target && x.status === "offline") : s.world.bank.filter((x) => x.status === "offline").sort((a, b) => a.code.localeCompare(b.code))[0];
      if (t) {
        t.status = "online";
        emit(d, "DONOR_ONLINE", `DONOR RETURNS ${t.code} (${t.units} units)`, { donorCode: t.code, units: t.units });
      } else if (live) {
        const part = s.participants.find((x) => x.id === live.participantId)!;
        part.online = true;
        emit(d, "DONOR_ONLINE", `DONOR RETURNS ${part.code}`, { participantId: part.id, donorCode: part.code, units: part.units });
      } else throw new LiveError("invalid_target", "No offline donor to return.", 409);
      reconcile(d);
      break;
    }
    case "escalate": {
      requireHost(actor);
      requireEmergency(s);
      const list = sortPatients(s.world.patients).filter((x) => x.urgency !== "critical");
      const p = action.target ? list.find((x) => x.id === action.target) : list.find((x) => (plan(s).perPatient[x.id]?.shortage ?? 0) > 0) ?? list[0];
      if (!p) throw new LiveError("invalid_target", "Nothing to escalate.", 409);
      escalateTo(d, p);
      reconcile(d);
      break;
    }
    case "stress_step": {
      requireHost(actor);
      const w = s.world;
      if (action.step === 0) {
        if (w.phase === "idle" || w.phase === "resolved" || w.stressStep > 0) startEmergency(d);
        s.world.phase = "stress";
        s.world.stressStep = 0;
        emit(d, "STRESS_STARTED", "SYSTEM UNDER STRESS");
        reconcile(d);
        break;
      }
      if (w.phase !== "stress" || action.step !== w.stressStep + 1) throw new LiveError("bad_step", "Stress steps must run in order.", 409);
      const step = (msg: string) => emit(d, "STRESS_STEP", `STRESS ${action.step}/${STRESS.steps}: ${msg}`, { step: action.step });
      if (action.step === 1) {
        for (const code of STRESS.cancel) {
          const t = w.bank.find((x) => x.code === code);
          if (t) t.status = "offline";
        }
        step(`two donors cancel (${STRESS.cancel.join(", ")})`);
      } else if (action.step === 2) {
        const t = w.bank.find((x) => x.code === STRESS.expire);
        if (t) { t.status = "expired"; t.hoursToExpiry = 0; }
        step(`unit ${STRESS.expire} expires`);
      } else if (action.step === 3) {
        const p = w.patients.find((x) => x.id === STRESS.demandPatient);
        if (p) p.unitsNeeded += STRESS.demandExtra;
        step(`demand rises at ${STRESS.demandPatient} (+${STRESS.demandExtra} units)`);
      } else if (action.step === 4) {
        const p = w.patients.find((x) => x.id === STRESS.criticalPatient);
        if (p) escalateTo(d, p);
        step(`${STRESS.criticalPatient} becomes critical`);
      } else if (action.step === 5) {
        const spec = HOSPITAL_CYCLE[w.nextHospital % HOSPITAL_CYCLE.length];
        w.nextHospital += 1;
        const p = addPatient(d, spec, "stress");
        step(`new hospital request ${p.id} (${p.abo}${p.rh}, ${p.unitsNeeded}u, ${p.urgency})`);
      } else if (action.step === 6) {
        const dn = addWalkIn(d);
        step(`live donor joins (${dn.code} ${dn.abo}${dn.rh}, ${dn.units}u)`);
      } else if (action.step === 7) {
        step("allocation engine recalculates");
      } else throw new LiveError("bad_step", "Unknown stress step.", 400);
      w.stressStep = action.step;
      reconcile(d);
      if (action.step === STRESS.steps) {
        w.phase = "resolved";
        w.resolution = resolution(s);
        const r = w.resolution;
        emit(d, "EMERGENCY_RESOLVED", `EMERGENCY RESOLUTION: ${r.patientsServed}/${r.patientsTotal} patients served, ${r.unitsAllocated} units allocated, critical shortage ${r.criticalShortage}, pending ${r.pending}`);
      }
      break;
    }
    default:
      throw new LiveError("unknown_action", "Unknown action.");
  }
  return { state, events: d.events };
}

// ------------------------------------------------------------------ snapshot (what clients see)

export interface DonorView {
  code: string;
  abo: LiveDonor["abo"];
  rh: LiveDonor["rh"];
  units: number;
  source: "bank" | "live";
  zone: LiveDonor["zone"];
  distanceKm: number;
  hoursToExpiry: number;
  status: "AVAILABLE" | "ONLINE" | "IN TRANSIT" | "EXPIRING" | "OFFLINE" | "EXPIRED";
  kell: LiveDonor["kell"];
  rhc: LiveDonor["rhc"];
  rhe: LiveDonor["rhe"];
  duffy: LiveDonor["duffy"];
  committed: number;
  participantId: string | null;
}

export interface PatientView {
  id: string;
  no: number;
  abo: LivePatient["abo"];
  rh: LivePatient["rh"];
  component: LivePatient["component"];
  unitsNeeded: number;
  urgency: LivePatient["urgency"];
  antibodies: LivePatient["antibodies"];
  chronicTransfusion: boolean;
  constraints: LivePatient["constraints"];
  status: "CRITICAL" | "URGENT" | "ROUTINE" | "ALLOCATED" | "WAITING" | "RESOLVED";
  covered: number;
  pending: number;
  shortage: number;
}

export interface Snapshot {
  seq: number;
  phase: World["phase"];
  stressStep: number;
  resolution: Resolution | null;
  patients: PatientView[];
  donors: DonorView[];
  assignments: Assignment[];
  metrics: Metrics;
  participants: Array<Pick<Participant, "id" | "role" | "code" | "online" | "connected">>;
  focusPatient: string | null;
  me: null | { participant: Participant; offers: Array<Allocation & { patient: PatientView | null }>; confirmed: Array<Allocation & { patient: PatientView | null }>; donor: DonorView | null };
}

export function buildSnapshot(s: LiveState, viewer: string | null): Snapshot {
  const pl = plan(s);
  const m = metrics(s, pl);
  const patients: PatientView[] = s.world.patients.map((p) => {
    const pp = pl.perPatient[p.id] ?? { covered: 0, pending: 0, shortage: 0 };
    const full = pp.covered >= p.unitsNeeded;
    const status: PatientView["status"] = p.resolved ? "RESOLVED" : full ? "ALLOCATED" : pp.covered > 0 || pp.pending > 0 ? "WAITING" : (p.urgency.toUpperCase() as PatientView["status"]);
    return { id: p.id, no: p.no, abo: p.abo, rh: p.rh, component: p.component, unitsNeeded: p.unitsNeeded, urgency: p.urgency, antibodies: p.antibodies, chronicTransfusion: p.chronicTransfusion, constraints: p.constraints, status, covered: pp.covered, pending: pp.pending, shortage: pp.shortage };
  });
  const committed = new Map<string, number>();
  pl.assignments.forEach((a) => committed.set(a.donorCode, (committed.get(a.donorCode) ?? 0) + a.units));
  const donors: DonorView[] = allDonors(s).map((dn) => {
    const c = committed.get(dn.code) ?? 0;
    const status: DonorView["status"] = dn.status === "offline" ? "OFFLINE" : dn.status === "expired" ? "EXPIRED" : c > 0 && dn.source === "bank" ? "IN TRANSIT" : dn.source === "live" ? "ONLINE" : dn.hoursToExpiry < 72 ? "EXPIRING" : "AVAILABLE";
    return { code: dn.code, abo: dn.abo, rh: dn.rh, units: dn.units, source: dn.source, zone: dn.zone, distanceKm: dn.distanceKm, hoursToExpiry: dn.hoursToExpiry, status, kell: dn.kell, rhc: dn.rhc, rhe: dn.rhe, duffy: dn.duffy, committed: c, participantId: dn.participantId };
  });
  const order = pl.order;
  const focus = order[0] ?? null;
  const pv = (id: string) => patients.find((x) => x.id === id) ?? null;
  let me: Snapshot["me"] = null;
  if (viewer) {
    const part = s.participants.find((p) => p.id === viewer);
    if (part) {
      const mine = s.allocations.filter((a) => a.participantId === part.id).map((a) => ({ ...a, patient: pv(a.patientId) }));
      me = { participant: part, offers: mine.filter((a) => a.state === "offered"), confirmed: mine.filter((a) => a.state === "confirmed"), donor: donors.find((x) => x.participantId === part.id) ?? null };
    }
  }
  return {
    seq: s.world.seq, phase: s.world.phase, stressStep: s.world.stressStep, resolution: s.world.resolution, patients, donors, assignments: pl.assignments, metrics: m,
    participants: s.participants.map((p) => ({ id: p.id, role: p.role, code: p.code, online: p.online, connected: p.connected })), focusPatient: focus, me,
  };
}

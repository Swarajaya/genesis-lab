/**
 * EXPIRY programmable-money engine (Experiment 06).
 *
 * Pure, deterministic and isomorphic: no I/O, no AI, no clock reads. Time is always passed in and
 * hashing is injected, so the same code runs on the server (node:crypto) and in tests.
 * Prototype simulation: no real money, no bank connection.
 */

export const PURPOSES = ["FOOD", "TRANSPORT", "EDUCATION", "HEALTH", "ELECTRONICS", "EMERGENCY", "ENTERTAINMENT", "OTHER"] as const;
export type Purpose = (typeof PURPOSES)[number];
export const RECIPIENT_TYPES = ["STUDENT", "FARMER", "WORKER", "ANY"] as const;
export type RecipientType = (typeof RECIPIENT_TYPES)[number];

export const MONEY_STATES = ["ISSUED", "ACTIVE", "PARTIALLY_SPENT", "DEPLETED", "SUSPENDED", "REVOKED", "EXPIRED"] as const;
export type MoneyState = (typeof MONEY_STATES)[number];
export type Command = "ACTIVATE" | "SPEND" | "SUSPEND" | "RESUME" | "REVOKE" | "EXPIRE";
export type EventType = "ISSUE" | "ACTIVATE" | "SPEND" | "SUSPEND" | "RESUME" | "REVOKE" | "EXPIRE" | "POLICY_UPDATE";

export const MIN_EXPIRY_SECONDS = 10;
export const MAX_EXPIRY_SECONDS = 365 * 86_400;
export const MIN_AMOUNT_PAISE = 100;
export const MAX_AMOUNT_PAISE = 100_000_000;
export const MAX_POLICY_VERSIONS = 12;
export const ISSUER = "GENESIS-LAB/ISSUER";

export const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ------------------------------------------------------------------ policy

export interface PolicyDraft {
  amountPaise: number;
  recipientType: RecipientType;
  /** "*" means any holder of that type. */
  recipientId: string;
  purposes: Purpose[];
  /** null = no per-transaction limit beyond the budget. */
  maxTxnPaise: number | null;
  expiresInSeconds: number;
  allocations: Partial<Record<Purpose, number>>;
  /** Empty = any merchant. Case-insensitive exact match otherwise. */
  merchants: string[];
}

export interface Policy {
  policyId: string;
  policyVersion: number;
  amountPaise: number;
  currency: "INR";
  recipient: { type: RecipientType; id: string };
  allowedPurposes: Purpose[];
  maxTransactionPaise: number;
  expiresAt: string;
  allocations: Partial<Record<Purpose, number>>;
  merchantConstraints: string[];
  createdAt: string;
  issuer: string;
  /** SHA-256 of canonicalPolicy(); set when the version is sealed. */
  hash: string;
}

export interface Conflict {
  code: string;
  title: string;
  message: string;
  allocatedPaise?: number;
  availablePaise?: number;
}

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);

/** Spend that is not covered by a dedicated allocation (shares the unallocated pool). */
export function unallocatedSpent(alloc: Partial<Record<string, number>>, spent: Record<string, number>): number {
  return Object.entries(spent).reduce((a, [p, v]) => a + (alloc[p] === undefined ? v : 0), 0);
}

/** Deterministic policy validator. The AI never decides validity. */
export function validateDraft(d: PolicyDraft, spent: Record<string, number> = {}): Conflict[] {
  const out: Conflict[] = [];
  const add = (code: string, title: string, message: string, extra: Partial<Conflict> = {}) => out.push({ code, title, message, ...extra });

  if (!Number.isInteger(d.amountPaise) || d.amountPaise < MIN_AMOUNT_PAISE || d.amountPaise > MAX_AMOUNT_PAISE) add("AMOUNT_RANGE", "AMOUNT OUT OF RANGE", `Budget must be between ${inr(MIN_AMOUNT_PAISE)} and ${inr(MAX_AMOUNT_PAISE)}.`);
  if (d.purposes.length === 0) add("NO_PURPOSE", "NO PURPOSE", "At least one allowed purpose is required.");
  if (!ID_RE.test(d.recipientId) && d.recipientId !== "*") add("RECIPIENT_ID", "INVALID RECIPIENT", "Recipient ID must be 1-40 letters, digits, '-' or '_'.");
  if (!Number.isFinite(d.expiresInSeconds) || d.expiresInSeconds < MIN_EXPIRY_SECONDS || d.expiresInSeconds > MAX_EXPIRY_SECONDS) add("EXPIRY_RANGE", "EXPIRY OUT OF RANGE", `Expiry must be between ${MIN_EXPIRY_SECONDS} seconds and 365 days.`);
  if (d.maxTxnPaise !== null && (!Number.isInteger(d.maxTxnPaise) || d.maxTxnPaise < 1)) add("MAX_TXN_INVALID", "INVALID TRANSACTION LIMIT", "Per-transaction limit must be at least ₹0.01.");

  const allocated = sum(d.allocations);
  if (allocated > d.amountPaise) add("ALLOCATION_OVERFLOW", "POLICY CONFLICT", `Allocations total ${inr(allocated)} but the total budget is ${inr(d.amountPaise)}. ${inr(allocated - d.amountPaise)} is allocated that does not exist.`, { allocatedPaise: allocated, availablePaise: d.amountPaise });
  for (const [p, v] of Object.entries(d.allocations)) {
    if (!d.purposes.includes(p as Purpose)) add("ALLOCATION_PURPOSE", "POLICY CONFLICT", `${p} has an allocation of ${inr(v ?? 0)} but is not an allowed purpose.`);
    if ((v ?? 0) < 0 || !Number.isInteger(v ?? 0)) add("ALLOCATION_INVALID", "INVALID ALLOCATION", `${p} allocation must be a non-negative amount.`);
    if ((spent[p] ?? 0) > (v ?? 0)) add("ALLOCATION_BELOW_SPENT", "POLICY CONFLICT", `${p} allocation ${inr(v ?? 0)} is below the ${inr(spent[p] ?? 0)} already spent on it.`, { allocatedPaise: v ?? 0, availablePaise: spent[p] ?? 0 });
  }
  const pool = d.amountPaise - allocated;
  const used = unallocatedSpent(d.allocations, spent);
  if (allocated <= d.amountPaise && used > pool) add("POOL_BELOW_SPENT", "POLICY CONFLICT", `Unallocated pool would be ${inr(pool)} but ${inr(used)} of unallocated spending already happened.`, { allocatedPaise: used, availablePaise: pool });
  return out;
}

export function normalizeDraft(d: PolicyDraft): PolicyDraft {
  const purposes = PURPOSES.filter((p) => d.purposes.includes(p));
  const allocations: Partial<Record<Purpose, number>> = {};
  for (const p of purposes) if (d.allocations[p] !== undefined && (d.allocations[p] as number) > 0) allocations[p] = d.allocations[p];
  return { ...d, purposes, allocations, recipientId: d.recipientId === "*" ? "*" : d.recipientId.toUpperCase(), merchants: [...new Set(d.merchants.map((m) => m.trim()).filter(Boolean))] };
}

/** Stable serialisation: fixed key order, so the hash does not depend on object insertion order. */
export function canonicalPolicy(p: Omit<Policy, "hash">): string {
  return JSON.stringify([p.policyId, p.policyVersion, p.amountPaise, p.currency, p.recipient.type, p.recipient.id, p.allowedPurposes, p.maxTransactionPaise, p.expiresAt, PURPOSES.map((k) => [k, p.allocations[k] ?? null]), p.merchantConstraints, p.createdAt, p.issuer]);
}

export type Hasher = (s: string) => string;

export function sealPolicy(p: Omit<Policy, "hash">, hash: Hasher): Policy {
  return { ...p, hash: hash(canonicalPolicy(p)) };
}

export function policyHashValid(p: Policy, hash: Hasher): boolean {
  const { hash: h, ...rest } = p;
  return hash(canonicalPolicy(rest)) === h;
}

/** Rules enforced for this policy, in evaluation order. Used by the graph and the DNA panel. */
export function activeRules(p: Policy): { id: string; label: string }[] {
  const r = [
    { id: "STATE", label: "Wallet state" },
    { id: "EXPIRY", label: "Expiry" },
    { id: "RECIPIENT", label: "Recipient" },
    { id: "PURPOSE", label: "Purpose" },
  ];
  if (p.merchantConstraints.length) r.push({ id: "MERCHANT", label: "Merchant" });
  r.push({ id: "MAX_TRANSACTION", label: "Max transaction" });
  if (Object.keys(p.allocations).length) r.push({ id: "ALLOCATION", label: "Allocation" });
  r.push({ id: "BALANCE", label: "Balance" });
  return r;
}

// ------------------------------------------------------------------ state machine

export const STATE_EDGES: { from: MoneyState; to: MoneyState; via: Command }[] = [
  { from: "ISSUED", to: "ACTIVE", via: "ACTIVATE" },
  { from: "ACTIVE", to: "PARTIALLY_SPENT", via: "SPEND" },
  { from: "ACTIVE", to: "DEPLETED", via: "SPEND" },
  { from: "PARTIALLY_SPENT", to: "DEPLETED", via: "SPEND" },
  { from: "ACTIVE", to: "SUSPENDED", via: "SUSPEND" },
  { from: "PARTIALLY_SPENT", to: "SUSPENDED", via: "SUSPEND" },
  { from: "SUSPENDED", to: "ACTIVE", via: "RESUME" },
  { from: "SUSPENDED", to: "PARTIALLY_SPENT", via: "RESUME" },
  { from: "ACTIVE", to: "EXPIRED", via: "EXPIRE" },
  { from: "PARTIALLY_SPENT", to: "EXPIRED", via: "EXPIRE" },
  { from: "SUSPENDED", to: "EXPIRED", via: "EXPIRE" },
  { from: "ISSUED", to: "EXPIRED", via: "EXPIRE" },
  { from: "ISSUED", to: "REVOKED", via: "REVOKE" },
  { from: "ACTIVE", to: "REVOKED", via: "REVOKE" },
  { from: "PARTIALLY_SPENT", to: "REVOKED", via: "REVOKE" },
  { from: "SUSPENDED", to: "REVOKED", via: "REVOKE" },
];

export const TERMINAL: MoneyState[] = ["DEPLETED", "REVOKED", "EXPIRED"];
export const SPENDABLE: MoneyState[] = ["ACTIVE", "PARTIALLY_SPENT"];

/** Deterministic transition function. Returns null when the transition is not legal. */
export function nextState(state: MoneyState, cmd: Command, ctx: { balancePaise: number; initialPaise: number }): MoneyState | null {
  switch (cmd) {
    case "ACTIVATE":
      return state === "ISSUED" ? "ACTIVE" : null;
    case "SPEND":
      return SPENDABLE.includes(state) ? (ctx.balancePaise <= 0 ? "DEPLETED" : "PARTIALLY_SPENT") : null;
    case "SUSPEND":
      return SPENDABLE.includes(state) ? "SUSPENDED" : null;
    case "RESUME":
      return state === "SUSPENDED" ? (ctx.balancePaise < ctx.initialPaise ? "PARTIALLY_SPENT" : "ACTIVE") : null;
    case "REVOKE":
      return TERMINAL.includes(state) ? null : "REVOKED";
    case "EXPIRE":
      return TERMINAL.includes(state) ? null : "EXPIRED";
  }
}

/** What the UI should display right now: a live timestamp can expire money before the server has recorded it. */
export function displayState(status: MoneyState, expiresAt: string, nowMs: number): MoneyState {
  return !TERMINAL.includes(status) && nowMs >= Date.parse(expiresAt) ? "EXPIRED" : status;
}

// ------------------------------------------------------------------ verification

export interface TxnRequest {
  amountPaise: number;
  purpose: Purpose;
  recipient: string;
  merchant: string;
}

export interface Check {
  rule: "STATE" | "EXPIRY" | "RECIPIENT" | "PURPOSE" | "MERCHANT" | "MAX_TRANSACTION" | "ALLOCATION" | "BALANCE";
  label: string;
  ok: boolean;
  /** Machine reason code reported when this check fails. */
  code: string;
  configured: string;
  requested: string;
  detail: string;
}

export interface Verification {
  decision: "APPROVED" | "REJECTED";
  checks: Check[];
  failed: Check[];
  /** First failing rule in priority order (STATE, EXPIRY, RECIPIENT, ...). */
  primary: Check | null;
}

export interface Wallet {
  walletId: string;
  policy: Policy;
  policies: Policy[];
  balancePaise: number;
  initialPaise: number;
  spentByPurpose: Record<string, number>;
  status: MoneyState;
  seq: number;
  lastHash: string | null;
  approved: number;
  rejected: number;
}

const PRIORITY: Check["rule"][] = ["STATE", "EXPIRY", "RECIPIENT", "PURPOSE", "MERCHANT", "MAX_TRANSACTION", "ALLOCATION", "BALANCE"];

export function verify(w: Wallet, req: TxnRequest, nowMs: number): Verification {
  const p = w.policy;
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const exp = Date.parse(p.expiresAt);

  add({ rule: "STATE", label: "State", ok: SPENDABLE.includes(w.status), code: "STATE_VIOLATION", configured: "ACTIVE or PARTIALLY_SPENT", requested: w.status, detail: SPENDABLE.includes(w.status) ? `Money is ${w.status} and can be spent.` : `Money is ${w.status} and cannot be spent.` });
  add({ rule: "EXPIRY", label: "Expiry", ok: nowMs < exp, code: "EXPIRATION_VIOLATION", configured: p.expiresAt, requested: new Date(nowMs).toISOString(), detail: nowMs < exp ? "Within the validity window." : `Expired at ${p.expiresAt}. Unspent funds have lapsed.` });
  const recOk = p.recipient.id === "*" || p.recipient.id.toUpperCase() === req.recipient.trim().toUpperCase();
  add({ rule: "RECIPIENT", label: "Recipient", ok: recOk, code: "RECIPIENT_VIOLATION", configured: p.recipient.id === "*" ? `any ${p.recipient.type}` : p.recipient.id, requested: req.recipient.trim().toUpperCase() || "(none)", detail: recOk ? "Spender is the authorised recipient." : `Authorised ${p.recipient.id}, received ${req.recipient.trim().toUpperCase() || "(none)"}.` });
  const purOk = p.allowedPurposes.includes(req.purpose);
  add({ rule: "PURPOSE", label: "Purpose", ok: purOk, code: "PURPOSE_VIOLATION", configured: p.allowedPurposes.join(" + "), requested: req.purpose, detail: purOk ? `${req.purpose} is an allowed purpose.` : `Allowed ${p.allowedPurposes.join(", ")}; requested ${req.purpose}.` });
  if (p.merchantConstraints.length) {
    const merOk = p.merchantConstraints.some((m) => m.toLowerCase() === req.merchant.trim().toLowerCase());
    add({ rule: "MERCHANT", label: "Merchant", ok: merOk, code: "MERCHANT_VIOLATION", configured: p.merchantConstraints.join(", "), requested: req.merchant.trim() || "(none)", detail: merOk ? "Merchant is on the allow-list." : `Merchant "${req.merchant.trim()}" is not on the allow-list.` });
  }
  const limOk = req.amountPaise <= p.maxTransactionPaise;
  add({ rule: "MAX_TRANSACTION", label: "Max transaction", ok: limOk, code: "LIMIT_VIOLATION", configured: inr(p.maxTransactionPaise), requested: inr(req.amountPaise), detail: limOk ? `${inr(req.amountPaise)} is within the ${inr(p.maxTransactionPaise)} limit.` : `Maximum ${inr(p.maxTransactionPaise)}; requested ${inr(req.amountPaise)}.` });
  if (Object.keys(p.allocations).length) {
    const alloc = p.allocations[req.purpose];
    const spent = w.spentByPurpose[req.purpose] ?? 0;
    const pool = p.amountPaise - sum(p.allocations);
    const room = alloc !== undefined ? alloc - spent : pool - unallocatedSpent(p.allocations, w.spentByPurpose);
    const aOk = purOk ? req.amountPaise <= room : true;
    add({ rule: "ALLOCATION", label: "Allocation", ok: aOk, code: "ALLOCATION_VIOLATION", configured: alloc !== undefined ? `${req.purpose} ${inr(alloc)}` : `unallocated pool ${inr(pool)}`, requested: inr(req.amountPaise), detail: aOk ? `${inr(Math.max(0, room))} of ${alloc !== undefined ? req.purpose + " allocation" : "unallocated pool"} remains.` : `Only ${inr(Math.max(0, room))} remains in the ${alloc !== undefined ? req.purpose + " allocation" : "unallocated pool"}; requested ${inr(req.amountPaise)}.` });
  }
  const balOk = req.amountPaise <= w.balancePaise;
  add({ rule: "BALANCE", label: "Balance", ok: balOk, code: "INSUFFICIENT_BALANCE", configured: inr(w.balancePaise), requested: inr(req.amountPaise), detail: balOk ? `Balance ${inr(w.balancePaise)} covers it.` : `Balance ${inr(w.balancePaise)} is below ${inr(req.amountPaise)}.` });

  const failed = checks.filter((c) => !c.ok);
  // An EXPIRED object is reported as an expiration violation; revoked/suspended/depleted money as a state violation.
  const order = w.status === "EXPIRED" ? ["EXPIRY", ...PRIORITY.filter((r) => r !== "EXPIRY")] : PRIORITY;
  const primary = [...failed].sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule))[0] ?? null;
  return { decision: failed.length ? "REJECTED" : "APPROVED", checks, failed, primary };
}

// ------------------------------------------------------------------ ledger

export interface Trace {
  request: { amountPaise: number; purpose: string; recipient: string; merchant: string } | null;
  checks: Check[];
  failedRule: string | null;
  note: string | null;
}

export interface LedgerEvent {
  seq: number;
  eventId: string;
  ts: string;
  type: EventType;
  amountPaise: number;
  purpose: string | null;
  recipient: string | null;
  merchant: string | null;
  result: "SUCCESS" | "APPROVED" | "REJECTED";
  reason: string | null;
  balanceAfterPaise: number;
  policyVersion: number;
  stateBefore: MoneyState | null;
  stateAfter: MoneyState;
  trace: Trace | null;
  prevHash: string | null;
  hash: string;
}

export function eventPayload(e: Omit<LedgerEvent, "hash">): string {
  return JSON.stringify([e.prevHash ?? "GENESIS", e.seq, e.eventId, e.ts, e.type, e.amountPaise, e.purpose, e.recipient, e.merchant, e.result, e.reason, e.balanceAfterPaise, e.policyVersion, e.stateBefore, e.stateAfter, e.trace]);
}

export function verifyChain(events: LedgerEvent[], hash: Hasher): { valid: boolean; brokenAt?: number } {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const { hash: h, ...rest } = events[i];
    if (rest.prevHash !== prev || hash(eventPayload(rest)) !== h) return { valid: false, brokenAt: i };
    prev = h;
  }
  return { valid: true };
}

export const eventId = (seq: number) => `TX-${String(seq).padStart(3, "0")}`;

// ------------------------------------------------------------------ transitions (pure)

interface Emit {
  type: EventType;
  amountPaise?: number;
  purpose?: string | null;
  recipient?: string | null;
  merchant?: string | null;
  result?: LedgerEvent["result"];
  reason?: string | null;
  stateAfter: MoneyState;
  trace?: Trace | null;
}

class Run {
  w: Wallet;
  events: LedgerEvent[] = [];
  constructor(
    w: Wallet,
    private readonly now: number,
    private readonly hash: Hasher,
  ) {
    this.w = { ...w, spentByPurpose: { ...w.spentByPurpose }, policies: [...w.policies] };
  }
  emit(e: Emit) {
    const seq = this.w.seq + 1;
    const base: Omit<LedgerEvent, "hash"> = {
      seq,
      eventId: eventId(seq),
      ts: new Date(this.now).toISOString(),
      type: e.type,
      amountPaise: e.amountPaise ?? 0,
      purpose: e.purpose ?? null,
      recipient: e.recipient ?? null,
      merchant: e.merchant ?? null,
      result: e.result ?? "SUCCESS",
      reason: e.reason ?? null,
      balanceAfterPaise: this.w.balancePaise,
      policyVersion: this.w.policy.policyVersion,
      stateBefore: this.w.status,
      stateAfter: e.stateAfter,
      trace: e.trace ?? null,
      prevHash: this.w.lastHash,
    };
    const ev: LedgerEvent = { ...base, hash: this.hash(eventPayload(base)) };
    this.events.push(ev);
    this.w.seq = seq;
    this.w.lastHash = ev.hash;
    this.w.status = e.stateAfter;
  }
  /** Time-based transition: recorded the first time the engine observes the expired timestamp. */
  expireIfNeeded() {
    const next = nextState(this.w.status, "EXPIRE", this.w);
    if (next && this.now >= Date.parse(this.w.policy.expiresAt)) this.emit({ type: "EXPIRE", stateAfter: next, reason: "EXPIRATION", trace: { request: null, checks: [], failedRule: null, note: `Policy v${this.w.policy.policyVersion} expiry ${this.w.policy.expiresAt} reached.` } });
  }
}

export interface StepResult {
  wallet: Wallet;
  events: LedgerEvent[];
}

export function buildPolicy(d: PolicyDraft, ctx: { policyId: string; version: number; nowMs: number; expiresAt?: string; createdAt?: string }, hash: Hasher): Policy {
  const n = normalizeDraft(d);
  return sealPolicy(
    {
      policyId: ctx.policyId,
      policyVersion: ctx.version,
      amountPaise: n.amountPaise,
      currency: "INR",
      recipient: { type: n.recipientType, id: n.recipientId },
      allowedPurposes: n.purposes,
      maxTransactionPaise: Math.min(n.maxTxnPaise ?? n.amountPaise, n.amountPaise),
      expiresAt: ctx.expiresAt ?? new Date(ctx.nowMs + n.expiresInSeconds * 1000).toISOString(),
      allocations: n.allocations,
      merchantConstraints: n.merchants,
      createdAt: ctx.createdAt ?? new Date(ctx.nowMs).toISOString(),
      issuer: ISSUER,
    },
    hash,
  );
}

/** ISSUE then ACTIVATE. Throws EngineError when the deterministic validator finds a conflict. */
export function issue(draft: PolicyDraft, ctx: { walletId: string; policyId: string; nowMs: number }, hash: Hasher): StepResult {
  const conflicts = validateDraft(normalizeDraft(draft));
  if (conflicts.length) throw new EngineError("policy_conflict", conflicts[0].message);
  const policy = buildPolicy(draft, { policyId: ctx.policyId, version: 1, nowMs: ctx.nowMs }, hash);
  const w: Wallet = { walletId: ctx.walletId, policy, policies: [policy], balancePaise: policy.amountPaise, initialPaise: policy.amountPaise, spentByPurpose: {}, status: "ISSUED", seq: 0, lastHash: null, approved: 0, rejected: 0 };
  const run = new Run(w, ctx.nowMs, hash);
  run.emit({ type: "ISSUE", amountPaise: policy.amountPaise, recipient: policy.recipient.id, stateAfter: "ISSUED", trace: { request: null, checks: [], failedRule: null, note: `Policy ${policy.policyId} v1 sealed ${policy.hash.slice(0, 12)}` } });
  run.w.status = "ISSUED";
  run.emit({ type: "ACTIVATE", stateAfter: nextState("ISSUED", "ACTIVATE", run.w) as MoneyState });
  return { wallet: run.w, events: run.events };
}

/** Records EXPIRE if the timestamp has passed. Safe to call repeatedly. */
export function sync(w: Wallet, nowMs: number, hash: Hasher): StepResult {
  const run = new Run(w, nowMs, hash);
  run.expireIfNeeded();
  return { wallet: run.w, events: run.events };
}

export function spend(w: Wallet, req: TxnRequest, nowMs: number, hash: Hasher): StepResult & { verification: Verification } {
  const run = new Run(w, nowMs, hash);
  run.expireIfNeeded();
  const v = verify(run.w, req, nowMs);
  const request = { amountPaise: req.amountPaise, purpose: req.purpose, recipient: req.recipient.trim().toUpperCase(), merchant: req.merchant.trim() };
  const trace: Trace = { request, checks: v.checks, failedRule: v.primary?.rule ?? null, note: null };
  if (v.decision === "APPROVED") {
    run.w.balancePaise -= req.amountPaise;
    run.w.spentByPurpose[req.purpose] = (run.w.spentByPurpose[req.purpose] ?? 0) + req.amountPaise;
    run.w.approved += 1;
    const after = nextState(run.w.status, "SPEND", run.w) as MoneyState;
    run.emit({ type: "SPEND", amountPaise: req.amountPaise, purpose: req.purpose, recipient: request.recipient, merchant: request.merchant, result: "APPROVED", stateAfter: after, trace });
  } else {
    run.w.rejected += 1;
    run.emit({ type: "SPEND", amountPaise: req.amountPaise, purpose: req.purpose, recipient: request.recipient, merchant: request.merchant, result: "REJECTED", reason: v.primary?.code ?? "REJECTED", stateAfter: run.w.status, trace });
  }
  return { wallet: run.w, events: run.events, verification: v };
}

export function control(w: Wallet, cmd: "SUSPEND" | "RESUME" | "REVOKE", nowMs: number, hash: Hasher): StepResult {
  const run = new Run(w, nowMs, hash);
  run.expireIfNeeded();
  const to = nextState(run.w.status, cmd, run.w);
  if (!to) throw new EngineError("illegal_transition", `${cmd} is not allowed while money is ${run.w.status}.`);
  run.emit({ type: cmd, stateAfter: to });
  return { wallet: run.w, events: run.events };
}

/** New policy version. Historical events keep the version they were evaluated under. */
export function updatePolicy(w: Wallet, draft: PolicyDraft, keepExpiry: boolean, nowMs: number, hash: Hasher): StepResult {
  const run = new Run(w, nowMs, hash);
  run.expireIfNeeded();
  if (TERMINAL.includes(run.w.status)) throw new EngineError("illegal_transition", `Policy cannot change while money is ${run.w.status}.`);
  if (run.w.policies.length >= MAX_POLICY_VERSIONS) throw new EngineError("version_limit", `At most ${MAX_POLICY_VERSIONS} policy versions per money object.`);
  const forced = { ...draft, amountPaise: run.w.initialPaise };
  const conflicts = validateDraft(normalizeDraft(forced), run.w.spentByPurpose);
  if (conflicts.length) throw new EngineError("policy_conflict", conflicts[0].message);
  const cur = run.w.policy;
  const next = buildPolicy(forced, { policyId: cur.policyId, version: cur.policyVersion + 1, nowMs, expiresAt: keepExpiry ? cur.expiresAt : undefined }, hash);
  run.w.policy = next;
  run.w.policies.push(next);
  run.emit({ type: "POLICY_UPDATE", stateAfter: run.w.status, trace: { request: null, checks: [], failedRule: null, note: `v${cur.policyVersion} -> v${next.policyVersion} ${next.hash.slice(0, 12)}` } });
  return { wallet: run.w, events: run.events };
}

/** Human summary of a policy, e.g. "₹1,000 · FOOD + TRANSPORT · 48h". */
export function policySummary(p: Policy): string {
  const secs = Math.round((Date.parse(p.expiresAt) - Date.parse(p.createdAt)) / 1000);
  return `${inr(p.amountPaise)} · ${p.allowedPurposes.join(" + ")} · max ${inr(p.maxTransactionPaise)} · ${fmtSpan(secs)}`;
}

export function fmtSpan(secs: number): string {
  if (secs < 90) return `${secs}s`;
  if (secs < 5400) return `${Math.round(secs / 60)}m`;
  if (secs < 172_800) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86_400)}d`;
}

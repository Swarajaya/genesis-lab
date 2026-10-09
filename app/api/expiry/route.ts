import { createHash, randomBytes, randomUUID } from "node:crypto";
import { aiConfigured, generateStructured } from "@/lib/ai";
import { EXPLAIN_SYSTEM, POLICY_PARSE_SYSTEM } from "@/lib/ai/prompts/expiry";
import { untrusted } from "@/lib/ai/prompts/shared";
import {
  EngineError,
  control,
  issue,
  normalizeDraft,
  spend,
  sync,
  updatePolicy,
  validateDraft,
  type LedgerEvent,
  type Policy,
  type PolicyDraft,
  type Purpose,
  type StepResult,
  type Wallet,
} from "@/lib/engines/money/policy";
import { ApiError, ok, parseJson, route } from "@/lib/security/api";
import { getSessionId } from "@/lib/security/session";
import { signToken, verifyToken } from "@/lib/security/token";
import { createWallet, recordRun, saveMoneyEvents, saveMoneyPolicy, saveTransaction, updateWalletRule } from "@/lib/supabase/persist";
import { aiExplain, aiPolicyParse, expiryRequest } from "@/lib/validation/expiry";

export const runtime = "nodejs";
export const maxDuration = 60;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

interface Signed {
  v: 2;
  w: Wallet;
}

const lower = (s: string) => s.toLowerCase();

function recipientTypeLegacy(t: string): string {
  const l = lower(t);
  return l === "student" || l === "farmer" || l === "worker" ? l : "any";
}

function ruleRow(p: Policy) {
  return { allowedCategories: p.allowedPurposes.map(lower), recipientType: recipientTypeLegacy(p.recipient.type), maxPerTxnPaise: p.maxTransactionPaise, issuedAt: p.createdAt, expiresAt: p.expiresAt };
}

function publicOut(w: Wallet, now: number, extra: Record<string, unknown> = {}) {
  return { wallet: w, token: signToken({ v: 2, w } satisfies Signed), serverTime: now, ...extra };
}

/** Persists everything an action produced. Never throws: persistence problems are reported, not fatal. */
async function persist(sessionId: string, before: Wallet | null, result: StepResult, opts: { policyChanged?: boolean } = {}) {
  const w = result.wallet;
  const rep = { events: true, policy: null as boolean | null };
  try {
    if (opts.policyChanged) {
      rep.policy = await saveMoneyPolicy(w.walletId, sessionId, { version: w.policy.policyVersion, policyId: w.policy.policyId, policy: w.policy, hash: w.policy.hash });
      if (before) await updateWalletRule(w.walletId, ruleRow(w.policy));
    }
    // Legacy per-spend table (existing schema), then the full event ledger.
    for (const e of result.events) {
      if (e.type === "SPEND") {
        await saveTransaction(w.walletId, { amountPaise: e.amountPaise, category: lower(e.purpose ?? "other"), merchant: e.merchant || "-", decision: e.result, reasons: e.trace?.checks.filter((c) => !c.ok).map((c) => c.detail) ?? [], evaluatedAt: e.ts, balanceAfterPaise: e.balanceAfterPaise, prevHash: e.prevHash, entryHash: e.hash });
      }
    }
    rep.events = await saveMoneyEvents(w.walletId, sessionId, result.events);
  } catch {
    rep.events = false;
  }
  return rep;
}

function readWallet(token: string): Wallet {
  const s = verifyToken<Signed>(token);
  if (!s || s.v !== 2 || !s.w) throw new ApiError(400, "bad_token", "Money state failed integrity verification. Issue new money.");
  return s.w;
}

function toDraft(d: { amountPaise: number; recipientType: PolicyDraft["recipientType"]; recipientId: string; purposes: Purpose[]; maxTxnPaise: number | null; expiresInSeconds: number; allocations: Partial<Record<Purpose, number>>; merchants: string[] }): PolicyDraft {
  return normalizeDraft(d);
}

function wrap<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof EngineError) throw new ApiError(e.code === "policy_conflict" ? 422 : 409, e.code, e.message);
    throw e;
  }
}

export const POST = route({ scope: "expiry", limit: 120 }, async (req) => {
  const body = await parseJson(req, expiryRequest, 40_000);
  const now = Date.now();

  // ---------------------------------------------------------------- AI: natural language -> structured draft (validated deterministically)
  if (body.action === "compile") {
    if (!aiConfigured()) throw new ApiError(503, "ai_no_keys", "AI policy compiler is unavailable. Use the structured controls instead.");
    const { data, meta } = await generateStructured(aiPolicyParse, { system: POLICY_PARSE_SYSTEM, prompt: untrusted("policy_text", body.text), temperature: 0.1, tag: "expiry-compile" });
    const allocations: Partial<Record<Purpose, number>> = {};
    for (const a of data.allocations) allocations[a.purpose] = (allocations[a.purpose] ?? 0) + Math.round(a.rupees * 100);
    const draft = toDraft({
      amountPaise: Math.round(data.amountRupees * 100),
      recipientType: data.recipientType,
      recipientId: data.recipientId?.trim() ? data.recipientId.trim() : `${data.recipientType}-${String(randomBytes(2).readUInt16BE() % 1000).padStart(3, "0")}`,
      purposes: data.purposes,
      maxTxnPaise: data.maxTransactionRupees ? Math.round(data.maxTransactionRupees * 100) : null,
      expiresInSeconds: data.expiresInSeconds,
      allocations,
      merchants: data.merchants,
    });
    return ok({ draft, conflicts: validateDraft(draft), provider: meta.provider });
  }

  if (body.action === "explain") {
    if (!aiConfigured()) return ok({ explanation: null, note: "AI explanation unavailable: no AI key configured. The engine result is unaffected." });
    try {
      const { data, meta } = await generateStructured(aiExplain, { system: EXPLAIN_SYSTEM, prompt: `${body.kind === "conflict" ? "Policy conflict" : "Transaction verification"} facts decided by the engine:\n${untrusted("facts", `${body.facts.headline}\n${body.facts.lines.join("\n")}`)}`, temperature: 0.2, tag: "expiry-explain" });
      return ok({ explanation: data.explanation, provider: meta.provider, note: null });
    } catch {
      return ok({ explanation: null, note: "AI explanation is temporarily unavailable. The engine result is unaffected." });
    }
  }

  const sessionId = await getSessionId();

  if (body.action === "issue") {
    const draft = toDraft(body.draft);
    const conflicts = validateDraft(draft);
    if (conflicts.length) throw new ApiError(422, "policy_conflict", conflicts[0].message);
    const walletId = await createWallet(sessionId, draft.amountPaise, ruleRow({ allowedPurposes: draft.purposes, recipient: { type: draft.recipientType, id: draft.recipientId }, maxTransactionPaise: Math.min(draft.maxTxnPaise ?? draft.amountPaise, draft.amountPaise), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + draft.expiresInSeconds * 1000).toISOString() } as Policy));
    const result = wrap(() => issue(draft, { walletId, policyId: `POL-${randomUUID().slice(0, 8).toUpperCase()}`, nowMs: now }, sha));
    const persisted = await persist(sessionId, null, result, { policyChanged: true });
    await recordRun("expiry", sessionId, { action: "issue", purposes: draft.purposes.length }, {}, Date.now() - now);
    return ok(publicOut(result.wallet, now, { events: result.events, persisted }));
  }

  const wallet = readWallet(body.token);

  if (body.action === "sync") {
    const result = sync(wallet, now, sha);
    const persisted = result.events.length ? await persist(sessionId, wallet, result) : { events: true, policy: null };
    return ok(publicOut(result.wallet, now, { events: result.events, persisted }));
  }

  if (body.action === "spend") {
    const result = spend(wallet, body.request, now, sha);
    const persisted = await persist(sessionId, wallet, result);
    await recordRun("expiry", sessionId, { action: "spend", purpose: body.request.purpose }, { decision: result.verification.decision }, Date.now() - now);
    return ok(publicOut(result.wallet, now, { events: result.events, persisted, verification: result.verification }));
  }

  if (body.action === "control") {
    const result = wrap(() => control(wallet, body.command, now, sha));
    const persisted = await persist(sessionId, wallet, result);
    return ok(publicOut(result.wallet, now, { events: result.events, persisted }));
  }

  // update_policy
  const result = wrap(() => updatePolicy(wallet, toDraft(body.draft), body.keepExpiry, now, sha));
  const persisted = await persist(sessionId, wallet, result, { policyChanged: true });
  return ok(publicOut(result.wallet, now, { events: result.events, persisted }));
});

export type { LedgerEvent };

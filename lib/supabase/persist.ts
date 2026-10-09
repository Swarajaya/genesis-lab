import "server-only";
import { randomUUID } from "node:crypto";
import { getAdmin } from "./admin";

/**
 * Persistence helpers. Every function returns quietly (null/false) if Supabase is not configured
 * or a write fails, so the experiments always keep working. Callers surface `saved` to the UI.
 */

const slugCache = new Map<string, string>();

async function experimentId(slug: string): Promise<string | null> {
  const db = getAdmin();
  if (!db) return null;
  if (slugCache.has(slug)) return slugCache.get(slug) as string;
  const { data } = await db.from("experiments").select("id").eq("slug", slug).maybeSingle();
  if (data?.id) slugCache.set(slug, data.id);
  return data?.id ?? null;
}

export async function recordRun(slug: string, sessionId: string, input: Record<string, unknown>, result: Record<string, unknown>, durationMs: number): Promise<string | null> {
  const db = getAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("experiment_runs")
      .insert({ experiment_id: await experimentId(slug), experiment_slug: slug, session_id: sessionId, input_summary: input, result_summary: result, duration_ms: durationMs })
      .select("id")
      .single();
    if (error) return null;
    return data.id as string;
  } catch {
    return null;
  }
}

async function insert(table: string, row: Record<string, unknown> | Record<string, unknown>[]): Promise<boolean> {
  const db = getAdmin();
  if (!db) return false;
  try {
    const { error } = await db.from(table).insert(row);
    return !error;
  } catch {
    return false;
  }
}

export const saveBlood = (runId: string | null, sessionId: string, recipient: unknown, constraints: unknown, ranking: unknown, explanation: string | null) =>
  insert("blood_matches", { run_id: runId, session_id: sessionId, recipient, constraints, ranking, explanation });

export async function saveNutrition(runId: string | null, sessionId: string, ingredients: unknown, result: unknown, wasteG: number, assetId: string | null) {
  return insert("nutrition_runs", { run_id: runId, session_id: sessionId, ingredients, result, waste_diverted_g: wasteG, asset_id: assetId });
}

export const saveObject = (runId: string | null, sessionId: string, name: string, material: string, pathways: unknown[], assetId: string | null) =>
  insert("object_lifecycles", { run_id: runId, session_id: sessionId, object_name: name, material, pathways, pathway_count: pathways.length, asset_id: assetId });

export const saveProof = (runId: string | null, sessionId: string, commitment: string, proof: unknown, verified: boolean, claim = "age>=18") =>
  insert("identity_proofs", { run_id: runId, session_id: sessionId, claim, commitment, proof, verified });

export async function saveGame(sessionId: string, seed: string, summary: { status: string; surviving: string[]; rejected: unknown[] }, observations: { before: unknown; action: unknown; after: unknown }[]): Promise<boolean> {
  const db = getAdmin();
  if (!db) return false;
  try {
    const { data, error } = await db
      .from("game_sessions")
      .insert({ session_id: sessionId, world_seed: seed, status: summary.status, surviving_hypotheses: summary.surviving, rejected_hypotheses: summary.rejected })
      .select("id")
      .single();
    if (error) return false;
    if (observations.length) {
      await db.from("game_observations").insert(observations.map((o, i) => ({ game_session_id: data.id, step_index: i, state_before: o.before, action: { move: o.action }, state_after: o.after })));
    }
    return true;
  } catch {
    return false;
  }
}

export async function storeUpload(sessionId: string, slug: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const db = getAdmin();
  if (!db) return null;
  try {
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = `${sessionId}/${slug}/${randomUUID()}.${ext}`;
    const up = await db.storage.from("genesis-uploads").upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) return null;
    const { data, error } = await db
      .from("uploaded_assets")
      .insert({ session_id: sessionId, experiment_slug: slug, storage_path: path, mime_type: mime, size_bytes: bytes.length })
      .select("id")
      .single();
    return error ? null : (data.id as string);
  } catch {
    return null;
  }
}

export async function createWallet(sessionId: string, amountPaise: number, rule: { allowedCategories: string[]; recipientType: string; maxPerTxnPaise: number; issuedAt: string; expiresAt: string }): Promise<string> {
  const db = getAdmin();
  const fallback = randomUUID();
  if (!db) return fallback;
  try {
    const { data, error } = await db.from("money_wallets").insert({ session_id: sessionId, balance_paise: amountPaise, initial_paise: amountPaise }).select("id").single();
    if (error) return fallback;
    await db.from("money_rules").insert({ wallet_id: data.id, allowed_categories: rule.allowedCategories, recipient_type: rule.recipientType, max_per_txn_paise: rule.maxPerTxnPaise, issued_at: rule.issuedAt, expires_at: rule.expiresAt });
    return data.id as string;
  } catch {
    return fallback;
  }
}

export async function updateWalletRule(walletId: string, rule: { allowedCategories: string[]; recipientType: string; maxPerTxnPaise: number; expiresAt: string }): Promise<boolean> {
  const db = getAdmin();
  if (!db) return false;
  try {
    const { error } = await db
      .from("money_rules")
      .update({ allowed_categories: rule.allowedCategories, recipient_type: rule.recipientType, max_per_txn_paise: rule.maxPerTxnPaise, expires_at: rule.expiresAt })
      .eq("wallet_id", walletId);
    return !error;
  } catch {
    return false;
  }
}

export async function saveTransaction(
  walletId: string,
  t: { amountPaise: number; category: string; merchant: string; decision: string; reasons: string[]; evaluatedAt: string; balanceAfterPaise: number; prevHash: string | null; entryHash: string },
): Promise<boolean> {
  const db = getAdmin();
  if (!db) return false;
  try {
    const { error } = await db.from("money_transactions").insert({
      wallet_id: walletId,
      amount_paise: t.amountPaise,
      category: t.category,
      merchant: t.merchant,
      decision: t.decision,
      reasons: t.reasons,
      evaluated_at: t.evaluatedAt,
      balance_after_paise: t.balanceAfterPaise,
      prev_hash: t.prevHash,
      entry_hash: t.entryHash,
    });
    if (error) return false;
    if (t.decision === "APPROVED") await db.from("money_wallets").update({ balance_paise: t.balanceAfterPaise }).eq("id", walletId);
    return true;
  } catch {
    return false;
  }
}

export async function loadBloodInventory() {
  const db = getAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db.from("blood_inventory").select("*").eq("is_demo", true).order("donor_code");
    if (error || !data?.length) return null;
    return data.map((d) => ({
      code: d.donor_code as string,
      abo: d.abo,
      rh: d.rh,
      kell: d.kell,
      rhc: d.rhc,
      rhe: d.rhe,
      duffy: d.duffy,
      units: d.units as number,
      distanceKm: Number(d.distance_km),
      available: d.available as boolean,
      hoursToExpiry: d.hours_to_expiry as number,
    }));
  } catch {
    return null;
  }
}

/** Remove everything written by this anonymous demo session. */
export async function resetSessionData(sessionId: string): Promise<boolean> {
  const db = getAdmin();
  if (!db) return false;
  try {
    const tables = ["experiment_runs", "blood_matches", "nutrition_runs", "object_lifecycles", "identity_proofs", "game_sessions", "money_wallets"];
    await Promise.all(tables.map((t) => db.from(t).delete().eq("session_id", sessionId)));
    const { data: assets } = await db.from("uploaded_assets").select("id, storage_path").eq("session_id", sessionId);
    if (assets?.length) {
      await db.storage.from("genesis-uploads").remove(assets.map((a) => a.storage_path as string));
      await db.from("uploaded_assets").delete().eq("session_id", sessionId);
    }
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ EXPIRY v2 (policy versions + event ledger)
// Uses money_policies / money_events (see supabase/expiry_v2.sql). Both return false if absent so the engine keeps working.

export const saveMoneyPolicy = (walletId: string, sessionId: string, p: { version: number; policyId: string; policy: unknown; hash: string }) =>
  insert("money_policies", { wallet_id: walletId, session_id: sessionId, policy_id: p.policyId, policy_version: p.version, policy: p.policy, policy_hash: p.hash });

export const saveMoneyEvents = (
  walletId: string,
  sessionId: string,
  events: { seq: number; eventId: string; ts: string; type: string; amountPaise: number; purpose: string | null; recipient: string | null; result: string; reason: string | null; balanceAfterPaise: number; policyVersion: number; stateBefore: string | null; stateAfter: string; trace: unknown; prevHash: string | null; hash: string }[],
) =>
  events.length === 0
    ? Promise.resolve(true)
    : insert(
        "money_events",
        events.map((e) => ({
          wallet_id: walletId,
          session_id: sessionId,
          seq: e.seq,
          event_id: e.eventId,
          occurred_at: e.ts,
          event_type: e.type,
          amount_paise: e.amountPaise,
          purpose: e.purpose,
          recipient: e.recipient,
          result: e.result,
          reason: e.reason,
          balance_after_paise: e.balanceAfterPaise,
          policy_version: e.policyVersion,
          state_before: e.stateBefore,
          state_after: e.stateAfter,
          trace: e.trace,
          prev_hash: e.prevHash,
          entry_hash: e.hash,
        })),
      );

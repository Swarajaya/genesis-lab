import "server-only";
import { getAdmin } from "./admin";
import type { AttemptMeta } from "@/lib/ai/router";

/** Persist safe AI metadata. Fails silently so logging never breaks a user request. */
export async function recordAiRequest(m: AttemptMeta): Promise<void> {
  const db = getAdmin();
  if (!db) return;
  try {
    await db.from("ai_requests").insert({
      experiment_slug: m.tag ?? null,
      provider: m.provider,
      model: m.model ?? null,
      key_slot: m.keySlot,
      success: m.success,
      error_kind: m.errorKind ?? null,
      latency_ms: m.latencyMs,
    });
  } catch {
    /* ignore */
  }
}

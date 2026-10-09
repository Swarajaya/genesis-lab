import "server-only";
import { getAdmin } from "./admin";
import { recordRun, saveObject } from "./persist";
import type { ObjectRunResult } from "@/lib/engines/object/types";

/**
 * Experiment 05 persistence. Reuses the existing experiment_runs and object_lifecycles tables (jsonb columns),
 * so no schema change is required. Every call fails quietly when Supabase is not configured.
 */

export async function persistObjectRun(sessionId: string, assetId: string | null, input: Record<string, unknown>, r: Omit<ObjectRunResult, "runId" | "saved">, durationMs: number): Promise<{ runId: string | null; saved: boolean }> {
  const best = r.pathways[0];
  const summary = {
    pathways: r.pathways.length,
    analysis: {
      material: r.analysis.profile.materials, components: r.analysis.profile.components.map((c) => ({ name: c.name, kind: c.kind, material: c.material, massFraction: c.massFraction, recoverability: c.recoverability, prov: c.prov })),
      massKg: r.analysis.profile.massKg, massProv: r.analysis.profile.massProv, confidence: r.analysis.profile.confidence, mode: r.analysis.analysisMode, provider: r.analysis.provider,
      dna: { recoverability: r.analysis.dna.recoverability, separability: r.analysis.dna.separability, contamination: r.analysis.dna.contaminationLevel },
    },
    stats: r.stats,
    impact: { baseline: r.baseline.score.metrics, bestPathway: best ? { id: best.id, title: best.title, ci: best.score.circularityIndex, metrics: best.score.metrics } : null, spaceIndex: r.spaceIndex },
    providers: r.providerSummary,
  };
  const runId = await recordRun("object", sessionId, input, summary, durationMs);
  const compact = r.pathways.map((p) => ({
    id: p.id, title: p.title, category: p.category, source: p.source, ci: p.score.circularityIndex, composite: p.score.composite, feasibility: p.score.practicality,
    retained: p.score.metrics.materialRetained, wasteKg: p.score.metrics.wasteDivertedKg, emissionsKg: p.score.metrics.emissionsKg, processing: p.score.metrics.processingBurden,
  }));
  const dominant = r.analysis.profile.materials[0]?.material ?? "other";
  const saved = await saveObject(runId, sessionId, r.analysis.profile.name, dominant, compact, assetId);
  return { runId, saved: saved && runId !== null };
}

/** Stores which pathways the researcher inspected or compared, inside the run's result_summary. */
export async function saveSelection(runId: string, sessionId: string, mode: string, ids: number[]): Promise<boolean> {
  const db = getAdmin();
  if (!db) return false;
  try {
    const { data, error } = await db.from("experiment_runs").select("result_summary").eq("id", runId).eq("session_id", sessionId).maybeSingle();
    if (error || !data) return false;
    const prev = (data.result_summary ?? {}) as Record<string, unknown>;
    const log = Array.isArray(prev.selections) ? (prev.selections as unknown[]).slice(-19) : [];
    const { error: e2 } = await db.from("experiment_runs").update({ result_summary: { ...prev, selections: [...log, { mode, pathways: ids, at: new Date().toISOString() }] } }).eq("id", runId).eq("session_id", sessionId);
    return !e2;
  } catch {
    return false;
  }
}

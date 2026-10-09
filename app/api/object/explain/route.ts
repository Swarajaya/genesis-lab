import { aiConfigured, generateStructured } from "@/lib/ai";
import { EXPLAIN_SYSTEM } from "@/lib/ai/prompts/objectCircularity";
import { untrusted } from "@/lib/ai/prompts/shared";
import { ok, parseJson, route } from "@/lib/security/api";
import { getSessionId } from "@/lib/security/session";
import { saveSelection } from "@/lib/supabase/objectPersist";
import { aiExplanation } from "@/lib/validation/schemas";
import { explainRequest } from "@/lib/validation/objectSchemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Model explanation of already-scored pathways. The model receives the engine's numbers and may only restate them.
 * When no provider is available the client falls back to its rule-based explanation, so this never blocks the UI.
 */
export const POST = route({ scope: "object-explain", limit: 30 }, async (req) => {
  const body = await parseJson(req, explainRequest, 20_000);
  const sessionId = await getSessionId();
  if (body.runId) void saveSelection(body.runId, sessionId, body.mode, body.pathways.map((p) => p.num));
  if (!aiConfigured()) return ok({ explanation: null, provider: null });
  try {
    const rows = body.pathways.map((p) => `#${p.num} (rank ${p.rank}) ${p.title} [${p.category}] ci=${p.ci} feasibility=${p.feasibility} retained=${p.retained}% waste_kg=${p.wasteKg} emissions_kg_indicative=${p.emissionsKg} processing=${p.processing}% inputs=${p.inputs}% economic=${p.economic} top_contributor=${p.topContributor} top_penalty=${p.topPenalty || "none"}`).join("\n");
    const { data, meta } = await generateStructured(aiExplanation, {
      system: EXPLAIN_SYSTEM,
      prompt: `${untrusted("scored_pathways", `object: ${body.objectName}\nbaseline disposal: ci=${body.baseline.ci} retained=${body.baseline.retained}%\n${rows}`)}\nMode: ${body.mode}.`,
      temperature: 0.3,
      maxOutputTokens: 1024,
      tag: "object-explain",
    });
    return ok({ explanation: data, provider: meta.provider });
  } catch {
    return ok({ explanation: null, provider: null });
  }
});

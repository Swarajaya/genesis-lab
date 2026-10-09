import { generateStructured, aiConfigured } from "@/lib/ai";
import { BLOOD_EXPLAIN_SYSTEM } from "@/lib/ai/prompts/blood";
import { DEMO_DONORS, rankDonors, type Donor } from "@/lib/engines/blood/engine";
import { ok, parseJson, route } from "@/lib/security/api";
import { getSessionId } from "@/lib/security/session";
import { loadBloodInventory, recordRun, saveBlood } from "@/lib/supabase/persist";
import { aiExplanation, bloodRequest } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = route({ scope: "blood", limit: 20 }, async (req) => {
  const t0 = Date.now();
  const body = await parseJson(req, bloodRequest);
  const sessionId = await getSessionId();

  const stored = (await loadBloodInventory()) as Donor[] | null;
  const base: Donor[] = stored ?? DEMO_DONORS;
  const extra = body.extraDonors.filter((d) => !base.some((b) => b.code === d.code));
  const donors = [...base, ...extra];
  const ranking = rankDonors(body.recipient, donors, body.constraints);

  let explanation: { summary: string; points: string[] } | null = null;
  let aiNote: string | null = null;
  let provider: string | null = null;
  if (body.explain) {
    if (!aiConfigured()) aiNote = "AI explanation unavailable: no AI key configured. The ranking above is fully deterministic.";
    else {
      try {
        const top = ranking.slice(0, 6).map((r) => ({
          donor: r.donor.code,
          group: `${r.donor.abo}${r.donor.rh}`,
          verdict: r.verdict,
          score: r.score,
          etaMinutes: r.etaMinutes,
          factors: r.factors.filter((f) => f.status !== "pass").map((f) => `${f.label}: ${f.detail}`),
        }));
        const { data, meta } = await generateStructured(aiExplanation, {
          system: BLOOD_EXPLAIN_SYSTEM,
          prompt: `Recipient: ${JSON.stringify(body.recipient)}\nRanking (top): ${JSON.stringify(top)}`,
          temperature: 0.3,
          tag: "blood",
        });
        explanation = data;
        provider = meta.provider;
      } catch {
        aiNote = "AI explanation is temporarily unavailable. The deterministic ranking is unaffected.";
      }
    }
  }

  const counts = { MATCH: 0, PARTIAL: 0, INCOMPATIBLE: 0 };
  ranking.forEach((r) => counts[r.verdict]++);
  const runId = await recordRun("blood", sessionId, { urgency: body.recipient.urgency, group: `${body.recipient.abo}${body.recipient.rh}` }, counts, Date.now() - t0);
  const saved = await saveBlood(runId, sessionId, body.recipient, body.constraints, ranking.map((r) => ({ code: r.donor.code, verdict: r.verdict, score: r.score })), explanation ? explanation.summary : null);

  return ok({ ranking, counts, explanation, aiNote, provider, inventorySource: stored ? "supabase" : "built-in demo", saved });
});

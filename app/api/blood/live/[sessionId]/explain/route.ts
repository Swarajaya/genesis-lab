import { aiConfigured, generateStructured } from "@/lib/ai";
import { BLOOD_LIVE_EXPLAIN_SYSTEM } from "@/lib/ai/prompts/blood";
import { explainFacts } from "@/lib/blood-live/explain";
import { guarded, sessionIdOf, type Params } from "@/lib/blood-live/http";
import { explainRequest } from "@/lib/blood-live/schemas";
import { snapshot } from "@/lib/blood-live/service";
import { verifyLive } from "@/lib/blood-live/auth";
import { LiveError } from "@/lib/engines/blood/liveTypes";
import { ok, parseJson, route } from "@/lib/security/api";
import { aiExplanation } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * AI is an explanation layer only. The facts below come from the deterministic engine; the model sees them
 * as read-only context and cannot change an allocation. If every key and provider fails, the facts still return.
 */
export const POST = (req: Request, ctx: Params) =>
  route({ scope: "blood-live-explain", limit: 40 }, () =>
    guarded(async () => {
      const id = await sessionIdOf(ctx);
      const body = await parseJson(req, explainRequest, 2_000);
      if (!verifyLive(body.token, id)) throw new LiveError("unauthorized", "This device is not authorised for the session.", 401);
      const snap = await snapshot(id, null);
      const f = explainFacts(snap, body.kind, body.patientId, body.donorCode);
      let explanation: { summary: string; points: string[] } | null = null;
      let provider: string | null = null;
      let aiNote: string | null = null;
      if (!aiConfigured()) aiNote = "AI explanation offline. The engine facts below are exact.";
      else {
        try {
          const { data, meta } = await generateStructured(aiExplanation, { system: BLOOD_LIVE_EXPLAIN_SYSTEM, prompt: `Question: ${f.question}\nState: ${JSON.stringify(f.context)}`, temperature: 0.3, tag: "blood-live" });
          explanation = data;
          provider = meta.provider;
        } catch {
          aiNote = "AI explanation is temporarily unavailable. The engine facts below are exact.";
        }
      }
      return ok({ question: f.question, facts: f.facts, explanation, aiNote, provider });
    }),
  )(req);

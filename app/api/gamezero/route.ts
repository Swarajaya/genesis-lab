import { randomBytes } from "node:crypto";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { GAMEZERO_EXPLAIN_SYSTEM, GAMEZERO_NARRATE_SYSTEM } from "@/lib/ai/prompts/gamezero";
import { ACTIONS } from "@/lib/engines/gamezero/types";
import { initialState, stepWorld, TRANSFER_SUFFIX, worldForSeed, type World } from "@/lib/engines/gamezero/world";
import { ok, parseJson, route } from "@/lib/security/api";
import { getSessionId } from "@/lib/security/session";
import { recordRun, saveGame } from "@/lib/supabase/persist";
import { aiNarration, gamezeroRequest } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

// Worlds are a pure function of their seed, so this cache is only an optimisation and is safe to lose.
const cache = new Map<string, World>();
function worldFor(seed: string): World {
  let w = cache.get(seed);
  if (!w) {
    w = worldForSeed(seed);
    cache.set(seed, w);
    if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  }
  return w;
}

interface NarrateFacts {
  movement: string;
  terrain: { label: string; terrain: string }[];
  rejectedCount: number;
  demonstrations: number;
  experiments: number;
  solvedInSteps: number | null;
  knowledge?: number;
  confirmedRules?: string[];
  counterfactuals?: number;
  transfer?: { baseline: number; transferred: number };
}

function deterministicNarration(a: NarrateFacts) {
  const t = a.terrain.map((x) => `${x.label} is ${x.terrain}`).join(", ");
  const confirmed = a.confirmedRules?.length ? ` ${a.confirmedRules.length} rule(s) were confirmed by deliberate interventions.` : "";
  const cf = a.counterfactuals ? ` We also checked ${a.counterfactuals} counterfactual situation(s) against the real engine.` : "";
  const tr = a.transfer ? ` In the new world we needed ${a.transfer.transferred} experiments, compared with ${a.transfer.baseline} in the first world.` : "";
  return `We watched ${a.demonstrations} demonstrated move(s), then ran ${a.experiments} experiments of our own and rejected ${a.rejectedCount} competing hypotheses. ${a.movement} ${t ? `Terrain we learned: ${t}.` : ""}${confirmed}${cf}${tr} ${a.solvedInSteps !== null ? `Using only what we learned, we reached the goal in ${a.solvedInSteps} moves.` : "We have not reached the goal yet."}`.replace(/\s+/g, " ").trim();
}

// The hidden rules never leave this file's world object. Clients only receive the public board and step results.
export const POST = route({ scope: "gamezero", limit: 1200 }, async (req) => {
  const body = await parseJson(req, gamezeroRequest, 400_000);

  if (body.action === "new") {
    const transfer = !!body.transferFrom;
    const seed = transfer ? `${body.transferFrom}${TRANSFER_SUFFIX}` : (body.seed ?? randomBytes(5).toString("hex"));
    const w = worldFor(seed);
    // Only the public board is returned. Whether mechanics are shared with the base world is NOT disclosed.
    return ok({ seed, world: w.pub, state: initialState(w.pub), transfer });
  }

  if (body.action === "step") {
    const w = worldFor(body.seed);
    const res = stepWorld(w, body.state, body.move);
    return ok({ state: res.state, event: res.event });
  }

  if (body.action === "counterfactual") {
    // Real engine evaluation of every move from the same state. Nothing is mutated; no rules are revealed beyond outcomes.
    const w = worldFor(body.seed);
    const outcomes = {} as Record<string, { pos: { x: number; y: number }; event: string }>;
    for (const a of ACTIONS) {
      const r = stepWorld(w, body.state, a);
      outcomes[a] = { pos: r.state.pos, event: r.event };
    }
    return ok({ outcomes });
  }

  if (body.action === "save") {
    const sessionId = await getSessionId();
    const m = body.model;
    const runId = await recordRun(
      "gamezero",
      sessionId,
      { observations: body.observations.length, seed: body.seed },
      { status: body.summary.status, surviving: body.summary.surviving.length, ...(m ? { worldModel: m } : {}) },
      0,
    );
    void runId;
    const saved = await saveGame(sessionId, body.seed, { status: body.summary.status, surviving: body.summary.surviving, rejected: body.summary.rejected }, body.observations);
    return ok({ saved });
  }

  if (body.action === "explain") {
    const facts = body.facts;
    const fallback = facts.join(" ").slice(0, 400);
    if (aiConfigured()) {
      try {
        const { data, meta } = await generateStructured(aiNarration, { system: GAMEZERO_EXPLAIN_SYSTEM, prompt: `Topic: ${body.topic}\nFacts:\n- ${facts.join("\n- ")}`, temperature: 0.3, tag: "gamezero" });
        return ok({ narration: data.narration, source: "ai", provider: meta.provider });
      } catch {
        /* fall through to the deterministic phrasing */
      }
    }
    return ok({ narration: fallback.length >= 20 ? fallback : `${fallback} (no further detail)`, source: "deterministic", provider: null });
  }

  // narrate: AI only phrases deterministic facts; falls back to a deterministic sentence.
  const facts: NarrateFacts = {
    movement: body.movement,
    terrain: body.terrain,
    rejectedCount: body.rejectedCount,
    demonstrations: body.demonstrations,
    experiments: body.experiments,
    solvedInSteps: body.solvedInSteps,
    knowledge: body.knowledge,
    confirmedRules: body.confirmedRules,
    counterfactuals: body.counterfactuals,
    transfer: body.transfer,
  };
  if (aiConfigured()) {
    try {
      const { data, meta } = await generateStructured(aiNarration, { system: GAMEZERO_NARRATE_SYSTEM, prompt: `Facts: ${JSON.stringify(facts)}`, temperature: 0.4, tag: "gamezero" });
      return ok({ narration: data.narration, source: "ai", provider: meta.provider });
    } catch {
      /* fall through */
    }
  }
  return ok({ narration: deterministicNarration(facts), source: "deterministic", provider: null });
});

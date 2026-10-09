import { aiConfigured, generateStructured } from "@/lib/ai";
import { AIUnavailableError } from "@/lib/ai/errors";
import { CANDIDATE_SYSTEM, OBJECT_ANALYSIS_SYSTEM, candidatePrompt } from "@/lib/ai/prompts/objectCircularity";
import { findReference, OPERATION_COUNT, profileFromReference, round } from "@/lib/engines/object/knowledge";
import { profileFromModel } from "@/lib/engines/object/profile";
import { aggregate, baselineFuture, computeDna, extractConstraints } from "@/lib/engines/object/scoring";
import { dedupe, expandLibrary, normalizeModel, scoreAll, selectTop, sortByComposite, validate, type RawModelCandidate } from "@/lib/engines/object/space";
import type { BaselineFuture, Candidate, Category, EngineEvent, ObjectAnalysis, ObjectNotice, ObjectProfile, ObjectRunResult, PipelineStats } from "@/lib/engines/object/types";
import { ApiError, clientKey, fail, toApiError } from "@/lib/security/api";
import { rateLimit } from "@/lib/security/rateLimit";
import { getSessionId } from "@/lib/security/session";
import { readImageFile } from "@/lib/security/upload";
import { persistObjectRun } from "@/lib/supabase/objectPersist";
import { storeUpload } from "@/lib/supabase/persist";
import { aiCandidateBatch, aiObjectAnalysis, parseCandidates } from "@/lib/validation/objectSchemas";
import { cleanText } from "@/lib/validation/text";

export const runtime = "nodejs";
export const maxDuration = 120;

const TARGET = 100;
const BATCHES: Category[][] = [
  ["direct_reuse", "repair", "adaptive_reuse"],
  ["upcycling", "component_reuse", "creative_transformation"],
  ["material_recovery", "recycling"],
  ["remanufacturing", "industrial_recovery"],
];

/**
 * Streams newline-delimited JSON. Every "event" line is emitted when the corresponding work has actually finished,
 * and carries the server clock at that moment. Nothing here is scripted.
 */
export async function POST(req: Request): Promise<Response> {
  const rl = rateLimit(clientKey(req, "object"), 6, 60_000);
  if (!rl.ok) return fail(429, "rate_limited", "Too many requests. Please slow down and try again shortly.", { "Retry-After": String(rl.retryAfterSec) });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
      const events: EngineEvent[] = [];
      const ev = (code: string, label: string, detail?: string) => {
        const e: EngineEvent = { at: Date.now(), code, label, detail };
        events.push(e);
        send({ type: "event", event: e });
      };
      try {
        const data = await run(req, ev, events, (a) => send({ type: "analysis", data: a }));
        send({ type: "result", data });
      } catch (err) {
        const e = toApiError(err, "object");
        send({ type: "error", error: { code: e.code, message: e.message } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

type Ev = (code: string, label: string, detail?: string) => void;

async function run(req: Request, ev: Ev, events: EngineEvent[], onAnalysis: (a: { analysis: ObjectAnalysis; baseline: BaselineFuture }) => void): Promise<ObjectRunResult> {
  const t0 = Date.now();
  const sessionId = await getSessionId();
  const form = await req.formData();
  const typedName = cleanText(String(form.get("objectName") ?? ""), 80);
  const massRaw = Number(form.get("massKg"));
  const userMassKg = Number.isFinite(massRaw) && massRaw > 0 && massRaw <= 500 ? massRaw : null;
  const requested = Math.min(TARGET, Math.max(10, Number(form.get("count")) || TARGET));
  const file = form.get("image");

  let img: Awaited<ReturnType<typeof readImageFile>> | null = null;
  if (file instanceof File && file.size > 0) img = await readImageFile(file);
  if (!img && !typedName) throw new ApiError(400, "no_object", "Enter an object or upload a photo.");

  const notices: ObjectNotice[] = [];
  ev("OBJECT_RECEIVED", "OBJECT RECEIVED", `${typedName || "photo only"}${img ? " + photo" : ""}${userMassKg ? ` + ${userMassKg} kg` : ""}`);
  const assetId = img ? await storeUpload(sessionId, "object", img.bytes, img.mime) : null;

  /* ---------- 1. material analysis (model first, curated reference as fallback) ---------- */
  const ref = typedName ? findReference(typedName) : null;
  let profile: ObjectProfile | null = null;
  let analysisProvider: string | null = null;
  let analysisErr: unknown = null;
  const aiOn = aiConfigured();
  if (aiOn) {
    try {
      const { data, meta } = await generateStructured(aiObjectAnalysis, {
        system: OBJECT_ANALYSIS_SYSTEM,
        prompt: typedName ? `Analyse this object: <object>${typedName}</object>${img ? " A photo of it is attached." : ""}` : "Analyse the main object in this photo.",
        image: img ? { mimeType: img.mime, data: img.base64 } : undefined,
        temperature: 0.2,
        maxOutputTokens: 4096,
        tag: "object-analysis",
      });
      profile = profileFromModel(data, { typedName, userMassKg, imageUsed: Boolean(img) });
      analysisProvider = meta.provider;
    } catch (e) {
      analysisErr = e;
    }
  }
  if (!profile && ref) {
    profile = profileFromReference(ref, { typedName, userMassKg, imageUsed: Boolean(img) });
    ev("ANALYSIS_FALLBACK", "REFERENCE PROFILE USED", aiOn ? "model analysis unavailable" : "no model keys configured");
    notices.push({ code: "reference_profile", message: "Model analysis was unavailable, so a curated reference profile for this object type was used. Values are typical, not measured." });
    if (img) notices.push({ code: "image_not_analysed", message: "The photo could not be analysed. Analysis is based on the typed name only." });
  }
  if (!profile) throw analysisErr ?? new AIUnavailableError("no_keys", 0);
  if (analysisProvider) {
    ev("MATERIAL_ANALYSIS", "MATERIAL ANALYSIS COMPLETE", `${profile.materials.map((m) => `${m.material} ${Math.round(m.share * 100)}%`).join(", ")} via ${analysisProvider}`);
  } else {
    ev("MATERIAL_ANALYSIS", "MATERIAL ANALYSIS COMPLETE", `${profile.materials.map((m) => `${m.material} ${Math.round(m.share * 100)}%`).join(", ")} from reference table`);
  }
  ev("COMPONENTS", `COMPONENTS IDENTIFIED: ${profile.components.length}`);
  const constraints = extractConstraints(profile);
  ev("CONSTRAINTS", `CONSTRAINTS EXTRACTED: ${constraints.length}`);
  const dna = computeDna(profile);
  const baseline = baselineFuture(profile);
  onAnalysis({ analysis: { profile, dna, constraints, analysisMode: profile.source, provider: analysisProvider }, baseline });

  /* ---------- 2. pathway search: rule expansion + model batches ---------- */
  const library = expandLibrary(profile);
  ev("SEARCH_START", "PATHWAY SEARCH STARTED");
  let generated = library.length;
  ev("LIBRARY_EXPANSION", `${generated} CANDIDATES GENERATED`, `rule library: ${OPERATION_COUNT} operations applied to ${profile.components.length} components`);

  const modelRaw: RawModelCandidate[] = [];
  const searchProviders = new Set<string>();
  let batchOk = 0;
  let batchFail = 0;
  let skipped = 0;

  async function runBatches(groups: Category[][], perCategory: number, exclude: string[], round: number) {
    await Promise.all(
      groups.map(async (cats) => {
        try {
          const { data, meta } = await generateStructured(aiCandidateBatch, {
            system: CANDIDATE_SYSTEM,
            prompt: candidatePrompt(profile as ObjectProfile, cats, perCategory, exclude),
            temperature: 0.85,
            maxOutputTokens: 8192,
            tag: "object-search",
          });
          const parsed = parseCandidates(data.pathways);
          modelRaw.push(...parsed.ok);
          skipped += parsed.skipped;
          generated += parsed.ok.length;
          batchOk++;
          searchProviders.add(meta.provider);
          ev("SEARCH_BATCH", `${generated} CANDIDATES GENERATED`, `round ${round}: ${cats.join(", ")} → +${parsed.ok.length}${parsed.skipped ? ` (${parsed.skipped} malformed skipped)` : ""}`);
        } catch {
          batchFail++;
          ev("SEARCH_BATCH_FAILED", "SEARCH BATCH UNAVAILABLE", `round ${round}: ${cats.join(", ")}`);
        }
      }),
    );
  }

  if (aiOn) await runBatches(BATCHES, 8, library.map((c) => c.title), 1);
  else ev("SEARCH_MODEL_OFF", "MODEL SEARCH SKIPPED", "no model keys configured; rule library only");
  if (aiOn && batchOk === 0) notices.push({ code: "search_fallback", message: "Model pathway search was unavailable. Pathways come from the deterministic rule library only." });
  else if (batchFail > 0) notices.push({ code: "search_partial", message: `${batchFail} of ${BATCHES.length} model search batches failed, so the search space is smaller.` });

  /* ---------- 3. validate, score, de-duplicate, select ---------- */
  const rejectReasons: Record<string, number> = {};
  let adjustedTotal = 0;
  let rejectedTotal = 0;
  let evaluated = 0;
  let duplicates = 0;
  let unique: ReturnType<typeof sortByComposite> = [];
  let rounds = 1;

  const assemble = (label: string) => {
    const all: Candidate[] = [...library, ...normalizeModel(modelRaw, profile as ObjectProfile)];
    const v = validate(all, profile as ObjectProfile);
    rejectReasons.hazard = 0;
    rejectReasons.incomplete = 0;
    for (const r of v.rejected) rejectReasons[r.reason] = (rejectReasons[r.reason] ?? 0) + 1;
    adjustedTotal = v.adjusted;
    rejectedTotal = v.rejected.length;
    ev("VALIDATION", `${label}VALIDATION: ${v.kept.length} PASSED, ${v.rejected.length} REJECTED`, `${v.adjusted} descriptor bands corrected${rejectReasons.hazard ? `; ${rejectReasons.hazard} rejected by the hazard rule` : ""}`);
    const scored = sortByComposite(scoreAll(v.kept, profile as ObjectProfile));
    evaluated = scored.length;
    ev("SCORING", `${label}${scored.length} PATHWAYS EVALUATED`, "deterministic multi-objective model");
    const d = dedupe(scored);
    duplicates = d.removed;
    unique = d.kept;
    ev("DEDUPE", `${label}DUPLICATE PATHWAYS REMOVED: ${d.removed}`, `${d.kept.length} distinct pathways remain`);
  };
  assemble("");

  if (aiOn && batchOk > 0 && unique.length < requested) {
    rounds = 2;
    const have = new Map<Category, number>();
    for (const p of unique) have.set(p.category, (have.get(p.category) ?? 0) + 1);
    const lacking = (Object.keys(BATCHES.flat().reduce((o, c) => ({ ...o, [c]: 1 }), {})) as Category[]).sort((a, b) => (have.get(a) ?? 0) - (have.get(b) ?? 0)).slice(0, 6);
    const per = Math.min(10, Math.ceil((requested - unique.length) / 4) + 2);
    ev("SEARCH_EXPAND", "SEARCH EXPANDED", `${unique.length} distinct so far; targeting ${lacking.length} sparse categories`);
    await runBatches([lacking.slice(0, 3), lacking.slice(3)].filter((g) => g.length), per, unique.map((p) => p.title), 2);
    assemble("ROUND 2 ");
  }

  const selected = selectTop(unique, requested);
  const categories = new Set(selected.map((p) => p.category)).size;
  ev("SELECTED", `${selected.length} FUTURES DISCOVERED`, `${categories} categories${selected.length < requested ? `; the distinct pool held only ${unique.length}` : ""}`);
  if (selected.length < requested) notices.push({ code: "fewer_pathways", message: `${selected.length} distinct pathways were found. The search space for this object is smaller than ${requested} after validation and de-duplication.` });

  const agg = aggregate(selected);
  dna.retentionPotential = round(selected.reduce((m, p) => Math.max(m, p.score.metrics.materialRetained), 0), 3);
  ev("OPTIMIZATION", "OPTIMIZATION COMPLETE", `best circularity index ${agg.bestCircularity.toFixed(1)} vs ${baseline.score.circularityIndex.toFixed(1)} for disposal`);

  const stats: PipelineStats = {
    generatedLibrary: library.length, generatedModel: modelRaw.length, generatedTotal: generated, adjusted: adjustedTotal, rejected: rejectedTotal, rejectReasons,
    evaluated, duplicatesRemoved: duplicates, selected: selected.length, categoriesPresent: categories, rounds,
  };
  void skipped;

  const assumptions = [
    "All numbers come from a deterministic scoring model. Language models only propose pathways and describe them with qualitative bands.",
    "Band-to-number tables, weights and penalties are heuristic and are listed in the circularity index breakdown. They are not calibrated against measured data.",
    "Emissions benefits use rounded embodied-emission factors per material, scaled by the share of new production avoided and reduced for processing, added inputs and transport. They are indicative, not life-cycle results.",
    "Disposal baseline: mixed waste, no recovery counted, regional transport assumed.",
    "Parts that a component-only pathway does not touch are assumed to follow disposal, which is conservative.",
  ];

  const partial: Omit<ObjectRunResult, "runId" | "saved"> = {
    analysis: { profile, dna, constraints, analysisMode: profile.source, provider: analysisProvider },
    baseline, pathways: selected, stats, events, notices, assumptions, requested, spaceIndex: agg.spaceIndex,
    providerSummary: { analysis: analysisProvider, search: [...searchProviders] },
  };
  const { runId, saved } = await persistObjectRun(sessionId, assetId, { object: profile.name, hasImage: Boolean(img), userMassKg }, partial, Date.now() - t0);
  ev("PERSIST", saved ? "EXPERIMENT RUN SAVED" : "EXPERIMENT RUN NOT SAVED", saved ? undefined : "Supabase is not configured or a write failed; the experiment still works");
  return { ...partial, events, runId, saved };
}

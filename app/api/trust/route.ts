import { randomBytes } from "node:crypto";
import { generateStructured, aiConfigured } from "@/lib/ai";
import { TRUST_EXPLAIN_SYSTEM, TRUST_PARSE_SYSTEM } from "@/lib/ai/prompts/trust";
import { untrusted } from "@/lib/ai/prompts/shared";
import { issueCredential, issuerFor } from "@/lib/engines/trust/credentials";
import { CRED_IDS, CREDS, compilePolicy, dayNumber, todayIso, validatePolicy, type CredId, type RegistryStatus } from "@/lib/engines/trust/model";
import { parsePolicyText } from "@/lib/engines/trust/nlp";
import { benchmark, kemKeysFromSeed, openPayload } from "@/lib/engines/trust/pq";
import type { ChallengeInfo } from "@/lib/engines/trust/proof";
import { verifyBundle } from "@/lib/engines/trust/verifier";
import { ApiError, ok, parseJson, route } from "@/lib/security/api";
import { getSessionId } from "@/lib/security/session";
import { signToken, verifyToken } from "@/lib/security/token";
import { recordRun, saveProof } from "@/lib/supabase/persist";
import { consumeNonce, registryGet, registryRegister, registrySet } from "@/lib/trust/store";
import { aiExplanation, aiPolicyParse, trustRequest } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROOF_TTL_MS = 30_000;
const seed = () => process.env.TRUST_ISSUER_SEED?.trim() || "genesis-lab-demo-issuer";
const kem = () => kemKeysFromSeed(`${seed()}/verifier-channel`);

function authentic(token: string): ChallengeInfo | null {
  const t = verifyToken<ChallengeInfo>(token);
  if (!t || typeof t.nonce !== "string" || typeof t.exp !== "number" || typeof t.iat !== "number" || typeof t.policyHash !== "string" || (t.mode !== "classical" && t.mode !== "hybrid-pq")) return null;
  const c = compilePolicy(t.policy, t.asOfDay);
  return c.ok && c.policyHash === t.policyHash ? t : null;
}

export const POST = route({ scope: "trust", limit: 160 }, async (req) => {
  const body = await parseJson(req, trustRequest, 600_000);

  if (body.action === "config") {
    return ok({
      issuers: CRED_IDS.map((c) => ({ cred: c, name: CREDS[c].issuer, classicalPublic: issuerFor(seed(), c).classical.publicHex, pqPublicBytes: issuerFor(seed(), c).pq.publicHex.length / 2 })),
      proofTtlMs: PROOF_TTL_MS,
      serverTime: Date.now(),
      persistence: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      ai: aiConfigured(),
    });
  }

  if (body.action === "issue") {
    // The issuer processes attribute values in memory only: never stored, never logged.
    const sessionId = await getSessionId();
    let held;
    try {
      held = issueCredential(seed(), body.cred as CredId, body.values);
    } catch {
      throw new ApiError(400, "invalid_credential", "One of the attribute values is outside its allowed range.");
    }
    await registryRegister(held.handle, sessionId);
    return ok({ credential: held, issuer: CREDS[body.cred as CredId].issuer });
  }

  if (body.action === "challenge") {
    const now = Date.now();
    const asOf = todayIso(now);
    const asOfDay = dayNumber(asOf);
    const c = compilePolicy(body.policy, asOfDay);
    if (!c.ok) throw new ApiError(400, "invalid_policy", c.errors[0]?.message ?? "The policy is invalid.");
    const info: ChallengeInfo = { nonce: randomBytes(16).toString("hex"), asOf, asOfDay, iat: now, exp: now + PROOF_TTL_MS, verifierId: body.verifierId, policy: body.policy, policyHash: c.policyHash, mode: body.mode };
    return ok({ info, token: signToken(info), kemPublicHex: body.mode === "hybrid-pq" ? kem().publicHex : null, serverTime: now });
  }

  if (body.action === "registry") {
    const sessionId = await getSessionId();
    if (body.op === "status") {
      const out: Record<string, RegistryStatus | null> = {};
      for (const h of body.handles ?? []) out[h] = (await registryGet(h)) ?? null;
      return ok({ statuses: out, serverTime: Date.now() });
    }
    if (!body.handle || !body.status) throw new ApiError(400, "invalid_input", "A handle and status are required.");
    const r = await registrySet(body.handle, body.status, sessionId);
    if (r === "unknown") throw new ApiError(404, "unknown_credential", "That credential is not in the registry.");
    if (r === "forbidden") throw new ApiError(403, "forbidden", "Only the issuing session can change a credential's status.");
    return ok({ handle: body.handle, status: body.status, at: Date.now() });
  }

  if (body.action === "verify") {
    const t0 = Date.now();
    const challenge = authentic(body.challengeToken);
    let bundle: unknown = body.bundle;
    let channel: { required: boolean; ok: boolean } | undefined;
    if (challenge?.mode === "hybrid-pq") {
      let okChannel = false;
      if (body.sealed) {
        const plain = await openPayload(body.sealed, kem().secretHex, challenge.nonce);
        if (plain !== null) {
          try {
            bundle = JSON.parse(plain);
            okChannel = true;
          } catch {
            bundle = undefined;
          }
        }
      }
      channel = { required: true, ok: okChannel };
    }
    let replayed = false;
    let durable = false;
    if (challenge) {
      const n = await consumeNonce(challenge.nonce);
      replayed = !n.first;
      durable = n.durable;
    }
    // Look up registry state for every presented credential handle.
    const statuses = new Map<string, RegistryStatus | undefined>();
    const pres = (bundle as { presentations?: Record<string, { handle?: unknown }> } | null | undefined)?.presentations;
    if (pres && typeof pres === "object") for (const p of Object.values(pres)) if (p && typeof p.handle === "string" && /^[0-9a-f]{64}$/.test(p.handle)) statuses.set(p.handle, await registryGet(p.handle));
    const report = verifyBundle({ bundle, challenge, replayed, now: Date.now(), seed: seed(), registry: (h) => statuses.get(h), channel });

    const sessionId = await getSessionId();
    const expression = challenge ? (compilePolicy(challenge.policy, challenge.asOfDay).expression ?? "") : "";
    const runId = await recordRun("trust", sessionId, { policyHash: challenge?.policyHash ?? null, verifier: challenge?.verifierId ?? null, mode: challenge?.mode ?? null }, { trust: report.trust, failed: report.failed, replay: report.replay }, Date.now() - t0);
    const saved = await saveProof(runId, sessionId, challenge?.policyHash ?? "unbound", { stages: report.stages.map((s) => ({ id: s.id, state: s.state })) }, report.trust === "VERIFIED", expression.slice(0, 200) || "unbound");
    return ok({ report, saved, durableReplayStore: durable, serverTime: Date.now() });
  }

  if (body.action === "parse") {
    const rules = parsePolicyText(body.text);
    if (aiConfigured()) {
      try {
        const { data, meta } = await generateStructured(aiPolicyParse, { system: TRUST_PARSE_SYSTEM, prompt: untrusted("requirement", body.text), temperature: 0.1, tag: "trust" });
        const v = validatePolicy(data.policy);
        if (v.ok && compilePolicy(v.policy, dayNumber(todayIso())).ok) return ok({ policy: v.policy, source: "ai", provider: meta.provider ?? null, note: null });
      } catch {
        /* fall through to deterministic parser */
      }
    }
    if (!rules.policy) return ok({ policy: null, source: "none", provider: null, note: "No supported conditions were found. Try naming a credential, a clearance level or an age." });
    return ok({ policy: rules.policy, source: "rules", provider: null, note: aiConfigured() ? "AI parsing was unavailable, so the deterministic rule parser was used." : "No AI key configured, so the deterministic rule parser was used." });
  }

  if (body.action === "pqbench") return ok({ ...benchmark(5), measuredOn: "server", at: Date.now() });

  // explain
  if (!aiConfigured()) return ok({ explanation: null, note: "AI explanation unavailable: no AI key configured. The verification result is unaffected." });
  try {
    const { data } = await generateStructured(aiExplanation, {
      system: TRUST_EXPLAIN_SYSTEM,
      prompt: `Kind: ${body.kind}\nPolicy: ${body.facts.policy}\nSecurity mode: ${body.facts.mode ?? "classical"}\n${body.facts.attack ? `Attack attempted: ${body.facts.attack}\n` : ""}Deterministic verdict: ${body.facts.trust}\nStages: ${JSON.stringify(body.facts.stages)}`,
      temperature: 0.3,
      tag: "trust",
    });
    return ok({ explanation: data, note: null });
  } catch {
    return ok({ explanation: null, note: "AI explanation is temporarily unavailable. The verification result is unaffected." });
  }
});

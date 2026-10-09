import "server-only";
import { createHash } from "node:crypto";
import type { z } from "zod";
import { AIUnavailableError } from "./errors";
import { extractJson } from "./json";
import { collectKeys } from "./keys";
import { GeminiProvider } from "./providers/gemini";
import { GrokProvider } from "./providers/grok";
import { AIProviderRouter } from "./router";
import type { AIRequest, AIResponse, ProviderName } from "./types";
import { recordAiRequest } from "@/lib/supabase/log";

let singleton: AIProviderRouter | null = null;
/** Fingerprint of the environment the singleton was built from. Never contains key text. */
let singletonSig = "";

export const DEFAULT_FORMAT_RETRIES = 2;

type Source = "env" | "default";
const src = (v: string | undefined): Source => (v?.trim() ? "env" : "default");

/** The single place model IDs, primary provider and limits are resolved. getRouter() and the architecture page both read this. */
export function resolveAiConfig() {
  const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const grokModel = process.env.GROK_MODEL?.trim() || "grok-4-fast";
  const grokVision = process.env.GROK_VISION_MODEL?.trim() || grokModel;
  const rawPrimary = process.env.AI_PRIMARY_PROVIDER?.trim().toLowerCase();
  const primary = (rawPrimary === "grok" ? "grok" : "gemini") as ProviderName;
  return {
    geminiModel,
    geminiModelSource: src(process.env.GEMINI_MODEL),
    grokModel,
    grokModelSource: src(process.env.GROK_MODEL),
    grokVision,
    grokVisionSource: (process.env.GROK_VISION_MODEL?.trim() ? "env" : "default") as Source,
    primary,
    primarySource: (rawPrimary === "grok" || rawPrimary === "gemini" ? "env" : "default") as Source,
    timeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS) || 30_000,
    timeoutSource: (Number(process.env.AI_REQUEST_TIMEOUT_MS) ? "env" : "default") as Source,
    maxAttempts: Number(process.env.AI_MAX_ATTEMPTS) || 12,
    maxAttemptsSource: (Number(process.env.AI_MAX_ATTEMPTS) ? "env" : "default") as Source,
    grokBaseUrl: process.env.GROK_BASE_URL?.trim() || undefined,
  };
}

/**
 * Alternative key variable names, chosen by where requests actually go, so a key is never sent to the wrong company:
 * x.ai endpoint -> XAI_API_KEY (xAI's own name); groq.com endpoint -> GROQ_API_KEY (Groq's own name).
 * Only used when no GROK_API_KEY / GROK_API_KEY_n is set.
 */
export function grokAlias(baseUrl: string | undefined): "XAI_API_KEY" | "GROQ_API_KEY" | null {
  if (!baseUrl) return "XAI_API_KEY";
  try {
    const h = new URL(baseUrl).hostname;
    if (h === "x.ai" || h.endsWith(".x.ai")) return "XAI_API_KEY";
    if (h === "groq.com" || h.endsWith(".groq.com")) return "GROQ_API_KEY";
  } catch {
    /* invalid URL: no alias */
  }
  return null;
}

export function grokKeys(cfg = resolveAiConfig()): string[] {
  const keys = collectKeys("GROK_API_KEY");
  if (keys.length > 0) return keys;
  const alias = grokAlias(cfg.grokBaseUrl);
  return alias ? collectKeys(alias) : [];
}

/**
 * Next.js reloads .env.local while the dev server runs, but a cached router would keep the old keys.
 * Rebuild it whenever the keys or model settings change. Only a hash is kept, never the keys.
 */
function envSignature(cfg: ReturnType<typeof resolveAiConfig>, gemini: string[], grok: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([gemini, grok, cfg.geminiModel, cfg.grokModel, cfg.grokVision, cfg.primary, cfg.timeoutMs, cfg.maxAttempts, cfg.grokBaseUrl ?? ""]))
    .digest("hex");
}

export function getRouter(): AIProviderRouter {
  const cfg = resolveAiConfig();
  const geminiKeys = collectKeys("GEMINI_API_KEY");
  const grok = grokKeys(cfg);
  const sig = envSignature(cfg, geminiKeys, grok);
  if (singleton && sig === singletonSig) return singleton;
  singletonSig = sig;

  singleton = new AIProviderRouter({
    providers: [
      new GeminiProvider(geminiKeys, cfg.geminiModel),
      new GrokProvider(grok, cfg.grokModel, cfg.grokVision, fetch, cfg.grokBaseUrl),
    ],
    primary: cfg.primary,
    timeoutMs: cfg.timeoutMs,
    maxAttempts: cfg.maxAttempts,
    onAttempt: (m) => {
      // Safe metadata only. Never keys, never prompts.
      console.info(
        `[ai] provider=${m.provider} slot=${m.keySlot} ok=${m.success}${m.errorKind ? ` err=${m.errorKind}` : ""} ${m.latencyMs}ms tag=${m.tag ?? "-"}`,
      );
      void recordAiRequest(m);
    },
  });
  return singleton;
}

export function aiConfigured(): boolean {
  return getRouter().configured;
}

export async function generateText(req: AIRequest): Promise<AIResponse> {
  return getRouter().generate(req);
}

/**
 * Generate JSON, validate with Zod, and retry through the router when output is malformed.
 * Raw model output is never trusted.
 */
export async function generateStructured<S extends z.ZodTypeAny>(
  schema: S,
  req: Omit<AIRequest, "json">,
  maxFormatRetries = DEFAULT_FORMAT_RETRIES,
): Promise<{ data: z.infer<S>; meta: Omit<AIResponse, "text"> }> {
  let attempts = 0;
  let prompt = req.prompt;
  for (let i = 0; i <= maxFormatRetries; i++) {
    const res = await generateText({ ...req, prompt, json: true });
    attempts += res.attempts;
    try {
      const parsed = schema.safeParse(extractJson(res.text));
      if (parsed.success) {
        const { text: _text, ...meta } = res;
        void _text;
        return { data: parsed.data, meta: { ...meta, attempts } };
      }
      prompt = `${req.prompt}\n\nYour previous answer failed validation. Return ONLY valid JSON matching the required shape exactly.`;
    } catch {
      prompt = `${req.prompt}\n\nYour previous answer was not valid JSON. Return ONLY a single valid JSON object.`;
    }
  }
  throw new AIUnavailableError("malformed_output", attempts);
}

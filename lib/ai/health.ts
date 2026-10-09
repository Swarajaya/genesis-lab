import "server-only";
import { COOLDOWN_MS } from "./router";
import type { AIErrorKind } from "./errors";
import type { AIRequest, ProviderName } from "./types";
import { DEFAULT_FORMAT_RETRIES, getRouter, grokAlias, resolveAiConfig } from "./index";
import { supabaseConfigured } from "@/lib/supabase/admin";
import type { ArchitectureSnapshot, HealthLabel, KeySlotResult, ProviderHealth, ProviderInfo } from "./healthTypes";

const PROVIDERS: ProviderName[] = ["gemini", "grok"];
const TITLES: Record<ProviderName, string> = { gemini: "Gemini", grok: "Grok" };
const ENV_HELP: Record<ProviderName, string[]> = {
  gemini: ["GEMINI_API_KEY (or GEMINI_API_KEY_1, GEMINI_API_KEY_2, …)", "GEMINI_MODEL (optional)"],
  grok: ["GROK_API_KEY (or GROK_API_KEY_1, GROK_API_KEY_2, …)", "GROK_MODEL (optional)", "GROK_VISION_MODEL (optional)", "GROK_BASE_URL (optional)"],
};
const READ_NAMES = /^(GEMINI_API_KEY(_\d+)?|GEMINI_MODEL|GROK_API_KEY(_\d+)?|GROK_MODEL|GROK_VISION_MODEL|GROK_BASE_URL)$/;
const WATCH: Record<ProviderName, RegExp> = { gemini: /gemini|google/i, grok: /grok|xai|groq/i };

/** Which provider-related variables the running server can see. Reports names and emptiness only. */
function inspectEnv(name: ProviderName, grokBase: string | undefined, keys: number): { found: ArchitectureSnapshot["providers"][number]["envFound"]; hint: string | null } {
  const alias = name === "grok" ? grokAlias(grokBase) : null;
  const aliasRe = alias ? new RegExp(`^${alias}(_\\d+)?$`) : null;
  const found = Object.keys(process.env)
    .filter((n) => WATCH[name].test(n))
    .sort()
    .map((n) => ({ name: n, hasValue: Boolean(process.env[n]?.trim()), read: READ_NAMES.test(n) || Boolean(aliasRe?.test(n)) }));
  if (keys > 0) return { found, hint: null };

  const label = name === "gemini" ? "Gemini" : "Grok";
  const main = name === "gemini" ? "GEMINI_API_KEY" : "GROK_API_KEY";
  const empty = found.find((f) => f.read && /API_KEY/.test(f.name) && !f.hasValue);
  if (empty) return { found, hint: `${empty.name} exists but its value is empty. Paste the key after the equals sign, save, and restart.` };
  const unread = found.filter((f) => !f.read && f.hasValue && /key|token|secret/i.test(f.name));
  if (name === "grok" && unread.some((f) => /groq/i.test(f.name))) {
    return { found, hint: `A Groq key variable (${unread.find((f) => /groq/i.test(f.name))?.name}) is set, but Genesis Lab only reads GROK_API_KEY. If you are using Groq, add GROK_API_KEY=<that key> and GROK_BASE_URL=https://api.groq.com/openai/v1 so requests go to Groq instead of xAI.` };
  }
  if (unread.length) {
    return { found, hint: `${unread.map((f) => f.name).join(", ")} ${unread.length === 1 ? "is" : "are"} set but not read by Genesis Lab. Rename ${unread.length === 1 ? "it" : "one"} to ${main} (or ${main}_1, ${main}_2 …) and restart.` };
  }
  return { found, hint: `No ${main} variable is visible to the server. Add ${main}=your_key to .env.local in the project root (next to package.json) and restart npm run dev. ${label} has no keys until then.` };
}

const DEFAULT_GROK_BASE = "https://api.x.ai/v1";
const MAX_KEYS_TESTED = 20;
const CONCURRENCY = 4;

/** A tiny real request. The reply text is not used; only whether the provider accepted and answered it. */
const PROBE_REQUEST: AIRequest = {
  system: "Reply with the single word: ok",
  prompt: "ping",
  temperature: 0,
  maxOutputTokens: 128,
  tag: "health-test",
};

// Results live in server memory (survive hot reloads via globalThis). They are a record of past tests, nothing more.
const g = globalThis as unknown as { __glHealth?: Map<ProviderName, Map<number, KeySlotResult>> };
const store = (g.__glHealth ??= new Map());

/** Human-safe wording per error kind. Never includes provider response bodies. */
function messageFor(kind: AIErrorKind | undefined, status?: number): string {
  const code = status ? ` (HTTP ${status})` : "";
  switch (kind) {
    case "rate_limit":
      return `The provider rate-limited this request${code}.`;
    case "quota":
      return `The provider reports the quota is used up${code}.`;
    case "auth":
      return `The provider rejected the API key${code}.`;
    case "timeout":
      return "The request timed out before the provider answered.";
    case "bad_request":
      return `The provider rejected the request${code}. Check the model name.`;
    case "transient":
      return `The provider had a temporary error${code}.`;
    default:
      return `The request failed${code}.`;
  }
}

function labelFor(kind: AIErrorKind | undefined): KeySlotResult["label"] {
  return kind === "rate_limit" || kind === "quota" ? "rate_limited" : "failed";
}

async function pool<T>(items: number[], worker: (n: number) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i]);
      }
    }),
  );
  return out;
}

/** Really calls the provider, one request per key slot. Records and returns the result. */
export async function testProvider(name: ProviderName, onlySlots?: number[]): Promise<ProviderHealth> {
  const router = getRouter();
  const info = router.status().find((p) => p.name === name);
  const keys = info?.keys ?? 0;
  if (keys > 0) {
    const slots = (onlySlots ?? Array.from({ length: Math.min(keys, MAX_KEYS_TESTED) }, (_, i) => i)).filter((s) => s >= 0 && s < keys);
    const bucket = store.get(name) ?? new Map<number, KeySlotResult>();
    store.set(name, bucket);
    await pool(slots, async (slot) => {
      const r = await router.probe(name, slot, PROBE_REQUEST);
      bucket.set(slot, {
        slot,
        label: r.ok ? "connected" : labelFor(r.errorKind),
        latencyMs: r.latencyMs,
        checkedAt: new Date().toISOString(),
        httpStatus: r.status,
        message: r.ok ? (r.note ?? "A real request succeeded.") : messageFor(r.errorKind, r.status),
      });
    });
  }
  return providerHealth(name);
}

export function providerHealth(name: ProviderName): ProviderHealth {
  const keys = getRouter().status().find((p) => p.name === name)?.keys ?? 0;
  if (keys === 0) {
    return { provider: name, label: "not_configured", checkedAt: null, latencyMs: null, keysTested: 0, keysOk: 0, keysRateLimited: 0, keysFailed: 0, message: "No API keys are configured for this provider.", slots: [] };
  }
  // Slots beyond the current key count (keys removed since the test) are ignored.
  const slots = [...(store.get(name)?.values() ?? [])].filter((s) => s.slot < keys).sort((a, b) => a.slot - b.slot);
  if (slots.length === 0) {
    return { provider: name, label: "not_checked", checkedAt: null, latencyMs: null, keysTested: 0, keysOk: 0, keysRateLimited: 0, keysFailed: 0, message: "No connection test has been run since the server started.", slots: [] };
  }
  const ok = slots.filter((s) => s.label === "connected");
  const limited = slots.filter((s) => s.label === "rate_limited");
  const failed = slots.filter((s) => s.label === "failed");
  const label: HealthLabel = ok.length > 0 ? "connected" : limited.length === slots.length ? "rate_limited" : "failed";
  const latencyMs = ok.length ? Math.round(ok.reduce((a, s) => a + s.latencyMs, 0) / ok.length) : null;
  const checkedAt = slots.map((s) => s.checkedAt).sort().at(-1) ?? null;
  const message =
    label === "connected"
      ? `${ok.length} of ${slots.length} tested key${slots.length === 1 ? "" : "s"} completed a real request.`
      : (failed[0] ?? limited[0]).message;
  return { provider: name, label, checkedAt, latencyMs, keysTested: slots.length, keysOk: ok.length, keysRateLimited: limited.length, keysFailed: failed.length, message, slots };
}

function endpoint(name: ProviderName, grokBase: string | undefined): { host: string; custom: boolean } {
  if (name === "gemini") return { host: "generativelanguage.googleapis.com", custom: false };
  try {
    return { host: new URL(grokBase || DEFAULT_GROK_BASE).host, custom: Boolean(grokBase) };
  } catch {
    return { host: "Invalid GROK_BASE_URL", custom: true };
  }
}

/** Everything the Architecture page shows, taken from the live router and config. Safe to send to the browser. */
export function buildSnapshot(): ArchitectureSnapshot {
  const router = getRouter();
  const cfg = resolveAiConfig();
  const status = router.status();
  const providers: ProviderInfo[] = PROVIDERS.map((name) => {
    const st = status.find((s) => s.name === name);
    const ep = endpoint(name, cfg.grokBaseUrl);
    const text = name === "gemini" ? cfg.geminiModel : cfg.grokModel;
    return {
      name,
      title: TITLES[name],
      primary: st?.primary ?? false,
      configured: (st?.keys ?? 0) > 0,
      keys: st?.keys ?? 0,
      coolingSlots: st?.coolingSlots ?? [],
      supportsImages: st?.supportsImages ?? false,
      endpointHost: ep.host,
      endpointIsCustom: ep.custom,
      textModel: text,
      textModelSource: name === "gemini" ? cfg.geminiModelSource : cfg.grokModelSource,
      visionModel: name === "gemini" ? cfg.geminiModel : cfg.grokVision,
      envHelp: ENV_HELP[name],
      ...(() => {
        const e = inspectEnv(name, cfg.grokBaseUrl, st?.keys ?? 0);
        return { envFound: e.found, envHint: e.hint };
      })(),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    primary: router.limits.primary,
    limits: {
      timeoutMs: router.limits.timeoutMs,
      maxAttempts: router.limits.maxAttempts,
      formatRetries: DEFAULT_FORMAT_RETRIES,
      cooldownMs: { rate_limit: COOLDOWN_MS.rate_limit ?? 0, quota: COOLDOWN_MS.quota ?? 0, auth: COOLDOWN_MS.auth ?? 0 },
    },
    providers,
    health: { gemini: providerHealth("gemini"), grok: providerHealth("grok") },
    database: { configured: supabaseConfigured() },
  };
}

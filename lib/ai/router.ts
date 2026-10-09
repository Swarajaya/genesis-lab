import { AIUnavailableError, ProviderError, type AIErrorKind } from "./errors";
import type { AIProvider, AIRequest, AIResponse, ProviderName } from "./types";

/** Safe metadata about one provider attempt. Never contains keys or prompts. */
export interface AttemptMeta {
  provider: ProviderName;
  keySlot: number;
  success: boolean;
  errorKind?: AIErrorKind;
  latencyMs: number;
  tag?: string;
  /** Model that answered. Only known on success. */
  model?: string;
}

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  errorKind?: AIErrorKind;
  /** HTTP status code from the provider, when there was one. Never the response body. */
  status?: number;
  note?: string;
}

export interface ProviderStatus {
  name: ProviderName;
  primary: boolean;
  keys: number;
  /** Keys currently sitting out after a rate limit / quota / auth failure. */
  coolingDown: number;
  /** Zero-based slot numbers currently cooling down. */
  coolingSlots: number[];
  supportsImages: boolean;
}

export interface RouterOptions {
  providers: AIProvider[];
  /** Defaults to the first provider in the list. */
  primary?: ProviderName;
  /** Per-attempt timeout. Default 25 000 ms. */
  timeoutMs?: number;
  /** Hard cap on provider calls per request. Default 6. */
  maxAttempts?: number;
  onAttempt?: (meta: AttemptMeta) => void;
  /** Clock used for key cooldowns. Injectable for tests. Default Date.now. */
  now?: () => number;
  /** Overrides the rate_limit cooldown in COOLDOWN_MS. */
  rateLimitCooldownMs?: number;
  /** Pause before the single same-key retry of a transient failure. Default 400 ms. */
  transientRetryDelayMs?: number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** How long a key sits out after a failure, by error kind. Exported so the Architecture page shows the real values. */
export const COOLDOWN_MS: Partial<Record<AIErrorKind, number>> = {
  rate_limit: 30_000,
  quota: 5 * 60_000,
  auth: 10 * 60_000,
};

/**
 * Routes a request across providers and API keys.
 * Order: primary provider's keys first, then the other providers' keys.
 * Keys that hit rate limits / quota / auth errors are put on a short cooldown.
 */
export class AIProviderRouter {
  private readonly providers: AIProvider[];
  private readonly primary: ProviderName;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly onAttempt?: (meta: AttemptMeta) => void;
  private readonly now: () => number;
  private readonly rateLimitCooldownMs?: number;
  private readonly transientRetryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  /** "provider:keyIndex" -> timestamp until which the key is skipped */
  private readonly cooldownUntil = new Map<string, number>();
  /** Round-robin cursor per provider so load spreads across keys. */
  private readonly cursor = new Map<ProviderName, number>();

  constructor(opts: RouterOptions) {
    this.providers = opts.providers;
    this.primary = opts.primary ?? opts.providers[0]?.name ?? "gemini";
    this.timeoutMs = opts.timeoutMs ?? 25_000;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? 6);
    this.onAttempt = opts.onAttempt;
    this.now = opts.now ?? Date.now;
    this.rateLimitCooldownMs = opts.rateLimitCooldownMs;
    this.transientRetryDelayMs = opts.transientRetryDelayMs ?? 400;
    this.sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  }

  /** True when at least one provider has at least one key. */
  get configured(): boolean {
    return this.providers.some((p) => p.keyCount > 0);
  }

  /** The limits this router is actually running with. */
  get limits() {
    return { timeoutMs: this.timeoutMs, maxAttempts: this.maxAttempts, primary: this.primary };
  }

  /**
   * One real request to one specific key of one provider. Used only by the health tests.
   * Bypasses routing and fallback on purpose, so a result belongs to exactly that provider and key slot.
   * Never touches key cooldowns and never throws.
   */
  async probe(name: ProviderName, keyIndex: number, req: AIRequest): Promise<ProbeResult> {
    const provider = this.providers.find((p) => p.name === name);
    if (!provider || keyIndex < 0 || keyIndex >= provider.keyCount) {
      return { ok: false, errorKind: "auth", latencyMs: 0, note: "No such key slot." };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const started = Date.now();
    try {
      const r = await provider.call(keyIndex, req, controller.signal);
      return { ok: true, latencyMs: Date.now() - started, model: r.model };
    } catch (err) {
      const latencyMs = Date.now() - started;
      // HTTP 200 with no text: the provider answered, the reply was just empty.
      if (err instanceof ProviderError && err.status === 200) {
        return { ok: true, latencyMs, note: "Provider answered, but the reply text was empty." };
      }
      return { ok: false, errorKind: this.classify(err, controller.signal.aborted), status: err instanceof ProviderError ? err.status : undefined, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Safe status: provider names, key COUNTS and cooldown counts. Never key material. */
  status(): ProviderStatus[] {
    const now = this.now();
    return this.providers.map((p) => {
      const coolingSlots: number[] = [];
      for (let i = 0; i < p.keyCount; i++) {
        if ((this.cooldownUntil.get(this.slotId(p.name, i)) ?? 0) > now) coolingSlots.push(i);
      }
      return { name: p.name, primary: p.name === this.primary, keys: p.keyCount, coolingDown: coolingSlots.length, coolingSlots, supportsImages: p.supportsImages };
    });
  }

  async generate(req: AIRequest): Promise<AIResponse> {
    const slots = this.plan(req);
    if (slots.length === 0) throw new AIUnavailableError("no_keys", 0);

    let attempts = 0;
    let lastKind: AIErrorKind | undefined;
    const skipProviders = new Set<ProviderName>();

    for (const slot of slots) {
      if (attempts >= this.maxAttempts) break;
      if (skipProviders.has(slot.provider.name)) continue;

      let retried = false;
      while (attempts < this.maxAttempts) {
        attempts++;
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const result = await slot.provider.call(slot.keyIndex, req, controller.signal);
          const latencyMs = Date.now() - started;
          this.report({ provider: slot.provider.name, keySlot: slot.keyIndex, success: true, latencyMs, tag: req.tag, model: result.model });
          return {
            text: result.text,
            provider: slot.provider.name,
            model: result.model,
            keySlot: slot.keyIndex,
            attempts,
            latencyMs,
          };
        } catch (err) {
          const kind = this.classify(err, controller.signal.aborted);
          lastKind = kind;
          this.report({
            provider: slot.provider.name,
            keySlot: slot.keyIndex,
            success: false,
            errorKind: kind,
            latencyMs: Date.now() - started,
            tag: req.tag,
          });

          const cooldown = this.cooldownFor(kind);
          if (cooldown) this.cooldownUntil.set(this.slotId(slot.provider.name, slot.keyIndex), this.now() + cooldown);

          // A bad request will fail the same way on every key of this provider; go to the next provider.
          if (kind === "bad_request") skipProviders.add(slot.provider.name);

          // A transient failure (5xx, network) gets exactly one retry on the same key.
          if (kind === "transient" && !retried && attempts < this.maxAttempts) {
            retried = true;
            await this.sleep(this.transientRetryDelayMs);
            continue;
          }
          break;
        } finally {
          clearTimeout(timer);
        }
      }
    }

    throw new AIUnavailableError("all_failed", attempts, lastKind);
  }

  // ---- internals ---------------------------------------------------------

  /** Ordered list of (provider, key) attempts for this request. */
  private plan(req: AIRequest): { provider: AIProvider; keyIndex: number }[] {
    const now = this.now();
    const ordered = [...this.providers].sort((a, b) => Number(b.name === this.primary) - Number(a.name === this.primary));

    const slots: { provider: AIProvider; keyIndex: number }[] = [];
    const coolingDown: { provider: AIProvider; keyIndex: number }[] = [];

    for (const provider of ordered) {
      if (provider.keyCount === 0) continue;
      if (req.image && !provider.supportsImages) continue;

      const start = (this.cursor.get(provider.name) ?? 0) % provider.keyCount;
      this.cursor.set(provider.name, start + 1);

      for (let i = 0; i < provider.keyCount; i++) {
        const keyIndex = (start + i) % provider.keyCount;
        const until = this.cooldownUntil.get(this.slotId(provider.name, keyIndex)) ?? 0;
        (until > now ? coolingDown : slots).push({ provider, keyIndex });
      }
    }

    // Keys on cooldown are a last resort rather than being dropped entirely.
    return [...slots, ...coolingDown];
  }

  private cooldownFor(kind: AIErrorKind): number | undefined {
    if (kind === "rate_limit" && this.rateLimitCooldownMs !== undefined) return this.rateLimitCooldownMs;
    return COOLDOWN_MS[kind];
  }

  private classify(err: unknown, aborted: boolean): AIErrorKind {
    if (aborted) return "timeout";
    if (err instanceof ProviderError) return err.kind;
    if (err instanceof Error && err.name === "AbortError") return "timeout";
    return "transient"; // network failure etc.
  }

  private slotId(name: ProviderName, keyIndex: number): string {
    return `${name}:${keyIndex}`;
  }

  private report(meta: AttemptMeta): void {
    try {
      this.onAttempt?.(meta);
    } catch {
      // Logging must never break a request.
    }
  }
}

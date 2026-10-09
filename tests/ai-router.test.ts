import { describe, expect, it, vi } from "vitest";
import { AIUnavailableError, ProviderError, classifyHttp } from "@/lib/ai/errors";
import { extractJson } from "@/lib/ai/json";
import { collectKeys } from "@/lib/ai/keys";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
import { GrokProvider } from "@/lib/ai/providers/grok";
import { AIProviderRouter } from "@/lib/ai/router";
import type { AIProvider, AIRequest, ProviderName } from "@/lib/ai/types";

const req: AIRequest = { system: "s", prompt: "p" };

function fake(name: ProviderName, behaviours: (ProviderError | string)[][], opts: { images?: boolean } = {}): AIProvider & { calls: number[] } {
  const calls: number[] = [];
  return {
    name,
    keyCount: behaviours.length,
    supportsImages: opts.images ?? true,
    calls,
    async call(keyIndex) {
      calls.push(keyIndex);
      const queue = behaviours[keyIndex];
      const next = queue.length > 1 ? (queue.shift() as ProviderError | string) : queue[0];
      if (typeof next === "string") return { text: next, model: `${name}-m` };
      throw next;
    },
  };
}

const fastOpts = { sleep: async () => {}, transientRetryDelayMs: 0 };

describe("collectKeys", () => {
  it("collects numbered keys of any count in numeric order, plus a plain key", () => {
    const keys = collectKeys("GEMINI_API_KEY", { GEMINI_API_KEY_10: "j", GEMINI_API_KEY_2: "b", GEMINI_API_KEY_1: "a", GEMINI_API_KEY: "z", GEMINI_API_KEY_3: "  ", OTHER: "x" });
    expect(keys).toEqual(["a", "b", "j", "z"]);
  });
});

describe("AIProviderRouter", () => {
  it("uses the primary provider's first key when it works", async () => {
    const g = fake("gemini", [["ok-g"]]);
    const x = fake("grok", [["ok-x"]]);
    const r = new AIProviderRouter({ providers: [g, x], primary: "gemini", ...fastOpts });
    const out = await r.generate(req);
    expect(out.provider).toBe("gemini");
    expect(out.text).toBe("ok-g");
    expect(x.calls).toEqual([]);
  });

  it("moves to the next key on rate limit, then switches provider when the pool is exhausted", async () => {
    const g = fake("gemini", [[new ProviderError("rate_limit", 429)], [new ProviderError("quota", 429)]]);
    const x = fake("grok", [["grok-answer"]]);
    const r = new AIProviderRouter({ providers: [g, x], primary: "gemini", ...fastOpts });
    const out = await r.generate(req);
    expect(out.provider).toBe("grok");
    expect(out.attempts).toBe(3);
    expect(g.calls.sort()).toEqual([0, 1]);
  });

  it("falls to the second gemini key when only the first is limited", async () => {
    const g = fake("gemini", [[new ProviderError("rate_limit", 429)], ["from-key-2"]]);
    const r = new AIProviderRouter({ providers: [g], ...fastOpts });
    const out = await r.generate(req);
    expect(out.keySlot).toBe(2);
  });

  it("retries a transient failure once on the same key", async () => {
    const g = fake("gemini", [[new ProviderError("transient", 503), "recovered"]]);
    const r = new AIProviderRouter({ providers: [g], ...fastOpts });
    const out = await r.generate(req);
    expect(out.text).toBe("recovered");
    expect(g.calls).toEqual([0, 0]);
  });

  it("cools down rate-limited keys so later requests skip them", async () => {
    let t = 1000;
    const g = fake("gemini", [[new ProviderError("rate_limit", 429), "later"], ["k2"]]);
    const r = new AIProviderRouter({ providers: [g], now: () => t, rateLimitCooldownMs: 30_000, ...fastOpts });
    await r.generate(req); // key0 limited -> key1
    g.calls.length = 0;
    await r.generate(req); // key0 cooling down, only key1 should be used
    expect(g.calls).not.toContain(0);
    t += 31_000;
    expect(r.status()[0].coolingDown).toBe(0);
  });

  it("permanently skips keys with auth errors", async () => {
    const g = fake("gemini", [[new ProviderError("auth", 403)], ["good"]]);
    const r = new AIProviderRouter({ providers: [g], ...fastOpts });
    await r.generate(req);
    g.calls.length = 0;
    await r.generate(req);
    expect(g.calls).toEqual([1]);
  });

  it("throws a clean AIUnavailableError when everything fails and never loops forever", async () => {
    const g = fake("gemini", [[new ProviderError("rate_limit", 429)], [new ProviderError("rate_limit", 429)]]);
    const x = fake("grok", [[new ProviderError("transient", 500)]]);
    const r = new AIProviderRouter({ providers: [g, x], maxAttempts: 20, ...fastOpts });
    await expect(r.generate(req)).rejects.toBeInstanceOf(AIUnavailableError);
    try {
      await r.generate(req);
    } catch (e) {
      expect((e as AIUnavailableError).userMessage).not.toMatch(/key|token|http/i);
    }
  });

  it("enforces the hard attempt cap", async () => {
    const g = fake("gemini", Array.from({ length: 10 }, () => [new ProviderError("bad_request", 400)]));
    const r = new AIProviderRouter({ providers: [g], maxAttempts: 3, ...fastOpts });
    await expect(r.generate(req)).rejects.toMatchObject({ attempts: 3 });
    expect(g.calls.length).toBe(3);
  });

  it("reports no_keys when nothing is configured", async () => {
    const r = new AIProviderRouter({ providers: [fake("gemini", []), fake("grok", [])], ...fastOpts });
    await expect(r.generate(req)).rejects.toMatchObject({ code: "no_keys" });
    expect(r.configured).toBe(false);
  });

  it("times out slow providers and moves on", async () => {
    const slow: AIProvider = {
      name: "gemini",
      keyCount: 1,
      supportsImages: true,
      call: (_k, _r, signal) => new Promise((_res, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    };
    const x = fake("grok", [["fast"]]);
    const r = new AIProviderRouter({ providers: [slow, x], primary: "gemini", timeoutMs: 20, ...fastOpts });
    const out = await r.generate(req);
    expect(out.provider).toBe("grok");
  });

  it("only routes image requests to providers that support images", async () => {
    const g = fake("gemini", [["img-ok"]]);
    const x = fake("grok", [["no"]], { images: false });
    const r = new AIProviderRouter({ providers: [x, g], primary: "grok", ...fastOpts });
    const out = await r.generate({ ...req, image: { mimeType: "image/png", data: "AA==" } });
    expect(out.provider).toBe("gemini");
    expect(x.calls).toEqual([]);
  });

  it("reports safe metadata only", async () => {
    const onAttempt = vi.fn();
    const r = new AIProviderRouter({ providers: [fake("gemini", [["ok"]])], onAttempt, ...fastOpts });
    await r.generate({ ...req, prompt: "SECRET PROMPT", tag: "t" });
    expect(JSON.stringify(onAttempt.mock.calls)).not.toContain("SECRET PROMPT");
  });
});

describe("providers", () => {
  it("Gemini sends the key in a header and parses text", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY");
      expect(String(_url)).not.toContain("KEY");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }), { status: 200 });
    });
    const p = new GeminiProvider(["KEY"], "m", fetchImpl as unknown as typeof fetch);
    expect((await p.call(0, { ...req, json: true }, new AbortController().signal)).text).toBe("hi");
  });

  it("Gemini maps 429 to rate_limit/quota and 500 to transient", async () => {
    const mk = (status: number, body: string) => new GeminiProvider(["K"], "m", (async () => new Response(body, { status })) as unknown as typeof fetch);
    await expect(mk(429, "slow down").call(0, req, new AbortController().signal)).rejects.toMatchObject({ kind: "rate_limit" });
    await expect(mk(429, "RESOURCE_EXHAUSTED quota").call(0, req, new AbortController().signal)).rejects.toMatchObject({ kind: "quota" });
    await expect(mk(503, "").call(0, req, new AbortController().signal)).rejects.toMatchObject({ kind: "transient" });
  });

  it("Grok uses bearer auth and the chat completions shape", async () => {
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer XK");
      return new Response(JSON.stringify({ choices: [{ message: { content: "yo" } }] }), { status: 200 });
    });
    const p = new GrokProvider(["XK"], "g", undefined, fetchImpl as unknown as typeof fetch);
    expect((await p.call(0, req, new AbortController().signal)).text).toBe("yo");
    expect(p.supportsImages).toBe(false);
  });

  it("classifyHttp covers auth and bad request", () => {
    expect(classifyHttp(401, "").kind).toBe("auth");
    expect(classifyHttp(400, "nope").kind).toBe("bad_request");
  });
});

describe("extractJson", () => {
  it("handles fences, prose and nested braces in strings", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":"}{","b":[1,2]} thanks')).toEqual({ a: "}{", b: [1, 2] });
    expect(() => extractJson("no json here")).toThrow();
  });
});

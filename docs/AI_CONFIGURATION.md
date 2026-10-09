# AI Configuration

All AI calls go through one server-side gateway, `AIProviderRouter` (`lib/ai/router.ts`), with `GeminiProvider` and `GrokProvider` adapters. No other code calls a provider directly, and keys never reach the browser.

## Keys
Add any number of numbered keys in `.env.local`:
```
GEMINI_API_KEY_1=...   GEMINI_API_KEY_2=...   (…_N)
GROK_API_KEY_1=...     GROK_API_KEY_2=...     (…_N)
```
A plain `GEMINI_API_KEY` / `GROK_API_KEY` is also accepted as an extra key. Keys are discovered at startup by `collectKeys`, so adding `_6`, `_7`, … needs no code change. Restart the server after editing.

## Models and behavior (all optional)
| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model id (supports images) |
| `GROK_MODEL` | `grok-4-fast` | Grok model id |
| `GROK_VISION_MODEL` | same as `GROK_MODEL` | Model used when a request includes an image |
| `AI_PRIMARY_PROVIDER` | `gemini` | Which provider is tried first (`gemini` or `grok`) |
| `AI_REQUEST_TIMEOUT_MS` | `30000` | Per-attempt timeout |
| `AI_MAX_ATTEMPTS` | `12` | Hard cap on attempts per request across all keys and providers |
| `GROK_BASE_URL` | `https://api.x.ai/v1` | xAI endpoint override |

## Fallback behavior
1. Try the primary provider's next healthy key (round-robin).
2. Rate-limit or quota error: that key goes on cooldown (30 s for rate limits, longer for quota) and the router moves to the next key. Invalid keys are marked dead for the process lifetime.
3. Transient error (5xx, timeout, network): one short retry, then the next key.
4. Pool exhausted: switch to the other provider and walk its pool.
5. Bounded by `AI_MAX_ATTEMPTS`; every attempt has a timeout.
6. If everything fails the user sees a clean message (for example "AI providers are rate limited"), never a stack trace.
7. Malformed JSON or Zod-invalid output is retried through the router up to twice, then reported gracefully.

Image requests (Nutrition and Object photo uploads) are only sent to providers that support images (Gemini, and Grok through the vision model). Logs record provider, model, key slot number, latency and error class only. Never keys or prompts.

## Without keys
The app shows an "AI is not configured" message in AI-dependent places. Deterministic parts (Blood ranking, GameZero, Trust, Expiry) keep working.

## Verification status
The router, cooldowns, fallback order, attempt cap and provider adapters are covered by unit tests with mocked providers/fetch (`tests/ai-router.test.ts`). **Real Gemini and Grok calls have not been tested in this build because no credentials were available.** Once you add keys, open `/architecture` and press "Run live router test" to make one real call through the full chain.

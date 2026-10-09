export type AIErrorKind =
  | "rate_limit"
  | "quota"
  | "transient"
  | "timeout"
  | "auth"
  | "bad_request"
  | "malformed"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    public readonly kind: AIErrorKind,
    public readonly status?: number,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "ProviderError";
  }
}

export class AIUnavailableError extends Error {
  constructor(
    public readonly code: "no_keys" | "all_failed" | "malformed_output",
    public readonly attempts: number,
    public readonly lastKind?: AIErrorKind,
  ) {
    super(code);
    this.name = "AIUnavailableError";
  }

  /** Clean, user-facing message. Never includes provider detail. */
  get userMessage(): string {
    switch (this.code) {
      case "no_keys":
        return "AI is not configured on this server. Add at least one Gemini or Grok API key.";
      case "malformed_output":
        return "The AI returned an answer we could not validate. Please try again.";
      default:
        if (this.lastKind === "rate_limit" || this.lastKind === "quota") {
          return "All AI providers are at their rate limit right now. Please wait a moment and try again.";
        }
        return "AI is temporarily unavailable. Please try again shortly.";
    }
  }
}

export function classifyHttp(status: number, body: string): ProviderError {
  const lower = body.toLowerCase();
  if (status === 429) {
    const quota = /quota|resource_exhausted|billing|exceeded your current/.test(lower);
    return new ProviderError(quota ? "quota" : "rate_limit", status);
  }
  if (status === 401 || status === 403) return new ProviderError("auth", status);
  if (status === 408 || status === 409 || status === 425 || status >= 500) {
    return new ProviderError("transient", status);
  }
  if (status === 400 && /quota|resource_exhausted/.test(lower)) return new ProviderError("quota", status);
  if (status >= 400) return new ProviderError("bad_request", status);
  return new ProviderError("unknown", status);
}

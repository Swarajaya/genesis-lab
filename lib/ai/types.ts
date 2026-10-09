export type ProviderName = "gemini" | "grok";

export interface AIImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  /** base64 without data: prefix */
  data: string;
}

export interface AIRequest {
  system: string;
  prompt: string;
  /** Ask the provider for a JSON-only response. */
  json?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  image?: AIImage;
  /** Tag used only for safe metadata logging, e.g. "nutrition". */
  tag?: string;
}

export interface AIResponse {
  text: string;
  provider: ProviderName;
  model: string;
  keySlot: number;
  attempts: number;
  latencyMs: number;
}

export interface ProviderCallResult {
  text: string;
  model: string;
}

export interface AIProvider {
  readonly name: ProviderName;
  /** Number of configured keys. Keys themselves never leave the provider. */
  readonly keyCount: number;
  supportsImages: boolean;
  call(keyIndex: number, req: AIRequest, signal: AbortSignal): Promise<ProviderCallResult>;
}

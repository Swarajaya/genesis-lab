import { classifyHttp, ProviderError } from "../errors";
import type { AIProvider, AIRequest, ProviderCallResult } from "../types";

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;
  readonly supportsImages = true;

  constructor(
    private readonly keys: string[],
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  get keyCount() {
    return this.keys.length;
  }

  async call(keyIndex: number, req: AIRequest, signal: AbortSignal): Promise<ProviderCallResult> {
    const key = this.keys[keyIndex];
    if (!key) throw new ProviderError("auth", undefined, "missing key");

    const parts: Record<string, unknown>[] = [{ text: req.prompt }];
    if (req.image) parts.push({ inline_data: { mime_type: req.image.mimeType, data: req.image.data } });

    const body = {
      system_instruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? 8192,
        ...(req.json ? { responseMimeType: "application/json" } : {}),
      },
    };

    const res = await this.fetchImpl(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) throw classifyHttp(res.status, await res.text().catch(() => ""));

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new ProviderError("transient", 200, "empty response");
    return { text, model: this.model };
  }
}

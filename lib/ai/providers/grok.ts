import { classifyHttp, ProviderError } from "../errors";
import type { AIProvider, AIRequest, ProviderCallResult } from "../types";

export class GrokProvider implements AIProvider {
  readonly name = "grok" as const;

  constructor(
    private readonly keys: string[],
    private readonly model: string,
    private readonly visionModel: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = "https://api.x.ai/v1",
  ) {}

  get keyCount() {
    return this.keys.length;
  }

  get supportsImages() {
    return Boolean(this.visionModel);
  }

  async call(keyIndex: number, req: AIRequest, signal: AbortSignal): Promise<ProviderCallResult> {
    const key = this.keys[keyIndex];
    if (!key) throw new ProviderError("auth", undefined, "missing key");
    if (req.image && !this.visionModel) throw new ProviderError("bad_request", undefined, "no vision model");

    const model = req.image ? (this.visionModel as string) : this.model;
    const userContent = req.image
      ? [
          { type: "text", text: req.prompt },
          { type: "image_url", image_url: { url: `data:${req.image.mimeType};base64,${req.image.data}` } },
        ]
      : req.prompt;

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: req.temperature ?? 0.4,
        max_tokens: req.maxOutputTokens ?? 8192,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: userContent },
        ],
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal,
    });

    if (!res.ok) throw classifyHttp(res.status, await res.text().catch(() => ""));

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new ProviderError("transient", 200, "empty response");
    return { text, model };
  }
}

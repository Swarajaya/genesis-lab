import type { UiError } from "@/components/ui/ErrorState";
import type { Stage } from "@/components/ui/AiProgress";

export class ClientError extends Error {
  constructor(public readonly ui: UiError) {
    super(ui.message);
  }
}

const NETWORK: UiError = { code: "network", message: "The server could not be reached. Check your connection and try again." };

export function toUiError(e: unknown): UiError {
  return e instanceof ClientError ? e.ui : NETWORK;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ClientError(NETWORK);
  }
  let json: { ok: boolean; data?: T; error?: UiError } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !json?.ok) throw new ClientError(json?.error ?? { code: "internal", message: "Something went wrong on our side. Please try again." });
  return json.data as T;
}

/** Posts FormData and reads the NDJSON stage stream emitted by streamRoute. */
export async function postStream<T>(url: string, form: FormData, onStage: (s: Stage) => void): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form });
  } catch {
    throw new ClientError(NETWORK);
  }
  if (!res.ok || !res.body) {
    let err: UiError = { code: "internal", message: "Something went wrong on our side. Please try again." };
    try {
      const j = await res.json();
      if (j?.error) err = j.error;
    } catch {
      /* ignore */
    }
    throw new ClientError(err);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: T | null = null;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { type: string; stage?: Stage; data?: T; error?: UiError };
        if (msg.type === "stage" && msg.stage) onStage(msg.stage);
        else if (msg.type === "result") result = msg.data as T;
        else if (msg.type === "error" && msg.error) throw new ClientError(msg.error);
      }
    }
  } catch (e) {
    if (e instanceof ClientError) throw e;
    throw new ClientError(NETWORK);
  }
  if (result === null) throw new ClientError(NETWORK);
  onStage("complete");
  return result;
}

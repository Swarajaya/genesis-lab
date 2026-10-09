import { ClientError } from "@/lib/client";
import type { UiError } from "@/components/ui/ErrorState";
import type { ObjectRunResult, ObjectAnalysis, BaselineFuture, EngineEvent } from "@/lib/engines/object/types";

const NETWORK: UiError = { code: "network", message: "The server could not be reached. Check your connection and try again." };
const INTERNAL: UiError = { code: "internal", message: "Something went wrong on our side. Please try again." };

export interface StreamHandlers {
  onEvent: (e: EngineEvent) => void;
  onAnalysis: (a: { analysis: ObjectAnalysis; baseline: BaselineFuture }) => void;
}

/** Reads the NDJSON stream of /api/object: real events as they happen, an early analysis payload, then the final result. */
export async function postObject(form: FormData, h: StreamHandlers, signal?: AbortSignal): Promise<ObjectRunResult> {
  let res: Response;
  try {
    res = await fetch("/api/object", { method: "POST", body: form, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ClientError(NETWORK);
  }
  if (!res.ok || !res.body) {
    let err = INTERNAL;
    try {
      const j = await res.json();
      if (j?.error) err = j.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ClientError(err);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result: ObjectRunResult | null = null;
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
        const msg = JSON.parse(line) as { type: string; event?: EngineEvent; data?: unknown; error?: UiError };
        if (msg.type === "event" && msg.event) h.onEvent(msg.event);
        else if (msg.type === "analysis") h.onAnalysis(msg.data as { analysis: ObjectAnalysis; baseline: BaselineFuture });
        else if (msg.type === "result") result = msg.data as ObjectRunResult;
        else if (msg.type === "error" && msg.error) throw new ClientError(msg.error);
      }
    }
  } catch (e) {
    if (e instanceof ClientError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ClientError(NETWORK);
  }
  if (!result) throw new ClientError(NETWORK);
  return result;
}

export interface ExplainPayload {
  runId: string | null;
  mode: "single" | "compare";
  objectName: string;
  baseline: { ci: number; retained: number };
  pathways: {
    num: number; title: string; category: string; ci: number; feasibility: number; retained: number; wasteKg: number; emissionsKg: number; processing: number; inputs: number; economic: number;
    topContributor: string; topPenalty: string; rank: number;
  }[];
}

export async function postExplain(body: ExplainPayload, signal?: AbortSignal): Promise<{ explanation: { summary: string; points: string[] } | null; provider: string | null }> {
  try {
    const res = await fetch("/api/object/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    const j = await res.json();
    if (!res.ok || !j?.ok) return { explanation: null, provider: null };
    return j.data;
  } catch {
    return { explanation: null, provider: null };
  }
}

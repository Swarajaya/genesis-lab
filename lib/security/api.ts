import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { AIUnavailableError } from "@/lib/ai/errors";
import { rateLimit } from "./rateLimit";
import { UploadError } from "./upload";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:${fwd || req.headers.get("x-real-ip") || "local"}`;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers });
}

interface Options {
  scope: string;
  limit?: number;
  windowMs?: number;
}

export function toApiError(err: unknown, scope: string): { status: number; code: string; message: string } {
  if (err instanceof ApiError) return { status: err.status, code: err.code, message: err.message };
  if (err instanceof ZodError) return { status: 400, code: "invalid_input", message: err.issues[0]?.message ? `Invalid input: ${err.issues[0].message}` : "Invalid input." };
  if (err instanceof UploadError) {
    const msg = { too_large: "That image is larger than 5 MB.", unsupported: "Unsupported image. Use JPEG, PNG or WebP.", empty: "That file is empty." }[err.code];
    return { status: err.code === "too_large" ? 413 : 400, code: `upload_${err.code}`, message: msg };
  }
  if (err instanceof AIUnavailableError) {
    const code = err.code === "all_failed" && (err.lastKind === "rate_limit" || err.lastKind === "quota") ? "ai_rate_limited" : `ai_${err.code}`;
    return { status: err.code === "malformed_output" ? 502 : 503, code, message: err.userMessage };
  }
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : "unknown";
  console.error("[api] unhandled error", scope, detail);
  // Local development only: say what actually failed so it can be fixed. Production keeps the generic message.
  return { status: 500, code: "internal", message: process.env.NODE_ENV === "production" ? "Something went wrong on our side. Please try again." : `Server error (${scope}): ${detail.slice(0, 240)}` };
}

/** Wraps a route handler: rate limit + uniform, safe error responses (no stack traces). */
export function route(opts: Options, handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const rl = rateLimit(clientKey(req, opts.scope), opts.limit ?? 30, opts.windowMs ?? 60_000);
    if (!rl.ok) {
      return fail(429, "rate_limited", "Too many requests. Please slow down and try again shortly.", { "Retry-After": String(rl.retryAfterSec) });
    }
    try {
      return await handler(req);
    } catch (err) {
      const e = toApiError(err, opts.scope);
      return fail(e.status, e.code, e.message);
    }
  };
}

export type StageName = "analyzing" | "understanding" | "generating" | "validating";
export type Emit = (stage: StageName) => void;

/**
 * Streams newline-delimited JSON: real stage events as the server reaches them, then one result or error.
 * Stages are emitted only when that work actually starts, so the UI never fakes progress.
 */
export function streamRoute(opts: Options, handler: (req: Request, emit: Emit) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    const rl = rateLimit(clientKey(req, opts.scope), opts.limit ?? 30, opts.windowMs ?? 60_000);
    if (!rl.ok) return fail(429, "rate_limited", "Too many requests. Please slow down and try again shortly.", { "Retry-After": String(rl.retryAfterSec) });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        try {
          const data = await handler(req, (stage) => send({ type: "stage", stage }));
          send({ type: "result", data });
        } catch (err) {
          const e = toApiError(err, opts.scope);
          send({ type: "error", error: { code: e.code, message: e.message } });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  };
}

export async function parseJson<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = 200_000): Promise<z.infer<S>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "too_large", "Request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  return schema.parse(body);
}

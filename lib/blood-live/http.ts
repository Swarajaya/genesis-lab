import "server-only";
import { fail } from "@/lib/security/api";
import { LiveError } from "@/lib/engines/blood/liveTypes";
import { uuid } from "./schemas";

export type Params = { params: Promise<{ sessionId: string }> };

export async function sessionIdOf(ctx: Params): Promise<string> {
  const { sessionId } = await ctx.params;
  if (!uuid.safeParse(sessionId).success) throw new LiveError("not_found", "Session not found.", 404);
  return sessionId;
}

/** Maps LiveError to a clean JSON response; anything else is rethrown to the shared route() wrapper. */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LiveError) return fail(e.status, e.code, e.message);
    throw e;
  }
}

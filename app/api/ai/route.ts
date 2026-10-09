import { z } from "zod";
import { aiConfigured, generateStructured, getRouter } from "@/lib/ai";
import { ok, route } from "@/lib/security/api";
import { supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe status: provider names, key COUNTS and cooldown counts. Never key material. */
export async function GET() {
  const router = getRouter();
  return ok({
    configured: aiConfigured(),
    providers: router.status(),
    supabase: supabaseConfigured(),
  });
}

const ping = z.object({ ok: z.literal(true), echo: z.string().max(40) });

/** Live router test: makes one real, tiny AI call through the full fallback chain. */
export const POST = route({ scope: "ai-ping", limit: 6, windowMs: 60_000 }, async () => {
  const { data, meta } = await generateStructured(ping, {
    system: 'Reply with JSON only: {"ok":true,"echo":"genesis"}',
    prompt: "ping",
    temperature: 0,
    maxOutputTokens: 64,
    tag: "ping",
  });
  return ok({ echo: data.echo, provider: meta.provider, model: meta.model, keySlot: meta.keySlot, attempts: meta.attempts, latencyMs: meta.latencyMs });
});

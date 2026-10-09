import { z } from "zod";
import { buildSnapshot, testProvider } from "@/lib/ai/health";
import { ok, parseJson, route } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe snapshot: provider config, key COUNTS, and the results of past tests. Never key material. */
export const GET = route({ scope: "ai-health-read", limit: 60, windowMs: 60_000 }, async () => ok(buildSnapshot()));

const body = z.object({ provider: z.enum(["gemini", "grok"]) });

/** Real connection test: sends one tiny request per configured key of that provider and records what happened. */
export const POST = route({ scope: "ai-health-test", limit: 6, windowMs: 60_000 }, async (req) => {
  const { provider } = await parseJson(req, body, 1_000);
  await testProvider(provider);
  return ok(buildSnapshot());
});

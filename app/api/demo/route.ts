import { z } from "zod";
import { ok, parseJson, route } from "@/lib/security/api";
import { clearSession, getSessionId } from "@/lib/security/session";
import { resetSessionData } from "@/lib/supabase/persist";
import { supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Judge-mode reset: deletes everything this anonymous session wrote, then starts a fresh session. */
export const POST = route({ scope: "demo", limit: 10 }, async (req) => {
  await parseJson(req, z.object({ action: z.literal("reset") }));
  const id = await getSessionId();
  const cleared = await resetSessionData(id);
  await clearSession();
  return ok({ reset: true, serverDataCleared: cleared, supabase: supabaseConfigured() });
});

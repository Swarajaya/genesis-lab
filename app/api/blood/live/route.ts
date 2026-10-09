import { lanAddresses } from "@/lib/blood-live/lan";
import { createSession } from "@/lib/blood-live/service";
import { ok, route } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Creates a live session. Returns the host capability once; the QR never contains it. */
export const POST = route({ scope: "blood-live-create", limit: 20 }, async (req) => {
  const s = await createSession();
  const url = new URL(req.url);
  const host = req.headers.get("host") ?? url.host;
  const port = host.includes(":") ? host.split(":").pop() : "";
  return ok({ ...s, lan: lanAddresses(), port, protocol: url.protocol });
});

/** Health probe: open /api/blood/live in a browser to confirm this route is installed. */
export const GET = route({ scope: "blood-live-probe", limit: 60 }, async () => ok({ route: "blood-live", method: "POST creates a session" }));

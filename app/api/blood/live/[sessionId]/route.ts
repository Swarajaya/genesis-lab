import { guarded, sessionIdOf, type Params } from "@/lib/blood-live/http";
import { liveBus, snapshot } from "@/lib/blood-live/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local transport, used ONLY when Supabase Realtime is not configured (single server process).
 * It pushes a tiny "tick" whenever the session changes; clients then refetch the snapshot.
 */
export const GET = (req: Request, ctx: Params) =>
  guarded(async () => {
    const id = await sessionIdOf(ctx);
    await snapshot(id, null); // 404 for unknown sessions
    const enc = new TextEncoder();
    let off = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const send = (s: string) => {
          try {
            controller.enqueue(enc.encode(s));
          } catch {
            off();
          }
        };
        const onTick = (seq: number) => send(`event: tick\ndata: ${seq}\n\n`);
        liveBus.on(id, onTick);
        const beat = setInterval(() => send(": keep-alive\n\n"), 20_000);
        off = () => {
          liveBus.off(id, onTick);
          clearInterval(beat);
        };
        req.signal.addEventListener("abort", () => {
          off();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
        send("retry: 1500\n\n: connected\n\n");
      },
      cancel() {
        off();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  });

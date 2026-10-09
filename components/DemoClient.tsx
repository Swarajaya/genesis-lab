"use client";
import { ArrowRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { Glass } from "@/components/ui/Glass";
import { LiveBadge } from "@/components/ui/Badges";
import { EXPERIMENTS } from "@/lib/experiments";
import { postJson, toUiError } from "@/lib/client";
import { ErrorState, type UiError } from "@/components/ui/ErrorState";

const SCRIPT: Record<string, string> = {
  blood: "Press “Load emergency example”, then Run matching. Watch the network rank donors and read why each is MATCH, PARTIAL or INCOMPATIBLE.",
  nutrition: "Tap the example chips (stale bread, overripe banana, tomato, rice, lentils) and Generate meals.",
  gamezero: "Make 2–3 moves on the board, then press “Let the AI learn”, then “Play to win”. Watch hypotheses get rejected.",
  trust: "Press Issue credentials, then Prove + verify. Open the Attack lab and try Tamper, Replay and Revoke.",
  object: "Pick “plastic bottle” and press Find 100 lives. Click branches of the 3D tree.",
  expiry: "Issue the default ₹1000 (Food, Student, ₹500, 48h). Try ₹300 food, ₹700 electronics, then ₹500 food after expiry.",
};

export default function DemoClient() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await postJson<{ reset: boolean; serverDataCleared: boolean; supabase: boolean }>("/api/demo", { action: "reset" });
      setDone(r.supabase ? (r.serverDataCleared ? "Demo reset: everything saved by this demo session was deleted and a fresh session started." : "Demo reset: session cleared. Some saved rows could not be removed.") : "Demo reset: a fresh session started. (Supabase is not configured, so nothing was stored.)");
    } catch (e) {
      setError(toUiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main" className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6">
      <span className="label">Judge mode</span>
      <h1 className="display mt-2 text-4xl sm:text-6xl">Demo mode</h1>
      <p className="mt-3 max-w-2xl text-base font-light text-dim">Launch any experiment in one click. No sign-in needed. Each card says exactly what to try. Reset clears everything this demo session saved.</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="danger" onClick={reset} disabled={busy}>
          <RotateCcw className="h-4 w-4" aria-hidden /> {busy ? "Resetting…" : "RESET DEMO"}
        </Button>
        {done && (
          <p role="status" className="text-sm text-ok">
            {done}
          </p>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <ErrorState error={error} onRetry={reset} />
        </div>
      )}
      <div className="mt-4">
        <Notice>Blood, money and security demos are simulations with no real data. Uploaded photos are validated, size-limited and removed on reset.</Notice>
      </div>

      <ol className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {EXPERIMENTS.map((e) => (
          <li key={e.slug}>
            <Glass className="flex h-full flex-col p-5" style={{ borderTop: `2px solid ${e.hue}` }}>
              <div className="flex items-center justify-between">
                <span className="label" style={{ color: e.hue }}>
                  {String(e.index).padStart(2, "0")} · {e.shortDomain}
                </span>
                <LiveBadge />
              </div>
              <h2 className="mt-2 text-lg font-light">{e.name}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-dim">{SCRIPT[e.slug]}</p>
              <Link href={e.href} className="mt-4 inline-flex items-center gap-2 self-start rounded-full bg-signal px-5 py-2.5 text-sm font-medium text-[#04110e] transition hover:bg-[#9af0e2]">
                Launch <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Glass>
          </li>
        ))}
      </ol>
    </main>
  );
}

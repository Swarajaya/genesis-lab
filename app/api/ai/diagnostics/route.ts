import { buildSnapshot, testProvider } from "@/lib/ai/health";
import type { DiagnosticCheck, DiagnosticsReport } from "@/lib/ai/healthTypes";
import { ok, route } from "@/lib/security/api";
import { getAdmin, supabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const now = () => new Date().toISOString();

async function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error("timeout")), ms)))]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function databaseCheck(): Promise<DiagnosticCheck> {
  const base = { id: "database", group: "Database" as const, label: "Supabase database", checkedAt: now() };
  if (!supabaseConfigured()) return { ...base, status: "skipped", detail: "Not configured. Experiments still run; results just are not saved." };
  const db = getAdmin();
  if (!db) return { ...base, status: "skipped", detail: "Not configured." };
  const started = Date.now();
  try {
    // Read-only, no rows returned: only proves the database answers and the ai_requests table exists.
    const { error } = await withTimeout(db.from("ai_requests").select("*", { head: true, count: "exact" }).limit(1), 6000);
    const latencyMs = Date.now() - started;
    // Never forward the database's own error text; it can name tables or hosts.
    if (error) return { ...base, status: "fail", detail: "The database answered with an error. Check the connection and that the ai_requests table exists.", latencyMs };
    return { ...base, status: "pass", detail: "A real read-only query succeeded.", latencyMs };
  } catch {
    return { ...base, status: "fail", detail: "The database did not answer in time.", latencyMs: Date.now() - started };
  }
}

/** Runs only checks that really happen. Anything that cannot be tested is reported as skipped, never as passing. */
export const POST = route({ scope: "ai-diagnostics", limit: 3, windowMs: 60_000 }, async () => {
  const startedAt = now();
  const snap = buildSnapshot();
  const checks: DiagnosticCheck[] = [];

  // Providers: configuration, then one real request on the first key slot of each configured provider.
  const providerChecks = await Promise.all(
    snap.providers.map(async (p): Promise<DiagnosticCheck[]> => {
      const cfg: DiagnosticCheck = {
        id: `${p.name}-config`,
        group: "Providers",
        label: `${p.title} configuration`,
        status: p.configured ? "pass" : "warn",
        detail: p.configured ? `${p.keys} key slot${p.keys === 1 ? "" : "s"} configured. Model ${p.textModel}.` : "Not configured. No API keys found.",
        checkedAt: now(),
      };
      if (!p.configured) {
        return [cfg, { id: `${p.name}-connect`, group: "Providers", label: `${p.title} connectivity`, status: "skipped", detail: "Skipped because the provider is not configured.", checkedAt: now() }];
      }
      const h = await testProvider(p.name, [0]);
      const slot = h.slots.find((s) => s.slot === 0);
      const conn: DiagnosticCheck = {
        id: `${p.name}-connect`,
        group: "Providers",
        label: `${p.title} connectivity (key slot 1)`,
        status: slot?.label === "connected" ? "pass" : slot?.label === "rate_limited" ? "warn" : "fail",
        detail: slot?.message ?? "No result.",
        latencyMs: slot?.latencyMs,
        checkedAt: slot?.checkedAt ?? now(),
      };
      return [cfg, conn];
    }),
  );
  checks.push(...providerChecks.flat());

  checks.push(await databaseCheck());

  const mem = process.memoryUsage();
  checks.push(
    { id: "app-runtime", group: "Application", label: "Server runtime", status: "pass", detail: `Node ${process.version}, ${process.env.NODE_ENV ?? "unknown"} mode, up ${Math.round(process.uptime())} s, ${Math.round(mem.rss / 1048576)} MB memory.`, checkedAt: now() },
    { id: "app-fallback", group: "Application", label: "Fallback provider", status: snap.providers.filter((p) => p.configured).length > 1 ? "pass" : "warn", detail: snap.providers.filter((p) => p.configured).length > 1 ? "More than one provider is configured, so failover is possible." : "Only one provider is configured, so there is no provider fallback. Keys of that provider can still rotate.", checkedAt: now() },
  );

  const report: DiagnosticsReport = { startedAt, finishedAt: now(), checks };
  return ok({ report, snapshot: buildSnapshot() });
});

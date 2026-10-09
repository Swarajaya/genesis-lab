"use client";
import { Activity, KeyRound, Loader2, RefreshCw } from "lucide-react";
import type { ArchitectureSnapshot, KeySlotResult, ProviderHealth, ProviderInfo } from "@/lib/ai/healthTypes";
import { LABELS, Pill, Panel, SectionHead, When } from "./shared";

function SlotChip({ n, r, cooling }: { n: number; r?: KeySlotResult; cooling: boolean }) {
  const tone = r ? (r.label === "connected" ? "border-ok/40 bg-ok/15 text-ok" : r.label === "rate_limited" ? "border-warn/40 bg-warn/15 text-warn" : "border-bad/40 bg-bad/15 text-bad") : "border-white/12 bg-white/[0.03] text-faint";
  const word = r ? LABELS[r.label].text : "Not checked";
  return (
    <li
      title={`Key slot ${n + 1}: ${word}${cooling ? ", cooling down" : ""}${r ? `, ${r.latencyMs} ms` : ""}`}
      className={`relative flex h-11 w-11 items-center justify-center rounded-lg border font-mono text-sm transition hover:scale-110 ${tone}`}
    >
      {n + 1}
      {cooling ? <span aria-label="cooling down" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-void bg-warn" /> : null}
    </li>
  );
}

function LatencyBars({ slots }: { slots: KeySlotResult[] }) {
  const ok = slots.filter((s) => s.label === "connected");
  if (ok.length === 0) return <p className="text-xs text-faint">Latency chart appears after at least one successful test.</p>;
  const max = Math.max(...ok.map((s) => s.latencyMs), 1);
  return (
    <figure aria-label="Response time per key slot">
      <div className="flex h-16 items-end gap-1.5">
        {ok.map((s) => (
          <div key={s.slot} className="group relative flex h-full flex-1 flex-col justify-end" title={`Slot ${s.slot + 1}: ${s.latencyMs} ms`}>
            <div className="rounded-t bg-gradient-to-t from-signal/30 to-signal transition group-hover:from-signal/50" style={{ height: `${Math.max(6, (s.latencyMs / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-xs text-faint">
        <span>Slot {ok[0].slot + 1}</span>
        <span>Response time per key slot, slowest {max} ms</span>
        <span>Slot {ok[ok.length - 1].slot + 1}</span>
      </figcaption>
    </figure>
  );
}

function ProviderCard({ info, health, busy, error, onTest }: { info: ProviderInfo; health: ProviderHealth; busy: boolean; error: string | null; onTest: () => void }) {
  const l = LABELS[health.label];
  const bySlot = new Map(health.slots.map((s) => [s.slot, s]));
  return (
    <Panel className="flex flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="arch-h3 font-light tracking-tight">{info.title}</h3>
            <span className="label">{info.primary ? "Primary" : "Fallback"}</span>
          </div>
          <p className="mt-0.5 break-all font-mono text-base text-signal">{info.textModel}</p>
        </div>
        <Pill tone={l.tone}>{l.text}</Pill>
      </div>

      {!info.configured ? (
        <div className="mt-3 rounded-xl border border-warn/25 bg-warn/[0.05] p-4 text-sm leading-relaxed text-dim">
          <p className="text-base font-medium text-text">Not configured. The server found 0 API keys for {info.title}.</p>
          {info.envHint ? <p className="mt-1.5 text-text/85">{info.envHint}</p> : null}
          <p className="mt-2">Variables this app reads (names only):</p>
          <ul className="mt-1 space-y-0.5 font-mono text-sm text-dim">
            {info.envHelp.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <p className="mt-2">
            Related variables the server can see:{" "}
            {info.envFound.length === 0 ? (
              <span className="text-faint">none</span>
            ) : (
              info.envFound.map((f, i) => (
                <span key={f.name} className="font-mono">
                  {i ? ", " : ""}
                  <span className={f.read ? "text-text" : "text-warn"}>{f.name}</span>
                  <span className="text-faint"> ({f.hasValue ? "set" : "empty"}{f.read ? "" : ", not read"})</span>
                </span>
              ))
            )}
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt className="label">Latency</dt><dd className="mt-1 text-xl font-light">{health.latencyMs === null ? "Not checked" : `${health.latencyMs} ms`}</dd></div>
            <div><dt className="label">Key slots</dt><dd className="mt-1 text-xl font-light">{info.keys}</dd></div>
            <div><dt className="label">Verified</dt><dd className="mt-1 text-xl font-light">{health.keysTested ? `${health.keysOk} / ${health.keysTested}` : "Not checked"}</dd></div>
            <div><dt className="label">Cooling down</dt><dd className="mt-1 text-xl font-light">{info.coolingSlots.length}</dd></div>
          </dl>
          <div className="mt-3">
            <p className="label mb-1.5">Key slots</p>
            <ul className="flex flex-wrap gap-2" aria-label={`${info.title} key slots`}>
              {Array.from({ length: info.keys }, (_, i) => <SlotChip key={i} n={i} r={bySlot.get(i)} cooling={info.coolingSlots.includes(i)} />)}
            </ul>
          </div>
          <div className="mt-3"><LatencyBars slots={health.slots} /></div>
        </>
      )}

      <div className="mt-3 space-y-0.5 border-t border-white/[0.07] pt-3 text-sm">
        <p className="text-dim"><span className="text-faint">Last checked: </span><When iso={health.checkedAt} /></p>
        <p className={health.label === "failed" || health.label === "rate_limited" ? "text-warn" : "text-dim"}>{error ?? health.message}</p>
        <p className="text-xs text-faint">Endpoint: {info.endpointHost}{info.endpointIsCustom ? " (custom)" : ""}</p>
      </div>

      <button
        type="button"
        onClick={onTest}
        disabled={busy || !info.configured}
        className="mt-3 inline-flex items-center justify-center gap-2 self-start rounded-full bg-signal px-5 py-2.5 text-sm font-medium text-[#04110e] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-faint"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
        {busy ? "Testing…" : health.checkedAt ? `Test ${info.title} again` : `Test ${info.title} Connection`}
      </button>
    </Panel>
  );
}

export function Overview({ snap }: { snap: ArchitectureSnapshot }) {
  const configured = snap.providers.filter((p) => p.configured);
  const models = new Set(configured.flatMap((p) => [p.textModel, p.visionModel].filter((m): m is string => Boolean(m))));
  const keyCount = snap.providers.reduce((a, p) => a + p.keys, 0);
  const healths = snap.providers.map((p) => snap.health[p.name]);
  const verified = healths.filter((h) => h.label === "connected").length;
  const anyChecked = healths.some((h) => h.checkedAt);
  const lastOk = healths.flatMap((h) => h.slots).filter((s) => s.label === "connected").map((s) => s.checkedAt).sort().at(-1) ?? null;

  let overall: { text: string; tone: "ok" | "warn" | "bad" | "mute" } = { text: "Not checked", tone: "mute" };
  if (configured.length === 0) overall = { text: "Not configured", tone: "bad" };
  else if (anyChecked) {
    const cfgHealth = configured.map((p) => snap.health[p.name]);
    overall = cfgHealth.every((h) => h.label === "connected") ? { text: "All configured providers connected", tone: "ok" } : verified > 0 ? { text: "Partly connected", tone: "warn" } : { text: "No provider connected", tone: "bad" };
  }

  const tiles: { label: string; value: string; sub: string }[] = [
    { label: "Configured providers", value: `${configured.length} of ${snap.providers.length}`, sub: configured.map((p) => p.title).join(", ") || "None" },
    { label: "Registered models", value: String(models.size), sub: models.size ? [...models].join(", ") : "None" },
    { label: "API key slots", value: String(keyCount), sub: snap.providers.map((p) => `${p.title} ${p.keys}`).join(" · ") },
    { label: "Verified providers", value: anyChecked ? `${verified} of ${configured.length}` : "Not checked", sub: anyChecked ? "Passed a real request" : "Run a connection test" },
    { label: "Last successful check", value: lastOk ? "" : "Not checked", sub: "" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {tiles.map((t, i) => (
        <Panel key={t.label} className={`p-4 ${i === 4 ? "lg:col-span-1" : ""}`}>
          <p className="label">{t.label}</p>
          <p className="mt-1 text-2xl font-light tracking-tight">{i === 4 ? <span className="text-base"><When iso={lastOk} /></span> : t.value}</p>
          {i !== 4 ? <p className="mt-1 line-clamp-2 break-words text-xs text-faint">{t.sub}</p> : null}
        </Panel>
      ))}
      <Panel className="p-4">
        <p className="label">Provider health</p>
        <div className="mt-2"><Pill tone={overall.tone}>{overall.text}</Pill></div>
        <p className="mt-2 text-xs text-faint">From real tests only</p>
      </Panel>
    </div>
  );
}

export function HealthSection({ snap, busy, errors, onTest }: { snap: ArchitectureSnapshot; busy: Record<string, boolean>; errors: Record<string, string | null>; onTest: (p: "gemini" | "grok") => void }) {
  return (
    <section aria-labelledby="health" className="scroll-mt-24">
      <SectionHead
        id="health"
        eyebrow="Live API health"
        title="Is each AI provider really working?"
        lead="A key being present does not prove a provider works. These buttons send one tiny real request per key from the server and report exactly what came back."
      />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {snap.providers.map((p) => (
          <ProviderCard key={p.name} info={p} health={snap.health[p.name]} busy={Boolean(busy[p.name])} error={errors[p.name] ?? null} onTest={() => onTest(p.name)} />
        ))}
      </div>
      <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-faint">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        A passing test shows the provider answered just now. It cannot promise the next request will succeed. Results are kept in server memory and clear when the server restarts.
        <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Keys stay on the server. This page only ever receives counts and slot numbers.
      </p>
    </section>
  );
}


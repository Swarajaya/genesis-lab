"use client";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ArchitectureSnapshot } from "@/lib/ai/healthTypes";
import { Panel, SectionHead, TONE, fmtMs } from "./shared";

type NodeId = "request" | "router" | "primary" | "fallback" | "validate" | "result" | "error";
interface Step { node: NodeId; title: string; text: string; tone: keyof typeof TONE }
interface Scenario { id: string; label: string; steps: Step[] }

function build(snap: ArchitectureSnapshot): { scenarios: Scenario[]; primary: string; other: string | null; otherReady: boolean } {
  const [a, b] = [...snap.providers].sort((x, y) => Number(y.primary) - Number(x.primary));
  const P = a.title;
  const O = b?.title ?? null;
  const otherReady = Boolean(b?.configured);
  const cool = fmtMs(snap.limits.cooldownMs.rate_limit);
  const t = fmtMs(snap.limits.timeoutMs);

  const failoverTail: Step[] = otherReady
    ? [
        { node: "fallback", title: `Fall back to ${O}`, text: `${O} is configured, so the router moves on and tries its keys.`, tone: "info" },
        { node: "validate", title: "Check the answer", text: "The reply is validated before anyone sees it.", tone: "ok" },
        { node: "result", title: "Result shown", text: `The answer came from ${O}, not ${P}.`, tone: "ok" },
      ]
    : [
        { node: "fallback", title: `No fallback: ${O ?? "other provider"} is not configured`, text: `There is no second provider to try. Add ${O ?? "another provider"} keys to enable provider fallback.`, tone: "warn" },
        { node: "error", title: "Clean error", text: "The user sees a friendly message. No invented answer is shown.", tone: "bad" },
      ];

  const scenarios: Scenario[] = [
    {
      id: "normal",
      label: "Normal request",
      steps: [
        { node: "request", title: "Request arrives", text: "An experiment sends its request to the server, after validation.", tone: "info" },
        { node: "router", title: "Router picks a provider and key", text: `It starts with the primary provider (${P}) and rotates through its keys so no single key does all the work.`, tone: "info" },
        { node: "primary", title: `${P} answers`, text: "A key sends the request and the provider replies.", tone: "ok" },
        { node: "validate", title: "Check the answer", text: "The reply is checked against the expected format.", tone: "ok" },
        { node: "result", title: "Result shown", text: "Validated data drives the visualization.", tone: "ok" },
      ],
    },
    {
      id: "limit",
      label: "A key is rate-limited",
      steps: [
        { node: "request", title: "Request arrives", text: "Same start as a normal request.", tone: "info" },
        { node: "router", title: "Router picks a key", text: `Key slot 1 of ${P} is chosen.`, tone: "info" },
        { node: "primary", title: "Provider says “too many requests”", text: "The key has hit its limit (HTTP 429).", tone: "warn" },
        { node: "router", title: `Key rests for ${cool}`, text: "That key is put on cooldown so it is not hammered again.", tone: "warn" },
        a.keys > 1
          ? { node: "primary", title: "Next key tries", text: `Key slot 2 of ${P} takes the request and succeeds. This is key rotation.`, tone: "ok" }
          : { node: "primary", title: "No other key to rotate to", text: `${P} has only ${a.keys} key slot${a.keys === 1 ? "" : "s"}, so the router moves to provider fallback.`, tone: "warn" },
        ...(a.keys > 1
          ? [
              { node: "validate" as const, title: "Check the answer", text: "The reply is validated.", tone: "ok" as const },
              { node: "result" as const, title: "Result shown", text: "The user never noticed the limit.", tone: "ok" as const },
            ]
          : failoverTail),
      ],
    },
    {
      id: "down",
      label: "Provider unavailable",
      steps: [
        { node: "request", title: "Request arrives", text: "Same start as a normal request.", tone: "info" },
        { node: "router", title: "Router tries the primary", text: `It tries ${P}'s keys one by one, up to ${snap.limits.maxAttempts} attempts in total.`, tone: "info" },
        { node: "primary", title: `${P} keeps failing`, text: `Errors or no answer within ${t}. Each failing key rests before being retried.`, tone: "bad" },
        ...failoverTail,
      ],
    },
    {
      id: "all",
      label: "Everything fails",
      steps: [
        { node: "request", title: "Request arrives", text: "Same start as a normal request.", tone: "info" },
        { node: "router", title: "Router works through every eligible key", text: `It stops after ${snap.limits.maxAttempts} attempts at most, with a ${t} timeout per attempt.`, tone: "info" },
        { node: "primary", title: `${P} fails`, text: "No key produced a usable reply.", tone: "bad" },
        { node: "fallback", title: otherReady ? `${O} fails too` : `${O ?? "Fallback"} not available`, text: otherReady ? "No key of the other provider worked either." : "It is not configured, so there is nothing else to try.", tone: otherReady ? "bad" : "warn" },
        { node: "error", title: "Clean error", text: "The user sees an honest “AI is temporarily unavailable” message. The app never fabricates an answer.", tone: "bad" },
      ],
    },
  ];
  return { scenarios, primary: P, other: O, otherReady };
}

export function RoutingFlow({ snap }: { snap: ArchitectureSnapshot }) {
  const { scenarios, primary, other, otherReady } = useMemo(() => build(snap), [snap]);
  const [sid, setSid] = useState("normal");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const sc = scenarios.find((s) => s.id === sid) ?? scenarios[0];
  const last = sc.steps.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setStep((s) => (s >= last ? 0 : s + 1)), 2200);
    return () => clearInterval(id);
  }, [playing, last, sid]);

  const cur = sc.steps[Math.min(step, last)];
  const seen = new Set(sc.steps.slice(0, step + 1).map((s) => s.node));
  const nodes: { id: NodeId; label: string; sub?: string; dim?: boolean }[] = [
    { id: "request", label: "Request" },
    { id: "router", label: "Router" },
    { id: "primary", label: primary, sub: "primary" },
    { id: "fallback", label: other ?? "Fallback", sub: otherReady ? "fallback" : "not configured", dim: !otherReady },
    { id: "validate", label: "Validate" },
    { id: "result", label: "Result" },
    { id: "error", label: "Clean error" },
  ];

  return (
    <section aria-labelledby="routing" className="scroll-mt-24">
      <SectionHead id="routing" eyebrow="Routing & fallback" title="What happens when something goes wrong" lead="Pick a situation. The diagram follows the router's real rules, using this server's actual limits and which providers are really configured." />
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Scenario">
        {scenarios.map((s) => (
          <button key={s.id} role="tab" aria-selected={s.id === sid} type="button" onClick={() => { setSid(s.id); setStep(0); }} className={`rounded-full border px-5 py-2 text-base transition ${s.id === sid ? "border-signal/50 bg-signal/10 text-signal" : "border-white/10 text-dim hover:border-white/25 hover:text-text"}`}>
            {s.label}
          </button>
        ))}
      </div>

      <Panel className="p-5">
        <ol className="flex flex-wrap items-center gap-3" aria-label="Routing path">
          {nodes.map((n) => {
            const active = cur.node === n.id;
            const visited = seen.has(n.id);
            const bad = n.id === "error";
            return (
              <li key={n.id} className={`rounded-xl border px-5 py-3 text-center transition duration-500 ${active ? (bad ? "scale-105 border-bad/60 bg-bad/15" : "scale-105 border-signal/70 bg-signal/15 shadow-[0_0_36px_-10px_var(--color-signal)]") : visited ? "border-white/25 bg-white/[0.06]" : "border-white/[0.08] bg-white/[0.02] opacity-60"} ${n.dim ? "border-dashed" : ""}`}>
                <p className="text-base">{n.label}</p>
                {n.sub ? <p className={`label mt-0.5 ${n.dim ? "!text-warn" : ""}`}>{n.sub}</p> : null}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div aria-live="polite" className={`rounded-xl border p-4 ${TONE[cur.tone]}`}>
            <p className="label !text-current opacity-80">Step {step + 1} of {sc.steps.length}</p>
            <p className="mt-1 text-xl font-medium text-text">{cur.title}</p>
            <p className="mt-2 text-lg leading-relaxed text-text/85">{cur.text}</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => setPlaying((p) => !p)} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3.5 py-1.5 text-xs text-text transition hover:bg-white/10">
                {playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" onClick={() => { setPlaying(false); setStep((s) => (s >= last ? 0 : s + 1)); }} className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs text-text transition hover:bg-white/10">Next step</button>
            </div>
          </div>
          <ol className="space-y-1.5">
            {sc.steps.map((s, i) => (
              <li key={`${s.title}-${i}`}>
                <button type="button" onClick={() => { setPlaying(false); setStep(i); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base transition ${i === step ? "bg-white/10 text-text" : "text-dim hover:bg-white/[0.05]"}`}>
                  <span className="label">{i + 1}</span>{s.title}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </Panel>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Timeout per attempt", fmtMs(snap.limits.timeoutMs)],
          ["Max attempts per request", String(snap.limits.maxAttempts)],
          ["Rate-limit cooldown", fmtMs(snap.limits.cooldownMs.rate_limit)],
          ["Quota cooldown", fmtMs(snap.limits.cooldownMs.quota)],
          ["Answer-format retries", String(snap.limits.formatRetries)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-2">
            <dt className="label">{k}</dt>
            <dd className="mt-0.5 text-xl font-light">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-faint">These values are read from the running router, not typed into this page. {otherReady ? "" : `${other ?? "The fallback provider"} has no keys, so provider fallback is not active; key rotation inside ${primary} still works.`}</p>
    </section>
  );
}

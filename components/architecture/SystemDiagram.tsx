"use client";
import { ChevronRight, Cpu, Database, Eye, Monitor, Route, ShieldCheck, Sparkles, User, CircleCheck } from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { ArchitectureSnapshot } from "@/lib/ai/healthTypes";
import { LABELS, Panel, Pill, SectionHead, TONE } from "./shared";

interface Stage {
  id: string;
  title: string;
  icon: LucideIcon;
  plain: string;
  tech: string[];
  source: string[];
}

const STAGES: Stage[] = [
  { id: "input", title: "User input", icon: User, plain: "You type text, drop in a photo, or press a button inside one of the six experiments.", tech: ["Each experiment has its own form component and collects only the fields it needs.", "Images are read in the browser and sent to the server as a file upload."], source: ["components/experiments/*", "components/ui/ImageDropzone.tsx"] },
  { id: "frontend", title: "Frontend", icon: Monitor, plain: "The website you see. It shows the forms, the 3D scenes and the results.", tech: ["Next.js App Router with React components.", "3D scenes are loaded on demand so pages stay fast.", "The browser never receives API keys."], source: ["app/(site)/*", "components/3d/*"] },
  { id: "validation", title: "Input validation", icon: ShieldCheck, plain: "The server checks that what arrived is safe and well-formed before using it.", tech: ["Zod schemas check every request body.", "Uploads are limited to 5 MB and identified by their real file signature, not the name the browser claims.", "Per-client rate limiting slows down abuse."], source: ["lib/validation/*", "lib/security/api.ts", "lib/security/upload.ts", "lib/security/rateLimit.ts"] },
  { id: "engine", title: "Experiment engine", icon: Cpu, plain: "Ordinary code does the core calculation first, so results do not depend on an AI guessing.", tech: ["Separate engines for blood matching, trust proofs, money rules, discovery, circularity and more.", "The AI is then asked to explain or enrich the computed result."], source: ["lib/engines/*"] },
  { id: "router", title: "AI provider router", icon: Route, plain: "Chooses which AI provider and which key should answer, and tries another if one fails.", tech: ["Tries the primary provider's keys in turn, then the other provider.", "Failing keys cool down so they are not retried straight away.", "Records safe metadata only: provider, key slot, latency, outcome."], source: ["lib/ai/router.ts", "lib/ai/index.ts"] },
  { id: "providers", title: "Gemini / Grok", icon: Sparkles, plain: "The AI services that actually read the request and write the answer.", tech: ["Each provider has its own adapter because their request formats differ.", "Gemini uses Google's generateContent API. Grok uses an OpenAI-style chat-completions API, at xAI by default or at GROK_BASE_URL."], source: ["lib/ai/providers/gemini.ts", "lib/ai/providers/grok.ts"] },
  { id: "output", title: "Output validation", icon: CircleCheck, plain: "The AI's answer is checked against an expected shape. If it is malformed, the router asks again.", tech: ["JSON is extracted and checked with a Zod schema.", "Up to the configured number of format retries, then a clean error. Nothing unvalidated is shown as fact.", "Applies to structured answers produced through generateStructured."], source: ["lib/ai/index.ts", "lib/ai/json.ts"] },
  { id: "database", title: "Database (when applicable)", icon: Database, plain: "Runs and AI metadata can be saved. This is optional: without it the experiments still work.", tech: ["Supabase, accessed only from the server with a service key.", "Anonymous session id; no personal data.", "AI request logs hold no prompts, no answers and no keys."], source: ["lib/supabase/persist.ts", "lib/supabase/log.ts"] },
  { id: "result", title: "Visualization / result", icon: Eye, plain: "The validated result becomes the 3D scene, charts and explanations you see.", tech: ["Result panels and 3D scenes read the validated data.", "Each experiment decides how to visualize its own result."], source: ["components/experiments/*", "components/3d/*"] },
];

function liveStatus(id: string, snap: ArchitectureSnapshot): { text: string; tone: keyof typeof TONE } {
  if (id === "database") return snap.database.configured ? { text: "Configured", tone: "ok" } : { text: "Not configured", tone: "mute" };
  if (id === "router" || id === "providers") {
    const n = snap.providers.filter((p) => p.configured).length;
    if (n === 0) return { text: "No provider configured", tone: "bad" };
    if (id === "router") return { text: `${n} provider${n === 1 ? "" : "s"} configured`, tone: "ok" };
    const hs = snap.providers.filter((p) => p.configured).map((p) => snap.health[p.name]);
    if (hs.some((h) => h.label === "connected")) return { text: "Verified by real test", tone: "ok" };
    if (hs.some((h) => h.checkedAt)) return { text: LABELS[hs.find((h) => h.checkedAt)!.label].text, tone: LABELS[hs.find((h) => h.checkedAt)!.label].tone };
    return { text: "Configured, not tested", tone: "warn" };
  }
  return { text: "Implemented", tone: "info" };
}

export function SystemDiagram({ snap }: { snap: ArchitectureSnapshot }) {
  const [sel, setSel] = useState("router");
  const stage = STAGES.find((s) => s.id === sel) ?? STAGES[0];
  const st = liveStatus(stage.id, snap);
  const Icon = stage.icon;
  return (
    <section aria-labelledby="diagram" className="scroll-mt-24">
      <SectionHead id="diagram" eyebrow="System map" title="From your click to the result" lead="Select any stage to see what it does, whether it is really implemented, and which files hold it." />
      <ol className="flex flex-wrap items-stretch gap-y-2" aria-label="Request path">
        {STAGES.map((s, i) => {
          const I = s.icon;
          const active = s.id === sel;
          return (
            <li key={s.id} className="flex min-w-[9rem] flex-1 items-center">
              <button
                type="button"
                onClick={() => setSel(s.id)}
                aria-pressed={active}
                className={`group flex w-full flex-1 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition duration-200 hover:-translate-y-0.5 ${active ? "border-signal/60 bg-signal/10 shadow-[0_0_40px_-12px_var(--color-signal)]" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl border ${active ? "border-signal/50 text-signal" : "border-white/12 text-dim group-hover:text-text"}`}><I className="h-6 w-6" aria-hidden /></span>
                <span className="label">{String(i + 1).padStart(2, "0")}</span>
                <span className={`text-base leading-tight ${active ? "text-text" : "text-dim"}`}>{s.title}</span>
              </button>
              {i < STAGES.length - 1 ? <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-faint" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>

      <Panel className="mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-signal/40 bg-signal/10 text-signal"><Icon className="h-6 w-6" aria-hidden /></span>
            <h3 className="arch-h3 font-light tracking-tight">{stage.title}</h3>
          </div>
          <Pill tone={st.tone}>{st.text}</Pill>
        </div>
        <p className="mt-3 max-w-5xl text-lg leading-relaxed text-text/90">{stage.plain}</p>
        <details className="group mt-3 max-w-5xl rounded-xl border border-white/[0.08] bg-white/[0.02] open:bg-white/[0.04]">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-sm marker:hidden [&::-webkit-details-marker]:hidden">Technical details <span aria-hidden className="ml-1 text-faint transition group-open:rotate-90 inline-block">›</span></summary>
          <ul className="list-disc space-y-1.5 px-9 pb-3 text-sm leading-relaxed text-dim">{stage.tech.map((t) => <li key={t}>{t}</li>)}</ul>
        </details>
        <div className="mt-3">
          <p className="label mb-1.5">Source in this project</p>
          <ul className="flex flex-wrap gap-2">{stage.source.map((s) => <li key={s} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-sm text-dim">{s}</li>)}</ul>
        </div>
      </Panel>
      <p className="mt-2 text-xs text-faint">“Implemented” means the code exists in this project. Stages with a live status (router, providers, database) reflect this server right now.</p>
    </section>
  );
}

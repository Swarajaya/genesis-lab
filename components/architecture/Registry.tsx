"use client";
import { useState } from "react";
import type { ArchitectureSnapshot } from "@/lib/ai/healthTypes";
import { LABELS, Panel, Pill, SectionHead, When } from "./shared";

const TABS = [
  ["providers", "Providers", "The companies whose AI we call."],
  ["models", "Models", "The specific AI brains we ask."],
  ["keys", "API keys", "The passes that let us in."],
] as const;

export function Registry({ snap }: { snap: ArchitectureSnapshot }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("providers");
  const note = TABS.find((t) => t[0] === tab)?.[2];
  return (
    <section aria-labelledby="registry" className="scroll-mt-24">
      <SectionHead id="registry" eyebrow="Providers, models and keys" title="Three different things, kept apart" lead="A provider is a company, a model is one of its AI systems, and a key is a pass to use it. Counts below are computed from the live configuration." />
      <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-5 py-2 text-sm transition ${tab === id ? "bg-signal/15 text-signal" : "text-dim hover:text-text"}`}>{label}</button>
        ))}
      </div>
      <p className="mb-3 text-sm text-faint">{note}</p>

      {tab === "providers" && (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {snap.providers.map((p) => {
            const l = snap.health[p.name];
            return (
              <Panel key={p.name} className="p-4">
                <div className="flex items-center justify-between"><h3 className="arch-h3 font-light">{p.title}</h3><Pill tone={p.configured ? "ok" : "mute"}>{p.configured ? "Configured" : "Not configured"}</Pill></div>
                <dl className="mt-3 grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
                  <dt className="text-faint">Role</dt><dd>{p.primary ? "Primary: asked first" : "Fallback: asked if the primary fails"}</dd>
                  <dt className="text-faint">Endpoint</dt><dd className="font-mono text-sm">{p.endpointHost}{p.endpointIsCustom ? " (custom)" : " (default)"}</dd>
                  <dt className="text-faint">Image input</dt><dd>{p.supportsImages ? "Supported by adapter" : "Not supported"}</dd>
                  <dt className="text-faint">Connection</dt><dd>{LABELS[l.label].text}</dd>
                </dl>
              </Panel>
            );
          })}
        </div>
      )}

      {tab === "models" && (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead><tr className="border-b border-white/10 text-faint"><th className="px-4 py-2.5 font-normal">Model ID</th><th className="px-4 py-2.5 font-normal">Provider</th><th className="px-4 py-2.5 font-normal">Used for</th><th className="px-4 py-2.5 font-normal">Set by</th><th className="px-4 py-2.5 font-normal">Provider status</th></tr></thead>
            <tbody>
              {snap.providers.flatMap((p) => {
                const rows = [{ id: p.textModel, use: "Text", src: p.textModelSource }];
                if (p.visionModel && p.visionModel !== p.textModel) rows.push({ id: p.visionModel, use: "Images", src: "env" });
                else if (p.visionModel) rows[0].use = p.supportsImages ? "Text and images" : "Text";
                return rows.map((r) => (
                  <tr key={`${p.name}-${r.id}-${r.use}`} className="border-b border-white/[0.06] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-sm text-signal">{r.id}</td>
                    <td className="px-4 py-2.5">{p.title}</td>
                    <td className="px-4 py-2.5 text-dim">{r.use}</td>
                    <td className="px-4 py-2.5 text-dim">{r.src === "env" ? "Environment variable" : "Built-in default"}</td>
                    <td className="px-4 py-2.5"><Pill tone={p.configured ? LABELS[snap.health[p.name].label].tone : "mute"}>{p.configured ? LABELS[snap.health[p.name].label].text : "Not configured"}</Pill></td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
          <p className="border-t border-white/10 px-4 py-2.5 text-xs text-faint">A model listed here is registered in configuration. It is only known to work for a provider that shows “Connected”.</p>
        </Panel>
      )}

      {tab === "keys" && (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {snap.providers.map((p) => {
            const h = snap.health[p.name];
            const by = new Map(h.slots.map((s) => [s.slot, s]));
            return (
              <Panel key={p.name} className="p-4">
                <div className="flex items-center justify-between"><h3 className="arch-h3 font-light">{p.title} keys</h3><span className="label">{p.keys} slot{p.keys === 1 ? "" : "s"}</span></div>
                {p.keys === 0 ? (
                  <p className="mt-4 text-sm text-dim">No key slots. Add {p.envHelp[0]} to enable {p.title}.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-white/[0.06] text-sm">
                    {Array.from({ length: p.keys }, (_, i) => {
                      const r = by.get(i);
                      const cooling = p.coolingSlots.includes(i);
                      return (
                        <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span className="font-mono text-sm text-dim">Slot {i + 1}</span>
                          <span className="flex items-center gap-2">
                            {cooling ? <Pill tone="warn">Cooling down</Pill> : null}
                            <Pill tone={r ? LABELS[r.label].tone : "mute"}>{r ? `${LABELS[r.label].text} · ${r.latencyMs} ms` : "Present, not checked"}</Pill>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-3 text-xs text-faint">Last checked: <When iso={h.checkedAt} /></p>
              </Panel>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-faint">“Present” only means a key exists in the server's environment. Only “Connected” means a real request succeeded. Key values are never shown.</p>
    </section>
  );
}

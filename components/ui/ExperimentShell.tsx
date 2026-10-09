"use client";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { bySlug, type ExperimentSlug } from "@/lib/experiments";
import { FlowStrip } from "./FlowStrip";
import { Glass } from "./Glass";
import { LiveBadge, Notice } from "./Badges";
import { SdgPanel } from "./SdgPanel";

/** Common frame: 10-second explanation, five-stage flow, live demo slot, impact and SDG mapping. */
export function ExperimentShell({ slug, flowActive, children, impact, large = false, sdgStory }: { slug: ExperimentSlug; flowActive: number; children: ReactNode; impact?: ReactNode; /** Opt-in: edge-to-edge layout, larger type and a bigger SDG section. */ large?: boolean; sdgStory?: string[] }) {
  const meta = bySlug(slug);
  if (!meta) return null;
  return (
    <main id="main" className={large ? "blood-xl mx-auto w-full max-w-none px-4 pb-14 pt-8 sm:px-8 lg:px-14" : "mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6"}>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/lab" className="inline-flex items-center gap-2 text-xs text-dim transition hover:text-text">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the lab
          </Link>
          <LiveBadge />
        </div>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <span className="label" style={{ color: meta.hue }}>
              Experiment {String(meta.index).padStart(2, "0")} · {meta.domain}
            </span>
            <h1 className="display mt-2 text-4xl sm:text-5xl lg:text-6xl">{meta.name}</h1>
            <p className="mt-3 text-lg font-light text-dim">{meta.tagline}</p>
          </div>
          <Glass className="p-4">
            <span className="label">10-second explanation</span>
            <p className="mt-1.5 text-sm leading-relaxed text-dim">{meta.tenSeconds}</p>
          </Glass>
        </div>
        {meta.notice && !large && (
          <div className="mt-5">
            <Notice tone="warn">{meta.notice}</Notice>
          </div>
        )}
        <div className="mt-7">
          <FlowStrip steps={meta.flow} active={flowActive} hue={meta.hue} />
        </div>
      </motion.div>

      <section aria-label="Live demo" className="mt-8">
        {children}
      </section>

      <section aria-label="Impact" className="mt-12">
        <span className="label">Impact</span>
        <div className={large ? "mt-3 grid gap-5" : "mt-2 grid gap-4 lg:grid-cols-[1fr_1.4fr]"}>
          <Glass className="p-6">
            <p className="text-base font-light leading-relaxed">{meta.impact}</p>
            {impact}
          </Glass>
          <SdgPanel meta={meta} large={large} story={sdgStory} />
        </div>
      </section>
    </main>
  );
}

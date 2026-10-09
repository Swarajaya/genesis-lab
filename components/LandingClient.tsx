"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/ui/SiteHeader";
import { LiveBadge } from "@/components/ui/Badges";
import { LinkButton } from "@/components/ui/Button";
import { useCapabilities } from "@/hooks/useCapabilities";
import { EXPERIMENTS, bySlug, type ExperimentSlug } from "@/lib/experiments";
import Link from "next/link";

const LandingScene = dynamic(() => import("@/components/3d/LandingScene"), { ssr: false });
const SceneFrame = dynamic(() => import("@/components/3d/SceneFrame"), { ssr: false });

function Fallback({ active, onSelect }: { active: ExperimentSlug | null; onSelect: (s: ExperimentSlug | null) => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div className="relative h-[min(80vw,520px)] w-[min(80vw,520px)]">
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal/30 blur-xl" aria-hidden />
        <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal" aria-hidden />
        {EXPERIMENTS.map((e, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={e.slug}
              type="button"
              onClick={() => onSelect(active === e.slug ? null : e.slug)}
              aria-pressed={active === e.slug}
              className="absolute flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[0.6rem] transition hover:scale-110"
              style={{ left: `${50 + Math.cos(a) * 42}%`, top: `${50 + Math.sin(a) * 42}%`, borderColor: e.hue, color: e.hue, background: active === e.slug ? `${e.hue}33` : "rgb(0 0 0 / 0.4)" }}
            >
              {e.shortDomain}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LandingClient() {
  const caps = useCapabilities();
  const router = useRouter();
  const [active, setActive] = useState<ExperimentSlug | null>(null);
  const [entering, setEntering] = useState(false);
  const meta = active ? bySlug(active) : null;

  useEffect(() => {
    router.prefetch("/auth");
  }, [router]);

  const enter = () => {
    if (entering) return;
    if (caps.reducedMotion) return router.push("/auth");
    setEntering(true);
    setTimeout(() => router.push("/auth"), 800);
  };

  return (
    <main id="main" className="relative h-dvh w-full overflow-hidden bg-void">
      <div className="absolute inset-0">
        <SceneFrame caps={caps} className="h-full w-full" label="Interactive 3D laboratory: a glowing core orbited by six experiment nodes. Click a node to inspect it." camera={{ position: [0, 0.6, 9], fov: 48 }} fallback={<Fallback active={active} onSelect={setActive} />}>
          <LandingScene active={active} onSelect={setActive} entering={entering} lowPower={caps.lowPower} reduced={caps.reducedMotion} />
        </SceneFrame>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgb(4_6_10/0.75)_100%)]" aria-hidden />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 py-5 sm:px-8">
        <div className="pointer-events-auto flex items-center gap-2.5">
          <Logo size={24} />
          <span className="text-sm font-medium tracking-[0.24em]">GENESIS LAB</span>
        </div>
        <nav aria-label="Primary" className="pointer-events-auto flex gap-1 text-xs text-dim">
          <Link href="/architecture" className="rounded-full px-3 py-1.5 hover:text-text">Architecture</Link>
        </nav>
      </header>

      <AnimatePresence>
        {!entering && (
          <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center px-5 pb-8 text-center sm:pb-10">
            <h1 className="display text-5xl sm:text-7xl">Genesis Lab</h1>
            <p className="mt-3 max-w-xl text-sm font-light text-dim sm:text-lg">Six domains. Six experiments. One live innovation laboratory.</p>
            <div className="pointer-events-auto mt-6 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={enter} className="inline-flex items-center gap-2 rounded-full bg-signal px-7 py-3 text-sm font-medium tracking-[0.18em] text-[#04110e] shadow-[0_0_50px_-8px_rgba(123,224,208,0.7)] transition hover:bg-[#9af0e2]">
                ENTER THE LAB <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <ul className="pointer-events-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-1.5" aria-label="Experiments">
              {EXPERIMENTS.map((e) => (
                <li key={e.slug}>
                  <button type="button" aria-pressed={active === e.slug} onClick={() => setActive(active === e.slug ? null : e.slug)} className={`rounded-full border px-3 py-1 text-xs transition ${active === e.slug ? "text-text" : "border-line text-dim hover:text-text"}`} style={active === e.slug ? { borderColor: e.hue, background: `${e.hue}22` } : undefined}>
                    {e.short}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {meta && !entering && (
          <motion.aside key={meta.slug} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.45 }} aria-label={`${meta.name} details`} className="glass absolute right-4 top-20 z-10 w-[min(92vw,22rem)] rounded-2xl p-5 sm:right-8">
            <div className="flex items-start justify-between gap-3">
              <span className="label" style={{ color: meta.hue }}>
                {meta.domain}
              </span>
              <button type="button" aria-label="Close details" onClick={() => setActive(null)} className="rounded-full p-1 text-dim hover:text-text">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <h2 className="mt-2 text-xl font-light">{meta.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-dim">{meta.objective}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <LiveBadge />
              <LinkButton href={meta.href}>
                Enter experiment <ArrowRight className="h-4 w-4" aria-hidden />
              </LinkButton>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>{entering && <motion.div className="pointer-events-none absolute inset-0 bg-void" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.1 }} aria-hidden />}</AnimatePresence>
    </main>
  );
}

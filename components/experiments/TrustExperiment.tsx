"use client";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TrustVisual } from "@/components/3d/trust/TrustVisual";
import { ErrorState } from "@/components/ui/ErrorState";
import { SdgPanel } from "@/components/ui/SdgPanel";
import { bySlug } from "@/lib/experiments";
import { CompilerPanel, DecisionPanel, EventStream, ProofExplorer } from "./trust/CorePanels";
import { AttackLab, PqPanel, SecurityMap, TrustGraph } from "./trust/LabPanels";
import { VerifierPanel } from "./trust/PolicyPanel";
import { Panel, TONE } from "./trust/ui";
import { useTrustLab, type TrustLab } from "./trust/useTrustLab";
import { VaultPanel } from "./trust/VaultPanel";

const FLOW = ["Private credentials", "Locked", "Commitment created", "Proof generated", "Challenge", "Response", "Verified claim"] as const;
/** Which flow steps are complete for each real processing phase. */
const FLOW_DONE: Record<number, number> = { 0: 0, 1: 2, 2: 3, 3: 4, 4: 6, 5: 7 };

function Indicators({ lab }: { lab: TrustLab }) {
  const rep = lab.current?.report;
  const items: [string, boolean][] = [
    ["Private vault", lab.issued],
    ["Policy engine", lab.compiled.ok],
    ["ZK proof", !!lab.current],
    ["Verifier", !!rep],
    ["Attack detection", lab.attackHistory.length > 0 || !!rep?.replay],
    ["Post-quantum", lab.mode === "hybrid-pq"],
  ];
  return (
    <ul className="grid grid-cols-2 gap-x-8 gap-y-2.5 font-mono text-[0.82rem] uppercase tracking-[0.16em]" aria-label="System indicators">
      {items.map(([k, on]) => (
        <li key={k} className="flex items-center gap-1.5" style={{ color: on ? TONE.ok : "#6b768a" }}>
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: on ? TONE.ok : "#3a4256", boxShadow: on ? `0 0 8px ${TONE.ok}` : "none" }} />
          {k}
        </li>
      ))}
    </ul>
  );
}

function Core({ lab }: { lab: TrustLab }) {
  const cur = lab.current;
  const done = FLOW_DONE[lab.phase] ?? 0;
  const bad = lab.verdict === "invalid";
  const color = bad ? TONE.bad : TONE.ok;
  return (
    <Panel title="Cryptographic trust core" kicker="Private data → commitment → proof → verification → trust" accent="#7be0d0">
      <div className="relative">
        <TrustVisual phase={lab.phase} verdict={lab.verdict} privateCount={lab.totalAttributes} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1 flex justify-between px-2 font-mono text-[0.74rem] uppercase tracking-[0.2em]">
          <span style={{ color: TONE.violet }}>Private domain</span>
          <span className="text-signal">Privacy boundary</span>
          <span className="text-dim">Verifier</span>
        </div>
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4 lg:grid-cols-7" aria-label="Proof transformation">
        {FLOW.map((s, i) => {
          const on = i < done;
          const active = i === done - 1 && lab.phase > 0;
          const last = i === FLOW.length - 1;
          const c = on ? (last && bad ? TONE.bad : color) : "#4a5468";
          return (
            <li key={s} className="border-t pt-1.5" style={{ borderColor: on ? c : "rgb(255 255 255 / 0.1)" }}>
              <span className="font-mono text-[0.74rem] text-faint">{String(i + 1).padStart(2, "0")}</span>
              <motion.span className="block font-mono text-[0.82rem] uppercase leading-tight tracking-wider" style={{ color: c }} animate={active ? { opacity: [1, 0.45, 1] } : { opacity: 1 }} transition={{ duration: 1.2, repeat: active ? Infinity : 0 }}>
                {last && bad && on ? "Claim rejected" : s}
              </motion.span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 text-sm">
        <div className="border border-dashed p-2.5" style={{ borderColor: `${TONE.violet}66` }}>
          <span className="label !text-[0.74rem]" style={{ color: TONE.violet }}>Inside the boundary</span>
          <p className="mt-1 font-mono text-[0.9rem] leading-relaxed text-faint">{["Name", "Credentials", "University", "Clearance", "Score", "Status"].map((k) => (lab.phase >= 1 ? "████████" : k)).join("  ")}</p>
        </div>
        <div className="flex flex-col items-center justify-center px-1 font-mono text-[0.74rem] uppercase tracking-widest text-signal">
          <span>ZK proof</span>
          <span aria-hidden>⟶</span>
          <span className="text-faint">{cur ? `${(cur.bytes / 1024).toFixed(0)} KB` : "—"}</span>
        </div>
        <div className="border p-2.5" style={{ borderColor: `${color}55` }}>
          <span className="label !text-[0.74rem]" style={{ color: cur?.report ? color : undefined }}>Verifier receives</span>
          <p className="mt-1 font-mono text-[0.9rem] leading-relaxed text-dim">{cur?.report ? (cur.report.trust === "VERIFIED" ? "Policy satisfied. Nothing else." : "Proof rejected. Nothing learned.") : "Only the requested claim result."}</p>
        </div>
      </div>
    </Panel>
  );
}

const TABS = [
  ["attack", "Attack lab"],
  ["pq", "Post-quantum"],
  ["map", "Security map"],
] as const;

export default function TrustExperiment() {
  const lab = useTrustLab();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("attack");
  const meta = bySlug("trust");
  return (
    <main id="main" className="relative w-full px-4 pb-12 pt-5 sm:px-6 xl:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5]" style={{ backgroundImage: "linear-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.025) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at 50% 20%, black 30%, transparent 75%)" }} />
      <Link href="/lab" className="inline-flex items-center gap-2 text-sm text-dim transition hover:text-text">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the lab
      </Link>

      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mt-4 grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-end">
        <div>
          <span className="label" style={{ color: "#b48bff" }}>Experiment 04 · Cybersecurity &amp; Digital Safety</span>
          <h1 className="display mt-3 text-5xl sm:text-7xl xl:text-[6.75rem]">TRUST WITHOUT IDENTITY</h1>
          <p className="mt-2 font-mono text-lg uppercase tracking-[0.3em] text-signal sm:text-2xl">Zero-knowledge trust engine</p>
          <p className="mt-5 text-2xl font-light leading-snug text-dim sm:text-4xl">Prove what is required.<br />Reveal nothing unnecessary.</p>
        </div>
        <div className="lg:justify-self-end">
          <Indicators lab={lab} />
          <p className="mt-5 max-w-xl text-base leading-relaxed text-dim">Issue private credentials, state what a verifier needs to know, and watch a composite zero-knowledge proof answer it. Then attack the proof, revoke a credential, change the policy, and verify again with post-quantum signatures.</p>
        </div>
      </motion.header>

      {lab.error && (
        <div className="mt-5">
          <ErrorState error={lab.error} onRetry={() => lab.setError(null)} />
        </div>
      )}

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
        <div className="order-2 lg:order-1"><VaultPanel lab={lab} /></div>
        <div className="order-1 space-y-5 lg:order-2">
          <Core lab={lab} />
          <TrustGraph lab={lab} />
          <DecisionPanel lab={lab} />
        </div>
        <div className="order-3 space-y-5">
          <VerifierPanel lab={lab} />
          <CompilerPanel lab={lab} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <EventStream lab={lab} />
        <ProofExplorer lab={lab} />
      </div>

      <div className="mt-8">
        <div role="tablist" aria-label="Analysis" className="mb-3 flex gap-1 border-b border-line">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)} className="px-4 py-2 font-mono text-[0.9rem] uppercase tracking-[0.16em] transition" style={tab === id ? { color: "#e8edf5", borderBottom: `2px solid ${TONE.info}` } : { color: "#6b768a", borderBottom: "2px solid transparent" }}>{label}</button>
          ))}
        </div>
        {tab === "attack" && <AttackLab lab={lab} />}
        {tab === "pq" && <PqPanel lab={lab} />}
        {tab === "map" && <SecurityMap lab={lab} />}
      </div>

      <section aria-label="Scope and limits" className="mt-8 grid gap-5 md:grid-cols-2">
        <Panel title="What this proves" kicker="Research system" accent="#7be0d0">
          <p className="text-base leading-relaxed text-dim">Pedersen commitments on secp256k1, bit-decomposition range proofs with Fiat–Shamir OR-proofs, and Σ-proofs for equality, composed under one policy transcript bound to a verifier nonce. Issuer signatures are Schnorr, with ML-DSA-65 co-signatures in hybrid mode.</p>
        </Panel>
        <Panel title="Limits" kicker="Stated precisely" accent="#b48bff">
          <p className="text-base leading-relaxed text-dim">Not audited. The issuer sees attribute values at issuance, proofs from one credential share an opaque handle, and OR branches reveal which branch was proven. The discrete-log layer is not post-quantum; production systems would use anonymous-credential schemes and standardised proof systems.</p>
        </Panel>
      </section>

      {meta && (
        <section aria-label="Impact" className="mt-10">
          <span className="label">Impact</span>
          <div className="mt-2"><SdgPanel meta={meta} /></div>
        </section>
      )}
    </main>
  );
}

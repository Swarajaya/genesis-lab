"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Atom, AtomStatus } from "@/lib/engines/gamezero/discovery/ledger";
import type { CounterfactualReport } from "@/lib/engines/gamezero/discovery/counterfactual";
import { META_CATEGORIES, type MetaLibrary } from "@/lib/engines/gamezero/discovery/meta";
import type { Analysis, DiscoveryEvent, EventKind, Frame } from "@/lib/engines/gamezero/discovery/session";
import type { PublicWorld } from "@/lib/engines/gamezero/types";
import { COLORS } from "@/lib/engines/gamezero/types";
import type { LastUpdate, PlanView, TransferInfo } from "./useDiscovery";
import { RuleDna, KnowledgeRing } from "./Viz";
import { COLOR_HEX } from "./helpers";
import { CYAN, GREEN, Panel, RED, Readout, VIOLET, bits, pct } from "./ui";

/* ------------------------------------------------------------------ metrics strip */

export function MetricsStrip({ a }: { a: Analysis }) {
  const m = a.metrics;
  return (
    <div className="gz-panel grid grid-cols-3 gap-x-4 gap-y-4 px-4 py-3.5 sm:grid-cols-6" aria-label="Live AI knowledge metrics">
      <Readout label="KNOWLEDGE" value={pct(m.knowledge)} tone="cyan" />
      <Readout label="HYPOTHESES" value={`${m.hypothesesAlive}/${m.hypothesesTotal}`} />
      <Readout label="EXPERIMENTS" value={m.experiments} />
      <Readout label="CONTRADICTIONS" value={m.contradictions} tone="red" />
      <Readout label="RULES CONFIRMED" value={`${m.rulesConfirmed}/${m.rulesTotal}`} tone="green" />
      <Readout label="MODEL CONFIDENCE" value={pct(m.modelConfidence)} tone="violet" />
    </div>
  );
}

/* ------------------------------------------------------------------ perception */

export function PerceptionPanel({ a, world }: { a: Analysis; world: PublicWorld }) {
  const p = a.perception;
  const counts = useMemo(() => COLORS.map((c) => ({ c, n: world.colors.flat().filter((x) => x === c).length })).filter((x) => x.n > 0), [world]);
  const roleOf = (c: string) => {
    const atom = a.modelAtoms.find((x) => x.color === c);
    return atom && atom.confidence >= 0.999 ? (atom.role as string) : null;
  };
  return (
    <Panel title="Perception engine" aside="live">
      <div className="relative overflow-hidden px-4 py-3.5">
        <div className="gz-scan" aria-hidden />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
          <Readout label="OBJECTS DETECTED" value={p.objects} />
          <Readout label="TERRAIN TYPES" value={p.terrainTypes} />
          <Readout label="OBSERVED STATES" value={p.observedStates} />
          <Readout label="INTERACTIONS" value={p.interactions} tone="cyan" />
          <Readout label="UNKNOWN VARIABLES" value={p.unknownVariables} tone="violet" />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Terrain types detected">
          {counts.map(({ c, n }) => (
            <li key={c} className="flex items-center gap-1.5 text-[1.15rem] text-dim">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR_HEX[c], boxShadow: `0 0 8px ${COLOR_HEX[c]}` }} aria-hidden />
              <span className="gz-readout capitalize">{c}</span>
              <span className="text-faint">×{n}</span>
              <span className="gz-readout text-[1.06rem] uppercase text-faint">{roleOf(c) ?? "unknown"}</span>
            </li>
          ))}
        </ul>
        <p className="gz-readout mt-2.5 text-[1.06rem] text-faint">
          collisions {p.collisions} · rewards {p.rewards} · penalties {p.penalties} · goals {p.goals} · transitions {p.transitions} · cells visited {p.visitedCells}
        </p>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ hypothesis space */

const STATUS_TONE: Record<AtomStatus, string> = {
  UNKNOWN: "border-white/10 text-faint",
  TESTING: "border-[#a78bfa]/50 text-[#a78bfa]",
  SUPPORTED: "border-signal/50 text-signal",
  CONTRADICTED: "border-warn/50 text-warn",
  CONFIRMED: "border-ok/60 text-ok",
  REJECTED: "border-bad/40 text-bad",
};
const STATUS_ORDER: Record<AtomStatus, number> = { CONFIRMED: 0, SUPPORTED: 1, TESTING: 2, CONTRADICTED: 3, UNKNOWN: 4, REJECTED: 5 };

export function HypothesisSpace({ atoms }: { atoms: Atom[] }) {
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...atoms].sort((x, y) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status] || y.confidence - x.confidence), [atoms]);
  const shown = all ? sorted : sorted.slice(0, 10);
  const alive = atoms.filter((x) => x.status !== "REJECTED").length;
  return (
    <Panel title="Hypothesis space" aside={`${alive} alive · ${atoms.length - alive} rejected`}>
      <ul className="max-h-[27rem] space-y-1.5 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {shown.map((h) => {
            const dead = h.status === "REJECTED";
            const strong = h.status === "CONFIRMED" || h.confidence > 0.9;
            return (
              <motion.li key={h.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: dead ? 0.38 : 1, scale: dead ? 0.985 : 1 }} transition={{ duration: 0.6 }} className={`rounded-[4px] border px-3 py-2 ${strong ? "border-ok/40 bg-ok/[0.05]" : dead ? "border-bad/15" : "border-white/[0.07]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="gz-readout text-[1.06rem] text-faint">{h.id}</span>
                    <p className={`text-[1.23rem] uppercase leading-snug tracking-wide ${dead ? "text-faint line-through decoration-bad/70" : "text-text"}`}>{h.statement}</p>
                  </div>
                  <span className={`label shrink-0 rounded-full border px-2 py-0.5 !text-[1.01rem] ${STATUS_TONE[h.status]}`}>{h.status}</span>
                </div>
                <div className="mt-1.5 h-[3px] overflow-hidden rounded bg-white/10">
                  <motion.div className="h-full" style={{ background: dead ? RED : h.status === "CONFIRMED" ? GREEN : CYAN }} initial={false} animate={{ width: `${h.confidence * 100}%` }} transition={{ duration: 0.7 }} />
                </div>
                <p className="gz-readout mt-1 text-[1.06rem] text-faint">
                  CONFIDENCE {pct(h.confidence)} · EVIDENCE {h.evidence} · CONTRADICTIONS {h.contradictions}
                  {h.sources.length > 0 && ` · SRC ${h.sources.slice(0, 5).map((s) => `#${s}`).join(" ")}${h.sources.length > 5 ? "…" : ""}`}
                  {dead && h.diedAt > 0 && ` · REJECTED @ #${h.diedAt}`}
                </p>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <button type="button" onClick={() => setAll((v) => !v)} className="label w-full border-t border-white/[0.06] py-2 !text-[1.06rem] transition hover:!text-signal">
        {all ? "Show fewer" : `Show all ${atoms.length}`}
      </button>
    </Panel>
  );
}

/* ------------------------------------------------------------------ experiment, causality, counterfactual */

export function ExperimentPanel({ plan, last, a }: { plan: PlanView | null; last: LastUpdate | null; a: Analysis }) {
  const maxGain = plan?.scores ? Math.max(0.0001, ...plan.scores.map((s) => s.gain)) : 1;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title={plan?.kind === "intervention" ? "Causal intervention" : "Next experiment"}>
        <div className="space-y-2.5 px-4 py-3.5" aria-live="polite">
          {plan ? (
            <>
              <div>
                <div className="label !text-[1.01rem]">QUESTION</div>
                <p className="text-[1.1rem] text-text">{plan.question}</p>
              </div>
              <div>
                <div className="label !text-[1.01rem]">ACTION</div>
                <p className="text-[1.1rem] text-dim">{plan.actionText}</p>
              </div>
              <div>
                <div className="label !text-[1.01rem]">{plan.gain !== null ? "EXPECTED INFORMATION" : "TEST"}</div>
                <p className="gz-readout text-[1.1rem] text-signal">{plan.gain !== null && plan.gain > 0 ? `${bits(plan.gain)} bits` : plan.note}</p>
              </div>
              {plan.scores && (
                <ul className="space-y-1.5 pt-1" aria-label="Information gain per action">
                  {plan.scores.map((s) => (
                    <li key={s.action} className="grid grid-cols-[3.2rem_1fr_3rem] items-center gap-2 text-[1.12rem]">
                      <span className="gz-readout uppercase text-dim">{s.action}</span>
                      <span className="h-[5px] overflow-hidden rounded bg-white/10">
                        <motion.span className="block h-full" style={{ background: s.action === plan.action ? CYAN : VIOLET, opacity: s.action === plan.action ? 1 : 0.55 }} initial={false} animate={{ width: `${(s.gain / maxGain) * 100}%` }} transition={{ duration: 0.5 }} />
                      </span>
                      <span className="gz-readout text-right text-faint">{bits(s.gain)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[1.1rem] text-faint">No experiment queued. Start discovery to let the agent choose the most informative action.</p>
          )}
        </div>
      </Panel>
      <Panel title="Result → update → verdict">
        <div className="space-y-2 px-4 py-3.5 text-[1.1rem]" aria-live="polite">
          {last ? (
            <>
              <Step n="OBSERVATION" tone="text">{last.label}</Step>
              <Step n="HYPOTHESIS UPDATE" tone="violet">
                knowledge {pct(last.knowledgeBefore)} → {pct(last.knowledgeAfter)}
              </Step>
              <Step n="VERDICT" tone={last.confirmed.length ? "green" : last.collapsed.length ? "red" : "text"}>
                {last.confirmed.length
                  ? `CONFIRMED ${last.confirmed.map((x) => x.id).join(", ")}`
                  : last.collapsed.length
                    ? `REJECTED ${last.collapsed.length}: ${last.collapsed.slice(0, 4).map((x) => x.id).join(", ")}${last.collapsed.length > 4 ? "…" : ""}`
                    : "no hypothesis changed state"}
              </Step>
            </>
          ) : (
            <p className="text-faint">Waiting for the first experiment result.</p>
          )}
          <CausalChain atoms={a.modelAtoms} />
        </div>
      </Panel>
    </div>
  );
}

function Step({ n, tone, children }: { n: string; tone: "text" | "violet" | "green" | "red"; children: ReactNode }) {
  const c = { text: "text-text", violet: "text-[#a78bfa]", green: "text-ok", red: "text-bad" }[tone];
  return (
    <div className="flex items-baseline gap-3">
      <span className="label w-32 shrink-0 !text-[1.01rem]">{n}</span>
      <span className={`gz-readout text-[1.19rem] ${c}`}>{children}</span>
    </div>
  );
}

function CausalChain({ atoms }: { atoms: Atom[] }) {
  const stages = (a: Atom) => [a.evidence > 0, a.interventions >= 1, a.interventions >= 2, a.status === "CONFIRMED"];
  return (
    <div className="border-t border-white/[0.06] pt-2.5">
      <div className="label !text-[1.01rem]">CAUSAL VERIFICATION · observed → intervened → replicated → confirmed</div>
      <ul className="mt-1.5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {atoms.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[1.06rem] text-dim">
            <span className="flex gap-[3px]" aria-label={`${a.interventions} interventions`}>
              {stages(a).map((on, i) => (
                <span key={i} className="h-1.5 w-3 rounded-[1px]" style={{ background: on ? (i === 3 ? GREEN : CYAN) : "rgba(255,255,255,0.12)" }} />
              ))}
            </span>
            <span className="truncate">{a.kind === "terrain" ? `${a.color} ${a.role}` : a.statement}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CounterfactualPanel({ reports, a }: { reports: CounterfactualReport[]; a: Analysis }) {
  const r = reports[reports.length - 1];
  return (
    <Panel title="Counterfactual analysis" aside={`${a.metrics.counterfactuals} evaluated · model matched ${a.metrics.counterfactualMatches}/${a.metrics.counterfactualChecked}`}>
      <div className="px-4 py-3.5">
        {r ? (
          <>
            <p className="gz-readout text-[1.12rem] text-faint">After observation #{r.step} ({r.reason}). Every outcome below was returned by the real game engine; the model's prediction was made before seeing it.</p>
            <table className="mt-2 w-full text-left text-[1.19rem]">
              <thead>
                <tr className="label !text-[1.01rem]">
                  <th className="py-1 font-normal">ACTION</th>
                  <th className="font-normal">ENGINE</th>
                  <th className="font-normal">MODEL PREDICTED</th>
                  <th className="text-right font-normal">MATCH</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.action} className={`border-t border-white/[0.05] ${x.taken ? "text-text" : "text-dim"}`}>
                    <td className="gz-readout py-1 uppercase">
                      {x.action}
                      {x.taken && <span className="ml-1.5 text-[1.01rem] text-signal">TAKEN</span>}
                    </td>
                    <td className="gz-readout">{x.label}</td>
                    <td className="gz-readout">{x.predictedLabel ?? "withheld"}</td>
                    <td className="gz-readout text-right">{x.match === null ? "—" : x.match ? "✓" : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-[1.1rem] text-faint">Counterfactuals appear after important observations: collisions, rewards, hazards and rejected hypotheses.</p>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ quantum-inspired search, evolution, meta */

export function SearchPanel({ a }: { a: Analysis }) {
  const q = a.qihs;
  const traj = q.trajectory;
  const w = 160;
  const h = 34;
  const pts = traj.length > 1 ? traj.map((t, i) => `${(i / (traj.length - 1)) * w},${h - t.p * h}`).join(" ") : "";
  const evo = a.evo;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Quantum-inspired hypothesis search" aside={q.mode === "amplitude-amplification" ? "amplitude amplification" : "classical fallback"}>
        <div className="space-y-2 px-4 py-3.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            <Readout label="REGISTER" value={`${q.qubits} qubits`} />
            <Readout label="CANDIDATE WORLDS" value={a.worldsLeft.toLocaleString("en-US")} tone="cyan" />
            <Readout label="AMPLIFY ROUNDS" value={q.rounds} />
            <Readout label="P(CONSISTENT)" value={pct(q.goodProbability, 1)} tone="green" />
            <Readout label="ORACLE QUERIES" value={q.oracleQueries} />
            <Readout label="MAX DEVIATION" value={q.agreement.toExponential(0)} />
          </div>
          {pts && (
            <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" role="img" aria-label="Probability of a consistent world over amplification rounds">
              <polyline points={pts} fill="none" stroke={CYAN} strokeWidth="1.2" />
            </svg>
          )}
          <p className="text-[1.12rem] leading-relaxed text-faint">
            Classical simulation of amplitude amplification over {a.worldsInitial.toLocaleString("en-US")} candidate worlds (Occam-weighted amplitudes, phase oracle for worlds consistent with every observation). It runs on this CPU: no quantum hardware, no speed-up claimed. Its output ranks hypotheses and drives the information-gain calculation; it is cross-checked against the exact Bayesian posterior (max deviation shown).
          </p>
        </div>
      </Panel>
      <Panel title="Evolutionary hypothesis search" aside={`${evo.history.length + 1} generation${evo.history.length ? "s" : ""}`}>
        <div className="max-h-64 overflow-y-auto px-4 py-3.5">
          <table className="w-full text-left text-[1.15rem]">
            <thead>
              <tr className="label !text-[1.01rem]">
                <th className="py-1 font-normal">GEN</th>
                <th className="font-normal">CANDIDATES</th>
                <th className="font-normal">SURVIVORS</th>
                <th className="font-normal">MUTATED</th>
                <th className="font-normal">COMBINED</th>
                <th className="text-right font-normal">NEXT</th>
              </tr>
            </thead>
            <tbody className="gz-readout text-dim">
              <tr className="border-t border-white/[0.05]">
                <td className="py-1">01</td>
                <td>{evo.history[0] ? evo.history[0].candidates : evo.pop.length}</td>
                <td colSpan={3} className="text-faint">initial random sample from the prior</td>
                <td className="text-right">{evo.history[0] ? evo.history[0].candidates : evo.pop.length}</td>
              </tr>
              {evo.history.map((g) => (
                <tr key={g.gen} className="border-t border-white/[0.05]">
                  <td className="py-1">{String(g.gen).padStart(2, "0")}</td>
                  <td>{g.candidates}</td>
                  <td className="text-ok">{g.survivors}</td>
                  <td>{g.mutated}</td>
                  <td>{g.combined}</td>
                  <td className="text-right">{g.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[1.12rem] leading-relaxed text-faint">A generation is recorded only when new evidence actually removed members. Offspring (mutation or combination) are admitted only if they reproduce every observation. {a.identified ? "Population has converged on the dominant rule model." : ""}</p>
        </div>
      </Panel>
    </div>
  );
}

export function MetaPanel({ lib, transfer, a, gameAExperiments }: { lib: MetaLibrary | null; transfer: TransferInfo; a: Analysis; gameAExperiments: number | null }) {
  const games = lib?.games ?? [];
  const prev = games.length >= 2 ? games[games.length - 2] : null;
  const cur = games[games.length - 1];
  return (
    <Panel title="Learning how to learn" aside={`${games.length} game${games.length === 1 ? "" : "s"} in strategy library`}>
      <div className="space-y-3 px-4 py-3.5">
        {games.length === 0 ? (
          <p className="text-[1.1rem] text-faint">Finish discovering a world and the agent stores what each kind of discovery cost, so it can reuse its strategy in the next world.</p>
        ) : (
          <table className="w-full text-left text-[1.15rem]">
            <thead>
              <tr className="label !text-[1.01rem]">
                <th className="py-1 font-normal">STRATEGY</th>
                <th className="font-normal">{prev ? "PREVIOUS" : "THIS WORLD"}</th>
                {prev && <th className="text-right font-normal">LATEST</th>}
              </tr>
            </thead>
            <tbody className="gz-readout text-dim">
              {META_CATEGORIES.map((c) => (
                <tr key={c} className="border-t border-white/[0.05]">
                  <td className="py-1">{c} DISCOVERY</td>
                  <td>{fmtCost((prev ?? cur).categoryCost[c])}</td>
                  {prev && <td className="text-right">{fmtCost(cur.categoryCost[c])}</td>}
                </tr>
              ))}
              <tr className="border-t border-white/[0.05] text-text">
                <td className="py-1">TOTAL EXPERIMENTS</td>
                <td>{(prev ?? cur).experiments}</td>
                {prev && <td className="text-right">{cur.experiments}</td>}
              </tr>
            </tbody>
          </table>
        )}
        {transfer.active && (
          <div className="rounded-[4px] border border-[#a78bfa]/30 bg-[#a78bfa]/[0.05] p-3 text-[1.19rem] leading-relaxed text-dim">
            <div className="label !text-[1.01rem] !text-[#a78bfa]">TRANSFER LEARNING ACTIVE</div>
            <p className="mt-1">
              Carried over: movement mechanics <span className="gz-readout text-text">{transfer.carriedDyn}</span> as a prior of {pct(transfer.carriedMass ?? 0)}. It is a hypothesis: evidence can overturn it.
            </p>
            {transfer.gameBExperiments !== null && transfer.fromExperiments !== null && (
              <p className="gz-readout mt-1.5 text-text">
                GAME A {transfer.fromExperiments} experiments · GAME B {transfer.gameBExperiments} experiments · prior {transfer.validated ? "confirmed by evidence" : "overturned by evidence"}
              </p>
            )}
            <p className="mt-1 text-[1.06rem] text-faint">Different worlds, so this is a comparison, not a controlled benchmark.</p>
          </div>
        )}
        {!transfer.active && gameAExperiments !== null && <p className="text-[1.12rem] text-faint">Game A needed {gameAExperiments} experiments. Transfer to a new world to see whether prior knowledge reduces that.</p>}
        <p className="text-[1.06rem] text-faint">Library is stored in this browser only. Experiments so far this world: {a.metrics.experiments}.</p>
      </div>
    </Panel>
  );
}

const fmtCost = (c: number | null | undefined) => (c === null || c === undefined ? "—" : `${c} exp`);

/* ------------------------------------------------------------------ learned world model (right column) */

export function ModelPanel({ a, narration, saved }: { a: Analysis; narration: { text: string; source: "ai" | "deterministic" } | null; saved: boolean | null }) {
  const c = a.compression;
  return (
    <div className="space-y-3">
      <Panel title="Learned world model" aside={a.identified ? (a.verified ? "complete" : "identified") : "building"}>
        <div className="grid grid-cols-[7rem_1fr] items-center gap-3 px-4 py-3.5">
          <KnowledgeRing value={a.knowledge} />
          <div className="gz-readout text-[1.12rem] leading-relaxed text-dim">
            <div>
              WORLDS {a.worldsLeft.toLocaleString("en-US")} <span className="text-faint">/ {a.worldsInitial.toLocaleString("en-US")}</span>
            </div>
            <div>
              ENTROPY {a.entropyBits.toFixed(1)} <span className="text-faint">/ {a.priorEntropyBits.toFixed(1)} bits</span>
            </div>
            <div className="text-faint">knowledge = removable uncertainty already resolved</div>
          </div>
        </div>
        <ul className="space-y-1 border-t border-white/[0.06] px-4 py-3">
          {a.modelAtoms.map((x) => (
            <li key={x.id} className="flex items-center gap-2 text-[1.19rem]">
              {x.color ? <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: COLOR_HEX[x.color], opacity: x.confidence < 0.999 ? 0.4 : 1 }} aria-hidden /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#a78bfa]/70" aria-hidden />}
              <span className={`min-w-0 flex-1 truncate ${x.confidence >= 0.999 ? "text-text" : "text-faint"}`}>{x.confidence >= 0.999 || x.confidence > 0.34 ? x.statement : x.kind === "terrain" ? `${x.color} terrain: unknown` : "undetermined"}</span>
              <span className={`label shrink-0 rounded-full border px-1.5 !text-[1.01rem] ${STATUS_TONE[x.status]}`}>{x.status === "CONFIRMED" ? "CAUSAL ✓" : x.status}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Discovered rule DNA">
        <RuleDna dna={a.dna} className="mx-auto h-56 w-full max-w-[17rem] p-2" />
      </Panel>
      <Panel title="Rule compression">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 px-4 py-3.5 text-center">
          <Readout label="RAW OBSERVATIONS" value={c.rawObservations} />
          <span className="text-faint" aria-hidden>→</span>
          <Readout label="PATTERNS" value={c.patterns} tone="violet" />
          <span className="text-faint" aria-hidden>→</span>
          <Readout label="CORE RULES" value={c.coreRules} tone="green" />
        </div>
        <p className="gz-readout border-t border-white/[0.06] px-4 py-2 text-center text-[1.12rem] text-dim">WORLD MODEL {c.complete ? "COMPLETE" : "IN PROGRESS"}{c.ratio > 0 && ` · ${c.ratio.toFixed(1)}:1 compression`}</p>
      </Panel>
      {narration && (
        <Panel title="Summary" aside={narration.source === "ai" ? "AI-phrased" : "deterministic"}>
          <p className="px-4 py-3.5 text-[1.26rem] leading-relaxed text-dim">{narration.text}</p>
          <p className="border-t border-white/[0.06] px-4 py-2 text-[1.06rem] text-faint">Wording only. Truth is decided by deterministic verification{saved ? " · session saved" : ""}.</p>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ event stream + timeline + replay */

const KIND_TONE: Record<EventKind, string> = {
  world: "text-faint", observation: "text-text", hypothesis: "text-[#a78bfa]", quantum: "text-signal", information: "text-signal", experiment: "text-signal",
  reject: "text-bad", confirm: "text-ok", causal: "text-ok", counterfactual: "text-[#a78bfa]", knowledge: "text-signal", model: "text-ok", play: "text-ok", transfer: "text-[#a78bfa]", system: "text-faint",
};

export const fmtT = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function EventStream({ events, upTo }: { events: DiscoveryEvent[]; upTo: number | null }) {
  const list = (upTo === null ? events : events.slice(0, upTo + 1)).slice(-120).reverse();
  return (
    <Panel title="Discovery event stream" aside={`${events.length} events`}>
      <div role="log" aria-live="polite" aria-label="Discovery event stream" className="max-h-64 overflow-y-auto px-4 py-2.5">
        <ul className="space-y-1">
          {list.map((e) => (
            <li key={e.id} className="grid grid-cols-[4.2rem_1fr] gap-2 text-[1.15rem] leading-snug">
              <span className="gz-readout text-faint">{e.wall}</span>
              <span className={`min-w-0 break-words ${KIND_TONE[e.kind]}`}>{e.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

interface Milestone {
  idx: number;
  t: number;
  label: string;
}

export function milestones(events: DiscoveryEvent[]): Milestone[] {
  const out: Milestone[] = [];
  const first = (kind: EventKind, label: string, pick?: (e: DiscoveryEvent) => boolean) => {
    const i = events.findIndex((e) => e.kind === kind && (!pick || pick(e)));
    if (i >= 0) out.push({ idx: i, t: events[i].t, label });
  };
  first("world", "WORLD UNKNOWN");
  first("observation", "FIRST OBSERVATION");
  first("hypothesis", "HYPOTHESIS CREATED");
  first("reject", "HYPOTHESIS REJECTED");
  first("experiment", "ACTIVE EXPERIMENT");
  first("counterfactual", "COUNTERFACTUAL TEST");
  first("confirm", "RULE CONFIRMED");
  first("knowledge", "MODEL CONVERGED", (e) => e.text.includes("100%"));
  first("model", "WORLD MODEL COMPLETE", (e) => e.text.includes("World model complete"));
  first("play", "AUTONOMOUS PLAY");
  return out.sort((x, y) => x.idx - y.idx);
}

export function Timeline({ events, frames, replayIndex, setReplayIndex }: { events: DiscoveryEvent[]; frames: Frame[]; replayIndex: number | null; setReplayIndex: (i: number | null) => void }) {
  const ms = useMemo(() => milestones(events), [events]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setReplayIndex(((replayIndex ?? -1) + 1) as number);
    }, 260);
    return () => window.clearInterval(id);
  }, [playing, replayIndex, setReplayIndex]);
  useEffect(() => {
    if (playing && replayIndex !== null && replayIndex >= events.length - 1) setPlaying(false);
  }, [playing, replayIndex, events.length]);
  const total = events.length ? events[events.length - 1].t || 1 : 1;
  const at = replayIndex ?? events.length - 1;
  const frame = [...frames].reverse().find((f) => f.eventCount <= at + 1);
  return (
    <Panel
      title="Discovery timeline"
      aside={
        <span className="flex items-center gap-3">
          <button type="button" className="transition hover:!text-signal" disabled={events.length < 3} onClick={() => { setReplayIndex(0); setPlaying(true); }}>
            ▶ replay
          </button>
          {replayIndex !== null && (
            <button type="button" className="transition hover:!text-signal" onClick={() => { setPlaying(false); setReplayIndex(null); }}>
              ■ live
            </button>
          )}
        </span>
      }
    >
      <div className="px-4 py-3.5">
        <div className="relative h-8" aria-hidden>
          <div className="absolute left-0 right-0 top-3 h-px bg-white/15" />
          {events.length > 0 && <div className="absolute top-3 h-px bg-signal" style={{ left: 0, width: `${((events[Math.max(0, at)]?.t ?? 0) / total) * 100}%` }} />}
          {ms.map((m) => (
            <span key={m.label} className="absolute top-[7px] h-[11px] w-[11px] -translate-x-1/2 rounded-full border border-signal/70 bg-void" style={{ left: `${Math.min(99, (m.t / total) * 100)}%`, background: m.idx <= at ? CYAN : undefined }} />
          ))}
        </div>
        <input type="range" aria-label="Replay position" min={0} max={Math.max(0, events.length - 1)} value={Math.max(0, at)} onChange={(e) => { setPlaying(false); setReplayIndex(Number(e.target.value)); }} className="mt-1" />
        <ol className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {ms.map((m) => (
            <li key={m.label}>
              <button type="button" onClick={() => { setPlaying(false); setReplayIndex(m.idx); }} className={`flex w-full items-baseline gap-2 text-left text-[1.12rem] transition hover:text-text ${m.idx <= at ? "text-dim" : "text-faint"}`}>
                <span className="gz-readout text-faint">{fmtT(m.t)}</span>
                <span className="label !text-[1.06rem] !text-inherit">{m.label}</span>
              </button>
            </li>
          ))}
        </ol>
        {replayIndex !== null && frame && (
          <p className="gz-readout mt-2 text-[1.12rem] text-signal">
            REPLAY · {events[at] ? fmtT(events[at].t) : ""} · knowledge {pct(frame.knowledge)} · worlds {frame.worldsLeft.toLocaleString("en-US")} · {events[at]?.text}
          </p>
        )}
      </div>
    </Panel>
  );
}

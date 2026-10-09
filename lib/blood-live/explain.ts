import { evaluateFor, type Snapshot } from "@/lib/engines/blood/live";
import { allDonorsFromSnapshot } from "./snapshotDonors";
import type { LiveEvent } from "@/lib/engines/blood/liveTypes";

export type ExplainKind = "donor_selected" | "donor_rejected" | "allocation_changed" | "priority" | "what_changed";

export interface ExplainFacts {
  question: string;
  facts: string[];
  context: unknown;
}

const g = (x: { abo: string; rh: string }) => `${x.abo}${x.rh}`;

/** Builds the exact, engine-derived facts for a question. Pure, so it is testable and AI-independent. */
export function explainFacts(snap: Snapshot & { feed?: LiveEvent[] }, kind: ExplainKind, patientId?: string, donorCode?: string): ExplainFacts {
  const patient = snap.patients.find((p) => p.id === (patientId ?? snap.focusPatient));
  const donors = allDonorsFromSnapshot(snap);
  const donor = donors.find((d) => d.code === donorCode);

  if ((kind === "donor_selected" || kind === "donor_rejected") && patient && donor) {
    const lp = { ...patient, resolved: false, source: "scenario" as const };
    const res = evaluateFor(lp, donor, patient.unitsNeeded);
    const asg = snap.assignments.find((a) => a.patientId === patient.id && a.donorCode === donor.code);
    return {
      question: kind === "donor_selected" ? `Why was ${donor.code} selected for ${patient.id}?` : `Why was ${donor.code} not used for ${patient.id}?`,
      facts: [`${donor.code} (${g(donor)}) vs ${patient.id} (${g(patient)}, ${patient.component}): ${res.verdict}, score ${res.score}.`, asg ? `Assigned ${asg.units} unit(s) as ${asg.kind}.` : "Not assigned by the allocation engine.", ...res.factors.map((f) => `${f.label} [${f.status}]: ${f.detail}`)],
      context: { patient, donor, verdict: res.verdict, score: res.score, assignment: asg ?? null, factors: res.factors },
    };
  }

  if (kind === "priority" && patient) {
    const order = [...snap.patients].filter((p) => p.status !== "RESOLVED").sort((a, b) => ["critical", "urgent", "routine"].indexOf(a.urgency) - ["critical", "urgent", "routine"].indexOf(b.urgency) || a.no - b.no);
    const rank = order.findIndex((p) => p.id === patient.id) + 1;
    return {
      question: `Why is ${patient.id} prioritised this way?`,
      facts: [`${patient.id} is ${patient.urgency.toUpperCase()} and ranks ${rank} of ${order.length} (critical, then urgent, then routine, then patient number).`, `Needs ${patient.unitsNeeded} unit(s): ${patient.covered} allocated, ${patient.pending} pending, ${patient.shortage} unmet.`],
      context: { patient, rank, of: order.length },
    };
  }

  const recent = (snap.feed ?? []).slice(-8).map((e) => e.message);
  return {
    question: kind === "allocation_changed" ? "Why did the allocation change?" : "What changed during the emergency?",
    facts: [`Metrics: ${snap.metrics.patients} patients, ${snap.metrics.unitsRequired} required, ${snap.metrics.unitsAvailable} available, ${snap.metrics.allocated} allocated, ${snap.metrics.pending} pending, shortage ${snap.metrics.shortage}.`, ...recent],
    context: { metrics: snap.metrics, recentEvents: recent, assignments: snap.assignments.slice(0, 20) },
  };
}
